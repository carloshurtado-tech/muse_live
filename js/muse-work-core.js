/* Connected production records. No hardware control or automatic outbound messages. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MuseWorkCore = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  var schemas = {
    assets: {
      name: "Name",
      production: "Production",
      department: "Department",
      legacyRef: "Existing barcode / record ID",
      model: "Model",
      serial: "Serial",
      accessories: "Accessory asset IDs[]assets",
      substitutes: "Approved substitute IDs[]assets",
      inspectionDue: "Inspection due@",
      warrantyEnd: "Warranty end@",
      state: "State",
      notes: "Notes",
    },
    venues: {
      name: "Venue",
      production: "Production",
      legacyRef: "Existing location ID",
      access: "Access / loading instructions",
      parking: "Parking",
      power: "Power reference",
      connectivity: "Connectivity",
      rf: "RF observations",
      restrictions: "Operational restrictions",
      reviewDue: "Reconfirm by@",
      documents: "Document IDs[]documents",
      notes: "Notes",
    },
    people: {
      name: "Person",
      production: "Production",
      legacyRef: "Existing personnel ID",
      role: "Role",
      skills: "Skills[]",
      qualifiedUntil: "Qualification expiry@",
      requiredSkills: "Required skills[]",
      relief: "Relief person ID>people",
      documents: "Onboarding documents[]documents",
      notes: "Notes",
    },
    bookings: {
      name: "Assignment",
      production: "Production",
      phase: "Phase",
      resources: "Resources (asset:id, person:id, venue:id)[]",
      start: "Start@",
      end: "End@",
      setupMinutes: "Setup minutes#",
      strikeMinutes: "Strike minutes#",
      requiredSkills: "Required skills[]",
      journey: "Travel record>journeys",
      state: "State",
      notes: "Notes",
    },
    gates: {
      name: "Readiness requirement",
      production: "Production",
      phase: "Phase",
      department: "Department",
      owner: "Responsible owner",
      due: "Due@",
      dependsOn: "Depends on requirements[]gates",
      resources: "Affected resources[]",
      evidence: "Evidence / next action",
      state: "State",
      notes: "Notes",
    },
    maintenance: {
      name: "Service / repair",
      production: "Production",
      asset: "Asset>assets",
      owner: "Owner",
      due: "Due@",
      symptom: "Symptom",
      resolution: "Resolution",
      procedure: "Wiki article slug",
      parts: "Parts",
      state: "State",
      notes: "Notes",
    },
    shipments: {
      name: "Manifest",
      production: "Production",
      assets: "Expected assets[]assets",
      origin: "Origin",
      destination: "Destination",
      owner: "Owner",
      due: "Due@",
      state: "State",
      notes: "Notes",
    },
    journeys: {
      name: "Itinerary",
      production: "Production",
      person: "Traveler>people",
      start: "Departure@",
      end: "Arrival@",
      transferMinutes: "Transfer minutes#",
      confirmation: "Booking reference",
      hotel: "Hotel block",
      pickup: "Ground transport / pickup",
      state: "State",
      notes: "Notes",
    },
    vendors: {
      name: "Vendor",
      production: "Production",
      legacyRef: "Existing vendor ID",
      contact: "Contact",
      documents: "Documents[]documents",
      reviewDue: "Documents valid until@",
      deliverables: "Agreed deliverables",
      state: "State",
      notes: "Notes",
    },
    quotes: {
      name: "Quote",
      production: "Production",
      vendor: "Vendor>vendors",
      category: "Cost category",
      currency: "Currency",
      amount: "Amount#",
      validUntil: "Valid until@",
      deliverables: "Deliverables",
      state: "State",
      notes: "Notes",
    },
    costs: {
      name: "Cost item",
      production: "Production",
      quote: "Quote>quotes",
      category: "Cost category",
      currency: "Currency",
      budget: "Budget#",
      committed: "Committed#",
      received: "Accepted receipt amount#",
      invoiced: "Invoiced#",
      paid: "Paid#",
      reason: "Variance / operational reason",
      owner: "Owner",
      due: "Payment due@",
      state: "State",
      notes: "Notes",
    },
    decisions: {
      name: "Decision / action",
      production: "Production",
      owner: "Owner",
      due: "Due@",
      resources: "Affected resources[]",
      participants: "Required acknowledgments[]",
      resolution: "Decision / outcome",
      state: "State",
      notes: "Notes",
    },
    documents: {
      name: "Document / drawing / manual",
      production: "Production",
      kind: "Kind",
      version: "Revision",
      language: "Language",
      audience: "Intended audience[]",
      resources: "Linked resources[]",
      source: "Source URL",
      reviewDue: "Review due@",
      retentionUntil: "Retain until@",
      supersedes: "Previous document>documents",
      changes: "Revision summary",
      state: "State",
      notes: "Notes",
    },
    deliveries: {
      name: "Delivery / techbook issue",
      production: "Production",
      document: "Document>documents",
      recipient: "Recipient",
      audience: "Audience",
      due: "Due@",
      retentionUntil: "Retention date@",
      qc: "Technical QC evidence",
      rights: "Use / rights restrictions",
      state: "State",
      notes: "Notes",
    },
    lessons: {
      name: "Lesson learned",
      production: "Production",
      category: "Category",
      owner: "Owner",
      finding: "What happened",
      action: "Next production change",
      resources: "Affected resources[]",
      procedure: "Wiki slug",
      state: "State",
      notes: "Notes",
    },
    knowledge: {
      name: "Article",
      production: "Production",
      slug: "Wiki article slug",
      kind: "Article kind",
      department: "Department",
      model: "Applicable model",
      firmware: "Applicable firmware",
      language: "Language",
      translationOf: "Source translation>knowledge",
      aliases: "Search aliases[]",
      owner: "Content owner",
      sources: "Source URLs[]",
      reviewDue: "Next review@",
      audience: "Audience[]",
      resources: "Linked resources[]",
      documents: "Manual / diagram / video documents[]documents",
      state: "State",
      notes: "Notes",
    },
    training: {
      name: "Training path",
      production: "Production",
      role: "Role",
      person: "Learner>people",
      articles: "Required articles[]knowledge",
      due: "Due@",
      state: "State",
      notes: "Notes",
    },
    integrations: {
      name: "Facility integration",
      production: "Production",
      kind: "Adapter kind",
      endpoint: "Same-origin adapter path",
      resources: "Mapped resources[]",
      maxAgeMinutes: "Observation lifetime minutes#",
      state: "State",
      notes: "Notes",
    },
  };
  schemas.guides = {
    name: "Troubleshooting guide",
    production: "Production",
    article: "Reviewed article>knowledge",
    steps: "Branch steps (JSON)",
    state: "State",
    notes: "Notes",
  };
  schemas.sessions = {
    name: "Troubleshooting session",
    production: "Production",
    guide: "Guide>guides",
    resource: "Resource reference",
    owner: "Operator",
    state: "State",
    notes: "Notes",
  };
  var types = Object.keys(schemas);
  function clone(x) {
    return JSON.parse(JSON.stringify(x));
  }
  function fail(m) {
    throw Error(m);
  }
  function parse(text) {
    if (typeof text !== "string" || text.length > 8000000)
      fail("Record package exceeds 8 MB");
    return JSON.parse(text, function (k, v) {
      if (["__proto__", "constructor", "prototype"].indexOf(k) >= 0)
        fail("Unsafe record key");
      return v;
    });
  }
  function empty() {
    var s = { version: 1, revision: 0, events: [], observations: [] };
    types.forEach(function (t) {
      s[t] = [];
    });
    return s;
  }
  function item(s, t, id) {
    var r = (s[t] || []).find(function (r) {
      return r.id === id;
    });
    if (!r) fail("Missing " + t + " record: " + id);
    return r;
  }
  function stamp(v) {
    if (!v) return 0;
    var n = Date.parse(v);
    if (!Number.isFinite(n) || !/(Z|[+-]\d\d:\d\d)$/.test(v))
      fail("Use ISO date/time including timezone");
    return n;
  }
  function clean(t, input) {
    var out = {};
    if (!schemas[t]) fail("Unknown collection");
    Object.keys(schemas[t]).forEach(function (k) {
      var spec = schemas[t][k],
        v = input[k];
      if (spec.indexOf("[]") >= 0)
        out[k] = (Array.isArray(v) ? v : String(v || "").split(","))
          .map(function (x) {
            return String(x).trim();
          })
          .filter(Boolean);
      else if (spec.endsWith("#")) {
        out[k] = v == null || v === "" ? 0 : Number(v);
        if (!Number.isFinite(out[k]) || out[k] < 0) fail("Invalid " + k);
      } else {
        out[k] = String(v == null ? "" : v).trim();
        if (out[k].length > 12000) fail("Field too long");
        if (spec.endsWith("@")) stamp(out[k]);
      }
    });
    if (t === "guides") {
      var steps = parse(out.steps || "[]");
      if (!Array.isArray(steps) || !steps.length || steps.length > 100)
        fail("Guide needs 1–100 steps");
      var ids = steps.map(function (x) {
        return x.id;
      });
      if (new Set(ids).size !== ids.length) fail("Duplicate guide step");
      steps.forEach(function (x) {
        if (
          typeof x.id !== "string" ||
          !x.prompt ||
          ["yes", "no"].some(function (k) {
            return x[k] && ids.indexOf(x[k]) < 0;
          })
        )
          fail("Invalid guide branch");
      });
    }
    if (!out.name) fail("Name is required");
    if (out.currency && !/^[A-Z]{3}$/.test(out.currency))
      fail("Use a three-letter uppercase currency");
    if (
      (t === "bookings" || t === "journeys") &&
      (!out.start || !out.end || stamp(out.end) <= stamp(out.start))
    )
      fail("End must follow start");
    if (
      t === "maintenance" &&
      ["resolved", "complete"].includes(out.state) &&
      (!out.resolution || !out.owner)
    )
      fail("Maintenance closure requires owner and resolution");
    if (t === "documents" && !out.version)
      fail("Document revision is required");
    if (t === "knowledge" && (!out.slug || !out.owner))
      fail("Article slug and owner are required");
    if (
      t === "integrations" &&
      out.endpoint &&
      !/^\/api\/adapters\/[a-z0-9-]+$/.test(out.endpoint)
    )
      fail("Choose a same-origin adapter path");
    return out;
  }
  function resource(s, ref) {
    var split = String(ref).split(":"),
      map = {
        asset: "assets",
        person: "people",
        venue: "venues",
        document: "documents",
      };
    if (!map[split[0]] || split.length !== 2)
      fail("Resource must be asset:id, person:id, venue:id or document:id");
    return item(s, map[split[0]], split[1]);
  }
  function validate(s) {
    if (
      !s ||
      s.version !== 1 ||
      !Number.isSafeInteger(s.revision) ||
      s.revision < 0
    )
      fail("Invalid workspace");
    types.concat(["events", "observations"]).forEach(function (t) {
      if (!Array.isArray(s[t]) || s[t].length > 10000) fail("Invalid " + t);
      var ids = new Set();
      s[t].forEach(function (r) {
        if (
          !r ||
          typeof r.id !== "string" ||
          !/^[-a-zA-Z0-9_]{1,120}$/.test(r.id) ||
          ids.has(r.id)
        )
          fail("Invalid or duplicate ID");
        ids.add(r.id);
      });
    });
    types.forEach(function (t) {
      s[t].forEach(function (r) {
        clean(t, r);
        Object.keys(schemas[t]).forEach(function (k) {
          if (schemas[t][k].includes("[]") && !Array.isArray(r[k]))
            fail("Expected array: " + k);
        });
        if (!Number.isSafeInteger(r.revision) || r.revision < 1)
          fail("Invalid revision");
        Object.keys(schemas[t]).forEach(function (k) {
          var spec = schemas[t][k],
            ref = spec.match(/(?:\[\]|>)([a-z]+)$/);
          if (ref)
            (Array.isArray(r[k]) ? r[k] : [r[k]])
              .filter(Boolean)
              .forEach(function (id) {
                item(s, ref[1], id);
              });
        });
        (r.resources || []).forEach(function (ref) {
          resource(s, ref);
        });
      });
    });
    s.gates.forEach(function (g) {
      var active = new Set(),
        done = new Set();
      function visit(id) {
        if (active.has(id)) fail("Requirement dependency cycle");
        if (done.has(id)) return;
        active.add(id);
        item(s, "gates", id).dependsOn.forEach(visit);
        active.delete(id);
        done.add(id);
      }
      visit(g.id);
    });
    ["assets", "vendors", "people", "venues"].forEach(function (t) {
      var refs = new Set();
      s[t].forEach(function (r) {
        if (r.legacyRef) {
          if (refs.has(r.legacyRef)) fail("Existing record is already linked");
          refs.add(r.legacyRef);
        }
      });
    });
    types.forEach(function (t) {
      s[t].forEach(function (r) {
        if (
          r.approval &&
          (!Number.isFinite(r.approval.at) ||
            !r.approval.actor ||
            !Number.isSafeInteger(r.approval.revision))
        )
          fail("Invalid approval evidence");
        if (
          r.file &&
          (!r.file.id ||
            !r.file.name ||
            !Number.isFinite(r.file.size) ||
            r.file.size < 0 ||
            r.file.size > 20000000 ||
            ![
              "application/pdf",
              "image/png",
              "image/jpeg",
              "image/webp",
              "video/mp4",
              "video/webm",
              "text/plain",
            ].includes(r.file.type) ||
            !Array.isArray(r.file.pages || []) ||
            (r.file.pages || []).some(function (p) {
              return typeof p !== "string";
            }))
        )
          fail("Invalid attachment metadata");
      });
    });
    var slugs = new Set();
    s.knowledge.forEach(function (k) {
      if (slugs.has(k.slug)) fail("Article already has an ownership record");
      slugs.add(k.slug);
    });
    s.events.forEach(function (e) {
      if (!Number.isFinite(e.at) || !e.actor || !e.action)
        fail("Invalid audit event");
    });
    return s;
  }
  function documentCurrent(s, d) {
    return (
      !!d.approval &&
      d.approval.revision === d.revision &&
      (!d.reviewDue || stamp(d.reviewDue) > Date.now())
    );
  }
  function conflicts(s, b) {
    var start =
        stamp(b.start) - (b.setupMinutes || b.transferMinutes || 0) * 60000,
      end = stamp(b.end) + (b.strikeMinutes || 0) * 60000;
    return s.bookings.filter(function (r) {
      return (
        r.id !== b.id &&
        r.state !== "cancelled" &&
        b.state !== "cancelled" &&
        r.resources.some(function (x) {
          return b.resources.indexOf(x) >= 0;
        }) &&
        stamp(r.start) - (r.setupMinutes || 0) * 60000 < end &&
        stamp(r.end) + (r.strikeMinutes || 0) * 60000 > start
      );
    });
  }
  function impacts(s, ref) {
    return types.flatMap(function (t) {
      return s[t]
        .filter(function (r) {
          var parts = ref.split(":");
          return (
            (r.resources || []).indexOf(ref) >= 0 ||
            (parts[0] === "document" &&
              ((r.documents || []).includes(parts[1]) ||
                r.document === parts[1])) ||
            (parts[0] === "asset" &&
              (r.asset === parts[1] || (r.assets || []).includes(parts[1]))) ||
            (parts[0] === "person" && r.person === parts[1])
          );
        })
        .map(function (r) {
          return { type: t, id: r.id, name: r.name, production: r.production };
        });
    });
  }
  function alerts(s, now, production) {
    var out = [];
    function add(t, r, reason) {
      if (!production || r.production === production)
        out.push({
          type: t,
          id: r.id,
          name: r.name,
          production: r.production,
          owner: r.owner || "",
          reason: reason,
        });
    }
    s.gates.forEach(function (r) {
      if (r.state !== "complete")
        add(
          "gates",
          r,
          r.due && stamp(r.due) < now
            ? "Overdue requirement"
            : "Open " + (r.phase || "production") + " requirement",
        );
      if (
        r.dependsOn.some(function (id) {
          return item(s, "gates", id).state !== "complete";
        })
      )
        add("gates", r, "Unresolved dependency");
    });
    s.bookings.forEach(function (r) {
      if (r.state === "cancelled") return;
      r.resources
        .filter(function (x) {
          return x.startsWith("asset:");
        })
        .forEach(function (ref) {
          var a = resource(s, ref);
          if (
            ["maintenance", "out-of-service", "missing", "damaged"].includes(
              a.state,
            )
          )
            add("bookings", r, "Assigned equipment unavailable: " + a.name);
        });
      if (conflicts(s, r).length)
        add("bookings", r, "Resource booking conflict including setup/strike");
      r.resources
        .filter(function (x) {
          return x.startsWith("person:");
        })
        .forEach(function (ref) {
          var p = resource(s, ref);
          if (
            r.requiredSkills.some(function (skill) {
              return p.skills.indexOf(skill) < 0;
            }) ||
            (p.qualifiedUntil && stamp(p.qualifiedUntil) < stamp(r.end))
          )
            add("bookings", r, "Skill / qualification coverage gap: " + p.name);
        });
      if (r.journey) {
        var j = item(s, "journeys", r.journey);
        if (
          j.state === "disrupted" ||
          stamp(j.end) + j.transferMinutes * 60000 >
            stamp(r.start) - r.setupMinutes * 60000
        )
          add("bookings", r, "Travel cannot meet call / setup time");
      }
    });
    [
      "assets",
      "venues",
      "vendors",
      "knowledge",
      "documents",
      "maintenance",
      "training",
      "decisions",
      "deliveries",
    ].forEach(function (t) {
      s[t].forEach(function (r) {
        var due = r.inspectionDue || r.reviewDue || r.due;
        if (
          due &&
          stamp(due) < now &&
          ["complete", "accepted", "resolved", "archived"].indexOf(r.state) < 0
        )
          add(t, r, "Review / action overdue");
      });
    });
    s.costs.forEach(function (r) {
      if (r.quote) {
        var q = item(s, "quotes", r.quote);
        if (r.currency !== q.currency)
          add(
            "costs",
            r,
            "Quote currency differs; record an explicit conversion or select the matching quote",
          );
        if (r.committed > q.amount)
          add("costs", r, "Commitment exceeds selected quote");
      }
      if (r.invoiced > r.received)
        add("costs", r, "Invoice exceeds accepted receipt");
      if (Math.max(r.committed, r.invoiced) > r.budget)
        add("costs", r, "Budget variance requires review");
      if (r.paid > r.invoiced) add("costs", r, "Payment exceeds invoice");
    });
    s.deliveries.forEach(function (r) {
      var d = item(s, "documents", r.document);
      if (!r.acceptance || r.acceptance.documentRevision !== d.revision)
        add("deliveries", r, "Current document revision not acknowledged");
    });
    return out;
  }
  function finance(s, production) {
    var sums = {};
    s.costs
      .filter(function (r) {
        return !production || r.production === production;
      })
      .forEach(function (r) {
        var k = r.currency || "UNSPECIFIED",
          v =
            sums[k] ||
            (sums[k] = {
              currency: k,
              budget: 0,
              committed: 0,
              received: 0,
              invoiced: 0,
              paid: 0,
            });
        Object.keys(v)
          .filter(function (k) {
            return k !== "currency";
          })
          .forEach(function (k) {
            v[k] += Math.round(r[k] * 100);
          });
      });
    return Object.values(sums).map(function (v) {
      Object.keys(v)
        .filter(function (k) {
          return k !== "currency";
        })
        .forEach(function (k) {
          v[k] /= 100;
        });
      v.variance = v.budget - Math.max(v.committed, v.invoiced);
      return v;
    });
  }
  function apply(state, c, ctx) {
    validate(state);
    var s = clone(state),
      actor = String(ctx.actor || "").trim(),
      now = ctx.now || Date.now(),
      id = ctx.id;
    if (
      !actor ||
      actor.length > 160 ||
      !/^[-a-zA-Z0-9_]{1,100}$/.test(id || "")
    )
      fail("Operator and operation ID required");
    if (
      s.events.some(function (e) {
        return e.id === id;
      })
    )
      return s;
    if (c.expectedRevision !== s.revision)
      fail("Records changed; reconcile your draft");
    var r;
    if (c.type === "upsert") {
      var values = clean(c.collection, c.values),
        old = s[c.collection].find(function (r) {
          return r.id === c.id;
        });
      if (
        ["complete", "published", "approved", "accepted"].includes(
          values.state,
        ) &&
        (!old || values.state !== old.state) &&
        [
          "gates",
          "knowledge",
          "documents",
          "training",
          "deliveries",
          "lessons",
        ].includes(c.collection)
      )
        fail("Use the evidence / review action to complete this record");
      if (
        old &&
        JSON.stringify(clean(c.collection, old)) === JSON.stringify(values)
      )
        return s;
      r = Object.assign(values, {
        id: old ? old.id : c.id || id,
        revision: old ? old.revision + 1 : 1,
      });
      if (old) {
        if (c.collection === "documents") {
          if (old.file) r.file = old.file;
          if (old.edition) r.edition = old.edition;
          if (old.annotations) r.annotations = old.annotations;
        }
        if (c.collection === "sessions" && old.answers?.length) {
          if (r.guide !== old.guide)
            fail("Start a new session when changing guides");
          r.answers = old.answers;
          r.guideRevision = old.guideRevision;
        }
        if (
          ["complete", "published", "approved", "accepted"].includes(r.state) &&
          [
            "gates",
            "knowledge",
            "documents",
            "training",
            "deliveries",
            "lessons",
          ].includes(c.collection)
        )
          r.state = "review";
        if (c.collection === "shipments" && old.scans?.length)
          r.scans = old.scans;
        s[c.collection][s[c.collection].indexOf(old)] = r;
      } else s[c.collection].push(r);
      if (
        ["assets", "people", "venues", "documents"].indexOf(c.collection) >= 0
      ) {
        var prefix = {
          assets: "asset",
          people: "person",
          venues: "venue",
          documents: "document",
        }[c.collection];
        impacts(s, prefix + ":" + r.id).forEach(function (x) {
          var affected = item(s, x.type, x.id);
          delete affected.approval;
          if (
            ["complete", "published", "approved", "accepted"].includes(
              affected.state,
            )
          )
            affected.state = "review";
        });
      }
    } else if (c.type === "completeGate") {
      r = item(s, "gates", c.id);
      if (
        !r.owner ||
        !c.evidence ||
        r.dependsOn.some(function (id) {
          return item(s, "gates", id).state !== "complete";
        })
      )
        fail("Owner, evidence and completed dependencies required");
      r.state = "complete";
      r.approval = { actor: actor, at: now, revision: r.revision };
      r.evidence = String(c.evidence);
    } else if (c.type === "scan") {
      r = item(s, "shipments", c.id);
      var a = s.assets.find(function (a) {
        return (
          a.id === c.asset || a.legacyRef === c.asset || a.serial === c.asset
        );
      });
      if (!a || r.assets.indexOf(a.id) < 0)
        fail("Asset is not on this manifest");
      if (
        [
          "picked",
          "loaded",
          "received",
          "returned",
          "damaged",
          "missing",
          "reconciled",
        ].indexOf(c.stage) < 0
      )
        fail("Invalid scan stage");
      r.scans = r.scans || [];
      var prev = r.scans
        .filter(function (x) {
          return x.asset === a.id;
        })
        .slice(-1)[0];
      var order = ["picked", "loaded", "received", "returned"];
      if (
        c.stage === "reconciled" &&
        (!prev || !["damaged", "missing"].includes(prev.stage) || !c.evidence)
      )
        fail("Reconciliation requires an open discrepancy and evidence");
      if (
        order.includes(c.stage) &&
        prev &&
        ["damaged", "missing"].includes(prev.stage)
      )
        fail("Reconcile the discrepancy before moving custody");
      if (prev && prev.stage === "reconciled")
        prev = r.scans
          .filter(function (x) {
            return x.asset === a.id && order.includes(x.stage);
          })
          .slice(-1)[0];
      if (c.stage === "picked" && prev)
        fail(
          "Asset already has custody history; create a return manifest for another journey",
        );
      if (
        order.indexOf(c.stage) > 0 &&
        (!prev || order.indexOf(prev.stage) !== order.indexOf(c.stage) - 1)
      )
        fail("Complete the previous custody stage first");
      if (["damaged", "missing"].indexOf(c.stage) >= 0 && !c.evidence)
        fail("Record discrepancy evidence");
      r.scans.push({
        asset: a.id,
        stage: c.stage,
        actor: actor,
        at: now,
        evidence: String(c.evidence || ""),
      });
    } else if (c.type === "acknowledge") {
      r = item(s, "decisions", c.id);
      if (r.participants.indexOf(actor) < 0)
        fail("Operator is not a required participant");
      r.acks = r.acks || [];
      r.acks = r.acks.filter(function (a) {
        return a.actor !== actor;
      });
      r.acks.push({ actor: actor, at: now, revision: r.revision });
    } else if (c.type === "review") {
      r = item(s, c.collection, c.id);
      if (["knowledge", "documents", "lessons"].indexOf(c.collection) < 0)
        fail("This record cannot be reviewed");
      if (!c.evidence) fail("Review evidence required");
      if (
        c.collection === "knowledge" &&
        (!r.sources.length ||
          !r.reviewDue ||
          stamp(r.reviewDue) <= now ||
          !c.articleRevision)
      )
        fail("Source, future review date and article revision required");
      if (
        c.collection === "knowledge" &&
        r.documents.some(function (id) {
          var d = item(s, "documents", id);
          return (
            !d.approval ||
            d.approval.revision !== d.revision ||
            (d.reviewDue && stamp(d.reviewDue) <= now)
          );
        })
      )
        fail("Review linked documents before publishing this article");
      r.state = c.collection === "knowledge" ? "published" : "approved";
      if (
        c.collection === "knowledge" &&
        (!Number.isSafeInteger(c.articleRevision) || c.articleRevision < 1)
      )
        fail("Invalid article revision");
      r.approval = {
        actor: actor,
        at: now,
        revision: r.revision,
        evidence: String(c.evidence),
        articleRevision: c.articleRevision || null,
        documentRevisions: (r.documents || []).map(function (id) {
          return { id: id, revision: item(s, "documents", id).revision };
        }),
      };
    } else if (c.type === "submitReview") {
      r = item(s, c.collection, c.id);
      r.state = "review";
      delete r.approval;
    } else if (c.type === "acceptDelivery") {
      r = item(s, "deliveries", c.id);
      var d = item(s, "documents", r.document);
      if (
        actor !== r.recipient ||
        !r.qc ||
        !d.approval ||
        d.approval.revision !== d.revision ||
        (d.reviewDue && stamp(d.reviewDue) <= now)
      )
        fail("Named recipient, QC and current document approval required");
      if (d.audience.length && d.audience.indexOf(r.audience) < 0)
        fail("Audience does not match document");
      r.state = "accepted";
      r.acceptance = { actor: actor, at: now, documentRevision: d.revision };
    } else if (c.type === "completeTraining") {
      r = item(s, "training", c.id);
      if (
        !r.articles.length ||
        r.articles.some(function (id) {
          var k = item(s, "knowledge", id);
          return (
            !k.approval || k.state !== "published" || stamp(k.reviewDue) <= now
          );
        })
      )
        fail("Training requires current reviewed articles");
      if (!c.evidence) fail("Completion evidence required");
      r.state = "complete";
      r.completion = {
        actor: actor,
        at: now,
        evidence: String(c.evidence),
        revisions: r.articles.map(function (id) {
          var k = item(s, "knowledge", id);
          return {
            id: id,
            revision: k.revision,
            articleRevision: k.approval.articleRevision,
          };
        }),
      };
    } else if (c.type === "answer") {
      r = item(s, "sessions", c.id);
      var guide = item(s, "guides", r.guide),
        steps = parse(guide.steps),
        answers = r.answers || [],
        previous = answers[answers.length - 1],
        next = previous
          ? steps.find(function (x) {
              return x.id === previous.step;
            })[previous.answer]
          : steps[0].id;
      if (
        !next ||
        c.step !== next ||
        !["yes", "no"].includes(c.answer) ||
        !c.evidence
      )
        fail("Answer the current branch and record evidence");
      if (r.guideRevision && r.guideRevision !== guide.revision)
        fail("Guide changed; start a new session");
      r.guideRevision = guide.revision;
      r.answers = answers.concat([
        {
          step: next,
          answer: c.answer,
          evidence: String(c.evidence),
          actor: actor,
          at: now,
        },
      ]);
      if (
        !steps.find(function (x) {
          return x.id === next;
        })[c.answer]
      )
        r.state = "complete";
    } else if (c.type === "annotate") {
      r = item(s, "documents", c.id);
      if (
        !Number.isFinite(c.x) ||
        !Number.isFinite(c.y) ||
        c.x < 0 ||
        c.x > 1 ||
        c.y < 0 ||
        c.y > 1 ||
        !c.text
      )
        fail("Choose a point and add an annotation");
      r.annotations = (r.annotations || []).concat([
        {
          x: c.x,
          y: c.y,
          text: String(c.text).slice(0, 4000),
          page: c.page || 1,
          actor: actor,
          at: now,
          revision: r.revision,
        },
      ]);
    } else if (c.type === "observe") {
      r = item(s, "integrations", c.id);
      if (!Array.isArray(c.observations) || c.observations.length > 500)
        fail("Invalid observation report");
      c.observations.forEach(function (o) {
        resource(s, o.resource);
        if (
          !Number.isFinite(o.at) ||
          o.at > now ||
          typeof o.metric !== "string" ||
          !["pass", "fail", "unknown"].includes(o.result) ||
          r.resources.indexOf(o.resource) < 0
        )
          fail("Invalid observation");
      });
      s.observations.push({
        id: id,
        adapter: r.id,
        at: now,
        actor: actor,
        source: c.trusted === true ? "adapter-reported" : "imported-unverified",
        items: clone(c.observations),
      });
    } else if (c.type === "freezeEdition") {
      r = item(s, "documents", c.id);
      if (
        !c.edition ||
        !Array.isArray(c.edition.sections) ||
        !c.edition.sections.length ||
        JSON.stringify(c.edition).length > 2000000
      )
        fail("Select valid techbook sections");
      r.edition = clone(c.edition);
      r.revision++;
      r.state = "review";
      delete r.approval;
    } else if (c.type === "shareAttachment") {
      r = item(s, "documents", c.id);
      if (
        !r.file ||
        typeof c.storageId !== "string" ||
        !/^[-a-zA-Z0-9]{1,200}$/.test(c.storageId)
      )
        fail("Invalid shared attachment");
      r.file.storageId = c.storageId;
    } else if (c.type === "attach") {
      r = item(s, "documents", c.id);
      if (
        !c.file ||
        !c.file.id ||
        !c.file.name ||
        !Number.isFinite(c.file.size) ||
        c.file.size < 0 ||
        c.file.size > 20000000
      )
        fail("Invalid document file");
      r.file = clone(c.file);
      delete r.approval;
      r.state = "review";
      r.revision++;
    } else fail("Unknown action");
    if (c.type === "upsert" && c.collection === "gates") {
      var pending = [r.id],
        seen = new Set();
      while (pending.length) {
        var dep = pending.shift();
        if (seen.has(dep)) continue;
        seen.add(dep);
        s.gates
          .filter(function (g) {
            return g.dependsOn.includes(dep);
          })
          .forEach(function (g) {
            delete g.approval;
            if (g.state === "complete") g.state = "review";
            pending.push(g.id);
          });
      }
    }
    s.revision++;
    s.events.push({
      id: id,
      actor: actor,
      at: now,
      action: c.type,
      collection: c.collection || "",
      record: c.id || id,
      production: r?.production || "",
      revision: s.revision,
      changes:
        c.type === "upsert"
          ? Object.keys(schemas[c.collection])
              .filter(function (k) {
                return JSON.stringify(old && old[k]) !== JSON.stringify(r[k]);
              })
              .map(function (k) {
                return {
                  field: k,
                  before: old && old[k] !== undefined ? clone(old[k]) : null,
                  after: clone(r[k]),
                };
              })
          : [],
    });
    validate(s);
    return s;
  }
  return {
    schemas: schemas,
    types: types,
    empty: empty,
    parse: parse,
    validate: validate,
    clone: clone,
    item: item,
    resource: resource,
    stamp: stamp,
    apply: apply,
    alerts: alerts,
    conflicts: conflicts,
    impacts: impacts,
    finance: finance,
  };
});
