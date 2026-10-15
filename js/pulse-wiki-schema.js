/* Shared validation for Wiki imports and persistence boundaries. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PulseWikiSchema = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  function validate(db) {
    if (
      !db ||
      typeof db !== "object" ||
      !db.pages ||
      typeof db.pages !== "object" ||
      Array.isArray(db.pages) ||
      !db.revs ||
      typeof db.revs !== "object" ||
      !Array.isArray(db.rc) ||
      !Number.isSafeInteger(db.nextRev) ||
      db.nextRev < 1
    )
      throw Error("Invalid Wiki package");
    var highest = 0,
      seen = new Set();
    Object.keys(db.pages).forEach(function (slug) {
      if (["__proto__", "constructor", "prototype"].includes(slug))
        throw Error("Unsafe Wiki key");
      var p = db.pages[slug],
        revs = db.revs[slug];
      if (
        !p ||
        p.slug !== slug ||
        typeof p.prefixed !== "string" ||
        !Array.isArray(revs) ||
        !revs.length ||
        revs.length > 1000 ||
        !Number.isSafeInteger(p.latest) ||
        !revs.some(function (r) {
          return r.id === p.latest;
        })
      )
        throw Error("Invalid Wiki page or revision");
      revs.forEach(function (r) {
        if (
          !r ||
          !Number.isSafeInteger(r.id) ||
          r.id < 1 ||
          seen.has(r.id) ||
          typeof r.text !== "string"
        )
          throw Error("Invalid Wiki revision");
        seen.add(r.id);
        highest = Math.max(highest, r.id);
      });
    });
    if (db.nextRev <= highest) throw Error("Wiki revision counter is stale");
    return db;
  }
  return { validate: validate };
});
