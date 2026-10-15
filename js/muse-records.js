/* Versioned local records, attachment storage and explicit shared reconciliation. */
(function (root) {
  "use strict";
  var PREFIX = "muselive_records_v1_",
    cache = {},
    states = {},
    validators = {},
    dbPromise;
  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }
  function error(s) {
    throw Error(s);
  }
  function id() {
    return root.crypto.randomUUID();
  }
  function database() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var r = indexedDB.open("MuseRecords", 1);
      r.onupgradeneeded = function () {
        var db = r.result;
        db.createObjectStore("files", { keyPath: "id" });
        db.createObjectStore("history", { keyPath: "id" });
        db.createObjectStore("drafts", { keyPath: "id" });
      };
      r.onsuccess = function () {
        resolve(r.result);
      };
      r.onerror = function () {
        reject(r.error);
      };
    });
    return dbPromise;
  }
  async function get(store, key) {
    var db = await database();
    return new Promise(function (resolve, reject) {
      var r = db.transaction(store).objectStore(store).get(key);
      r.onsuccess = function () {
        resolve(r.result);
      };
      r.onerror = function () {
        reject(r.error);
      };
    });
  }
  async function put(store, value) {
    var db = await database();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value);
      tx.oncomplete = function () {
        resolve(value);
      };
      tx.onerror = function () {
        reject(tx.error);
      };
      tx.onabort = function () {
        reject(tx.error || Error("Storage transaction aborted"));
      };
    });
  }
  function lock(name, fn) {
    return navigator.locks
      ? navigator.locks.request("muse-records-" + name, fn)
      : Promise.resolve().then(fn);
  }
  function read(name, initial) {
    var raw = localStorage.getItem(PREFIX + name);
    if (raw && cache[name]?.raw === raw) return clone(cache[name].value);
    var v = raw
      ? JSON.parse(raw)
      : {
          version: 0,
          serverVersion: null,
          dirty: false,
          value: clone(initial),
          mutationId: "",
          savedAt: 0,
        };
    cache[name] = { raw: raw, value: v };
    return clone(v);
  }
  function write(name, record) {
    if (validators[name]) validators[name](record.value);
    var raw = JSON.stringify(record);
    localStorage.setItem(PREFIX + name, raw);
    cache[name] = { raw: raw, value: clone(record) };
    root.dispatchEvent(
      new CustomEvent("muse-records-change", {
        detail: { name: name, version: record.version },
      }),
    );
  }
  async function pruneHistory(name, version) {
    var db = await database();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction("history", "readwrite"),
        store = tx.objectStore("history"),
        request = store.openCursor();
      request.onsuccess = function () {
        var c = request.result;
        if (!c) return;
        if (c.value.name === name && c.value.record.version < version - 19)
          c.delete();
        c.continue();
      };
      tx.oncomplete = resolve;
      tx.onerror = function () {
        reject(tx.error);
      };
    });
  }
  async function commit(name, initial, expectedVersion, value) {
    return lock(name, async function () {
      var before = read(name, initial);
      if (before.version !== expectedVersion)
        error("Another editor changed these records; reconcile your draft");
      var next = {
        version: before.version + 1,
        serverVersion: before.serverVersion,
        dirty: true,
        value: clone(value),
        mutationId: id(),
        savedAt: Date.now(),
      };
      write(name, next);
      states[name] = "Saved locally · synchronization pending";
      try {
        await put("history", {
          id: name + ":" + next.version,
          name: name,
          record: next,
        });
        await pruneHistory(name, next.version);
      } catch (e) {
        states[name] =
          "Saved locally · history checkpoint failed: " + e.message;
      }
      return clone(next);
    });
  }
  async function request(body) {
    var r = await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    var data = await r.json();
    if (!r.ok) {
      var e = Error(data.error || "Shared service unavailable");
      e.status = r.status;
      throw e;
    }
    return data;
  }
  async function synchronize(name, initial, mode) {
    return lock(name, async function () {
      var local = read(name, initial);
      states[name] = "Synchronizing";
      try {
        var remote = await request({ action: "get", name: name });
        if (local.dirty && remote.mutationId === local.mutationId) {
          local.serverVersion = remote.version;
          local.dirty = false;
          write(name, local);
          states[name] = "Synchronized · prior write acknowledged";
          return local;
        }
        if (mode === "pull") {
          if (local.dirty)
            error(
              "Unsynchronized local changes exist. Export them before replacing from the shared copy.",
            );
          if (remote.version) {
            write(name, {
              version: local.version + 1,
              serverVersion: remote.version,
              dirty: false,
              value: remote.value,
              mutationId: "",
              savedAt: Date.now(),
            });
          }
          states[name] = "Synchronized";
          return read(name, initial);
        }
        if (!local.dirty) {
          if (remote.version && remote.version !== local.serverVersion) {
            write(name, {
              version: local.version + 1,
              serverVersion: remote.version,
              dirty: false,
              value: remote.value,
              mutationId: "",
              savedAt: Date.now(),
            });
          }
          states[name] = "Synchronized";
          return read(name, initial);
        }
        if (local.serverVersion === null && remote.version !== 0)
          error(
            "A shared copy already exists. Compare and reconcile before publishing your local copy.",
          );
        if (
          local.serverVersion !== null &&
          remote.version !== local.serverVersion
        )
          error(
            "Shared records changed. Export both versions and reconcile before retrying.",
          );
        var ack = await request({
          action: "put",
          name: name,
          expectedVersion: local.serverVersion || 0,
          mutationId: local.mutationId,
          value: local.value,
        });
        local.serverVersion = ack.version;
        local.dirty = false;
        write(name, local);
        states[name] = "Synchronized · server revision " + ack.version;
        return local;
      } catch (e) {
        states[name] =
          (e.status === 409 ? "Conflict · " : "Not synchronized · ") +
          e.message;
        throw e;
      }
    });
  }
  async function reconcile(
    name,
    initial,
    expectedVersion,
    value,
    remoteVersion,
  ) {
    return lock(name, async function () {
      var local = read(name, initial);
      if (local.version !== expectedVersion)
        error("Local records changed during reconciliation");
      var remote = await request({ action: "get", name: name });
      if (remote.version !== remoteVersion)
        error("Shared records changed during reconciliation");
      var next = {
        version: local.version + 1,
        serverVersion: remote.version,
        dirty: true,
        value: clone(value),
        mutationId: id(),
        savedAt: Date.now(),
      };
      write(name, next);
      states[name] = "Reconciled locally · publish with Sync";
      return next;
    });
  }
  async function saveFile(file) {
    if (file.size > 20000000) error("Files must be 20 MB or smaller");
    if (
      !/^(application\/pdf|image\/(png|jpeg|webp)|video\/(mp4|webm)|text\/plain)$/.test(
        file.type,
      )
    )
      error("Supported: PDF, PNG, JPEG, WebP, MP4, WebM and text");
    var digest = await crypto.subtle.digest(
        "SHA-256",
        await file.arrayBuffer(),
      ),
      sha256 = Array.from(new Uint8Array(digest))
        .map(function (x) {
          return x.toString(16).padStart(2, "0");
        })
        .join("");
    var row = {
      id: id(),
      sha256: sha256,
      name: file.name,
      type: file.type,
      size: file.size,
      blob: file,
      at: Date.now(),
    };
    await put("files", row);
    return {
      id: row.id,
      sha256: sha256,
      name: row.name,
      type: row.type,
      size: row.size,
    };
  }
  async function sharedFile(fileId) {
    var f = await get("files", fileId);
    if (!f) error("Attachment is not available in this browser");
    var target = await request({ action: "uploadUrl", name: "operations" });
    var url = new URL(target.url);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".convex.cloud"))
      error("Invalid storage upload target");
    var r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": f.type },
      body: f.blob,
    });
    if (!r.ok) error("Attachment upload failed");
    return (await r.json()).storageId;
  }
  root.MuseRecords = {
    registerValidator: function (name, fn) {
      validators[name] = fn;
    },
    read: read,
    commit: commit,
    synchronize: synchronize,
    reconcile: reconcile,
    remote: function (name) {
      return request({ action: "get", name: name });
    },
    state: function (name) {
      return (
        states[name] ||
        (read(name, {}).dirty
          ? "Saved locally · synchronization pending"
          : "Local record · shared status unknown")
      );
    },
    saveFile: saveFile,
    getFile: function (id) {
      return get("files", id);
    },
    sharedFile: sharedFile,
    fileUrl: async function (storageId) {
      return (
        await request({
          action: "fileUrl",
          name: "operations",
          storageId: storageId,
        })
      ).url;
    },
    draft: function (name, value) {
      return put("drafts", { id: name, value: clone(value), at: Date.now() });
    },
    getDraft: function (name) {
      return get("drafts", name);
    },
    history: function (name, version) {
      return get("history", name + ":" + version);
    },
  };
  root.addEventListener("storage", function (e) {
    if (e.key && e.key.startsWith(PREFIX)) {
      var name = e.key.slice(PREFIX.length);
      delete cache[name];
      root.dispatchEvent(
        new CustomEvent("muse-records-change", {
          detail: { name: name, external: true },
        }),
      );
    }
  });
})(window);
