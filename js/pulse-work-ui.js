/* Connected workflows augment Classic screens without replacing their editors. */
(function (root) {
  "use strict";
  var C = root.PulseWorkCore,
    R = root.PulseRecords,
    dialogContext = null,
    lastFocus = null,
    notice = "",
    searchTimer,
    indexCache = null,
    workspaceCache = null;
  var titles = {
    assets: "Equipment register",
    venues: "Venue profiles",
    people: "Crew qualifications",
    bookings: "Shared resource bookings",
    gates: "Phase readiness",
    maintenance: "Maintenance",
    shipments: "Custody manifests",
    journeys: "Travel readiness",
    vendors: "Vendor assurance",
    quotes: "Quote comparison",
    costs: "Cost reconciliation",
    decisions: "Decisions & acknowledgments",
    documents: "Documents & editions",
    deliveries: "Distribution & acceptance",
    lessons: "Lessons & closeout",
    knowledge: "Knowledge ownership",
    training: "Training paths",
    integrations: "Facility observations",
    guides: "Guided troubleshooting",
    sessions: "Troubleshooting sessions",
  };
  var panes = {
    overview: ["gates"],
    ops: ["integrations"],
    schedule: ["bookings"],
    survey: ["venues", "documents"],
    crew: ["people", "training"],
    vendors: ["vendors", "quotes"],
    finance: ["costs"],
    tracking: ["assets", "maintenance", "lessons"],
    workflow: ["documents", "deliveries"],
    packlist: ["shipments"],
    travel: ["journeys"],
    omni: ["decisions"],
  };
  function esc(x) {
    return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }
  function call(name, args) {
    return esc(
      "PulseWork." + name + "(" + JSON.stringify(args || []).slice(1, -1) + ")",
    );
  }
  function btn(label, name, args) {
    return (
      '<button type="button" onclick="' +
      call(name, args) +
      '">' +
      esc(label) +
      "</button>"
    );
  }
  function read() {
    var raw = localStorage.getItem("nbcpulse_records_v1_operations");
    if (workspaceCache && workspaceCache.raw === raw)
      return workspaceCache.value;
    var value = C.validate(R.read("operations", C.empty()).value);
    workspaceCache = { raw: raw, value: value };
    return value;
  }
  function allowed(t) {
    if (
      typeof permCan === "function" &&
      !permCan(
        t === "costs" || t === "quotes"
          ? "finance"
          : t === "vendors"
            ? "vendors"
            : "edit",
      )
    )
      return false;
    return (
      !["knowledge", "guides"].includes(t) || !root.PulseKB || PulseKB.canEdit()
    );
  }
  function actor() {
    return (
      (document.getElementById("pw-actor") || {}).value ||
      sessionStorage.getItem("pulse-work-actor") ||
      ""
    );
  }
  function error(e) {
    notice = e.message || String(e);
    var n = document.getElementById("pw-error");
    if (n) {
      n.textContent = notice;
      n.focus();
    } else if (typeof toast === "function") toast(notice);
  }
  async function change(command, version, operator) {
    if (!allowed(command.collection || ""))
      throw Error("Your current role cannot edit these records");
    operator = operator || actor();
    if (!operator.trim()) throw Error("Enter the responsible operator name");
    sessionStorage.setItem("pulse-work-actor", operator);
    var rec = R.read("operations", C.empty());
    if (version !== undefined && version !== rec.version)
      throw Error(
        "Records changed while this form was open. Export your draft and reopen.",
      );
    command.expectedRevision = rec.value.revision;
    var next = C.apply(rec.value, command, {
      actor: operator,
      id: crypto.randomUUID(),
      now: Date.now(),
    });
    if (next.revision !== rec.value.revision)
      await R.commit("operations", C.empty(), rec.version, next);
    return next;
  }
  function shell(title, content) {
    close();
    lastFocus = document.activeElement;
    var d = document.createElement("dialog");
    d.id = "pulse-work-dialog";
    d.className = "pulse-work pw-dialog";
    d.innerHTML =
      "<header><h2>" +
      esc(title) +
      "</h2>" +
      btn("Close", "close") +
      '</header><p id="pw-error" role="alert" tabindex="-1"></p>' +
      content;
    document.body.appendChild(d);
    d.addEventListener("close", function () {
      d.remove();
      if (lastFocus && lastFocus.isConnected) lastFocus.focus();
    });
    d.showModal();
    return d;
  }
  function close() {
    var d = document.getElementById("pulse-work-dialog");
    if (d) d.close();
  }
  function download(name, data, type) {
    var u = URL.createObjectURL(
        new Blob([data], { type: type || "application/json" }),
      ),
      a = document.createElement("a");
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(u);
    }, 1000);
  }
  function operatorHTML() {
    return (
      '<label>Responsible operator<input id="pw-actor" required maxlength="160" autocomplete="name" value="' +
      esc(sessionStorage.getItem("pulse-work-actor") || "") +
      '"></label><small>Operator names are recorded statements; they are not authenticated recipient signatures.</small>'
    );
  }
  function options(rows, value, multi) {
    return rows
      .map(function (r) {
        return (
          '<option value="' +
          esc(r.id) +
          '"' +
          ((multi ? (value || []).includes(r.id) : value === r.id)
            ? " selected"
            : "") +
          ">" +
          esc(r.name) +
          " · " +
          esc(r.id) +
          "</option>"
        );
      })
      .join("");
  }
  function field(t, k, value, s) {
    var spec = C.schemas[t][k],
      label = spec.replace(/(?:\[\]|>)[a-z]*$|[#@]$/g, ""),
      ref = spec.match(/(?:\[\]|>)([a-z]+)$/),
      multiple = spec.includes("[]"),
      input;
    if (t === "guides" && k === "steps") {
      var steps;
      try {
        steps = C.parse(value || "[]");
      } catch (e) {
        steps = [];
      }
      if (!steps.length) steps = [{ id: "step1", prompt: "", yes: "", no: "" }];
      input =
        '<input type="hidden" name="steps" value="' +
        esc(JSON.stringify(steps)) +
        '"><div id="pw-guide-steps">' +
        guideStepsHTML(steps) +
        "</div>" +
        btn("Add troubleshooting step", "addGuideStep");
      label = "Troubleshooting branches";
    } else if (k === "production") {
      var ps =
        typeof productions === "object"
          ? Object.keys(productions).map(function (id) {
              return { id: id, name: productions[id].name };
            })
          : [];
      input =
        '<select name="production"><option value="">Across productions</option>' +
        options(ps, value, false) +
        "</select>";
    } else if (ref)
      input =
        '<select name="' +
        k +
        '"' +
        (multiple ? ' multiple size="4"' : "") +
        '><option value="">' +
        (multiple ? "None" : "Choose record") +
        "</option>" +
        options(s[ref[1]], value, multiple) +
        "</select>";
    else if (k === "resources") {
      var rows = ["assets", "people", "venues", "documents"].flatMap(
        function (t) {
          return s[t].map(function (r) {
            return {
              id:
                {
                  assets: "asset",
                  people: "person",
                  venues: "venue",
                  documents: "document",
                }[t] +
                ":" +
                r.id,
              name: r.name,
            };
          });
        },
      );
      input =
        '<select name="resources" multiple size="4">' +
        options(rows, value, true) +
        "</select>";
    } else if (spec.endsWith("#"))
      input =
        '<input name="' +
        k +
        '" type="number" min="0" step="any" value="' +
        esc(value || 0) +
        '">';
    else if (spec.endsWith("@"))
      input =
        '<input name="' +
        k +
        '" type="datetime-local" value="' +
        esc(
          value
            ? new Date(
                Date.parse(value) - new Date(value).getTimezoneOffset() * 60000,
              )
                .toISOString()
                .slice(0, 16)
            : "",
        ) +
        '"><small>Your browser timezone; stored with UTC offset.</small>';
    else if (k === "state")
      input =
        '<select name="state">' +
        Array.from(
          new Set([
            value || "draft",
            "draft",
            "open",
            "review",
            "active",
            "available",
            "checked-out",
            "maintenance",
            "out-of-service",
            "missing",
            "damaged",
            "disrupted",
            "resolved",
            "cancelled",
            "archived",
            "complete",
            "approved",
            "published",
            "accepted",
          ]),
        )
          .map(function (v) {
            return (
              "<option" +
              (value === v ? " selected" : "") +
              ">" +
              v +
              "</option>"
            );
          })
          .join("") +
        "</select><small>Completion and publication require their evidence action.</small>";
    else
      input =
        '<textarea name="' +
        k +
        '" rows="' +
        (["notes", "steps", "finding", "resolution", "changes"].includes(k)
          ? 4
          : 2) +
        '"' +
        (k === "name" ? " required" : "") +
        ">" +
        esc(multiple ? (value || []).join(", ") : value || "") +
        "</textarea>" +
        (multiple ? "<small>Separate values with commas.</small>" : "");
    return t === "guides" && k === "steps"
      ? '<div class="pw-guide-editor"><strong>' +
          esc(label) +
          "</strong>" +
          input +
          "</div>"
      : "<label>" + esc(label) + input + "</label>";
  }
  function guideStepsHTML(steps) {
    return steps
      .map(function (step, i) {
        function next(answer) {
          return (
            '<select data-branch="' +
            answer +
            '" onchange="PulseWork.updateGuideSteps()"><option value="">Finish session</option>' +
            steps
              .map(function (n, j) {
                return (
                  '<option value="' +
                  esc(n.id) +
                  '"' +
                  (step[answer] === n.id ? " selected" : "") +
                  ">Step " +
                  (j + 1) +
                  ": " +
                  esc(n.prompt.slice(0, 45)) +
                  "</option>"
                );
              })
              .join("") +
            "</select>"
          );
        }
        return (
          '<section data-guide-step="' +
          esc(step.id) +
          '"><strong>Step ' +
          (i + 1) +
          '</strong><label>Question / check<input data-prompt value="' +
          esc(step.prompt) +
          '" oninput="PulseWork.updateGuideSteps()"></label><label>If yes' +
          next("yes") +
          "</label><label>If no" +
          next("no") +
          "</label>" +
          btn("Remove step", "removeGuideStep", [step.id]) +
          "</section>"
        );
      })
      .join("");
  }
  function updateGuideSteps() {
    var steps = Array.from(document.querySelectorAll("[data-guide-step]")).map(
      function (el) {
        return {
          id: el.dataset.guideStep,
          prompt: el.querySelector("[data-prompt]").value,
          yes: el.querySelector("[data-branch=yes]").value,
          no: el.querySelector("[data-branch=no]").value,
        };
      },
    );
    document.querySelector("[name=steps]").value = JSON.stringify(steps);
    return steps;
  }
  function removeGuideStep(id) {
    var steps = updateGuideSteps().filter(function (s) {
      return s.id !== id;
    });
    steps.forEach(function (s) {
      if (s.yes === id) s.yes = "";
      if (s.no === id) s.no = "";
    });
    document.getElementById("pw-guide-steps").innerHTML = guideStepsHTML(steps);
    document.querySelector("[name=steps]").value = JSON.stringify(steps);
  }
  function addGuideStep() {
    var steps = updateGuideSteps();
    steps.push({
      id: "step" + crypto.randomUUID(),
      prompt: "",
      yes: "",
      no: "",
    });
    document.getElementById("pw-guide-steps").innerHTML = guideStepsHTML(steps);
    document.querySelector("[name=steps]").value = JSON.stringify(steps);
  }
  function edit(t, id, production, defaults) {
    try {
      if (!allowed(t)) throw Error("Editing is restricted for your role");
      var rec = R.read("operations", C.empty()),
        r = id
          ? C.item(rec.value, t, id)
          : Object.assign(
              { production: production || "", state: "draft" },
              defaults || {},
            );
      dialogContext = {
        type: t,
        id: id,
        version: rec.version,
        production: production || r.production,
      };
      shell(
        (id ? "Edit " : "Add ") + titles[t],
        '<form id="pw-form"><div class="pw-fields">' +
          Object.keys(C.schemas[t])
            .map(function (k) {
              return field(t, k, r[k], rec.value);
            })
            .join("") +
          "</div>" +
          operatorHTML() +
          '<footer><button type="submit">Save record</button>' +
          btn("Export draft", "exportDraft") +
          "</footer></form>",
      );
      document.getElementById("pw-form").onsubmit = function (e) {
        e.preventDefault();
        saveForm();
      };
    } catch (e) {
      error(e);
    }
  }
  function formValues() {
    var f = document.getElementById("pw-form"),
      t = dialogContext.type,
      v = {};
    Object.keys(C.schemas[t]).forEach(function (k) {
      var e = f.elements.namedItem(k),
        spec = C.schemas[t][k];
      v[k] = e.multiple
        ? Array.from(e.selectedOptions)
            .map(function (x) {
              return x.value;
            })
            .filter(Boolean)
        : spec.endsWith("@")
          ? e.value
            ? new Date(e.value).toISOString()
            : ""
          : e.value;
    });
    return v;
  }
  async function saveForm() {
    var context = dialogContext,
      activeDialog = document.getElementById("pulse-work-dialog");
    try {
      await change(
        {
          type: "upsert",
          collection: dialogContext.type,
          id: dialogContext.id,
          values: formValues(),
        },
        dialogContext.version,
      );
      var p = context.production;
      if (activeDialog === document.getElementById("pulse-work-dialog"))
        close();
      refresh(p);
    } catch (e) {
      error(e);
    }
  }
  function exportDraft() {
    download(
      "Pulse-record-draft.json",
      JSON.stringify({ context: dialogContext, values: formValues() }, null, 2),
    );
  }
  function refresh(production) {
    indexCache = null;
    document.querySelectorAll("[data-pulse-work-pane]").forEach(function (el) {
      el.outerHTML = paneHTML(el.dataset.production, el.dataset.tab);
    });
    if (location.hash.includes("/kb") && root.PulseKB) PulseKB.render();
    mountDashboard();
  }
  function filtered(s, t, p) {
    return s[t].filter(function (r) {
      return !p || !r.production || r.production === p;
    });
  }
  function knowledgeStatus(slug, revision) {
    try {
      var k = read().knowledge.find(function (k) {
        return k.slug === slug;
      });
      return !!(
        k &&
        k.approval &&
        k.approval.revision === k.revision &&
        k.approval.articleRevision === revision &&
        k.state === "published" &&
        C.stamp(k.reviewDue) > Date.now() &&
        (k.documents || []).every(function (id) {
          var d = C.item(read(), "documents", id);
          return (
            d.approval &&
            d.approval.revision === d.revision &&
            (!d.reviewDue || C.stamp(d.reviewDue) > Date.now()) &&
            (k.approval.documentRevisions || []).some(function (x) {
              return x.id === id && x.revision === d.revision;
            })
          );
        })
      );
    } catch (e) {
      return false;
    }
  }
  function currentKnowledge(k) {
    var d = root.PulseKB && PulseKB.bySlug(k.slug);
    return !!(d && knowledgeStatus(k.slug, d.revision));
  }
  function stateLabel(t, r) {
    if (t === "knowledge")
      return currentKnowledge(r) ? "Reviewed · current" : "Needs review";
    if (r.approval && r.approval.revision !== r.revision)
      return "Approval stale";
    return r.state || "draft";
  }
  function quoteComparison(s, p) {
    return (
      '<div class="pw-scroll"><table><caption>Compare quotes within the same currency and scope</caption><thead><tr><th>Quote</th><th>Vendor</th><th>Currency</th><th>Amount</th><th>Valid until</th><th>Deliverables</th></tr></thead><tbody>' +
      filtered(s, "quotes", p)
        .map(function (q) {
          return (
            "<tr><td>" +
            esc(q.name) +
            "</td><td>" +
            esc(q.vendor ? C.item(s, "vendors", q.vendor).name : "Unassigned") +
            "</td><td>" +
            esc(q.currency) +
            "</td><td>" +
            q.amount +
            "</td><td>" +
            esc(q.validUntil) +
            "</td><td>" +
            esc(q.deliverables) +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }
  function listHTML(s, t, p) {
    if (!allowed(t) && ["costs", "quotes", "vendors"].includes(t)) return "";
    var rows = filtered(s, t, p);
    return (
      '<section class="pw-collection"><header><h3>' +
      esc(titles[t]) +
      " <small>" +
      rows.length +
      "</small></h3>" +
      btn("Add", "edit", [t, null, p || ""]) +
      "</header>" +
      (t === "quotes" ? quoteComparison(s, p) : "") +
      (!rows.length
        ? "<p>No connected records yet. Add a record or link an existing record below.</p>"
        : '<div class="pw-cards">' +
          rows
            .slice(0, 50)
            .map(function (r) {
              return (
                "<article><strong>" +
                esc(r.name) +
                "</strong><p>" +
                esc(stateLabel(t, r)) +
                " · " +
                esc(
                  r.owner ||
                    r.recipient ||
                    r.department ||
                    r.role ||
                    r.production ||
                    "Shared",
                ) +
                "</p><small>" +
                esc(r.start || r.due || r.reviewDue || r.legacyRef || "") +
                "</small><footer>" +
                btn("Open", "detail", [t, r.id]) +
                btn("Edit", "edit", [t, r.id, p || ""]) +
                "</footer></article>"
              );
            })
            .join("") +
          "</div>") +
      (rows.length > 50
        ? btn("Search all " + rows.length + " records", "searchDialog", [t])
        : "") +
      "</section>"
    );
  }
  function alertHTML(s, p) {
    var a = C.alerts(s, Date.now(), p).filter(function (x) {
      return allowed(x.type);
    });
    return (
      "<details " +
      (a.length ? "open" : "") +
      "><summary>" +
      a.length +
      " connected actions requiring attention</summary><ul>" +
      a
        .slice(0, 30)
        .map(function (x) {
          return (
            "<li>" +
            btn(x.name, "detail", [x.type, x.id]) +
            " " +
            esc(x.reason) +
            (x.owner ? " · " + esc(x.owner) : "") +
            "</li>"
          );
        })
        .join("") +
      "</ul></details>"
    );
  }
  function toolbar(p) {
    return (
      '<div class="pw-toolbar">' +
      btn("Search Pulse", "searchDialog", [""]) +
      btn("Link existing record", "legacy", [p || ""]) +
      btn("Sync / recovery", "storage") +
      btn("All connected workflows", "hub", [p || ""]) +
      "<small>" +
      esc(R.state("operations")) +
      "</small></div>"
    );
  }
  function paneHTML(p, tab) {
    try {
      var s = read(),
        ts = panes[tab] || [];
      if (!ts.length) return "";
      return (
        '<div class="pulse-work" data-pulse-work-pane data-production="' +
        esc(p) +
        '" data-tab="' +
        esc(tab) +
        '">' +
        toolbar(p) +
        (tab === "overview" ? alertHTML(s, p) : "") +
        (tab === "finance" ? financeHTML(s, p) : "") +
        ts
          .map(function (t) {
            return listHTML(s, t, p);
          })
          .join("") +
        "</div>"
      );
    } catch (e) {
      return (
        '<p class="pulse-work" role="alert">Connected records could not be loaded: ' +
        esc(e.message) +
        ". Existing records have not been replaced.</p>"
      );
    }
  }
  function financeHTML(s, p) {
    return (
      '<div class="pw-scroll"><table><caption>Reconciliation by currency — no implicit currency conversion</caption><thead><tr>' +
      [
        "Currency",
        "Budget",
        "Committed",
        "Received",
        "Invoiced",
        "Paid",
        "Remaining",
      ]
        .map(function (x) {
          return "<th>" + x + "</th>";
        })
        .join("") +
      "</tr></thead><tbody>" +
      C.finance(s, p)
        .map(function (r) {
          return (
            "<tr>" +
            [
              "currency",
              "budget",
              "committed",
              "received",
              "invoiced",
              "paid",
              "variance",
            ]
              .map(function (k) {
                return "<td>" + esc(r[k]) + "</td>";
              })
              .join("") +
            "</tr>"
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }
  function hub(p) {
    try {
      var s = read();
      shell(
        "Connected production workflows",
        toolbar(p) +
          alertHTML(s, p) +
          C.types
            .map(function (t) {
              return (
                "<details><summary>" +
                esc(titles[t]) +
                "</summary>" +
                listHTML(s, t, p) +
                "</details>"
              );
            })
            .join(""),
      );
    } catch (e) {
      error(e);
    }
  }
  function detail(t, id) {
    try {
      if (!allowed(t) && ["costs", "quotes", "vendors"].includes(t))
        throw Error("This record is restricted");
      var s = read(),
        r = C.item(s, t, id),
        html =
          "<p>" +
          esc(stateLabel(t, r)) +
          " · record revision " +
          r.revision +
          "</p><dl>" +
          Object.keys(C.schemas[t])
            .filter(function (k) {
              return r[k] && k !== "name";
            })
            .map(function (k) {
              return (
                "<dt>" +
                esc(C.schemas[t][k].replace(/(?:\[\]|>)[a-z]*$|[#@]$/g, "")) +
                "</dt><dd>" +
                esc(Array.isArray(r[k]) ? r[k].join(", ") : r[k]) +
                "</dd>"
              );
            })
            .join("") +
          "</dl><footer>" +
          btn("Edit", "edit", [t, id, r.production]);
      if (["knowledge", "documents", "lessons"].includes(t))
        html +=
          btn("Submit for review", "act", [t, id, "submitReview"]) +
          btn("Record review", "act", [t, id, "review"]);
      if (t === "knowledge")
        html +=
          btn("Read article", "openArticle", [r.slug]) +
          btn("Create guide", "edit", [
            "guides",
            null,
            r.production,
            {
              article: id,
              name: r.name + " troubleshooting",
              steps: JSON.stringify(
                [
                  {
                    id: "start",
                    prompt: "Does the documented check pass?",
                    yes: "",
                    no: "",
                  },
                ],
                null,
                2,
              ),
            },
          ]);
      if (t === "gates")
        html += btn("Complete with evidence", "act", [t, id, "completeGate"]);
      if (t === "decisions")
        html += btn("Acknowledge current revision", "act", [
          t,
          id,
          "acknowledge",
        ]);
      if (t === "deliveries")
        html += btn("Record recipient acceptance", "act", [
          t,
          id,
          "acceptDelivery",
        ]);
      if (t === "training")
        html += btn("Complete training", "act", [t, id, "completeTraining"]);
      if (t === "shipments")
        html += btn("Scan custody", "act", [t, id, "scan"]);
      if (t === "guides")
        html += btn("Start session", "edit", [
          "sessions",
          null,
          r.production,
          { name: r.name + " session", guide: id },
        ]);
      if (t === "sessions")
        html += btn("Continue troubleshooting", "troubleshoot", [id]);
      if (t === "integrations")
        html +=
          btn("Fetch configured adapter", "poll", [id]) +
          btn("Import observation report", "importObservations", [id]);
      if (t === "documents")
        html +=
          (r.production
            ? btn("Freeze techbook edition", "freezeEdition", [id])
            : "") +
          (r.edition
            ? btn("Export frozen edition PDF", "exportEdition", [id])
            : "") +
          btn("Attach file", "attach", [id]) +
          btn("Create delivery", "edit", [
            "deliveries",
            null,
            r.production,
            { document: id, name: r.name + " distribution" },
          ]) +
          (r.file
            ? btn("Open attachment", "openFile", [id, 1]) +
              btn("Upload attachment for sharing", "shareFile", [id])
            : "") +
          btn("Record drawing annotation", "act", [t, id, "annotate"]);
      if (t === "lessons")
        html += btn("Create Wiki draft", "lessonArticle", [id]);
      html += "</footer>";
      [
        "approval",
        "acceptance",
        "completion",
        "acks",
        "scans",
        "annotations",
        "answers",
      ].forEach(function (k) {
        if (r[k])
          html +=
            "<details><summary>" +
            esc(k) +
            "</summary><pre>" +
            esc(JSON.stringify(r[k], null, 2)) +
            "</pre></details>";
      });
      var prefix = {
        assets: "asset",
        people: "person",
        venues: "venue",
        documents: "document",
      }[t];
      if (prefix) {
        var links = C.impacts(s, prefix + ":" + id);
        html +=
          "<h3>Change impact</h3><ul>" +
          links
            .map(function (x) {
              return "<li>" + btn(x.name, "detail", [x.type, x.id]) + "</li>";
            })
            .join("") +
          "</ul>";
      }
      if (t === "shipments") {
        html +=
          "<h3>Manifest reconciliation</h3><ul>" +
          r.assets
            .map(function (id) {
              var scans = (r.scans || []).filter(function (x) {
                return x.asset === id;
              });
              return (
                "<li>" +
                esc(C.item(s, "assets", id).name) +
                " · " +
                esc(
                  scans.length ? scans[scans.length - 1].stage : "not picked",
                ) +
                "</li>"
              );
            })
            .join("") +
          "</ul>";
      }
      if (t === "integrations") {
        html +=
          "<h3>Latest reports</h3>" +
          s.observations
            .filter(function (o) {
              return o.adapter === id;
            })
            .slice(-5)
            .reverse()
            .map(function (o) {
              return (
                "<p>" +
                esc(o.source) +
                " · " +
                new Date(o.at).toISOString() +
                "</p><ul>" +
                o.items
                  .map(function (x) {
                    return (
                      "<li>" +
                      esc(x.resource) +
                      " · " +
                      esc(x.metric) +
                      " · " +
                      (Date.now() - x.at > (r.maxAgeMinutes || 5) * 60000
                        ? "STALE"
                        : esc(x.result)) +
                      "</li>"
                    );
                  })
                  .join("") +
                "</ul>"
              );
            })
            .join("");
      }
      html +=
        "<details><summary>Record change history</summary><pre>" +
        esc(
          JSON.stringify(
            s.events
              .filter(function (e) {
                return e.record === id;
              })
              .slice(-30)
              .reverse(),
            null,
            2,
          ),
        ) +
        "</pre></details>";
      shell(r.name, html);
    } catch (e) {
      error(e);
    }
  }
  function act(t, id, type) {
    try {
      var r = C.item(read(), t, id);
      dialogContext = {
        type: t,
        id: id,
        version: R.read("operations", C.empty()).version,
        production: r.production,
      };
      var extra = "";
      if (type === "scan")
        extra =
          '<label>Barcode / serial / asset ID<input name="asset" required autofocus></label><label>Custody stage<select name="stage">' +
          [
            "picked",
            "loaded",
            "received",
            "returned",
            "damaged",
            "missing",
            "reconciled",
          ]
            .map(function (x) {
              return "<option>" + x + "</option>";
            })
            .join("") +
          "</select></label>";
      if (type === "annotate")
        extra =
          '<label>Page<input type="number" name="page" min="1" value="1"></label><label>Horizontal position (0–1)<input name="x" type="number" min="0" max="1" step="0.01" required></label><label>Vertical position (0–1)<input name="y" type="number" min="0" max="1" step="0.01" required></label>';
      shell(
        type.replace(/([A-Z])/g, " $1"),
        '<form id="pw-action">' +
          operatorHTML() +
          extra +
          '<label>Evidence / observation<textarea name="evidence" rows="4"></textarea></label><button type="submit">Record ' +
          esc(type) +
          "</button></form>",
      );
      document.getElementById("pw-action").onsubmit = async function (e) {
        e.preventDefault();
        var activeDialog = e.target.closest("dialog");
        try {
          var f = new FormData(e.target),
            c = {
              type: type,
              collection: t,
              id: id,
              evidence: f.get("evidence") || "",
            };
          if (type === "review" && t === "knowledge") {
            var d = PulseKB.bySlug(r.slug);
            if (!d) throw Error("Wiki article does not exist");
            c.articleRevision = d.revision;
          }
          if (
            type === "completeTraining" &&
            r.articles.some(function (k) {
              return !currentKnowledge(C.item(read(), "knowledge", k));
            })
          )
            throw Error("One or more required articles changed or need review");
          if (type === "scan") {
            c.asset = f.get("asset");
            c.stage = f.get("stage");
          }
          if (type === "annotate") {
            c.x = Number(f.get("x"));
            c.y = Number(f.get("y"));
            c.page = Number(f.get("page"));
            c.text = c.evidence;
          }
          await change(c, dialogContext.version);
          if (
            activeDialog.open &&
            activeDialog === document.getElementById("pulse-work-dialog")
          )
            detail(t, id);
          refresh(r.production);
        } catch (err) {
          error(err);
        }
      };
    } catch (e) {
      error(e);
    }
  }
  function openArticle(slug) {
    close();
    if (typeof switchView === "function") switchView("kb");
    PulseKB.open(slug);
  }
  function reviewArticle(slug) {
    var s = read(),
      k = s.knowledge.find(function (k) {
        return k.slug === slug;
      });
    if (k) detail("knowledge", k.id);
    else {
      var d = PulseKB.bySlug(slug);
      edit("knowledge", null, "", {
        name: d ? d.title : slug,
        slug: slug,
        kind: d ? d.kind : "procedure",
      });
    }
  }
  function articleHTML(slug) {
    try {
      var s = read(),
        k = s.knowledge.find(function (k) {
          return k.slug === slug;
        });
      return (
        '<aside class="pulse-work pw-context"><strong>' +
        (!k
          ? "Ownership and review not recorded"
          : currentKnowledge(k)
            ? "Reviewed for current article revision"
            : "Review required — do not treat as approved guidance") +
        "</strong><p>" +
        esc(
          k
            ? "Owner: " + k.owner + " · review due " + (k.reviewDue || "unset")
            : "Add applicability, sources and a responsible owner.",
        ) +
        "</p>" +
        btn(k ? "Review details" : "Add ownership", "reviewArticle", [slug]) +
        (k
          ? k.documents
              .map(function (id) {
                return btn(C.item(s, "documents", id).name, "detail", [
                  "documents",
                  id,
                ]);
              })
              .join("")
          : "") +
        "</aside>"
      );
    } catch (e) {
      return '<p role="alert">' + esc(e.message) + "</p>";
    }
  }
  function wikiHubHTML() {
    try {
      var s = read(),
        current = s.knowledge.filter(currentKnowledge).length;
      return (
        '<section class="pulse-work"><details' +
        (root.innerWidth >= 768 ? " open" : "") +
        "><summary>Knowledge tools · " +
        current +
        " / " +
        PulseKB.search("").length +
        ' current reviewed articles</summary><div class="pw-toolbar">' +
        btn("Search articles & manuals", "searchDialog", ["knowledge"]) +
        btn("Ownership & review queue", "knowledgeHealth") +
        btn("Training", "collection", ["training", ""]) +
        btn("Troubleshooting", "collection", ["guides", ""]) +
        btn("Manuals & media", "collection", ["documents", ""]) +
        btn("Offline knowledge pack", "offline") +
        btn("Sync / recovery", "storage") +
        "</div></details></section>"
      );
    } catch (e) {
      return "<p>" + esc(e.message) + "</p>";
    }
  }
  function knowledgeHealth() {
    try {
      var s = read(),
        pages = PulseKB.search("");
      shell(
        "Knowledge health",
        '<p>Every article needs an owner, applicable sources and a current review. Sample material remains labeled until validated.</p><div class="pw-scroll"><table><thead><tr><th>Article</th><th>Owner</th><th>Review state</th><th>Next review</th><th>Action</th></tr></thead><tbody>' +
          pages
            .map(function (d) {
              var k = s.knowledge.find(function (k) {
                return k.slug === d.slug;
              });
              return (
                "<tr><td>" +
                esc(d.title) +
                "</td><td>" +
                esc(k ? k.owner : "Unassigned") +
                "</td><td>" +
                esc(k && currentKnowledge(k) ? "Current" : "Needs review") +
                "</td><td>" +
                esc(k ? k.reviewDue : "Unset") +
                "</td><td>" +
                btn(k ? "Review" : "Assign owner", "reviewArticle", [d.slug]) +
                "</td></tr>"
              );
            })
            .join("") +
          "</tbody></table></div>",
      );
    } catch (e) {
      error(e);
    }
  }
  function collection(t, p) {
    try {
      shell(titles[t], listHTML(read(), t, p));
    } catch (e) {
      error(e);
    }
  }
  function globalResultsHTML(q) {
    try {
      var results = search(q, "")
        .filter(function (r) {
          return r.type !== "wiki";
        })
        .slice(0, 12);
      return results.length
        ? '<section class="pulse-work"><h3>Connected records & manuals</h3>' +
            results
              .map(function (r) {
                return (
                  "<p>" +
                  btn(r.title, "searchGo", [r.type, r.id, r.page || 1]) +
                  " " +
                  esc(r.status) +
                  "</p>"
                );
              })
              .join("") +
            "</section>"
        : "";
    } catch (e) {
      return (
        '<p class="pulse-work" role="alert">Connected search unavailable: ' +
        esc(e.message) +
        "</p>"
      );
    }
  }
  function searchGo(t, id, page) {
    if (typeof globalSearchClose === "function") globalSearchClose();
    if (t === "manual") openFile(id, page);
    else detail(t, id);
  }
  function departmentHTML(p, dept) {
    try {
      var s = read(),
        ks = s.knowledge.filter(function (k) {
          return k.department === dept && (!k.production || k.production === p);
        }),
        as = s.assets.filter(function (a) {
          return a.department === dept && (!a.production || a.production === p);
        });
      return (
        '<aside class="pulse-work pw-context"><strong>Department knowledge & resources</strong><p>' +
        ks.length +
        " linked articles · " +
        as.length +
        " registered assets</p>" +
        ks
          .map(function (k) {
            return btn(
              k.name + (currentKnowledge(k) ? "" : " · review needed"),
              "openArticle",
              [k.slug],
            );
          })
          .join("") +
        as
          .map(function (a) {
            return btn(a.name, "detail", ["assets", a.id]);
          })
          .join("") +
        btn("Link article", "edit", [
          "knowledge",
          null,
          p,
          { department: dept },
        ]) +
        "</aside>"
      );
    } catch (e) {
      return "";
    }
  }
  function searchDialog(filter) {
    shell(
      "Search Pulse",
      '<label>Search articles, aliases, manuals and connected records<input id="pw-search" type="search" autofocus placeholder="Model, symptom, barcode, owner…"></label><p>Results show recorded sources and review status. Imported text is not automatically verified.</p><div id="pw-results" aria-live="polite"></div>',
    );
    document.getElementById("pw-search").oninput = function (e) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        searchResults(e.target.value, filter);
      }, 180);
    };
  }
  function normalize(x) {
    return String(x || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }
  function search(q, filter) {
    var tokens = normalize(q).trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];
    var s = read(),
      wikiVersion = root.PulseKB ? PulseKB.databaseVersion() : 0,
      key =
        s.revision +
        ":" +
        wikiVersion +
        ":" +
        (typeof permRoleDef === "function" ? permRoleDef().id : "default");
    if (!indexCache || indexCache.key !== key) {
      var rows = C.types.flatMap(function (t) {
        if (!allowed(t) && ["costs", "quotes", "vendors"].includes(t))
          return [];
        return s[t].map(function (r) {
          return {
            type: t,
            id: r.id,
            title: r.name,
            body: normalize(JSON.stringify(r)),
            status: stateLabel(t, r),
          };
        });
      });
      if (root.PulseKB)
        PulseKB.search("").forEach(function (d) {
          rows.push({
            type: "wiki",
            id: d.slug,
            title: d.title,
            body: normalize(d.title + " " + d.body),
            revision: d.revision,
            status: d.sample
              ? "Sample · review required"
              : "See recorded review",
          });
        });
      s.documents.forEach(function (d) {
        ((d.file && d.file.pages) || []).forEach(function (p, i) {
          rows.push({
            type: "manual",
            id: d.id,
            page: i + 1,
            title: d.name + " · page " + (i + 1),
            body: normalize(p),
            status: "Document revision " + d.version,
          });
        });
      });
      indexCache = { key: key, rows: rows };
    }
    return indexCache.rows
      .filter(function (r) {
        return (
          (!filter ||
            (filter === "knowledge" &&
              ["knowledge", "wiki", "manual", "documents"].includes(r.type)) ||
            filter === r.type) &&
          tokens.every(function (w) {
            return (
              r.body.includes(w) ||
              (w.length > 4 &&
                r.body.split(/\W+/).some(function (x) {
                  return typo(w, x);
                }))
            );
          })
        );
      })
      .map(function (r) {
        return Object.assign({}, r, {
          score: tokens.reduce(function (n, w) {
            return n + (normalize(r.title).includes(w) ? 5 : 1);
          }, 0),
        });
      })
      .sort(function (a, b) {
        return b.score - a.score;
      })
      .slice(0, 80);
  }
  function typo(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    var i = 0,
      j = 0,
      edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        i++;
        j++;
      } else {
        if (++edits > 1) return false;
        if (a.length >= b.length) i++;
        if (b.length >= a.length) j++;
      }
    }
    return edits + (i < a.length || j < b.length ? 1 : 0) <= 1;
  }
  function searchResults(q, filter) {
    try {
      var rows = search(q, filter);
      document.getElementById("pw-results").innerHTML = rows.length
        ? rows
            .map(function (r) {
              return (
                "<article>" +
                btn(
                  r.title,
                  r.type === "wiki"
                    ? "openArticle"
                    : r.type === "manual"
                      ? "openFile"
                      : "detail",
                  r.type === "wiki"
                    ? [r.id]
                    : r.type === "manual"
                      ? [r.id, r.page]
                      : [r.type, r.id],
                ) +
                "<p>" +
                esc(r.status) +
                "</p></article>"
              );
            })
            .join("")
        : "<p>No matches. Try a model, barcode or symptom.</p>";
    } catch (e) {
      error(e);
    }
  }
  function freezeEdition(id) {
    try {
      var rec = R.read("operations", C.empty()),
        r = C.item(rec.value, "documents", id),
        p = productions[r.production];
      if (!p) throw Error("Link this document to a production first");
      var sections = techbookSections(p),
        capturedAt = new Date().toISOString();
      shell(
        "Freeze techbook edition",
        operatorHTML() +
          "<p>Select sections for " +
          esc(r.name) +
          " · " +
          esc(r.version) +
          '. The edition retains these exact section contents and requires document review before recipient acceptance.</p><form id="pw-edition">' +
          sections
            .map(function (s, i) {
              return (
                '<label><span><input type="checkbox" name="section" value="' +
                i +
                '" checked style="width:auto"> ' +
                esc(s.title) +
                "</span></label>"
              );
            })
            .join("") +
          '<button type="submit">Freeze selected sections</button></form>',
      );
      document.getElementById("pw-edition").onsubmit = async function (e) {
        e.preventDefault();
        var activeDialog = e.target.closest("dialog");
        try {
          var selected = new FormData(e.target)
            .getAll("section")
            .map(function (i) {
              return sections[Number(i)];
            });
          await change(
            {
              type: "freezeEdition",
              collection: "documents",
              id: id,
              edition: {
                capturedAt: capturedAt,
                production: r.production,
                metadata: {
                  name: p.name,
                  venue: p.venue,
                  date: p.date,
                  customer: p.customer,
                },
                sections: selected,
              },
            },
            rec.version,
          );
          if (
            activeDialog.open &&
            activeDialog === document.getElementById("pulse-work-dialog")
          )
            detail("documents", id);
          refresh(r.production);
        } catch (e) {
          error(e);
        }
      };
    } catch (e) {
      error(e);
    }
  }
  function exportEdition(id) {
    try {
      var r = C.item(read(), "documents", id);
      if (!r.edition) throw Error("Freeze the edition first");
      downloadTechbook(r.production, {
        sections: r.edition.sections,
        productionSnapshot: r.edition.metadata,
        titleLabel:
          r.name + " · " + r.version + " · frozen " + r.edition.capturedAt,
        fileTag: "Edition_" + r.version,
        frozen: true,
      });
    } catch (e) {
      error(e);
    }
  }
  function chooseFile(accept, fn) {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = function () {
      if (input.files[0]) Promise.resolve(fn(input.files[0])).catch(error);
    };
    input.click();
  }
  async function pdfLibrary() {
    var lib = await import("./vendor/pdfjs/pdf.mjs?v=6.3.289");
    lib.GlobalWorkerOptions.workerSrc =
      "js/vendor/pdfjs/pdf.worker.mjs?v=6.3.289";
    return lib;
  }
  function attach(id) {
    var version = R.read("operations", C.empty()).version;
    chooseFile(
      ".pdf,.png,.jpg,.jpeg,.webp,.mp4,.webm,.txt",
      async function (file) {
        var meta = await R.saveFile(file);
        if (file.type === "application/pdf") {
          try {
            var lib = await pdfLibrary(),
              pdf = await lib.getDocument({
                data: await file.arrayBuffer(),
                isEvalSupported: false,
              }).promise;
            meta.pages = [];
            for (var i = 1; i <= pdf.numPages; i++) {
              if (i > 500)
                throw Error("PDF exceeds 500 pages; split it for indexing");
              var page = await pdf.getPage(i),
                text = await page.getTextContent();
              meta.pages.push(
                text.items
                  .map(function (x) {
                    return x.str || "";
                  })
                  .join(" "),
              );
              page.cleanup();
              if (meta.pages.join("").length > 500000)
                throw Error("PDF text exceeds 500 KB; split it for indexing");
            }
            meta.indexStatus = meta.pages.some(Boolean)
              ? "Text indexed"
              : "Image-only PDF: OCR text is required for search";
          } catch (e) {
            meta.pages = [];
            meta.indexStatus = "Not indexed: " + e.message;
          } finally {
            if (pdf && pdf.loadingTask) await pdf.loadingTask.destroy();
          }
        } else if (file.type === "text/plain") {
          var text = await file.text();
          meta.pages = [text.slice(0, 500000)];
          meta.indexStatus =
            text.length > 500000 ? "First 500 KB indexed" : "Text indexed";
        }
        var r = C.item(read(), "documents", id);
        shell(
          "Attach " + file.name,
          operatorHTML() +
            "<p>" +
            esc(meta.indexStatus || "Media stored locally") +
            '</p><p>Replacing content increments the document revision and requires review.</p><button id="pw-attach-confirm">Attach to ' +
            esc(r.name) +
            "</button>",
        );
        document.getElementById("pw-attach-confirm").onclick =
          async function () {
            var activeDialog = this.closest("dialog");
            try {
              await change(
                { type: "attach", collection: "documents", id: id, file: meta },
                version,
              );
              if (
                activeDialog.open &&
                activeDialog === document.getElementById("pulse-work-dialog")
              )
                detail("documents", id);
              refresh(r.production);
            } catch (e) {
              error(e);
            }
          };
      },
    );
  }
  async function openFile(id, pageNumber) {
    try {
      var r = C.item(read(), "documents", id),
        f = r.file;
      if (!f) throw Error("No attachment");
      var local = await R.getFile(f.id),
        url = local
          ? URL.createObjectURL(local.blob)
          : f.storageId
            ? await R.fileUrl(f.storageId)
            : null;
      if (!local && url) {
        var response = await fetch(url);
        if (!response.ok) throw Error("Shared attachment unavailable");
        local = {
          blob: new Blob([await response.arrayBuffer()], { type: f.type }),
        };
        url = URL.createObjectURL(local.blob);
      }
      if (!url)
        throw Error(
          "Attachment is local to its uploading browser. Upload it for sharing first.",
        );
      var u = new URL(url, location.href);
      if (!["blob:", "https:"].includes(u.protocol))
        throw Error("Invalid attachment URL");
      var content =
        f.type === "application/pdf"
          ? '<iframe sandbox="allow-scripts" title="' +
            esc(r.name) +
            '" class="pw-media" src="' +
            esc(url) +
            "#page=" +
            (Number(pageNumber) || 1) +
            '"></iframe>'
          : f.type.startsWith("image/")
            ? '<img class="pw-media" alt="' +
              esc(r.name) +
              '" src="' +
              esc(url) +
              '">'
            : f.type.startsWith("video/")
              ? '<video class="pw-media" controls src="' +
                esc(url) +
                '"></video>'
              : "<pre>" +
                esc(
                  local
                    ? await local.blob.text()
                    : await (await fetch(url)).text(),
                ) +
                "</pre>";
      var d = shell(
        r.name + " · revision " + r.version,
        "<p>" +
          esc(f.indexStatus || "") +
          "</p>" +
          content +
          "<ol>" +
          (r.annotations || [])
            .filter(function (a) {
              return a.revision === r.revision;
            })
            .map(function (a) {
              return (
                "<li>Page " +
                a.page +
                " · (" +
                a.x +
                ", " +
                a.y +
                ") " +
                esc(a.text) +
                " — " +
                esc(a.actor) +
                "</li>"
              );
            })
            .join("") +
          "</ol>",
      );
      if (local)
        d.addEventListener(
          "close",
          function () {
            URL.revokeObjectURL(url);
          },
          { once: true },
        );
    } catch (e) {
      error(e);
    }
  }
  async function shareFile(id) {
    try {
      var rec = R.read("operations", C.empty()),
        r = C.item(rec.value, "documents", id);
      if (!actor())
        throw Error("Save a responsible operator on a record before uploading");
      var storageId = await R.sharedFile(r.file.id);
      await change(
        {
          type: "shareAttachment",
          collection: "documents",
          id: id,
          storageId: storageId,
        },
        rec.version,
      );
      detail("documents", id);
      notice = "Attachment uploaded. Sync records to publish its reference.";
    } catch (e) {
      error(e);
    }
  }
  function storage() {
    if (typeof permIsAdmin === "function" && !permIsAdmin()) {
      error(
        Error(
          "Shared synchronization and full-workspace recovery require the administrator role",
        ),
      );
      return;
    }
    shell(
      "Synchronization & recovery",
      "<p>" +
        esc(R.state("operations")) +
        "</p><p>" +
        esc(R.state("wiki")) +
        '</p><p>Sync uses the configured shared service. Local edits stay on this browser until synchronization succeeds. Export before clearing browser data.</p><div class="pw-toolbar">' +
        btn("Sync operations", "sync", ["operations"]) +
        btn("Sync Wiki", "sync", ["wiki"]) +
        btn("Export operations", "exportRecords", ["operations"]) +
        btn("Export Wiki", "exportRecords", ["wiki"]) +
        btn("Reconcile operations", "reconciliation", ["operations"]) +
        btn("Reconcile Wiki", "reconciliation", ["wiki"]) +
        btn("Import operations backup", "importBackup", ["operations"]) +
        btn("Import Wiki backup", "importBackup", ["wiki"]) +
        "</div><p>Attachments are stored separately. Upload each attachment for cross-device use. Audience labels organize distribution; the current shared-password workspace does not enforce per-recipient confidentiality.</p>",
    );
  }
  function exportRecords(name) {
    if (typeof permIsAdmin === "function" && !permIsAdmin()) {
      error(Error("Full-workspace exports require the administrator role"));
      return;
    }
    var value = name === "wiki" ? PulseKB.exportDatabase() : read();
    download(
      "Pulse-" + name + "-" + new Date().toISOString().slice(0, 10) + ".json",
      JSON.stringify(value, null, 2),
    );
  }
  async function sync(name) {
    try {
      if (name === "wiki") await PulseKB.flushShared();
      var initial = name === "wiki" ? PulseKB.exportDatabase() : C.empty(),
        local = R.read(name, initial),
        remote = await R.remote(name);
      if (remote.value)
        (name === "wiki" ? PulseKB.validateDatabase : C.validate)(remote.value);
      var result = await R.synchronize(name, initial);
      if (
        name === "wiki" &&
        JSON.stringify(result.value) !==
          JSON.stringify(PulseKB.exportDatabase())
      ) {
        var replaced = await PulseKB.replaceDatabase(result.value);
        if (replaced && replaced.error) throw Error(replaced.error.info);
        await PulseKB.flushShared();
      }
      storage();
      refresh();
    } catch (e) {
      error(e);
    }
  }
  function validatePackage(name, v) {
    return name === "wiki" ? PulseKB.validateDatabase(v) : C.validate(v);
  }
  async function reconciliation(name) {
    try {
      var initial = name === "wiki" ? PulseKB.exportDatabase() : C.empty(),
        local = R.read(name, initial),
        remote = await R.remote(name);
      if (remote.value) validatePackage(name, remote.value);
      shell(
        "Reconcile " + name,
        "<p>Local version " +
          local.version +
          " · shared version " +
          remote.version +
          '</p><p>Compare both copies, then import your reviewed merged JSON. No copy is replaced until you save the reconciliation.</p><div class="pw-toolbar"><button id="pw-local">Download local</button><button id="pw-remote">Download shared</button><button id="pw-merge">Import reviewed merge</button></div>',
      );
      document.getElementById("pw-local").onclick = function () {
        download(
          "Pulse-" + name + "-local.json",
          JSON.stringify(local.value, null, 2),
        );
      };
      document.getElementById("pw-remote").onclick = function () {
        download(
          "Pulse-" + name + "-shared.json",
          JSON.stringify(remote.value, null, 2),
        );
      };
      document.getElementById("pw-merge").onclick = function () {
        chooseFile(".json", async function (file) {
          var merged = validatePackage(name, C.parse(await file.text()));
          await R.reconcile(
            name,
            initial,
            local.version,
            merged,
            remote.version,
          );
          if (name === "wiki") {
            var result = await PulseKB.replaceDatabase(merged);
            if (result && result.error) throw Error(result.error.info);
          }
          storage();
          refresh();
        });
      };
    } catch (e) {
      error(e);
    }
  }
  function importBackup(name) {
    var local = R.read(
      name,
      name === "wiki" ? PulseKB.exportDatabase() : C.empty(),
    );
    chooseFile(".json", async function (file) {
      var value = validatePackage(name, C.parse(await file.text()));
      shell(
        "Restore " + name + " backup",
        "<p>Existing copy: version " +
          local.version +
          ". Export it before applying this validated backup.</p>" +
          btn("Export current copy", "exportRecords", [name]) +
          '<button id="pw-restore">Apply this backup locally</button>',
      );
      document.getElementById("pw-restore").onclick = async function () {
        try {
          if (name === "wiki") {
            if (R.read(name, {}).version !== local.version)
              throw Error("Wiki changed; reopen recovery");
            var r = await PulseKB.replaceDatabase(value);
            if (r && r.error) throw Error(r.error.info);
          } else await R.commit(name, C.empty(), local.version, value);
          storage();
          refresh();
        } catch (e) {
          error(e);
        }
      };
    });
  }
  function legacy(p) {
    try {
      if (typeof loadInvOnce === "function") loadInvOnce();
      var s = read(),
        rows = (typeof inventory !== "undefined" ? inventory : [])
          .map(function (r) {
            return {
              type: "assets",
              id: r.id,
              name: r.name,
              values: {
                name: r.name,
                production: r.project || p || "",
                legacyRef: r.barcode || r.id,
                serial: r.serial,
                department: r.category,
                model: r.name,
                state: r.status,
                notes: r.notes,
              },
            };
          })
          .concat(
            (typeof vendors !== "undefined" ? vendors : []).map(function (r) {
              return {
                type: "vendors",
                id: r.id,
                name: r.name,
                values: {
                  name: r.name,
                  production: p || "",
                  legacyRef: r.id,
                  contact: [r.contact, r.email, r.phone]
                    .filter(Boolean)
                    .join(" · "),
                  notes: r.notes,
                  state: "draft",
                },
              };
            }),
          );
      rows = rows.concat(
        (typeof personnelRoster === "function" ? personnelRoster() : []).map(
          function (r) {
            return {
              type: "people",
              id: r.id,
              name: r.name,
              values: {
                name: r.name,
                production: "",
                legacyRef: r.id,
                role: r.pos,
                state: "draft",
              },
            };
          },
        ),
      );
      if (p && productions[p])
        rows.push({
          type: "venues",
          id: p,
          name: productions[p].venue || productions[p].name,
          values: {
            name: productions[p].venue || productions[p].name,
            production: p,
            legacyRef: "production-venue:" + p,
            state: "draft",
          },
        });
      shell(
        "Link existing record",
        "<p>Choose existing equipment, personnel, a vendor or this production’s venue to extend. Its original ID or barcode is retained. Existing sample entries remain sample data until you validate them.</p>" +
          rows
            .map(function (r, i) {
              var linked = s[r.type].find(function (x) {
                return x.legacyRef === r.values.legacyRef;
              });
              return (
                "<p>" +
                esc(r.name) +
                " " +
                (linked
                  ? btn("Open connected record", "detail", [r.type, linked.id])
                  : '<button type="button" data-legacy="' +
                    i +
                    '">Link ' +
                    esc(r.values.legacyRef) +
                    "</button>") +
                "</p>"
              );
            })
            .join(""),
      );
      document.querySelectorAll("[data-legacy]").forEach(function (b) {
        b.onclick = function () {
          var r = rows[Number(b.dataset.legacy)];
          edit(r.type, null, p, r.values);
        };
      });
    } catch (e) {
      error(e);
    }
  }
  function troubleshoot(id) {
    try {
      var s = read(),
        r = C.item(s, "sessions", id),
        g = C.item(s, "guides", r.guide),
        k = C.item(s, "knowledge", g.article);
      if (!currentKnowledge(k))
        throw Error(
          "Review the guide’s source article before starting troubleshooting",
        );
      var steps = C.parse(g.steps),
        last = (r.answers || []).slice(-1)[0],
        next = last
          ? steps.find(function (x) {
              return x.id === last.step;
            })[last.answer]
          : steps[0].id;
      if (!next) {
        detail("sessions", id);
        return;
      }
      var step = steps.find(function (x) {
          return x.id === next;
        }),
        version = R.read("operations", C.empty()).version;
      shell(
        r.name,
        "<p>Source: " +
          esc(k.name) +
          " · article revision " +
          k.approval.articleRevision +
          "</p><h3>" +
          esc(step.prompt) +
          '</h3><form id="pw-answer">' +
          operatorHTML() +
          '<label>Observation / measured evidence<textarea name="evidence" required></textarea></label><label>Result<select name="answer"><option value="yes">Yes</option><option value="no">No</option></select></label><button type="submit">Record and continue</button></form>',
      );
      document.getElementById("pw-answer").onsubmit = async function (e) {
        e.preventDefault();
        try {
          var f = new FormData(e.target);
          await change(
            {
              type: "answer",
              collection: "sessions",
              id: id,
              step: next,
              answer: f.get("answer"),
              evidence: f.get("evidence"),
            },
            version,
          );
          troubleshoot(id);
        } catch (e) {
          error(e);
        }
      };
    } catch (e) {
      error(e);
    }
  }
  async function lessonArticle(id) {
    try {
      var r = C.item(read(), "lessons", id),
        slug =
          "SOP:" +
          r.name.replace(/[^a-zA-Z0-9 -]/g, "").replace(/\s+/g, "_") +
          "_" +
          r.id.slice(0, 8),
        result = await PulseKB.put(
          { slug: slug, title: slug, kind: "sop", show: r.production },
          "== Observed issue ==\n" +
            r.finding +
            "\n== Proposed corrective action ==\n" +
            r.action +
            "\n== Review required ==\nDraft derived from lesson " +
            r.id +
            ". Validate sources and applicability before use.",
          "Lesson draft",
        );
      if (result && result.error) throw Error(result.error.info);
      reviewArticle(slug);
    } catch (e) {
      error(e);
    }
  }
  function incidentDraft(p, id) {
    try {
      var r = PulseLive.read(p).incidents.find(function (x) {
        return x.id === id;
      });
      if (!r) throw Error("Incident not found");
      edit("lessons", null, p, {
        name: r.title,
        category: "Incident",
        owner: r.owner,
        finding: r.notes + "\nIncident " + r.id + " · " + r.status,
        action: r.resolution || "",
        procedure: r.procedure || "",
      });
    } catch (e) {
      error(e);
    }
  }
  async function poll(id) {
    try {
      var rec = R.read("operations", C.empty()),
        r = C.item(rec.value, "integrations", id);
      if (!r.endpoint || r.state !== "active")
        throw Error("Configure an active same-origin adapter first");
      var response = await fetch(r.endpoint, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10000),
        }),
        data = await response.json();
      if (!response.ok) throw Error(data.error || "Adapter unavailable");
      await change(
        {
          type: "observe",
          collection: "integrations",
          id: id,
          observations: data.observations,
          trusted: true,
        },
        rec.version,
      );
      detail("integrations", id);
    } catch (e) {
      error(e);
    }
  }
  function importObservations(id) {
    var rec = R.read("operations", C.empty());
    chooseFile(".json", async function (file) {
      var data = C.parse(await file.text());
      shell(
        "Import unverified observations",
        operatorHTML() +
          '<p>Imported observations remain unverified and do not release the show.</p><button id="pw-observe">Record imported report</button>',
      );
      document.getElementById("pw-observe").onclick = async function () {
        try {
          await change(
            {
              type: "observe",
              collection: "integrations",
              id: id,
              observations: data.observations,
              trusted: false,
            },
            rec.version,
          );
          detail("integrations", id);
        } catch (e) {
          error(e);
        }
      };
    });
  }
  function offline() {
    shell(
      "Offline knowledge pack",
      '<form id="pw-offline"><label>Audience label (blank includes unrestricted articles only)<input name="audience"></label><label>Edition name<input name="edition" required value="Field knowledge"></label><p>Exports current reviewed articles and their cited sources as a searchable, standalone HTML snapshot. Review dates remain visible offline. Optional manuals and media must be available locally or from shared attachment storage.</p><label><span><input type="checkbox" name="attachments" style="width:auto"> Include linked manuals and media (up to 50 MB)</span></label><button type="submit">Download edition</button></form>',
    );
    document.getElementById("pw-offline").onsubmit = async function (e) {
      e.preventDefault();
      try {
        var f = new FormData(e.target),
          audience = f.get("audience"),
          rows = read().knowledge.filter(function (k) {
            return (
              currentKnowledge(k) &&
              (!k.audience.length || k.audience.includes(audience))
            );
          });
        if (!rows.length)
          throw Error("No current reviewed articles match this audience");
        var media = "";
        if (f.get("attachments")) {
          var ids = Array.from(
              new Set(
                rows.flatMap(function (k) {
                  return k.documents;
                }),
              ),
            ),
            total = 0;
          for (var di = 0; di < ids.length; di++) {
            var doc = C.item(read(), "documents", ids[di]);
            if (
              !doc.file ||
              (doc.audience.length && !doc.audience.includes(audience))
            )
              continue;
            total += doc.file.size;
            if (total > 50000000)
              throw Error(
                "Linked media exceeds 50 MB; create a smaller audience edition",
              );
            var stored = await R.getFile(doc.file.id),
              blob = stored && stored.blob;
            if (!blob && doc.file.storageId) {
              var url = await R.fileUrl(doc.file.storageId),
                response = await fetch(url);
              if (!response.ok)
                throw Error("Shared manual unavailable: " + doc.name);
              blob = await response.blob();
            }
            if (!blob)
              throw Error("Manual is unavailable in this browser: " + doc.name);
            var data = await new Promise(function (resolve, reject) {
              var reader = new FileReader();
              reader.onload = function () {
                resolve(reader.result);
              };
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            media +=
              '<p><a download="' +
              esc(doc.file.name) +
              '" href="' +
              esc(data) +
              '">' +
              esc(doc.name) +
              " · " +
              esc(doc.version) +
              "</a></p>";
          }
        }
        var content = rows
          .map(function (k) {
            var d = PulseKB.bySlug(k.slug);
            return (
              "<article><h2>" +
              esc(k.name) +
              "</h2><p>Owner " +
              esc(k.owner) +
              " · article revision " +
              d.revision +
              " · review due " +
              esc(k.reviewDue) +
              "</p><pre>" +
              esc(d.body) +
              "</pre><ul>" +
              k.sources
                .map(function (u) {
                  return "<li>" + esc(u) + "</li>";
                })
                .join("") +
              "</ul></article>"
            );
          })
          .join("");
        download(
          "Pulse-knowledge-edition.html",
          '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'"><title>' +
            esc(f.get("edition")) +
            "</title><style>body{font:16px system-ui;max-width:900px;margin:auto;padding:24px;color:#172032;background:#fff}input{font:inherit;padding:12px;width:90%}article{border-top:1px solid #bbb;margin-top:24px}pre{white-space:pre-wrap;font:inherit;overflow-wrap:anywhere}@media(prefers-color-scheme:dark){body{background:#111827;color:#eee}}</style><h1>" +
            esc(f.get("edition")) +
            "</h1><p>Frozen " +
            new Date().toISOString() +
            " · " +
            rows.length +
            ' articles. Recheck review dates and equipment applicability before use.</p><label>Search this edition <input id="search" type="search"></label>' +
            content +
            "<section><h2>Included manuals and media</h2>" +
            media +
            '</section><script>document.getElementById("search").oninput=function(){var q=this.value.toLowerCase();document.querySelectorAll("article").forEach(function(a){a.hidden=!a.textContent.toLowerCase().includes(q);});};</script></html>',
          "text/html",
        );
        close();
      } catch (e) {
        error(e);
      }
    };
  }
  function mountSections() {
    var mapping = {
      equipment: ["assets", "maintenance"],
      personnel: ["people", "training"],
      vendors: ["vendors", "quotes"],
      schedule: ["bookings"],
    };
    Object.keys(mapping).forEach(function (view) {
      var host = document.getElementById("view-" + view);
      if (!host) return;
      var id = "pulse-work-global-" + view,
        node = document.getElementById(id);
      if (!node) {
        node = document.createElement("section");
        node.id = id;
        node.className = "pulse-work";
        host.appendChild(node);
      }
      node.innerHTML =
        "<header><h2>Connected " +
        esc(
          view === "equipment"
            ? "equipment lifecycle"
            : view === "schedule"
              ? "resource schedule"
              : view,
        ) +
        "</h2></header>" +
        toolbar("") +
        mapping[view]
          .map(function (t) {
            return (
              "<details><summary>" +
              esc(titles[t]) +
              "</summary>" +
              listHTML(read(), t, "") +
              "</details>"
            );
          })
          .join("");
    });
  }
  function mountDashboard() {
    var host = document.getElementById("view-dashboard");
    if (!host) return;
    var node = document.getElementById("pulse-work-dashboard");
    if (!node) {
      node = document.createElement("section");
      node.id = "pulse-work-dashboard";
      node.className = "pulse-work";
      host.appendChild(node);
    }
    try {
      mountSections();
      node.innerHTML =
        "<header><h2>Connected operations</h2>" +
        btn("Open workflows", "hub", [""]) +
        "</header>" +
        toolbar("") +
        alertHTML(read(), "");
    } catch (e) {
      node.textContent = e.message;
    }
  }
  root.PulseWork = {
    knowledgeHealth: knowledgeHealth,
    mountSections: mountSections,
    removeGuideStep: removeGuideStep,
    addGuideStep: addGuideStep,
    updateGuideSteps: updateGuideSteps,
    globalResultsHTML: globalResultsHTML,
    searchGo: searchGo,
    paneHTML: paneHTML,
    departmentHTML: departmentHTML,
    wikiHubHTML: wikiHubHTML,
    articleHTML: articleHTML,
    reviewArticle: reviewArticle,
    knowledgeStatus: knowledgeStatus,
    currentKnowledge: currentKnowledge,
    read: read,
    change: change,
    edit: edit,
    close: close,
    detail: detail,
    act: act,
    exportDraft: exportDraft,
    openArticle: openArticle,
    hub: hub,
    collection: collection,
    searchDialog: searchDialog,
    search: search,
    attach: attach,
    openFile: openFile,
    freezeEdition: freezeEdition,
    exportEdition: exportEdition,
    shareFile: shareFile,
    storage: storage,
    sync: sync,
    exportRecords: exportRecords,
    reconciliation: reconciliation,
    importBackup: importBackup,
    legacy: legacy,
    troubleshoot: troubleshoot,
    lessonArticle: lessonArticle,
    incidentDraft: incidentDraft,
    poll: poll,
    importObservations: importObservations,
    offline: offline,
  };
  R.registerValidator("operations", C.validate);
  R.registerValidator("wiki", function (v) {
    return PulseKB.validateDatabase(v);
  });
  root.addEventListener("pulse-records-change", function (e) {
    indexCache = null;
    if (e.detail.external) {
      var box = document.getElementById("pw-error");
      if (box)
        box.textContent =
          "Another tab changed records. Your form is retained; export the draft before reopening.";
    }
    mountDashboard();
  });
  root.addEventListener("pulse-wiki-saved", function () {
    indexCache = null;
  });
  root.addEventListener("hashchange", function () {
    setTimeout(mountSections, 0);
  });
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", mountDashboard);
  else mountDashboard();
})(window);
