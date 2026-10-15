/* NBC Pulse Wiki — MediaWiki-style engine, Pulse chrome. Broadcast knowledge base. */
(function (root) {
  'use strict';
  var KEY = 'nbcpulse_wiki_v2';
  var SEED_VER = 20260827;
  var SITENAME = 'NBC Pulse Wiki';
  var CSRF_ANON = '+\\';
  var TEAMS = ['Audio', 'Cameras', 'TX', 'Power', 'RF', 'ENG', 'Lighting', 'Networking', 'Truck', 'TOC', 'Travel'];
  var COLS = [
    ['', 'All'],
    ['equipment', 'Equipment'],
    ['manual', 'Manuals'],
    ['repair', 'Repairs'],
    ['troubleshooting', 'Troubleshooting'],
    ['procedure', 'Procedures'],
    ['spec', 'Specs'],
    ['incident', 'Incidents'],
    ['help', 'Help']
  ];
  var NS_LIST = [
    { id: -1, name: 'Special' },
    { id: 0, name: '' },
    { id: 1, name: 'Talk' },
    { id: 4, name: 'Pulse' },
    { id: 5, name: 'Pulse talk' },
    { id: 6, name: 'File' },
    { id: 10, name: 'Template' },
    { id: 12, name: 'Help' },
    { id: 14, name: 'Category' },
    { id: 100, name: 'Manual' },
    { id: 102, name: 'Repair' },
    { id: 104, name: 'Troubleshooting' }
  ];
  var NS_ALIAS = { Project: 4, WikiCore: 4, Image: 6 };
  var COL_LANDING = {
    '': 'Main_Page',
    equipment: 'Category:Equipment',
    manual: 'Category:Manuals',
    repair: 'Category:Repairs',
    troubleshooting: 'Category:Troubleshooting',
    procedure: 'Category:Procedures',
    spec: 'Category:Specs',
    incident: 'Category:Incidents',
    help: 'Help:Contents'
  };
  var LABEL_LANDING = {
    all: 'Main_Page',
    article: 'Main_Page',
    articles: 'Main_Page',
    equipment: 'Category:Equipment',
    manuals: 'Category:Manuals',
    manual: 'Category:Manuals',
    repairs: 'Category:Repairs',
    repair: 'Category:Repairs',
    troubleshooting: 'Category:Troubleshooting',
    procedures: 'Category:Procedures',
    procedure: 'Category:Procedures',
    specs: 'Category:Specs',
    spec: 'Category:Specs',
    incidents: 'Category:Incidents',
    incident: 'Category:Incidents',
    help: 'Help:Contents',
    contents: 'Help:Contents'
  };
  var _db = null;
  var _persistedRaw = null, _saveFailure = '', _seedBatch = false, _plainCache = Object.create(null), _wikiBridgeQueue = Promise.resolve();
  var _sel = 'Main_Page';
  var _q = '';
  var _col = '';
  var _team = '';
  var _mode = 'read';
  var _nsTab = 'article';
  var _preview = '';
  var _suggest = [];
  var _diff = null;
  var _histHook = false;
  var _revA = '';
  var _revB = '';
  var _wikiQuill = null;
  var _wikiQuillP = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escAttr(s) {
    return esc(s).replace(/'/g, '&#39;');
  }
  function jsStr(s) {
    return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }
  function canEdit() {
    try {
      if (typeof permIsAdmin === 'function' && permIsAdmin()) return true;
      var id = '';
      if (typeof permRoleDef === 'function') id = (permRoleDef() && permRoleDef().id) || '';
      else if (typeof pulseRoleId !== 'undefined') id = pulseRoleId || '';
      return id === 'engineer' || id === 'ops' || id === 'executive' || id === 'admin';
    } catch (e) {
      return true;
    }
  }
  function nowIso() {
    try { return new Date().toISOString(); } catch (e) { return ''; }
  }
  function who() {
    try {
      if (typeof permUser === 'function') {
        var u = permUser();
        if (u) return String(u);
      }
    } catch (e) {}
    return 'Ops';
  }
  function byteLen(s) {
    try { return new TextEncoder().encode(String(s || '')).length; } catch (e) { return String(s || '').length; }
  }
  function nsById(id) {
    var i;
    for (i = 0; i < NS_LIST.length; i++) if (NS_LIST[i].id === id) return NS_LIST[i];
    return NS_LIST[1];
  }
  function nsIdFromName(name) {
    var n = String(name || '');
    if (NS_ALIAS[n] != null) return NS_ALIAS[n];
    var i;
    for (i = 0; i < NS_LIST.length; i++) {
      if (NS_LIST[i].name && NS_LIST[i].name.toLowerCase() === n.toLowerCase()) return NS_LIST[i].id;
    }
    return null;
  }
  function landingForLabel(label) {
    var k = String(label || '').replace(/_/g, ' ').trim().toLowerCase();
    return LABEL_LANDING[k] || '';
  }
  function resolveTitle(title) {
    var raw = String(title || '').trim();
    if (!raw) return parseTitle('Main_Page');
    var land = landingForLabel(raw);
    if (land) {
      var lt = parseTitle(land);
      if (getPage(lt.slug)) return lt;
    }
    var t = parseTitle(raw);
    if (!t.invalid && getPage(t.slug)) return t;
    var tries = [
      'Category:' + t.dbkey.replace(/_/g, ' '),
      'Help:' + t.dbkey.replace(/_/g, ' '),
      'Manual:' + t.dbkey.replace(/_/g, ' '),
      'Repair:' + t.dbkey.replace(/_/g, ' '),
      'Troubleshooting:' + t.dbkey.replace(/_/g, ' '),
      'Pulse:' + t.dbkey.replace(/_/g, ' ')
    ];
    var i;
    for (i = 0; i < tries.length; i++) {
      var x = parseTitle(tries[i]);
      if (getPage(x.slug)) return x;
    }
    var pages = allPages();
    var want = t.prefixed.toLowerCase();
    var wantKey = t.dbkey.replace(/_/g, ' ').toLowerCase();
    for (i = 0; i < pages.length; i++) {
      var p = pages[i];
      var pref = String(p.prefixed || '').toLowerCase();
      var db = String(p.dbkey || '').replace(/_/g, ' ').toLowerCase();
      if (pref === want || db === wantKey || String(p.slug).toLowerCase() === String(t.slug).toLowerCase()) return parseTitle(p.slug);
    }
    return t;
  }
  function goCol(c) {
    _col = c || '';
    _team = '';
    _q = '';
    _mode = 'read';
    _nsTab = 'article';
    var landing = COL_LANDING.hasOwnProperty(c) ? COL_LANDING[c] : COL_LANDING[''];
    openSlug(landing, { mode: 'read' });
  }
  function syncFiltersFromTitle(t) {
    if (!t) return;
    if (t.slug === 'Main_Page') { _col = ''; _team = ''; return; }
    if (t.ns === 14) {
      var catName = t.dbkey.replace(/_/g, ' ');
      var ck;
      for (ck in COL_LANDING) {
        if (COL_LANDING[ck] === t.slug || COL_LANDING[ck] === 'Category:' + catName) _col = ck;
      }
      if (TEAMS.indexOf(catName) >= 0) _team = catName;
    }
    if (t.ns === 12) _col = 'help';
  }
  function goTeam(t) {
    _team = t || '';
    _mode = 'read';
    _nsTab = 'article';
    if (!t) {
      render();
      return;
    }
    var cat = parseTitle('Category:' + t);
    if (getPage(cat.slug)) openSlug(cat.slug, { mode: 'read' });
    else render();
  }
  function parseTitle(raw) {
    var src = String(raw == null ? '' : raw);
    src = src.replace(/^#\/kb\//i, '');
    src = src.replace(/^#\/?/, '');
    src = src.replace(/\u00d7/g, 'x');
    var frag = '';
    var hash = src.lastIndexOf('#');
    if (hash > 0) { frag = src.slice(hash + 1); src = src.slice(0, hash); }
    src = src.replace(/[\u00a0\u1680\u2000-\u200b\u202f\u205f\u3000\s]+/g, '_');
    src = src.replace(/^_+|_+$/g, '').replace(/_+/g, '_');
    if (!src) return { invalid: true, ns: 0, dbkey: '', slug: '', prefixed: '', fragment: frag };
    if (/[<>\[\]\|\{\}]/.test(src) || /:\/\//.test(src) || /(^|\/)\.\.(\/|$)/.test(src)) {
      return { invalid: true, ns: 0, dbkey: src, slug: src, prefixed: src.replace(/_/g, ' '), fragment: frag };
    }
    var ns = 0;
    var name = src;
    var colon = src.indexOf(':');
    if (colon > 0) {
      var pre = src.slice(0, colon);
      var nid = nsIdFromName(pre);
      if (nid != null) { ns = nid; name = src.slice(colon + 1).replace(/^_+|_+$/g, ''); }
    }
    if (name) name = name.charAt(0).toUpperCase() + name.slice(1);
    var nsName = nsById(ns).name;
    var slug = nsName ? nsName + ':' + name : name;
    var prefixed = (nsName ? nsName + ':' : '') + name.replace(/_/g, ' ');
    return { invalid: false, ns: ns, dbkey: name, slug: slug, prefixed: prefixed, fragment: frag };
  }
  function emptyDb() {
    return { pages: {}, revs: {}, rc: [], nextRev: 1, seedVer: SEED_VER };
  }
  function load() {
    if (_db) return _db;
    try {
      if (/[?&]wiki_reset=1(?:&|$)/.test(location.search || '')) {
        localStorage.removeItem(KEY);
        try { history.replaceState(null, '', location.pathname + (location.hash || '#/kb')); } catch (eH) {}
      }
    } catch (e0) {}
    var raw;
    try { raw=localStorage.getItem(KEY); } catch(e) { throw Error('Wiki storage is unavailable; existing content has not been replaced.'); }
    _persistedRaw=raw;
    if(raw){
      try { _db=validateDatabase(JSON.parse(raw)); } catch(e) { _db=null;throw Error('Wiki data could not be read. Export browser storage before recovery; existing data is retained.'); }
      var before=JSON.stringify(_db);
      try { ensureSeedPages(); } catch(e) { _db=JSON.parse(before);_saveFailure=e.message; }
      return _db;
    }
    _db = emptyDb();
    _seedBatch = true;
    seedAll();
    _seedBatch = false;
    _db.seedVer = SEED_VER;
    try { save(); } catch (e) { _saveFailure=e.message; }
    return _db;
  }
  function save() {
    if(_seedBatch)return;
    var current=localStorage.getItem(KEY);
    if(current!==_persistedRaw)throw Error('Wiki changed in another tab. Export your draft, then reload before saving.');
    var raw=JSON.stringify(_db||emptyDb());
    try{localStorage.setItem(KEY,raw);}catch(e){throw Error('Wiki was not saved. Your editor remains open; export the draft or free browser storage.');}
    _persistedRaw=raw;_saveFailure='';_plainCache=Object.create(null);
    if(root.PulseRecords){var snapshot=JSON.parse(raw);_wikiBridgeQueue=_wikiBridgeQueue.then(function(){if(localStorage.getItem(KEY)!==raw)return;var rec=root.PulseRecords.read('wiki',emptyDb());return root.PulseRecords.commit('wiki',emptyDb(),rec.version,snapshot);}).catch(function(e){_saveFailure='Wiki saved locally; shared checkpoint failed: '+e.message;});}
    root.dispatchEvent(new CustomEvent('pulse-wiki-saved'));
  }
  function guarded(fn){return function(){var args=arguments;var run=function(){var before;try{load();before=JSON.stringify(_db);return fn.apply(null,args);}catch(e){if(before)_db=JSON.parse(before);_saveFailure=e.message;var box=document.getElementById('wikiStorageStatus');if(box){box.textContent=e.message;box.setAttribute('role','alert');}if(typeof toast==='function')toast(e.message);return {error:{code:'save_failed',info:e.message}};}};return navigator.locks?navigator.locks.request('pulse-wiki-write',run):Promise.resolve().then(run);};}
  function exportDraft(){var data={title:((document.getElementById('wikiEditTitle')||{}).value)||_sel,text:readWikiEditor(),baseRevision:(getPage(_sel)||{}).latest||0};var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download='Pulse-wiki-draft.json';a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},1000);}
  function validateDatabase(db){if(root.PulseWikiSchema)return root.PulseWikiSchema.validate(db);JSON.parse(JSON.stringify(db),function(k,v){if(['__proto__','constructor','prototype'].indexOf(k)>=0)throw Error('Unsafe Wiki key');return v;});if(!db||!db.pages||!db.revs||!Array.isArray(db.rc)||!Number.isSafeInteger(db.nextRev))throw Error('Invalid Wiki package');Object.keys(db.pages).forEach(function(slug){var p=db.pages[slug],revs=db.revs[slug];if(!p||p.slug!==slug||typeof p.prefixed!=='string'||!Array.isArray(revs)||!revs.some(function(r){return r.id===p.latest&&typeof r.text==='string';}))throw Error('Invalid Wiki page or revision');});return db;}
  function getPage(slug) {
    load();
    var t = parseTitle(slug);
    if (t.invalid) return null;
    if (_db.pages[t.slug]) return _db.pages[t.slug];
    if (_db.pages[slug]) return _db.pages[slug];
    var alt = String(t.slug || '').replace(/\u00d7/g, 'x');
    if (_db.pages[alt]) return _db.pages[alt];
    var want = String(t.prefixed || '').toLowerCase();
    var k;
    for (k in _db.pages) {
      if (!_db.pages.hasOwnProperty(k)) continue;
      if (String(_db.pages[k].prefixed || '').toLowerCase() === want) return _db.pages[k];
      if (String(_db.pages[k].dbkey || '').replace(/_/g, ' ').toLowerCase() === t.dbkey.replace(/_/g, ' ').toLowerCase() && _db.pages[k].ns === t.ns) return _db.pages[k];
    }
    return null;
  }
  function latestText(page) {
    if (!page) return '';
    var list = (_db.revs && _db.revs[page.slug]) || [];
    var i;
    for (i = list.length - 1; i >= 0; i--) {
      if (list[i].id === page.latest) return list[i].text || '';
    }
    return list.length ? (list[list.length - 1].text || '') : '';
  }
  function textByRev(page, revid) {
    var list = (_db.revs && _db.revs[page.slug]) || [];
    var i;
    for (i = 0; i < list.length; i++) if (String(list[i].id) === String(revid)) return list[i].text || '';
    return latestText(page);
  }
  function allPages() {
    load();
    var out = [];
    var k;
    for (k in _db.pages) if (_db.pages.hasOwnProperty(k)) out.push(_db.pages[k]);
    out.sort(function (a, b) { return String(a.prefixed).localeCompare(String(b.prefixed)); });
    return out;
  }
  function putPage(meta, text, summary, minor) {
    load();
    var t = parseTitle(meta.slug || meta.title || meta.prefixed);
    if (t.invalid || t.ns === -1) return null;
    var slug = t.slug;
    var page = _db.pages[slug];
    var prev = page ? latestText(page) : '';
    if (page && prev === text && !meta.force) {
      return { page: page, nochange: true };
    }
    var revid = _db.nextRev++;
    if (!_db.revs[slug]) _db.revs[slug] = [];
    _db.revs[slug].push({
      id: revid,
      at: nowIso(),
      by: who(),
      summary: summary || (page ? 'edit' : 'create'),
      minor: !!minor,
      text: String(text || '')
    });
    if (_db.revs[slug].length > 40) _db.revs[slug] = _db.revs[slug].slice(-40);
    var cats = collectCats(text);
    if (!cats.length && page && page.cats && page.cats.length) cats = page.cats.slice();
    if (!cats.length && meta.cats && meta.cats.length) cats = meta.cats.slice();
    var parsedKind = meta.kind || (page && page.kind) || kindFromNs(t.ns, cats, text);
    var rec = {
      slug: slug,
      ns: t.ns,
      dbkey: t.dbkey,
      prefixed: t.prefixed,
      kind: parsedKind,
      team: meta.team != null ? meta.team : (page && page.team) || teamFromCats(cats),
      barcode: meta.barcode != null ? meta.barcode : (barcodeFromText(text) || (page && page.barcode) || ''),
      show: meta.show != null ? meta.show : (page && page.show) || '',
      cats: cats,
      sample: summary==='seed'||!!(page&&page.sample),
      verified: false,
      verifiedBy: (page && page.verifiedBy) || '',
      verifiedAt: (page && page.verifiedAt) || '',
      latest: revid,
      len: byteLen(text),
      touched: nowIso(),
      redirect: redirectTarget(text)
    };
    if (page && (prev !== text)) {
      rec.verified = false;
      rec.verifiedBy = '';
      rec.verifiedAt = '';
    }
    _db.pages[slug] = rec;
    _db.rc.unshift({ slug: slug, title: rec.prefixed, at: rec.touched, by: who(), summary: summary || '', revid: revid });
    if (_db.rc.length > 80) _db.rc = _db.rc.slice(0, 80);
    save();
    return { page: rec, nochange: false, revid: revid };
  }
  function kindFromNs(ns, cats, text) {
    if (ns === 100) return 'manual';
    if (ns === 102) return 'repair';
    if (ns === 104) return 'troubleshooting';
    if (ns === 12) return 'help';
    if (ns === 14) return 'category';
    if (ns === 10) return 'template';
    if (ns === 1 || ns === 5) return 'talk';
    var c = (cats || []).join(' ').toLowerCase();
    if (c.indexOf('incident') >= 0) return 'incident';
    if (c.indexOf('troubleshooting') >= 0) return 'troubleshooting';
    if (c.indexOf('procedure') >= 0) return 'procedure';
    if (c.indexOf('manual') >= 0) return 'manual';
    if (c.indexOf('repair') >= 0) return 'repair';
    if (/infobox equipment/i.test(text || '')) return 'equipment';
    if (c.indexOf('spec') >= 0) return 'spec';
    if (c.indexOf('equipment') >= 0) return 'equipment';
    return 'article';
  }
  function teamFromCats(cats) {
    var i, j;
    for (i = 0; i < (cats || []).length; i++) {
      for (j = 0; j < TEAMS.length; j++) {
        if (String(cats[i]).toLowerCase() === TEAMS[j].toLowerCase()) return TEAMS[j];
      }
    }
    return '';
  }
  function barcodeFromText(text) {
    var m = /\|\s*barcode\s*=\s*([^\n|]+)/i.exec(text || '');
    return m ? m[1].trim() : '';
  }
  function collectCats(text) {
    var out = [];
    var seen = {};
    String(text || '').replace(/\[\[Category:([^\]|#]+)(?:\|[^\]]+)?\]\]/gi, function (_, n) {
      var t = String(n || '').replace(/_/g, ' ').trim();
      if (!t) return '';
      var key = t.toLowerCase();
      if (seen[key]) return '';
      seen[key] = true;
      out.push(t);
      return '';
    });
    return out;
  }
  function redirectTarget(text) {
    var m = /^\s*#REDIRECT\s*\[\[([^\]|#]+)\]\]/i.exec(String(text || ''));
    return m ? m[1].trim() : '';
  }
  function pagesInCat(name) {
    var want = String(name || '').replace(/_/g, ' ').toLowerCase();
    return allPages().filter(function (p) {
      var cats = p.cats || [];
      var i;
      for (i = 0; i < cats.length; i++) if (String(cats[i]).toLowerCase() === want) return true;
      return false;
    });
  }
  function existingSet() {
    var set = {};
    var k;
    load();
    for (k in _db.pages) if (_db.pages.hasOwnProperty(k)) set[k] = true;
    return set;
  }

  /* ---------- wikitext ---------- */
  function splitPipes(inner) {
    var parts = [];
    var buf = '';
    var i, depthSq = 0, depthBr = 0;
    for (i = 0; i < inner.length; i++) {
      var ch = inner.charAt(i);
      var nx = inner.charAt(i + 1);
      if (ch === '[' && nx === '[') { depthSq++; buf += ch; continue; }
      if (ch === ']' && nx === ']') { depthSq = Math.max(0, depthSq - 1); buf += ch; continue; }
      if (ch === '{' && nx === '{') { depthBr++; buf += ch; continue; }
      if (ch === '}' && nx === '}') { depthBr = Math.max(0, depthBr - 1); buf += ch; continue; }
      if (ch === '|' && !depthSq && !depthBr) { parts.push(buf); buf = ''; continue; }
      buf += ch;
    }
    parts.push(buf);
    return parts;
  }
  function parseTmplParts(inner) {
    var parts = splitPipes(inner);
    var name = (parts[0] || '').trim();
    var named = {};
    var anon = [];
    var i;
    for (i = 1; i < parts.length; i++) {
      var p = parts[i];
      var eq = p.indexOf('=');
      if (eq > 0 && !/[\n\[]/.test(p.slice(0, eq))) named[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim();
      else anon.push(p.trim());
    }
    return { name: name, named: named, anon: anon };
  }
  function findTmplEnd(s, start) {
    var depth = 0;
    var i;
    for (i = start; i < s.length - 1; i++) {
      if (s.charAt(i) === '{' && s.charAt(i + 1) === '{') { depth++; i++; continue; }
      if (s.charAt(i) === '}' && s.charAt(i + 1) === '}') {
        depth--;
        i++;
        if (depth === 0) return i + 1;
      }
    }
    return -1;
  }
  function magic(name, pageTitle) {
    var t = parseTitle(pageTitle);
    var n = String(name || '').toUpperCase();
    if (n === 'SITENAME') return SITENAME;
    if (n === 'PAGENAME') return t.dbkey.replace(/_/g, ' ');
    if (n === 'FULLPAGENAME') return t.prefixed;
    if (n === 'NAMESPACE') return nsById(t.ns).name;
    if (n === 'NAMESPACENUMBER') return String(t.ns);
    if (n === 'PAGENAMEE') return t.dbkey;
    if (n === 'CURRENTYEAR') return String(new Date().getFullYear());
    if (n === 'NUMBEROFARTICLES') return String(allPages().filter(function (p) { return p.ns === 0; }).length);
    if (n === 'NUMBEROFPAGES') return String(allPages().length);
    if (n === 'SCRIPTPATH') return '/w';
    if (n === 'ARTICLEPATH') return '/wiki/$1';
    return null;
  }
  function expandTemplates(src, pageTitle, depth) {
    if (depth > 8) return src;
    var out = '';
    var i = 0;
    while (i < src.length) {
      if (src.charAt(i) === '{' && src.charAt(i + 1) === '{') {
        var end = findTmplEnd(src, i);
        if (end < 0) { out += src.slice(i); break; }
        var inner = src.slice(i + 2, end - 2);
        inner = expandTemplates(inner, pageTitle, depth + 1);
        out += renderTemplate(inner, pageTitle, depth + 1);
        i = end;
        continue;
      }
      out += src.charAt(i);
      i++;
    }
    return out;
  }
  function renderTemplate(inner, pageTitle, depth) {
    var t = parseTmplParts(inner);
    var name = t.name.replace(/_/g, ' ');
    var low = name.toLowerCase();
    var mag = magic(name, pageTitle);
    if (mag != null) return mag;
    if (/^lc:/i.test(name)) return name.slice(3).toLowerCase();
    if (/^uc:/i.test(name)) return name.slice(3).toUpperCase();
    if (/^ucfirst:/i.test(name)) { var s = name.slice(8); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
    if (low === '!' ) return '|';
    if (low === '=') return '=';
    if (low.indexOf('infobox') === 0) return renderInfobox(name, t.named);
    if (low === 'hub') return renderHub();
    if (low === 'stats') return renderStatsBox();
    if (low === 'main') return '<p class="wiki-hat">Main article: ' + linkBtn(t.anon[0] || t.named.page || '') + '</p>';
    if (low === 'see also' || low === 'see_also') {
      var bits = t.anon.length ? t.anon : Object.keys(t.named).map(function (k) { return t.named[k]; });
      return '<p class="wiki-hat">See also: ' + bits.filter(Boolean).map(linkBtn).join(' · ') + '</p>';
    }
    if (low === 'hatnote') return '<p class="wiki-hat">' + esc(t.anon[0] || t.named.text || '') + '</p>';
    if (low === 'procedure') return '<p class="wiki-hat">Day-of procedure — verify before air.</p>';
    var tpl = getPage('Template:' + name.replace(/ /g, '_'));
    if (tpl) {
      var body = latestText(tpl);
      body = body.replace(/\{\{\{([^}|]+)(?:\|([^}]*))?\}\}\}/g, function (_, key, def) {
        key = String(key || '').trim();
        if (/^\d+$/.test(key)) return t.anon[parseInt(key, 10) - 1] != null ? t.anon[parseInt(key, 10) - 1] : (def || '');
        return t.named[key.toLowerCase()] != null ? t.named[key.toLowerCase()] : (def || '');
      });
      return expandTemplates(body, pageTitle, depth + 1);
    }
    return '<span class="wiki-red">Template:' + esc(name) + '</span>';
  }
  function renderInfobox(kind, named) {
    var title = named.name || named.title || kind.replace(/^Infobox\s*/i, '');
    var rows = [
      ['Manufacturer', named.manufacturer],
      ['Type', named.type || named.role],
      ['Department', named.department || named.team],
      ['Power', named.power],
      ['Connectors', named.connector || named.connectors],
      ['Format', named.format],
      ['Barcode', named.barcode],
      ['Spare', named.spare],
      ['Firmware', named.firmware],
      ['Show', named.show]
    ];
    var html = '<aside class="wiki-infobox"><div class="wiki-infobox-head">' + esc(title) + '</div><table>';
    var i;
    for (i = 0; i < rows.length; i++) {
      if (!rows[i][1]) continue;
      var val = rows[i][1];
      if (rows[i][0] === 'Barcode') {
        val = '<button type="button" class="wiki-ilink" onclick="PulseKB.openInventory(\'' + jsStr(val) + '\')">' + esc(val) + '</button>';
      } else val = esc(val);
      html += '<tr><th>' + esc(rows[i][0]) + '</th><td>' + val + '</td></tr>';
    }
    html += '</table></aside>';
    return html;
  }
  function renderHub() {
    var cards = [
      ['equipment', 'Equipment', 'Cameras, consoles, RF, fiber, switchers, intercom, encoders.'],
      ['manual', 'Manuals', 'Power-up, pinouts, firmware, field setup for every box on the truck.'],
      ['repair', 'Repairs', 'FRU swaps, shop notes, and what actually failed last time.'],
      ['troubleshooting', 'Troubleshooting', 'No picture, RF clash, voltage sag, IFB, PTP, bonded TX.'],
      ['procedure', 'Procedures', 'Day-of strike, GNG weather hold, RF scan, shore-to-gen.'],
      ['incident', 'Incidents', 'Logged faults from the compound, TOC, and HIL runs.']
    ];
    return '<div class="wiki-hub">' + cards.map(function (c) {
      var n = allPages().filter(function (p) { return p.kind === c[0]; }).length;
      var land = COL_LANDING[c[0]] || 'Main_Page';
      return '<a class="wiki-hub-card" href="#/kb/' + encodeURIComponent(land) + '" data-wiki-go="' + escAttr(land) + '" data-wiki-col="' + escAttr(c[0]) + '"><p class="wiki-hub-k">' + esc(c[1]) + '</p><p class="wiki-hub-v">' + esc(c[2]) + '</p><span class="wiki-hub-n">' + n + ' pages</span></a>';
    }).join('') + '</div>';
  }
  function renderStatsBox() {
    var pages = allPages();
    var arts = pages.filter(function (p) { return p.ns === 0; }).length;
    var man = pages.filter(function (p) { return p.kind === 'manual'; }).length;
    var rep = pages.filter(function (p) { return p.kind === 'repair'; }).length;
    var tree = pages.filter(function (p) { return p.kind === 'troubleshooting'; }).length;
    return '<div class="wiki-stats"><div class="wiki-stat"><b>' + arts + '</b><span>Articles</span></div><div class="wiki-stat"><b>' + man + '</b><span>Manuals</span></div><div class="wiki-stat"><b>' + rep + '</b><span>Repairs</span></div><div class="wiki-stat"><b>' + tree + '</b><span>Trees</span></div></div>';
  }
  function wikiA(title, label, cls) {
    title = String(title || '').trim();
    if (!title) return '';
    var t = resolveTitle(title);
    var lab = label || title;
    var exists = !t.invalid && (!!getPage(t.slug) || t.ns === -1);
    var c = (cls || 'wiki-ilink') + (exists ? '' : ' wiki-red');
    return '<a class="' + c + '" href="#/kb/' + encodeURIComponent(t.slug) + '" data-wiki-go="' + escAttr(t.slug) + '">' + esc(lab) + '</a>';
  }
  function linkBtn(title) {
    title = String(title || '').trim();
    if (!title) return '';
    var t = resolveTitle(title);
    var lab = title;
    if (title && title !== t.prefixed && !/^Category:/i.test(title)) lab = title;
    else lab = t.prefixed || title;
    return wikiA(t.slug || title, lab);
  }
  function protectNowiki(src) {
    var slots = [];
    function hold(html) {
      var k = '%%W' + slots.length + '%%';
      slots.push(html);
      return k;
    }
    src = String(src || '').replace(/<nowiki>([\s\S]*?)<\/nowiki>/gi, function (_, b) { return hold(esc(b)); });
    src = src.replace(/<pre>([\s\S]*?)<\/pre>/gi, function (_, b) { return hold('<pre>' + esc(b) + '</pre>'); });
    src = src.replace(/<code>([\s\S]*?)<\/code>/gi, function (_, b) { return hold('<code>' + esc(b) + '</code>'); });
    src = src.replace(/<syntaxhighlight[^>]*>([\s\S]*?)<\/syntaxhighlight>/gi, function (_, b) { return hold('<pre>' + esc(b) + '</pre>'); });
    return { src: src, slots: slots };
  }
  function restoreSlots(html, slots) {
    var i;
    for (i = 0; i < slots.length; i++) html = html.replace('%%W' + i + '%%', slots[i]);
    return html;
  }
  function parseWikitext(src, pageTitle, opts) {
    opts = opts || {};
    src = String(src == null ? '' : src);
    var cats = [];
    var sections = [];
    var existing = existingSet();
    var redir = redirectTarget(src);
    if (redir) {
      return {
        html: '<p class="wiki-hat">Redirect to ' + linkBtn(redir) + '</p>',
        cats: collectCats(src),
        sections: [],
        redirect: redir,
        text: src.replace(/<[^>]+>/g, ' ')
      };
    }
    var held = protectNowiki(src);
    src = expandTemplates(held.src, pageTitle, 0);
    src = src.replace(/\[\[Category:([^\]|#]+)(?:\|[^\]]+)?\]\]/gi, function (_, n) {
      cats.push(String(n).replace(/_/g, ' ').trim());
      return '';
    });
    src = src.replace(/\[\[File:([^\]|]+)(?:\|([^\]]+))?\]\]/gi, function (_, file, opts) {
      var cap = '';
      String(opts || '').split('|').forEach(function (p) {
        if (!/^(thumb|right|left|center|\d+px)$/i.test(p.trim())) cap = p.trim();
      });
      return '<figure class="wiki-file"><div class="cap"><strong>' + esc(file) + '</strong>' + (cap ? '<div class="cap">' + esc(cap) + '</div>' : '') + '</div></figure>';
    });
    src = src.replace(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g, function (_, target, label) {
      var t = resolveTitle(target);
      var lab = label || target || t.prefixed;
      return wikiA(t.slug || target, lab);
    });
    src = src.replace(/\[(https?:\/\/[^\s\]]+)\s+([^\]]+)\]/g, '<a class="wiki-ext" href="$1" target="_blank" rel="noopener">$2</a>');
    src = src.replace(/\[(https?:\/\/[^\s\]]+)\]/g, '<a class="wiki-ext" href="$1" target="_blank" rel="noopener">$1</a>');
    src = src.replace(/'''''(.*?)'''''/g, '<strong><em>$1</em></strong>');
    src = src.replace(/'''(.*?)'''/g, '<strong>$1</strong>');
    src = src.replace(/''(.*?)''/g, '<em>$1</em>');
    src = parseTables(src);
    var lines = src.split('\n');
    var html = [];
    var inOl = false, inUl = false, inTree = false;
    function closeL() {
      if (inOl) { html.push('</ol>'); inOl = false; }
      if (inUl) { html.push('</ul>'); inUl = false; }
      if (inTree) { html.push('</ol>'); inTree = false; }
    }
    var i;
    for (i = 0; i < lines.length; i++) {
      var line = lines[i];
      var hm = /^(={2,4})\s*(.+?)\s*\1\s*$/.exec(line);
      if (hm) {
        closeL();
        var level = hm[1].length;
        var title = hm[2];
        var id = 'wsec-' + sections.length;
        var plainHead = title.replace(/<[^>]+>/g, '');
        sections.push({ level: level, title: plainHead, id: id, landing: landingForLabel(plainHead) });
        var headInner = title;
        if (sections[sections.length - 1].landing) {
          headInner = wikiA(sections[sections.length - 1].landing, plainHead);
        }
        html.push('<h' + level + ' id="' + id + '">' + headInner + '</h' + level + '>');
        continue;
      }
      if (/^----+$/.test(line.trim())) { closeL(); html.push('<hr>'); continue; }
      if (/^\s*#\s+/.test(line)) {
        if (!inOl) { closeL(); html.push('<ol>'); inOl = true; }
        html.push('<li>' + line.replace(/^\s*#\s+/, '') + '</li>');
        continue;
      }
      if (/^\s*\*\s+/.test(line)) {
        if (!inUl) { closeL(); html.push('<ul>'); inUl = true; }
        html.push('<li>' + line.replace(/^\s*\*\s+/, '') + '</li>');
        continue;
      }
      if (/^\s*;\s*/.test(line) && line.indexOf(':') > 0) {
        closeL();
        var d = line.replace(/^\s*;\s*/, '').split(':');
        html.push('<p><strong>' + d.shift() + '</strong> — ' + d.join(':') + '</p>');
        continue;
      }
      closeL();
      if (!line.trim()) html.push('<p></p>');
      else html.push('<p>' + line + '</p>');
    }
    closeL();
    var toc = '';
    if (sections.length >= 3 && !(opts && opts.noToc)) {
      toc = '<nav class="wiki-toc"><p>On this page</p>' + sections.map(function (s, n) {
        if (s.landing) return wikiA(s.landing, (n + 1) + '. ' + s.title);
        return '<a class="wiki-ilink" href="#' + escAttr(s.id) + '" data-wiki-jump="' + escAttr(s.id) + '">' + (n + 1) + '. ' + esc(s.title) + '</a>';
      }).join('') + '</nav>';
    }
    var body = restoreSlots(html.join(''), held.slots);
    var plain = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return { html: toc + '<div class="wiki-prose">' + body + '</div>', cats: cats, sections: sections, redirect: '', text: plain };
  }
  function parseTables(src) {
    return src.replace(/\{\|([\s\S]*?)\|\}/g, function (_, body) {
      var rows = [];
      var cur = [];
      var caption = '';
      var lines = String(body || '').split('\n');
      var i;
      for (i = 0; i < lines.length; i++) {
        var ln = lines[i];
        if (/^\s*\|\+/.test(ln)) { caption = ln.replace(/^\s*\|\+\s*/, ''); continue; }
        if (/^\s*\|-/.test(ln)) { if (cur.length) rows.push(cur); cur = []; continue; }
        if (/^\s*!/.test(ln)) {
          ln.replace(/!!|\s*!/g, function (m, off, s) { return off ? '\u0001' : m; });
          var hs = ln.replace(/^\s*!/, '').split(/!!/);
          hs.forEach(function (h) { cur.push({ th: true, t: h.replace(/^\s*!?\s*/, '') }); });
          continue;
        }
        if (/^\s*\|/.test(ln)) {
          var cells = ln.replace(/^\s*\|/, '').split(/\|\|/);
          cells.forEach(function (c) { cur.push({ th: false, t: c.replace(/^\s*\|\s*/, '') }); });
        }
      }
      if (cur.length) rows.push(cur);
      var html = '<table class="wikitable">';
      if (caption) html += '<caption>' + caption + '</caption>';
      rows.forEach(function (r) {
        html += '<tr>' + r.map(function (c) {
          return c.th ? '<th>' + c.t + '</th>' : '<td>' + c.t + '</td>';
        }).join('') + '</tr>';
      });
      return html + '</table>';
    });
  }
  function lineDiff(a, b) {
    var A = String(a || '').split('\n');
    var B = String(b || '').split('\n');
    var rows = [];
    var n = Math.max(A.length, B.length);
    var i;
    for (i = 0; i < n; i++) {
      var L = A[i] == null ? '' : A[i];
      var R = B[i] == null ? '' : B[i];
      if (L === R) rows.push({ k: '', l: L, r: R });
      else rows.push({ k: L && R ? 'chg' : (L ? 'del' : 'ins'), l: L, r: R });
    }
    return rows;
  }

  function looksLikeHtml(s) {
    return /<(p|br|div|ol|ul|li|h[1-6]|strong|em|b|i|u|a|span|table|blockquote|aside)\b/i.test(String(s || ''));
  }
  function pagePlain(pageOrText) {
    var raw = (pageOrText && pageOrText.slug) ? latestText(pageOrText) : String(pageOrText == null ? '' : pageOrText);
    if (typeof pulseRichPlain === 'function' && looksLikeHtml(raw)) return pulseRichPlain(raw);
    if (looksLikeHtml(raw)) {
      return String(raw)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    return String(raw)
      .replace(/\{\{[\s\S]*?\}\}/g, ' ')
      .replace(/\[\[Category:[^\]]+\]\]/gi, '')
      .replace(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g, function (_, a, b) { return b || a; })
      .replace(/[=']{2,}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function htmlForEditor(src, title) {
    src = String(src == null ? '' : src);
    if (!src.trim()) return '<p></p>';
    if (looksLikeHtml(src)) {
      return typeof pulseRichHTML === 'function' ? pulseRichHTML(src) : src;
    }
    var parsed = parseWikitext(src, title, { noToc: true });
    var html = parsed.html || '';
    try {
      var d = document.createElement('div');
      d.innerHTML = html;
      var kill = d.querySelectorAll('.wiki-toc, .wiki-hub, .wiki-stats');
      var i;
      for (i = 0; i < kill.length; i++) if (kill[i].parentNode) kill[i].parentNode.removeChild(kill[i]);
      var heads = d.querySelectorAll('.wiki-infobox-head');
      for (i = 0; i < heads.length; i++) {
        var p = document.createElement('p');
        var st = document.createElement('strong');
        st.textContent = heads[i].textContent || '';
        p.appendChild(st);
        heads[i].parentNode.replaceChild(p, heads[i]);
      }
      var asides = d.querySelectorAll('.wiki-infobox');
      for (i = 0; i < asides.length; i++) {
        var wrap = document.createElement('div');
        wrap.innerHTML = asides[i].innerHTML;
        asides[i].parentNode.replaceChild(wrap, asides[i]);
      }
      var tables = d.querySelectorAll('table');
      for (i = 0; i < tables.length; i++) {
        var tbl = tables[i];
        if ((tbl.getAttribute('class') || '').indexOf('wikitable') >= 0) continue;
        var facts = [];
        var trs = tbl.querySelectorAll('tr');
        var r;
        for (r = 0; r < trs.length; r++) {
          var th = trs[r].querySelector('th');
          var td = trs[r].querySelector('td');
          if (th && td) {
            facts.push('<p><strong>' + esc(th.textContent.replace(/\s+/g, ' ').trim()) + ':</strong> ' + esc(td.textContent.replace(/\s+/g, ' ').trim()) + '</p>');
          }
        }
        if (facts.length) {
          var box = document.createElement('div');
          box.innerHTML = facts.join('');
          tbl.parentNode.replaceChild(box, tbl);
        }
      }
      var btns = d.querySelectorAll('button.wiki-ilink, button.wiki-hub-card');
      for (i = 0; i < btns.length; i++) {
        var b = btns[i];
        var a = document.createElement('a');
        var oc = b.getAttribute('onclick') || '';
        var m = /openByTitle\('([^']*)'\)/.exec(oc);
        var label = b.textContent || '';
        var slug = m ? parseTitle(m[1].replace(/\\'/g, "'")).slug : parseTitle(label).slug;
        a.setAttribute('href', '#/kb/' + encodeURIComponent(slug));
        a.textContent = label;
        b.parentNode.replaceChild(a, b);
      }
      var prose = d.querySelector('.wiki-prose');
      return prose ? prose.innerHTML : d.innerHTML;
    } catch (e) {
      return html.replace(/<[^>]+>/g, function (tag) {
        if (/^<(p|br|div|h[1-6]|ul|ol|li|strong|em|table|tr|td|th|a)\b/i.test(tag) || /^<\//.test(tag)) return tag;
        return '';
      });
    }
  }
  function htmlForRead(page) {
    var raw = latestText(page);
    var html;
    if (looksLikeHtml(raw)) {
      var cleaned = (typeof pulseRichHTML === 'function') ? pulseRichHTML(raw) : raw;
      html = '<div class="wiki-prose">' + cleaned + '</div>';
    } else {
      html = parseWikitext(raw, page.prefixed).html;
    }
    if (page.slug === 'Main_Page' && html.indexOf('wiki-hub') < 0) {
      html = renderStatsBox() + renderHub() + html;
    }
    return html;
  }
  function bindWikiHtmlClicks() {
    var host = document.getElementById('kbHost');
    if (!host || host.getAttribute('data-wiki-click')) return;
    host.setAttribute('data-wiki-click', '1');
    host.addEventListener('click', function (ev) {
      var n = ev.target;
      while (n && n !== host && n.nodeType === 1) {
        var jump = n.getAttribute('data-wiki-jump');
        if (jump) {
          ev.preventDefault();
          ev.stopPropagation();
          PulseKB.jump(jump);
          return;
        }
        var col = n.getAttribute('data-wiki-col');
        if (n.hasAttribute('data-wiki-col')) {
          ev.preventDefault();
          ev.stopPropagation();
          goCol(col);
          return;
        }
        var go = n.getAttribute('data-wiki-go');
        if (go) {
          ev.preventDefault();
          ev.stopPropagation();
          openSlug(go);
          return;
        }
        if (n.tagName === 'A') {
          var href = n.getAttribute('href') || '';
          var m = href.match(/#\/kb\/(.+)/);
          if (m) {
            ev.preventDefault();
            ev.stopPropagation();
            openSlug(decodeURIComponent(m[1]));
            return;
          }
        }
        if (n.classList && n.classList.contains('wiki-ilink')) {
          ev.preventDefault();
          ev.stopPropagation();
          openSlug((n.textContent || '').replace(/^\d+\.\s*/, ''));
          return;
        }
        n = n.parentNode;
      }
    }, true);
  }
  function loadWikiQuill() {
    if (typeof window !== 'undefined' && window.Quill) {
      return Promise.resolve(window.Quill);
    }
    if (typeof loadQuill === 'function') return loadQuill();
    if (_wikiQuillP) return _wikiQuillP;
    function injectCss(href) {
      if (document.getElementById('quill-css')) return;
      var l = document.createElement('link');
      l.id = 'quill-css';
      l.rel = 'stylesheet';
      l.href = href;
      document.head.appendChild(l);
    }
    function loadScript(src) {
      return new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src;
        s.async = true;
        var amd = (typeof define === 'function' && define.amd) ? define.amd : null;
        if (amd) define.amd = null;
        s.onload = function () {
          if (amd) define.amd = amd;
          window.Quill ? resolve(window.Quill) : reject(new Error('Quill missing'));
        };
        s.onerror = function () {
          if (amd) define.amd = amd;
          reject(new Error('Quill fail'));
        };
        document.head.appendChild(s);
      });
    }
    _wikiQuillP = Promise.resolve()
      .then(function () { injectCss('js/vendor/quill/quill.snow.css'); return loadScript('js/vendor/quill/quill.js'); })
      .catch(function (err) { _wikiQuillP = null; throw err; });
    return _wikiQuillP;
  }
  function readWikiEditor() {
    if (_wikiQuill) {
      try {
        if (typeof pulseRichRead === 'function') return pulseRichRead(_wikiQuill);
        if (_wikiQuill.getLength() <= 1) return '';
        var html = '';
        try { html = _wikiQuill.getSemanticHTML(); } catch (e0) { html = _wikiQuill.root.innerHTML; }
        html = html.replace(/&nbsp;/gi, ' ').replace(/\u00a0/g, ' ');
        if (typeof pulseRichClean === 'function') return pulseRichClean(html);
        return html;
      } catch (e) {}
    }
    if (typeof pulseRichGet === 'function') {
      var v = pulseRichGet('wikiEditBody');
      if (v != null && v !== '') return v;
    }
    var ta = document.getElementById('wikiEditBody');
    return ta ? ta.value : '';
  }
  function mountWikiEditor() {
    var host = document.getElementById('wikiEditHost');
    var ta = document.getElementById('wikiEditBody');
    if (!host || !ta) return;
    loadWikiQuill().then(function (Q) {
      if (!document.body.contains(host)) return;
      if (host.getAttribute('data-q')) return;
      host.setAttribute('data-q', '1');
      var toolbar = [
        [{ header: [2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link', 'blockquote'],
        ['clean']
      ];
      var q;
      try {
        q = new Q(host, {
          theme: 'snow',
          placeholder: 'Write this page in plain language…',
          modules: { toolbar: toolbar }
        });
      } catch (e) { return; }
      _wikiQuill = q;
      var html = ta.value || '';
      if (typeof pulseRichClean === 'function') html = pulseRichClean(typeof pulseRichHTML === 'function' ? pulseRichHTML(html) : html);
      if (html) {
        try { q.clipboard.dangerouslyPasteHTML(html, 'silent'); } catch (e2) {}
      }
      var flush = function () {
        var cur = document.getElementById('wikiEditBody');
        if (cur) {cur.value=readWikiEditor();if(root.PulseRecords)root.PulseRecords.draft('wiki:'+_sel,{text:cur.value,revision:(getPage(_sel)||{}).latest}).catch(function(e){_saveFailure='Draft checkpoint failed: '+e.message;});}
      };
      q.on('text-change', function () { setTimeout(flush, 200); });
      q.root.addEventListener('blur', flush);
    }).catch(function () {
      ta.style.display = 'block';
      host.style.display = 'none';
    });
  }

  /* ---------- search / charlie ---------- */
  function toDoc(page) {
    if (!page) return null;
    return {
      slug: page.slug,
      title: page.prefixed,
      col: page.kind,
      kind: page.kind,
      team: page.team || '',
      show: page.show || '',
      barcode: page.barcode || '',
      tags: page.cats || [],
      body: cachedPlain(page),
      revision: page.latest,
      sample: !!page.sample && !(root.PulseWork&&root.PulseWork.knowledgeStatus(page.slug,page.latest)),
      sampleOrigin:!!page.sample,
      verified: root.PulseWork?root.PulseWork.knowledgeStatus(page.slug,page.latest):false,
      ns: page.ns
    };
  }
  function cachedPlain(p){var key=p.slug+':'+p.latest;return _plainCache[key]||(_plainCache[key]=pagePlain(p));}
  function search(q) {
    q = String(q || '').toLowerCase().trim();
    var pages = allPages().filter(function (p) { return p.ns !== 10 && p.ns !== -1; });
    if (!q) return pages.map(toDoc);
    var tagToks = [];
    var rest = q.replace(/#([a-z0-9][a-z0-9-]*)/g, function (_, t) { tagToks.push(t); return ' '; }).replace(/\s+/g, ' ').trim();
    var scored = [];
    var i, j;
    for (i = 0; i < pages.length; i++) {
      var p = pages[i];
      var tags = (p.cats || []).map(function (t) { return String(t).toLowerCase(); });
      var score = 0;
      var miss = false;
      for (j = 0; j < tagToks.length; j++) {
        if (tags.join(' ').indexOf(tagToks[j]) >= 0) score += 120;
        else miss = true;
      }
      if (miss && tagToks.length) continue;
      var blob = (p.prefixed + ' ' + p.slug + ' ' + (p.barcode || '') + ' ' + (p.team || '') + ' ' + tags.join(' ') + ' ' + cachedPlain(p)).toLowerCase();
      if (rest) {
        if (String(p.prefixed).toLowerCase().indexOf(rest) >= 0) score += 1000;
        if (String(p.slug).toLowerCase().indexOf(rest.replace(/ /g, '_')) >= 0) score += 800;
        if ((p.barcode || '').toLowerCase().indexOf(rest) >= 0) score += 100;
        if ((p.team || '').toLowerCase().indexOf(rest) >= 0) score += 10;
        if (blob.indexOf(rest) >= 0) score += 1;
        if (!score) continue;
      }
      scored.push({ s: score, d: toDoc(p) });
    }
    scored.sort(function (a, b) { return b.s - a.s; });
    return scored.map(function (r) { return r.d; });
  }
  function chunksForCharlie(q, limit) {
    limit = limit || 6;
    var hits = search(q);
    var hideFin = typeof permCan === 'function' && !permCan('finance');
    var out = [];
    var i;
    for (i = 0; i < hits.length && out.length < limit; i++) {
      var d = hits[i];
      if (hideFin && String(d.team || '').toLowerCase() === 'finance') continue;
      var body = String(d.body || '').replace(/\{\{[^}]+\}\}/g, ' ').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (_, a, b) { return b || a; });
      if (body.length > 600) body = body.slice(0, 600);
      out.push({
        slug: d.slug, title: d.title, col: d.col, team: d.team, show: d.show,
        barcode: d.barcode, tags: d.tags, body: body, revision:d.revision, verified:d.verified, sample:d.sample
      });
    }
    return out;
  }
  function related(doc) {
    var page = getPage(doc && doc.slug ? doc.slug : doc);
    if (!page) return [];
    var mine = page.cats || [];
    var out = [];
    allPages().forEach(function (p) {
      if (p.slug === page.slug) return;
      var hit = 0;
      if (page.team && p.team === page.team) hit++;
      var i;
      for (i = 0; i < mine.length; i++) {
        if ((p.cats || []).indexOf(mine[i]) >= 0) hit++;
      }
      if (hit) out.push(toDoc(p));
    });
    return out.slice(0, 8);
  }

  /* ---------- seed ---------- */
  function seedPage(nsName, title, kind, team, cats, text, extra) {
    extra = extra || {};
    var slug = nsName ? nsName + ':' + title.replace(/ /g, '_') : title.replace(/ /g, '_');
    var catLines = (cats || []).map(function (c) { return '[[Category:' + c + ']]'; }).join('\n');
    var body = String(text || '').replace(/\s*$/, '') + (catLines ? '\n\n' + catLines : '');
    putPage({
      slug: slug,
      kind: kind,
      team: team || '',
      barcode: extra.barcode || '',
      show: extra.show || '',
      verified: false,
      force: true
    }, body, 'seed', true);
    var p = getPage(slug);
    if(p){p.sample=true;p.verified=false;p.verifiedBy='';p.verifiedAt='';}
  }
  function seedAll() {
    if (typeof root.PULSE_WIKI_SEED === 'function') {
      var rows = root.PULSE_WIKI_SEED() || [];
      var i;
      for (i = 0; i < rows.length; i++) {
        var r = rows[i];
        seedPage(r.ns || '', r.title, r.kind, r.team, r.cats, r.text, r);
      }
      return;
    }
    seedFallback();
  }
  function ensureSeedPages() {
    if (typeof root.PULSE_WIKI_SEED !== 'function' || !_db || !_db.pages) return 0;
    var rows = root.PULSE_WIKI_SEED() || [];
    var added = 0;
    Object.keys(_db.pages).forEach(function(slug){var p=_db.pages[slug],last=(_db.revs[slug]||[]).slice(-1)[0];if(last&&last.summary==='seed'&&!p.sample){p.sample=true;p.verified=false;p.verifiedBy='';p.verifiedAt='';added++;}});
    var i;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      var slug = (r.ns ? r.ns + ':' : '') + String(r.title || '').replace(/ /g, '_');
      var t = parseTitle(slug);
      if (t.invalid) continue;
      if (_db.pages[t.slug]) continue;
      seedPage(r.ns || '', r.title, r.kind, r.team, r.cats, r.text, r);
      added++;
    }
    _db.seedVer = SEED_VER;
    if (added) save();
    return added;
  }
  function seedFallback() {
    seedPage('', 'Main_Page', 'article', 'ENG', ['Pulse'],
      "{{Stats}}\n{{Hub}}\n\n'''NBC Pulse Wiki''' is the central knowledge base for live television broadcast — trucks, compound, TOC, REMI, and ENG.\n\n== Start here ==\n* [[Help:Contents]]\n* [[Sony HDC-5500]]\n* [[Troubleshooting:No picture at TOC]]\n* [[Manual:Sony HDC-5500]]\n* [[Sandbox]]\n");
  }

  /* ---------- mutations ---------- */
  function logIncident(rec) {
    rec = rec || {};
    var title = rec.title || ('Incident ' + Date.now().toString(36));
    var slugTitle = title.replace(/[/:]/g, ' ');
    var text = (rec.body || 'Symptom / action / outcome') +
      '\n\nShow: ' + (rec.show || '—') +
      '\nLogged by ' + who() + ' at ' + (rec.at || nowIso()) +
      '\n\n[[Category:Incidents]]\n[[Category:ENG]]';
    var res = putPage({
      slug: slugTitle.replace(/ /g, '_'),
      kind: 'incident',
      team: rec.team || 'ENG',
      show: rec.show || '',
      verified: false
    }, text, 'incident', false);
    return res && res.page ? res.page.slug : '';
  }
  function closeIncident(query) {
    query = query || {};
    var pages = allPages();
    var i;
    for (i = 0; i < pages.length; i++) {
      var p = pages[i];
      if (p.kind !== 'incident') continue;
      if (query.show && p.show && p.show !== query.show) continue;
      if (query.title && String(p.prefixed).indexOf(query.title) === -1) continue;
      var t = latestText(p) + '\n\nClosed ' + (query.at || nowIso());
      putPage({ slug: p.slug, kind: 'incident', team: p.team, show: p.show, verified: false }, t, 'close incident', true);
      return p.slug;
    }
    return null;
  }
  function seedShow(showKey, showName, templateId) {
    showKey = String(showKey || '').trim();
    if (!showKey) return null;
    var slug = 'Show_brain_—_' + showKey;
    if (getPage(slug) || getPage('Show brain — ' + showName)) return slug;
    var name = showName || showKey;
    var kind = String(templateId || '').toLowerCase();
    var lines = [
      '{{Hatnote|Show-specific brain. Link procedures; do not duplicate Broadcast Ops.}}',
      "'''Show brain — " + name + "''' (" + (kind || 'blank') + ").",
      '',
      '== Day-of checklist ==',
      '# Confirm GNG and weather hold ([[GNG weather hold]]).',
      '# Fiber discipline ([[Fiber bulkhead strike]]).',
      '# RF scan ±200 kHz ([[RF 200 kHz clash response]]).',
      '# Camera power-up ([[Sony HDC-5500 power-up]]).',
      "# Bonded backup armed ([[LiveU LU800 failover]])."
    ];
    putPage({
      slug: 'Show_brain_—_' + name.replace(/ /g, '_'),
      kind: 'procedure',
      team: 'ENG',
      show: showKey,
      verified: false
    }, lines.join('\n') + '\n\n[[Category:Procedures]]\n[[Category:ENG]]', 'show brain', true);
    return 'Show_brain_—_' + name.replace(/ /g, '_');
  }
  var COMPOSE_KINDS = [
    { id: 'equipment', lab: 'Equipment', hint: 'A camera, console, switch, encoder, UPS…' },
    { id: 'manual', lab: 'Manual', hint: 'Power-up, pinouts, firmware' },
    { id: 'repair', lab: 'Repair', hint: 'Symptom, cause, field fix, parts' },
    { id: 'troubleshooting', lab: 'Troubleshooting', hint: 'A decision tree for a fault' },
    { id: 'procedure', lab: 'Procedure', hint: 'Day-of numbered steps' },
    { id: 'spec', lab: 'Spec', hint: 'Format, draw, plant rules' },
    { id: 'incident', lab: 'Incident', hint: 'What actually happened' }
  ];
  var _composeKind = 'equipment';
  var _composeTitle = '';
  var _composeFields = [];
  var _composeFieldSeq = 0;
  var _composeDragId = '';

  function wcVal(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }
  function wcP(s) {
    s = String(s || '').trim();
    if (!s) return '';
    return '<p>' + esc(s).replace(/\n/g, '<br>') + '</p>';
  }
  function wcH2(s) { return '<h2>' + esc(s) + '</h2>'; }
  function wcFact(k, v) {
    v = String(v || '').trim();
    return v ? '<p><strong>' + esc(k) + ':</strong> ' + esc(v) + '</p>' : '';
  }
  function wcOl(s) {
    var lines = String(s || '').split(/\n+/).map(function (x) {
      return x.replace(/^\s*([0-9]+[.)]|[-*•])\s*/, '').trim();
    }).filter(Boolean);
    if (!lines.length) return '';
    return '<ol>' + lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ol>';
  }
  function wcUl(s) {
    var lines = String(s || '').split(/\n+/).map(function (x) {
      return x.replace(/^\s*([0-9]+[.)]|[-*•])\s*/, '').trim();
    }).filter(Boolean);
    if (!lines.length) return '';
    return '<ul>' + lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>';
  }
  function wcLinkish(s) {
    s = String(s || '').trim();
    if (!s) return '';
    var t = resolveTitle(s);
    if (getPage(t.slug)) {
      return '<a href="#/kb/' + encodeURIComponent(t.slug) + '">' + esc(s) + '</a>';
    }
    return esc(s);
  }
  function composeKindMeta(kind) {
    return {
      equipment: { ns: '', cat: ['Equipment'], landing: 'equipment' },
      manual: { ns: 'Manual', cat: ['Manuals'], landing: 'manual' },
      repair: { ns: 'Repair', cat: ['Repairs'], landing: 'repair' },
      troubleshooting: { ns: 'Troubleshooting', cat: ['Troubleshooting'], landing: 'troubleshooting' },
      procedure: { ns: '', cat: ['Procedures'], landing: 'procedure' },
      spec: { ns: '', cat: ['Specs'], landing: 'spec' },
      incident: { ns: '', cat: ['Incidents'], landing: 'incident' },
      help: { ns: 'Help', cat: ['Help'], landing: 'help' }
    }[kind] || { ns: '', cat: ['Procedures'], landing: 'procedure' };
  }
  function harvestCompose() {
    var t = document.getElementById('wcTitle');
    if (t) _composeTitle = t.value;
    var i;
    for (i = 0; i < _composeFields.length; i++) {
      var field = _composeFields[i];
      var lab = document.getElementById('wcL_' + field.id);
      var inp = document.getElementById('wcF_' + field.id);
      if (lab) field.label = lab.value;
      if (inp) field.value = inp.value;
    }
  }
  function composeTeamValue() {
    var i;
    for (i = 0; i < _composeFields.length; i++) {
      if (_composeFields[i].type === 'team') return _composeFields[i].value || _team || 'ENG';
    }
    return _team || 'ENG';
  }
  function readComposeFields() {
    harvestCompose();
    var barcode = '';
    var show = '';
    var i;
    for (i = 0; i < _composeFields.length; i++) {
      if (_composeFields[i].id === 'barcode') barcode = _composeFields[i].value;
      if (_composeFields[i].id === 'show') show = _composeFields[i].value;
    }
    return {
      title: String(_composeTitle || '').trim(),
      team: composeTeamValue(),
      barcode: barcode,
      show: show
    };
  }
  function defaultComposeFields(kind) {
    function F(id, label, ph, extra) {
      extra = extra || {};
      return {
        id: id,
        label: label,
        ph: ph || 'Type here',
        value: '',
        rows: extra.rows || 0,
        hint: extra.hint || '',
        type: extra.type || 'text'
      };
    }
    if (kind === 'equipment' || kind === 'spec') {
      return [
        F('team', 'Department', '', { type: 'team' }),
        F('mfr', 'Manufacturer', "e.g. Panasonic"),
        F('type', 'What it is', 'e.g. 4K system camera'),
        F('power', 'Power', 'e.g. 240 V / 20 A at the CCU'),
        F('conn', 'Connectors', 'e.g. SMPTE 304 fiber'),
        F('format', 'Format', 'e.g. 3840×2160 HDR'),
        F('barcode', 'Barcode', "e.g. PULSE-EQ-341506"),
        F('spare', 'Spare on the truck', 'e.g. HDC-3100'),
        F('desc', 'In one or two sentences', 'Type what this unit does on a tentpole show.', { rows: 3 }),
        F('role', 'Role on the truck', 'e.g. Hard cam, tower, sideline', { rows: 2 }),
        F('related', 'Related page (optional)', "e.g. Manual:Sony HDC-5500")
      ];
    }
    if (kind === 'manual') {
      return [
        F('team', 'Department', '', { type: 'team' }),
        F('related', 'Equipment this manual covers', "e.g. Sony HDC-5500"),
        F('scope', 'Who uses this, and when', 'Type who uses this and when.', { rows: 2 }),
        F('steps', 'Power-up steps', 'Type each step on its own line.', { rows: 6, hint: 'One step per line. Pulse numbers them.', type: 'lines' }),
        F('pinout', 'Pinout / path', 'Type connectors, strand IDs, and what not to hot-plug.', { rows: 3 }),
        F('firmware', 'Firmware note', 'e.g. Camera and CCU must match.')
      ];
    }
    if (kind === 'repair') {
      return [
        F('team', 'Department', '', { type: 'team' }),
        F('related', 'Equipment this repair applies to', "e.g. Sony HDC-5500"),
        F('symptom', 'What you see', 'Type the symptom.', { rows: 2 }),
        F('cause', 'Likely cause', 'Type the likely cause.', { rows: 2 }),
        F('fix', 'Field fix', 'Type each fix step on its own line.', { rows: 6, hint: 'One step per line.', type: 'lines' }),
        F('parts', 'Parts / FRU', 'e.g. SMPTE 304 jumper, spare HDCU-5500')
      ];
    }
    if (kind === 'troubleshooting') {
      return [
        F('team', 'Department', '', { type: 'team' }),
        F('checks', 'Start here', 'Type each check on its own line.', { rows: 6, hint: 'One check per line.', type: 'lines' }),
        F('branches', 'If / then (optional)', 'Type each branch on its own line.', { rows: 4, type: 'lines' }),
        F('related', 'Related page', 'e.g. Repair:Sony HDC-5500 CCU no LINK')
      ];
    }
    if (kind === 'procedure') {
      return [
        F('team', 'Department', '', { type: 'team' }),
        F('when', 'When do we run this?', 'e.g. Only after GNG is HOLD.'),
        F('steps', 'Steps', 'Type each step on its own line.', { rows: 7, hint: 'One step per line. This becomes the procedure.', type: 'lines' }),
        F('desc', 'Notes (optional)', 'Type any extra notes for TOC.', { rows: 2 })
      ];
    }
    if (kind === 'incident') {
      return [
        F('team', 'Department', '', { type: 'team' }),
        F('show', 'Show / venue', 'e.g. World Cup compound'),
        F('symptom', 'Symptom', 'Type what you saw.', { rows: 2 }),
        F('action', 'What you did', 'Type what the truck did.', { rows: 3 }),
        F('outcome', 'Outcome', 'Type the outcome.', { rows: 2 })
      ];
    }
    return [F('team', 'Department', '', { type: 'team' }), F('desc', 'Notes', 'Type here.', { rows: 4 })];
  }
  function composeHtml(kind, f, live) {
    harvestCompose();
    f = f || readComposeFields();
    var html = '';
    if (kind === 'troubleshooting') html += '<p class="wiki-hat">Start at the source, not the TOC monitor.</p>';
    if (kind === 'procedure') html += '<p class="wiki-hat">Day-of procedure — EIC verifies before air.</p>';
    if (kind === 'incident') html += wcP('Logged by ' + who() + (f.show ? ' · show ' + f.show : '') + '.');
    var i;
    for (i = 0; i < _composeFields.length; i++) {
      var field = _composeFields[i];
      var label = field.label || 'Field';
      var v = String(field.value || '').trim();
      if (field.type === 'team') {
        html += wcFact(label, v || 'ENG');
        continue;
      }
      if (live && !v) continue;
      if (field.type === 'lines') {
        if (v) html += wcH2(label) + wcOl(v);
        else if (!live) html += wcH2(label) + '<ol><li>Add the first step.</li></ol>';
        continue;
      }
      if (field.rows) {
        if (v) html += wcH2(label) + wcP(v);
        continue;
      }
      if (v) html += wcFact(label, v);
    }
    if (!live && !html.replace(/<[^>]+>/g, '').trim() && f.title) {
      html += wcP(f.title + ' is filed under ' + (f.team || 'ENG') + '.');
    }
    return html;
  }
  function composeKindLabel() {
    var i;
    for (i = 0; i < COMPOSE_KINDS.length; i++) if (COMPOSE_KINDS[i].id === _composeKind) return COMPOSE_KINDS[i].lab;
    return _composeKind;
  }
  function composePreview() {
    var f = readComposeFields();
    var box = document.getElementById('wcPreview');
    if (!box) return;
    var body = composeHtml(_composeKind, f, true);
    var titleHtml = f.title
      ? '<h2 class="wiki-first">' + esc(f.title) + '</h2>'
      : '<h2 class="wiki-first wiki-preview-ph">Page name</h2>';
    var empty = !body && !f.title;
    box.innerHTML = '<p class="wiki-kicker">' + esc(composeKindLabel()) + ' · ' + esc(f.team || 'ENG') + '</p>' +
      titleHtml +
      '<div class="wiki-prose">' +
      (empty ? '<p class="wiki-preview-ph">Start typing on the left. This preview updates as you go.</p>' : body) +
      '</div>';
  }
  function composeFieldsHtml() {
    var title = '<label class="wiki-compose-field"><span class="wiki-compose-lab">Name of this page</span>' +
      "<input id=\"wcTitle\" class=\"wiki-compose-input\" placeholder=\"e.g. Sony HDC-5500\" value=\"" + escAttr(_composeTitle) + '" oninput="PulseKB.composePreview()"></label>';
    var cards = _composeFields.map(function (field, idx) {
      var body;
      if (field.type === 'team') {
        body = '<select id="wcF_' + field.id + '" class="wiki-compose-input" oninput="PulseKB.composePreview()" onchange="PulseKB.composePreview()">' +
          TEAMS.map(function (tm) {
            return '<option' + ((field.value || _team || 'ENG') === tm ? ' selected' : '') + '>' + esc(tm) + '</option>';
          }).join('') + '</select>';
      } else if (field.rows || field.type === 'lines') {
        body = '<textarea id="wcF_' + field.id + '" rows="' + (field.rows || 3) + '" class="wiki-compose-input" placeholder="' + escAttr(field.ph) + '" oninput="PulseKB.composePreview()">' + esc(field.value || '') + '</textarea>';
      } else {
        body = '<input id="wcF_' + field.id + '" class="wiki-compose-input" placeholder="' + escAttr(field.ph) + '" value="' + escAttr(field.value || '') + '" oninput="PulseKB.composePreview()">';
      }
      return '<div class="wiki-compose-card" data-fid="' + escAttr(field.id) + '" ondragover="event.preventDefault()" ondrop="PulseKB.composeDrop(\'' + jsStr(field.id) + '\')">' +
        '<div class="wiki-compose-card-bar">' +
        '<span class="wiki-compose-drag" draggable="true" title="Drag to reorder" ondragstart="PulseKB.composeDragStart(\'' + jsStr(field.id) + '\')">⋮⋮</span>' +
        '<input id="wcL_' + field.id + '" class="wiki-compose-card-title" value="' + escAttr(field.label) + '" oninput="PulseKB.composePreview()" placeholder="Field title">' +
        '<button type="button" class="wiki-compose-ico" title="Move up" onclick="PulseKB.composeMove(\'' + jsStr(field.id) + '\',-1)">↑</button>' +
        '<button type="button" class="wiki-compose-ico" title="Move down" onclick="PulseKB.composeMove(\'' + jsStr(field.id) + '\',1)">↓</button>' +
        '<button type="button" class="wiki-compose-ico" title="Remove field" onclick="PulseKB.composeRemove(\'' + jsStr(field.id) + '\')">×</button>' +
        '</div>' + body +
        (field.hint ? '<span class="wiki-compose-hint">' + esc(field.hint) + '</span>' : '') +
        '</div>';
    }).join('');
    return title + cards +
      '<button type="button" class="wiki-compose-add" onclick="PulseKB.composeAddField()">+ Add text field</button>';
  }
  function ensureComposer() {
    var el = document.getElementById('wikiCompose');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'wikiCompose';
    el.className = 'wiki-compose';
    el.hidden = true;
    el.addEventListener('input',function(){if(root.PulseRecords){harvestCompose();root.PulseRecords.draft('wiki:composer',{kind:_composeKind,title:_composeTitle,fields:_composeFields}).catch(function(e){_saveFailure='Draft checkpoint failed: '+e.message;});}});
    el.onclick = function (ev) { if (ev.target === el) closeComposer(); };
    document.body.appendChild(el);
    return el;
  }
  function closeComposer() {
    var el = document.getElementById('wikiCompose');
    if (el) el.hidden = true;
  }
  function openComposer(kind, titlePrefill) {
    if (!canEdit()) return;
    _composeKind = kind || _col || 'equipment';
    if (_composeKind === '' || _composeKind === 'article' || _composeKind === 'category') _composeKind = 'equipment';
    _composeTitle = titlePrefill || '';
    _composeFields = defaultComposeFields(_composeKind);
    _composeFieldSeq = _composeFields.length;
    var host = ensureComposer();
    host.hidden = false;
    renderComposer();
    setTimeout(function () {
      var t = document.getElementById('wcTitle');
      if (t) t.focus();
    }, 30);
  }
  function renderComposer() {
    var host = ensureComposer();
    var kinds = COMPOSE_KINDS.map(function (k) {
      return '<button type="button" class="wiki-compose-kind' + (_composeKind === k.id ? ' is-on' : '') + '" onclick="PulseKB.composeKind(\'' + k.id + '\')">' +
        '<strong>' + esc(k.lab) + '</strong><span>' + esc(k.hint) + '</span></button>';
    }).join('');
    host.innerHTML =
      '<div class="wiki-compose-box" onclick="event.stopPropagation()">' +
      '<div class="wiki-compose-head"><div><h2>New wiki page</h2><p>Answer in plain language. Rename any field, drag to reorder, or add a blank text field. Preview updates as you type.</p></div>' +
      '<button type="button" class="pui-btn text-[11px] font-bold" onclick="PulseKB.closeComposer()">Close</button></div>' +
      '<div class="wiki-compose-kinds">' + kinds + '</div>' +
      '<div class="wiki-compose-grid">' +
      '<div class="wiki-compose-form" id="wcFields">' + composeFieldsHtml() + '</div>' +
      '<div class="wiki-compose-preview-wrap"><p class="wiki-compose-lab">Preview</p><div id="wcPreview" class="wiki-compose-preview wiki-reader"></div></div>' +
      '</div>' +
      '<div class="wiki-compose-foot">' +
      '<span>Name the page, then fill the fields you need. Order in Preview matches the order of the boxes.</span>' +
      '<div class="wiki-compose-actions">' +
      '<button type="button" class="pui-btn text-[11px] font-bold" onclick="PulseKB.closeComposer()">Cancel</button>' +
      '<button type="button" class="pui-btn" onclick="PulseKB.exportComposer()">Export draft</button><button type="button" class="pui-btn" onclick="PulseKB.restoreComposer()">Recover draft</button><button type="button" class="wiki-new-btn" onclick="PulseKB.composeCommit()">Create page</button>' +
      '</div></div></div>';
    var form = document.getElementById('wcFields');
    if (form) {
      form.addEventListener('input', composePreview);
      form.addEventListener('change', composePreview);
      form.addEventListener('keyup', composePreview);
    }
    composePreview();
  }
  function composeKind(kind) {
    harvestCompose();
    var keep = _composeTitle;
    _composeKind = kind || 'equipment';
    _composeFields = defaultComposeFields(_composeKind);
    _composeTitle = keep;
    renderComposer();
  }
  function composeFieldIndex(id) {
    var i;
    for (i = 0; i < _composeFields.length; i++) if (_composeFields[i].id === id) return i;
    return -1;
  }
  function composeMove(id, dir) {
    harvestCompose();
    var i = composeFieldIndex(id);
    var j = i + dir;
    if (i < 0 || j < 0 || j >= _composeFields.length) return;
    var tmp = _composeFields[i];
    _composeFields[i] = _composeFields[j];
    _composeFields[j] = tmp;
    renderComposer();
  }
  function composeDragStart(id) {
    harvestCompose();
    _composeDragId = id;
  }
  function composeDrop(id) {
    if (!_composeDragId || _composeDragId === id) return;
    harvestCompose();
    var from = composeFieldIndex(_composeDragId);
    var to = composeFieldIndex(id);
    _composeDragId = '';
    if (from < 0 || to < 0) return;
    var item = _composeFields.splice(from, 1)[0];
    _composeFields.splice(to, 0, item);
    renderComposer();
  }
  function composeRemove(id) {
    harvestCompose();
    var i = composeFieldIndex(id);
    if (i < 0) return;
    _composeFields.splice(i, 1);
    renderComposer();
  }
  function composeAddField() {
    harvestCompose();
    _composeFieldSeq += 1;
    _composeFields.push({
      id: 'c' + _composeFieldSeq,
      label: 'New field',
      ph: 'Type here',
      value: '',
      rows: 3,
      hint: '',
      type: 'text'
    });
    renderComposer();
    setTimeout(function () {
      var el = document.getElementById('wcL_c' + _composeFieldSeq);
      if (el) { el.focus(); el.select(); }
    }, 30);
  }
  function composeCommit() {
    if (!canEdit()) return;
    var f = readComposeFields();
    if (!f.title) {
      if (typeof toast === 'function') toast('Name the page first');
      var t = document.getElementById('wcTitle');
      if (t) t.focus();
      return;
    }
    var meta = composeKindMeta(_composeKind);
    var html = composeHtml(_composeKind, f);
    var cats = meta.cat.slice();
    if (f.team && cats.indexOf(f.team) < 0) cats.push(f.team);
    var slug = (meta.ns ? meta.ns + ':' : '') + f.title.replace(/[/:]/g, ' ').replace(/\s+/g, '_');
    if (getPage(slug)) {
      closeComposer();
      if (typeof toast === 'function') toast('That page already exists — opening it');
      openSlug(slug, { mode: 'read' });
      return;
    }
    putPage({
      slug: slug,
      kind: _composeKind,
      team: f.team,
      barcode: f.barcode || '',
      show: f.show || '',
      verified: false,
      cats: cats
    }, html, 'create', false);
    closeComposer();
    _col = meta.landing;
    _mode = 'read';
    _nsTab = 'article';
    if (typeof toast === 'function') toast('Page is live — looks like the rest of the wiki. Edit only if you want to tweak.');
    openSlug(slug, { mode: 'read' });
  }
  function insertWikiBlock(kind) {
    var blocks = {
      heading: '<h2>Section</h2><p></p>',
      steps: '<h2>Steps</h2><ol><li>First action</li><li>Next action</li><li>Tell TOC what changed</li></ol>',
      bullets: '<ul><li>First point</li><li>Second point</li></ul>',
      fact: '<p><strong>Label:</strong> value</p>',
      note: '<p class="wiki-hat">Note for the truck: </p>'
    };
    var html = blocks[kind] || blocks.heading;
    if (_wikiQuill) {
      try {
        var range = _wikiQuill.getSelection(true);
        var idx = range ? range.index : _wikiQuill.getLength();
        _wikiQuill.clipboard.dangerouslyPasteHTML(idx, html, 'user');
        _wikiQuill.focus();
      } catch (e) {}
      return;
    }
    var ta = document.getElementById('wikiEditBody');
    if (ta) ta.value += html;
  }
  function newPage(kind) {
    if (!canEdit()) return null;
    openComposer(kind || _col || 'equipment');
    return null;
  }

  /* ---------- routing ---------- */
  function installHistoryHooks() {
    if (_histHook) return;
    _histHook = true;
    var origPush = root.pulseHistoryPush;
    var origHash = root.pulseRouteHash;
    if (typeof origHash === 'function') {
      root.pulseRouteHash = function (view, sub) {
        if (view === 'kb' && sub) return '#/kb/' + encodeURIComponent(sub);
        return origHash(view, sub);
      };
    }
    if (typeof origPush === 'function') {
      root.pulseHistoryPush = function (view, sub, replace) {
        if (view === 'kb') {
          try {
            var hash = '#/kb' + (sub ? '/' + encodeURIComponent(sub) : '');
            var state = { view: 'kb', sub: sub || null, t: Date.now() };
            if (replace) history.replaceState(state, '', hash);
            else if ((location.hash || '') !== hash && (location.hash || '') !== hash.replace(/^#/, '#')) history.pushState(state, '', hash);
          } catch (e) {}
          return;
        }
        return origPush(view, sub, replace);
      };
    }
    if (!root._pulseWikiHashBound) {
      root._pulseWikiHashBound = true;
      window.addEventListener('hashchange', function () {
        try {
          if (typeof pulseParseHash !== 'function') return;
          var route = pulseParseHash();
          if (!route || route.view !== 'kb') return;
          if (!route.sub) return;
          var want = resolveTitle(decodeURIComponent(route.sub)).slug;
          if (want && want !== _sel) openSlug(want, { mode: 'read' });
        } catch (eH) {}
      });
    }
  }
  function openSlug(slug, opts) {
    opts = opts || {};
    var t = resolveTitle(String(slug == null ? 'Main_Page' : slug));
    if (t.invalid) t = parseTitle('Main_Page');
    if (t.ns === -1) {
      _sel = t.slug;
      _mode = 'special';
      _nsTab = 'article';
    } else {
      var hit = getPage(t.slug);
      _sel = hit ? hit.slug : t.slug;
      _mode = opts.mode || 'read';
      _nsTab = opts.talk ? 'talk' : 'article';
      syncFiltersFromTitle(parseTitle(_sel));
      _preview = '';
      _diff = null;
      var page = hit;
      if (page && page.redirect && !opts.noRedirect) {
        var dest = resolveTitle(page.redirect);
        if (dest.slug && dest.slug !== t.slug) {
          _sel = dest.slug;
        }
      }
    }
    render();
    try {
      var panes = document.querySelectorAll('.view-pane');
      var i;
      for (i = 0; i < panes.length; i++) panes[i].classList.remove('active');
      var pane = document.getElementById('view-kb');
      if (pane) pane.classList.add('active');
      if (typeof navRailSetActive === 'function') navRailSetActive('kb');
    } catch (ePane) {}
    try { if (typeof pulseHistoryPush === 'function') pulseHistoryPush('kb', _sel, false); } catch (e) {}
  }
  function talkSlug(slug) {
    var t = parseTitle(slug);
    if (t.ns === 1 || t.ns % 2 === 1) return t.slug;
    if (t.ns === 0) return 'Talk:' + t.dbkey;
    return nsById(t.ns + 1).name + ':' + t.dbkey;
  }
  function subjectSlug(slug) {
    var t = parseTitle(slug);
    if (t.ns === 1) return t.dbkey;
    if (t.ns > 0 && t.ns % 2 === 1) return nsById(t.ns - 1).name + ':' + t.dbkey;
    return t.slug;
  }

  /* ---------- specials ---------- */
  function specialBody(name) {
    var n = String(name || '').replace(/^Special:/i, '').replace(/_/g, ' ').toLowerCase();
    if (n === 'random') {
      var pool = allPages().filter(function (p) { return p.ns === 0; });
      if (pool.length) {
        var pick = pool[Math.floor(Math.random() * pool.length)].slug;
        setTimeout(function () { openSlug(pick); }, 0);
      }
      return '<p>Opening a random article…</p>';
    }
    if (n === 'allpages' || n === 'all pages') {
      return '<h2 class="wiki-first">All pages</h2><ul class="wiki-prose">' + allPages().filter(function (p) { return p.ns !== 10; }).map(function (p) {
        return '<li>' + linkBtn(p.prefixed) + ' <span class="wiki-row-meta">' + esc(p.kind) + '</span></li>';
      }).join('') + '</ul>';
    }
    if (n === 'recentchanges' || n === 'recent changes') {
      load();
      return '<h2 class="wiki-first">Recent changes</h2>' + (_db.rc || []).map(function (r) {
        return '<div class="wiki-rev">' + linkBtn(r.title) + '<span class="wiki-row-meta">' + esc((r.at || '').replace('T', ' ').slice(0, 16)) + ' · ' + esc(r.by) + ' · ' + esc(r.summary) + '</span></div>';
      }).join('') || '<p>No edits yet.</p>';
    }
    if (n === 'categories') {
      var seen = {};
      allPages().forEach(function (p) {
        (p.cats || []).forEach(function (c) { seen[c] = (seen[c] || 0) + 1; });
      });
      return '<h2 class="wiki-first">Categories</h2><ul>' + Object.keys(seen).sort().map(function (c) {
        return '<li>' + linkBtn('Category:' + c) + ' · ' + seen[c] + '</li>';
      }).join('') + '</ul>';
    }
    if (n === 'statistics' || n === 'version') {
      return '<h2 class="wiki-first">Statistics</h2>' + renderStatsBox() +
        '<p class="wiki-prose">Generator is Pulse Wiki (MediaWiki-compatible wikitext + Action API in-app). Sitename ' + esc(SITENAME) + '.</p>';
    }
    if (n === 'search') {
      return '<h2 class="wiki-first">Search</h2><p>Use the search box, or [[Help:Contents]].</p>';
    }
    if (n === 'sandbox') {
      openSlug('Sandbox');
      return '';
    }
    if (n === 'apisandbox' || n === 'api sandbox') return renderApiSandbox();
    if (n === 'specialpages' || n === 'special pages') {
      var list = ['AllPages', 'RecentChanges', 'Categories', 'Statistics', 'Random', 'ApiSandbox', 'Search'];
      return '<h2 class="wiki-first">Special pages</h2><ul>' + list.map(function (s) {
        return '<li>' + linkBtn('Special:' + s) + '</li>';
      }).join('') + '</ul>';
    }
    return '<h2 class="wiki-first">No such special page</h2><p>Unknown special: ' + esc(name) + '. See ' + linkBtn('Special:SpecialPages') + '.</p>';
  }
  function renderApiSandbox() {
    return '<h2 class="wiki-first">Api sandbox</h2>' +
      '<p class="wiki-lede" style="display:block;margin-bottom:10px">Talk to this wiki the way a bot talks to MediaWiki. CSRF token <code>+\\</code> is accepted.</p>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">' +
      '<label class="text-[10px] font-bold text-gray-500">action<select id="wikiApiAction" class="wiki-input mt-1 w-full text-[12px] px-2 py-1.5"><option>query</option><option>parse</option><option>edit</option><option>opensearch</option><option>help</option></select></label>' +
      '<label class="text-[10px] font-bold text-gray-500">params (a=b&amp;c=d)<input id="wikiApiParams" class="wiki-input mt-1 w-full text-[12px] px-2 py-1.5" value="meta=siteinfo&amp;siprop=general|namespaces|statistics&amp;formatversion=2"></label>' +
      '</div>' +
      '<button type="button" class="pui-btn pui-btn-brand text-[11px] font-bold" onclick="PulseKB.runApi()">Make request</button>' +
      '<pre id="wikiApiOut" class="wiki-api mt-3">Ready.</pre>';
  }

  /* ---------- action API ---------- */
  function action(params) {
    params = params || {};
    var act = String(params.action || 'help');
    if (act === 'query') return actionQuery(params);
    if (act === 'parse') return actionParse(params);
    if (act === 'edit') return actionEdit(params);
    if (act === 'opensearch') return actionOpensearch(params);
    if (act === 'help') return { help: { text: 'Pulse Wiki Action API. Modules: query, parse, edit, opensearch. CSRF token +\\' } };
    return { error: { code: 'unknown_action', info: 'Unknown action: ' + act } };
  }
  function actionQuery(p) {
    var meta = String(p.meta || '');
    var out = { batchcomplete: true, query: {} };
    if (meta.indexOf('siteinfo') >= 0) {
      var nss = {};
      NS_LIST.forEach(function (n) { nss[n.id] = { id: n.id, case: 'first-letter', canonical: n.name, '*': n.name }; });
      out.query.general = { sitename: SITENAME, generator: 'MediaWiki 1.46.0', articlepath: '/wiki/$1', scriptpath: '/w' };
      out.query.namespaces = nss;
      out.query.statistics = { pages: allPages().length, articles: allPages().filter(function (x) { return x.ns === 0; }).length, edits: (_db.rc || []).length };
    }
    if (meta.indexOf('tokens') >= 0) out.query.tokens = { csrftoken: CSRF_ANON };
    var titles = String(p.titles || '').split('|').filter(Boolean);
    if (titles.length) {
      var pages = [];
      titles.forEach(function (title) {
        var t = parseTitle(title);
        var page = getPage(t.slug);
        if (!page) pages.push({ title: t.prefixed, missing: true, ns: t.ns, pageid: -1 });
        else {
          var rec = { pageid: page.latest, ns: page.ns, title: page.prefixed };
          if (String(p.prop || '').indexOf('revisions') >= 0) rec.revisions = [{ revid: page.latest, slots: { main: { content: latestText(page), contentmodel: 'wikitext' } } }];
          if (String(p.prop || '').indexOf('extracts') >= 0) rec.extract = parseWikitext(latestText(page), page.prefixed).text.slice(0, 400);
          if (String(p.prop || '').indexOf('info') >= 0) rec.length = page.len;
          if (String(p.prop || '').indexOf('categories') >= 0) rec.categories = (page.cats || []).map(function (c) { return { title: 'Category:' + c }; });
          pages.push(rec);
        }
      });
      out.query.pages = pages;
    }
    if (p.list === 'search' || p.srsearch) {
      out.query.search = search(p.srsearch || p.sr || '').slice(0, parseInt(p.srlimit || 10, 10)).map(function (d) {
        return { title: d.title, snippet: String(d.body || '').slice(0, 160) };
      });
    }
    if (p.list === 'allpages') {
      out.query.allpages = allPages().filter(function (x) { return x.ns === (p.apnamespace != null ? parseInt(p.apnamespace, 10) : 0); }).map(function (x) {
        return { title: x.prefixed, pageid: x.latest };
      });
    }
    if (p.list === 'recentchanges') {
      out.query.recentchanges = (_db.rc || []).slice(0, parseInt(p.rclimit || 10, 10));
    }
    return out;
  }
  function actionParse(p) {
    var title = p.page || p.title || 'Main Page';
    var page = getPage(title);
    var text = p.text != null ? p.text : (page ? latestText(page) : '');
    var parsed = parseWikitext(text, title);
    return { parse: { title: page ? page.prefixed : title, text: { '*': parsed.html }, sections: parsed.sections, categories: parsed.cats } };
  }
  function actionEdit(p) {
    var token = p.token;
    if (token == null) return { error: { code: 'notoken', info: 'Missing token' } };
    if (token !== CSRF_ANON && token !== '+\\') return { error: { code: 'badtoken', info: 'Invalid CSRF token' } };
    if (!canEdit()) return { error: { code: 'protectedpage', info: 'You cannot edit this wiki' } };
    var title = p.title || p.page;
    var page = getPage(title);
    var text = p.text;
    if (text == null && page) {
      text = latestText(page);
      if (p.prependtext) text = p.prependtext + text;
      if (p.appendtext) text += p.appendtext;
    }
    var res = putPage({ slug: title, verified: false }, text || '', p.summary || 'api edit', !!p.minor);
    if (!res) return { error: { code: 'badtitle', info: 'Invalid title' } };
    if (res.nochange) return { edit: { result: 'Success', nochange: true, title: res.page.prefixed } };
    return { edit: { result: 'Success', pageid: res.page.latest, title: res.page.prefixed, contentmodel: 'wikitext', newrevid: res.revid, newtimestamp: res.page.touched } };
  }
  function actionOpensearch(p) {
    var q = p.search || p.srsearch || '';
    var hits = search(q).slice(0, parseInt(p.limit || 8, 10));
    return [q, hits.map(function (h) { return h.title; }), hits.map(function () { return SITENAME; }), hits.map(function (h) { return '#/kb/' + encodeURIComponent(h.slug); })];
  }

  /* ---------- render ---------- */
  function matchesFilters(p) {
    if (!p) return false;
    if (p.ns === 10) return false;
    if (_col && p.kind !== _col) return false;
    if (_team && String(p.team || '') !== _team) return false;
    return true;
  }
  function pageList() {
    var list;
    if (_q) list = search(_q).map(function (d) { return getPage(d.slug); }).filter(Boolean);
    else list = allPages();
    list = list.filter(matchesFilters);
    var cur = getPage(subjectSlug(_sel));
    if (cur && list.every(function (p) { return p.slug !== cur.slug; })) list.unshift(cur);
    return list;
  }
  function saveCurrent() {
    if (!canEdit()) return;
    var titleEl = document.getElementById('wikiEditTitle');
    var sumEl = document.getElementById('wikiEditSummary');
    var teamEl = document.getElementById('wikiEditTeam');
    var minorEl = document.getElementById('wikiEditMinor');
    var newTitle = titleEl ? titleEl.value : _sel;
    var text = readWikiEditor();
    var t = parseTitle(newTitle);
    var page = getPage(_sel);
    var res = putPage({
      slug: t.slug,
      kind: page ? page.kind : (_col || 'article'),
      team: teamEl ? teamEl.value : (page && page.team) || _team || '',
      verified: false
    }, text, (sumEl && sumEl.value) || 'edit', !!(minorEl && minorEl.checked));
    if (res && res.page) _sel = res.page.slug;
    _mode = 'read';
    _preview = '';
    if (typeof toast === 'function') toast('Wiki saved');
    render();
  }
  function renderReader(page, titleObj) {
    if (titleObj.ns === -1) {
      return '<div class="wiki-article">' + specialBody(titleObj.dbkey) + '</div>';
    }
    if (titleObj.ns === 14 && page) {
      var members = pagesInCat(titleObj.dbkey.replace(/_/g, ' '));
      var parsedC = parseWikitext(latestText(page), page.prefixed);
      var catTabs = '<div class="wiki-tabs"><div class="wiki-tab-seg">' +
        '<button type="button" class="is-on" onclick="PulseKB.setNsTab(\'article\')">Article</button>' +
        '<button type="button" onclick="PulseKB.setNsTab(\'talk\')">Talk</button></div>' +
        '<div class="wiki-tab-seg">' +
        '<button type="button" class="' + (_mode === 'read' ? 'is-on' : '') + '" onclick="PulseKB.setMode(\'read\')">Read</button>' +
        (canEdit() ? '<button type="button" class="' + (_mode === 'edit' ? 'is-on' : '') + '" onclick="PulseKB.setMode(\'edit\')">Edit</button>' : '') +
        '<button type="button" onclick="PulseKB.setMode(\'history\')">History</button></div></div>';
      if (_mode === 'edit' && canEdit()) {
        /* fall through to the standard editor below using this category page */
      } else if (_mode === 'read') {
        return '<div class="wiki-article">' + catTabs +
          '<p class="wiki-kicker">Category</p><h2 class="wiki-first">' + esc(page.prefixed) + '</h2>' +
          parsedC.html + '<h3>Pages in this wiki</h3><ul class="wiki-cat-list">' + members.map(function (m) {
            return '<li>' + linkBtn(m.prefixed) + '<span class="wiki-row-meta"> · ' + esc(m.kind || '') + (m.team ? ' · ' + esc(m.team) : '') + '</span></li>';
          }).join('') + '</ul></div>';
      }
    }
    var isTalk = _nsTab === 'talk';
    var viewSlug = isTalk ? talkSlug(titleObj.slug) : subjectSlug(titleObj.slug);
    var viewTitle = parseTitle(viewSlug);
    var viewPage = getPage(viewSlug);
    var canMutate = canEdit();
    var tabs = '<div class="wiki-tabs"><div class="wiki-tab-seg">' +
      '<button type="button" class="' + (!isTalk ? 'is-on' : '') + '" onclick="PulseKB.setNsTab(\'article\')">Article</button>' +
      '<button type="button" class="' + (isTalk ? 'is-on' : '') + '" onclick="PulseKB.setNsTab(\'talk\')">Talk</button></div>' +
      '<div class="wiki-tab-seg">' +
      '<button type="button" class="' + (_mode === 'read' ? 'is-on' : '') + '" onclick="PulseKB.setMode(\'read\')">Read</button>' +
      (canMutate ? '<button type="button" class="' + (_mode === 'edit' ? 'is-on' : '') + '" onclick="PulseKB.setMode(\'edit\')">Edit</button>' : '') +
      '<button type="button" class="' + (_mode === 'history' || _mode === 'diff' ? 'is-on' : '') + '" onclick="PulseKB.setMode(\'history\')">History</button></div></div>';

    if (!viewPage && _mode !== 'edit') {
      return '<div class="wiki-article">' + tabs +
        '<p class="wiki-kicker">' + esc(viewTitle.prefixed) + '</p>' +
        '<h2 class="wiki-first">' + esc(viewTitle.prefixed) + '</h2>' +
        '<div class="wiki-missing"><p>There is currently no text in this page. You can create it — this is how the knowledge base grows.</p>' +
        (canMutate ? '<button type="button" class="pui-btn pui-btn-brand text-[11px] font-bold" onclick="PulseKB.createMissing(\'' + jsStr(viewTitle.prefixed) + '\')">Create page</button>' : '') +
        '</div></div>';
    }

    if (_mode === 'edit' && canMutate) {
      _wikiQuill = null;
      var source = viewPage ? latestText(viewPage) : '';
      var editorHtml = htmlForEditor(source, viewTitle.prefixed);
      return '<div class="wiki-article">' + tabs +
        '<p class="wiki-kicker">Editing</p>' +
        '<input id="wikiEditTitle" class="wiki-input w-full text-[13px] px-3 py-2 mb-2" value="' + escAttr(viewTitle.prefixed) + '">' +
        '<div class="wiki-insert-row">' +
        '<span>Insert</span>' +
        '<button type="button" onclick="PulseKB.insertWikiBlock(\'heading\')">Heading</button>' +
        '<button type="button" onclick="PulseKB.insertWikiBlock(\'steps\')">Numbered steps</button>' +
        '<button type="button" onclick="PulseKB.insertWikiBlock(\'bullets\')">Bullets</button>' +
        '<button type="button" onclick="PulseKB.insertWikiBlock(\'fact\')">Fact line</button>' +
        '<button type="button" onclick="PulseKB.insertWikiBlock(\'note\')">Truck note</button>' +
        '</div>' +
        '<div class="wiki-editor">' +
        '<div id="wikiEditHost"></div>' +
        '<textarea id="wikiEditBody" class="wiki-edit-mirror" hidden>' + esc(editorHtml) + '</textarea>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">' +
        '<label class="text-[10px] font-bold text-gray-500">Department<select id="wikiEditTeam" class="wiki-input mt-1 w-full text-[12px] px-2 py-1.5">' +
        TEAMS.map(function (tm) { return '<option' + ((viewPage && viewPage.team) === tm ? ' selected' : '') + '>' + esc(tm) + '</option>'; }).join('') +
        '</select></label>' +
        '<label class="text-[10px] font-bold text-gray-500">Edit summary<input id="wikiEditSummary" class="wiki-input mt-1 w-full text-[12px] px-2 py-1.5" placeholder="What changed"></label></div>' +
        '<div class="wiki-edit-bar">' +
        '<label class="text-[11px] text-gray-600"><input id="wikiEditMinor" type="checkbox"> Minor</label>' +
        '<button type="button" class="pui-btn pui-btn-brand text-[11px] font-bold" onclick="PulseKB.saveCurrent()">Save page</button>' +
        '<button type="button" class="pui-btn text-[11px] font-bold" onclick="PulseKB.exportDraft()">Export draft</button><button type="button" class="pui-btn text-[11px] font-bold" onclick="PulseKB.restoreDraft()">Recover draft</button>' +
        '<button type="button" class="pui-btn text-[11px] font-bold" onclick="PulseKB.setMode(\'read\')">Cancel</button>' +
        '</div></div>';
    }

    if (_mode === 'history' || _mode === 'diff') {
      load();
      var revs = ((_db.revs || {})[viewSlug] || []).slice().reverse();
      if (_mode === 'diff' && _diff) {
        var rows = lineDiff(_diff.a, _diff.b);
        return '<div class="wiki-article">' + tabs + '<h2 class="wiki-first">Diff</h2><table class="wiki-diff">' + rows.map(function (r) {
          var cls = r.k === 'ins' ? 'ins' : (r.k === 'del' ? 'del' : '');
          return '<tr><td class="' + (r.k === 'del' || r.k === 'chg' ? 'del' : '') + '">' + esc(r.l) + '</td><td class="' + (r.k === 'ins' || r.k === 'chg' ? 'ins' : cls) + '">' + esc(r.r) + '</td></tr>';
        }).join('') + '</table></div>';
      }
      return '<div class="wiki-article">' + tabs + '<h2 class="wiki-first">History</h2>' +
        revs.map(function (r) {
          return '<div class="wiki-rev"><label><input type="checkbox" data-rev="' + r.id + '" class="wiki-revbox"> ' +
            esc(String(r.at || '').replace('T', ' ').slice(0, 16)) + '</label> · ' + esc(r.by) + ' · ' + esc(r.summary || '') +
            ' <button type="button" class="wiki-ilink" onclick="PulseKB.openRev(\'' + jsStr(viewSlug) + '\',' + r.id + ')">view</button></div>';
        }).join('') +
        '<p class="mt-3"><button type="button" class="pui-btn text-[11px] font-bold" onclick="PulseKB.compareRevs(\'' + jsStr(viewSlug) + '\')">Compare selected</button></p></div>';
    }

    var parsedHtml = htmlForRead(viewPage);
    var currentReview=root.PulseWork&&root.PulseWork.knowledgeStatus(viewPage.slug,viewPage.latest);
    var meta = [viewPage.kind, viewPage.team, currentReview ? 'reviewed current revision' : (viewPage.sample ? 'sample content · requires review' : 'review required')].filter(Boolean).join(' · ');
    var rel = related(viewPage);
    var extra = '';
    if (rel.length) extra += '<p class="wiki-related">Related: ' + rel.map(function (r) { return linkBtn(r.title); }).join(' · ') + '</p>';
    if (viewPage.barcode) extra += '<p class="mt-2 text-[11px]">Inventory · <button type="button" class="wiki-ilink" onclick="PulseKB.openInventory(\'' + jsStr(viewPage.barcode) + '\')">' + esc(viewPage.barcode) + '</button></p>';
    var cat = (viewPage.cats || []).length ? '<div class="wiki-catlinks">Categories: ' + viewPage.cats.map(function (c) { return linkBtn('Category:' + c); }).join(' ') + '</div>' : '';
    var verify = '';
    if (canMutate && viewPage.kind !== 'incident' && viewPage.ns !== 1) {
      verify = '<p class="mt-3"><button type="button" class="text-[10px] font-bold text-gray-600" onclick="PulseKB.toggleVerified()">' + 'Review article' + '</button></p>';
    }
    return '<div class="wiki-article">' + tabs +
      '<p class="wiki-kicker">' + esc(meta) + (viewPage.touched ? ' · Edited ' + esc(String(viewPage.touched).replace('T', ' ').slice(0, 16)) : '') + '</p>' +
      '<h2 class="wiki-first" id="firstHeading">' + esc(viewPage.prefixed) + '</h2>' +
      (root.PulseWork?root.PulseWork.articleHTML(viewPage.slug):'')+parsedHtml + extra + verify + cat + '</div>';
  }
  function render() {
    var host = document.getElementById('kbHost');
    if (!host) return;
    installHistoryHooks();
    load();
    var titleObj = parseTitle(_sel || 'Main_Page');
    var page = getPage(titleObj.slug);
    if (titleObj.ns !== -1 && page && _col && page.kind !== _col && !_q && _mode === 'read' && _nsTab === 'article') {
      /* keep the open article even if it is outside the chip — list still filters */
    }
    var list = pageList();
    var plusIco = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
    var createLab = { equipment: 'Equipment', manual: 'Manual', repair: 'Repair', troubleshooting: 'Tree', procedure: 'Procedure', spec: 'Spec', incident: 'Incident', help: 'Help page', '': 'Page' }[_col] || 'Page';
    var composer = canEdit()
      ? ('<button type="button" class="wiki-new-btn" onclick="PulseKB.newPage(\'' + (_col || 'procedure') + '\')">' + plusIco + '<span>' + esc(createLab) + '</span></button>')
      : '';
    var nav = COLS.map(function (c) {
      return '<button type="button" class="wiki-chip' + (_col === c[0] ? ' is-on' : '') + '" data-wiki-col="' + escAttr(c[0]) + '">' + esc(c[1]) + '</button>';
    }).join('');
    var deptNav = '<button type="button" class="wiki-chip wiki-chip-sm' + (!_team ? ' is-on' : '') + '" onclick="PulseKB.goTeam(\'\')">All depts</button>' +
      TEAMS.map(function (tm) {
        return '<button type="button" class="wiki-chip wiki-chip-sm' + (_team === tm ? ' is-on' : '') + '" onclick="PulseKB.goTeam(\'' + tm + '\')">' + esc(tm) + '</button>';
      }).join('');
    function pageRow(d) {
      var on = titleObj.slug === d.slug || (_nsTab === 'talk' && subjectSlug(titleObj.slug) === d.slug);
      var bits = [d.kind, d.team || ''];
      if (d.verified) bits.push('verified');
      var pills = (d.cats || []).slice(0, 3).map(function (tg) {
        return '<span class="wiki-pill" style="background:rgba(99,46,138,.10);color:#632E8A">#' + esc(String(tg).toLowerCase().replace(/\s+/g, '-')) + '</span>';
      }).join('');
      return '<a class="wiki-row' + (on ? ' is-on' : '') + '" href="#/kb/' + encodeURIComponent(d.slug) + '" data-wiki-go="' + escAttr(d.slug) + '"><p class="wiki-row-title">' + esc(d.prefixed) + '</p><p class="wiki-row-meta">' + esc(bits.filter(Boolean).join(' · ')) + '</p>' + (pills ? '<div class="wiki-row-tags">' + pills + '</div>' : '') + '</a>';
    }
    var items = '';
    if (!list.length) items = '<p class="text-[12px] text-gray-500 px-3 py-6">No pages in this filter.</p>';
    else if (_team || _q) items = list.map(pageRow).join('');
    else {
      var groups = [];
      var gseen = {};
      list.forEach(function (d) {
        var g = d.kind || 'article';
        if (!gseen[g]) { gseen[g] = true; groups.push(g); }
      });
      items = groups.map(function (g) {
        var rows = list.filter(function (d) { return (d.kind || 'article') === g; }).map(pageRow).join('');
        return '<p class="wiki-list-k">' + esc(g) + '</p>' + rows;
      }).join('');
    }
    var sug = '';
    if (_suggest.length) {
      sug = '<div id="kbSuggest" class="wiki-suggest">' + _suggest.map(function (s, i) {
        return '<button type="button" class="' + (i === 0 ? 'is-on' : '') + '" onclick="PulseKB.openByTitle(\'' + jsStr(s.title) + '\')">' + esc(s.title) + '<span class="wiki-sug-ns">' + esc(s.col || '') + '</span></button>';
      }).join('') + '</div>';
    }
    host.innerHTML =
      '<div class="wiki-shell">' +
      '<div class="wiki-toolbar">' +
      '<div class="wiki-title min-w-0"><h1>Wiki</h1><p class="wiki-lede">Central knowledge base for live television broadcast — equipment, manuals, repairs, and troubleshooting. Charlie searches these pages.</p></div>' +
      '<div class="wiki-actions">' + composer +
      '<div class="wiki-search-wrap"><input id="kbSearch" value="' + escAttr(_q) + '" oninput="PulseKB.onSearch(this)" onkeydown="PulseKB.onSearchKey(event)" placeholder="Search wiki… cameras, RF, fiber" autocomplete="off">' + sug + '</div>' +
      '</div></div>' +
      '<p id="wikiStorageStatus" role="status">'+esc(_saveFailure||(root.PulseRecords?root.PulseRecords.state('wiki'):'Wiki saved in this browser'))+'</p>'+(root.PulseWork?root.PulseWork.wikiHubHTML():'')+
      '<div class="wiki-type-row">' + nav + '</div>' +
      '<div class="wiki-dept-row">' + deptNav + '</div>' +
      '<div class="kb-layout">' +
      '<div class="wiki-list">' + items + '</div>' +
      '<div class="wiki-reader pui-pane" id="mw-content-text">' + renderReader(page, titleObj) + '</div></div></div>';
    try {
      bindWikiHtmlClicks();
      if (_mode === 'edit') setTimeout(mountWikiEditor, 0);
      if (!window._pulseWikiComposeAuto && /[?&]wiki_new=1(?:&|$)/.test(location.search || '')) {
        window._pulseWikiComposeAuto = true;
        setTimeout(function () { openComposer(_col || 'equipment'); }, 200);
      }
    } catch (e) {}
  }

  root.PulseKB = {
    render: render,
    open: function (slug) { openSlug(slug, { mode: 'read' }); },
    search: search,
    bySlug: function (slug) { var p = getPage(slug); return p ? toDoc(p) : null; },
    logIncident: logIncident,
    closeIncident: closeIncident,
    canEdit: canEdit,
    openInventory: function (barcode) {
      try { if (typeof setInvSearch === 'function') setInvSearch(barcode); } catch (e) {}
      try { if (typeof switchView === 'function') switchView('equipment'); } catch (e2) {}
    },
    related: related,
    chunksForCharlie: chunksForCharlie,
    seedShow: seedShow,
    toggleVerified: function () {
      if (!canEdit()) return null;
      var p = getPage(_sel);
      if (!p) return null;
      if(root.PulseWork){root.PulseWork.reviewArticle(_sel);return p;}
      throw Error('Use the article review workflow to record sources, ownership and review evidence.');
      return p;
    },
    normalize: function (d) { return d; },
    newPage: newPage,
    openComposer: openComposer,
    closeComposer: closeComposer,
    composeKind: composeKind,
    composePreview: composePreview,
    composeCommit: composeCommit,
    composeMove: composeMove,
    composeDrop: composeDrop,
    composeDragStart: composeDragStart,
    composeRemove: composeRemove,
    composeAddField: composeAddField,
    insertWikiBlock: insertWikiBlock,
    currentSlug: function () { return _sel; },
    saveCurrent: saveCurrent,
    newIncident: function () { return newPage('incident'); },
    setCol: goCol,
    goCol: goCol,
    setTeam: goTeam,
    goTeam: goTeam,
    setTag: function (t) { _q = t ? '#' + String(t).replace(/^#/, '') : _q; render(); },
    setQ: function (q) { _q = q; render(); },
    onSearch: function (el) {
      _q = el ? el.value : '';
      _suggest = _q ? search(_q).slice(0, 8) : [];
      render();
      var n = document.getElementById('kbSearch');
      if (n) {
        try { n.focus(); n.setSelectionRange(_q.length, _q.length); } catch (e) {}
      }
    },
    onSearchKey: function (ev) {
      if (ev.key === 'Escape') { _suggest = []; render(); return; }
      if (ev.key === 'Enter') {
        ev.preventDefault();
        if (_suggest[0]) openSlug(_suggest[0].slug);
      }
    },
    onTagField: function () {},
    onTagKey: function () {},
    useTag: function (t) {
      _q = '#' + String(t || '').replace(/^#/, '');
      _suggest = search(_q).slice(0, 8);
      render();
    },
    pickTag: function (t) { this.useTag(t); },
    applyRoute: function (slug) {
      if (slug) {
        var t = resolveTitle(decodeURIComponent(String(slug)));
        _sel = t.slug || _sel || 'Main_Page';
        syncFiltersFromTitle(t);
      } else if (!_sel) {
        _sel = 'Main_Page';
      }
      _mode = 'read';
      try {
        if (/[?&]action=edit(?:&|$)/.test(location.search || '')) _mode = 'edit';
      } catch (eE) {}
      render();
    },
    openByTitle: function (title) {
      var t = resolveTitle(title);
      openSlug(t.slug || title);
    },
    setMode: function (m) { _mode = m || 'read'; window.__wikiWantPreview = false; render(); },
    setNsTab: function (tab) {
      _nsTab = tab === 'talk' ? 'talk' : 'article';
      _mode = 'read';
      if (_nsTab === 'talk') openSlug(talkSlug(subjectSlug(_sel)), { talk: true, mode: 'read' });
      else openSlug(subjectSlug(_sel), { mode: 'read' });
    },
    jump: function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var label = (el.textContent || '').replace(/^\d+\.\s*/, '').trim();
      var land = landingForLabel(label);
      if (land) { openSlug(land); return; }
      try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { el.scrollIntoView(); }
    },
    previewEdit: function () {},
    createMissing: function (title) {
      var t = parseTitle(title);
      var kind = t.ns === 100 ? 'manual' : (t.ns === 102 ? 'repair' : (t.ns === 104 ? 'troubleshooting' : (_col || 'equipment')));
      var pref = t.prefixed.replace(/^Manual:|^Repair:|^Troubleshooting:|^Help:/, '');
      openComposer(kind, pref);
    },
    openRev: function (slug, id) {
      var p = getPage(slug);
      if (!p) return;
      _sel = slug;
      _mode = 'read';
      var host = document.getElementById('mw-content-text');
      var raw = textByRev(p, id);
      var html = looksLikeHtml(raw) ? '<div class="wiki-prose">' + raw + '</div>' : parseWikitext(raw, p.prefixed).html;
      if(typeof pulseRichClean==='function')html=pulseRichClean(html);
      if (host) host.innerHTML = '<div class="wiki-article"><p class="wiki-kicker">Revision ' + esc(String(id)) + '</p><h2 class="wiki-first">' + esc(p.prefixed) + '</h2>' + html + '</div>';
    },
    compareRevs: function (slug) {
      var boxes = document.querySelectorAll('.wiki-revbox:checked');
      if (boxes.length < 2) { if (typeof toast === 'function') toast('Select two revisions'); return; }
      var a = boxes[0].getAttribute('data-rev');
      var b = boxes[1].getAttribute('data-rev');
      var p = getPage(slug);
      _diff = { a: textByRev(p, a), b: textByRev(p, b) };
      _mode = 'diff';
      render();
    },
    action: action,
    runApi: function () {
      var act = (document.getElementById('wikiApiAction') || {}).value || 'query';
      var raw = (document.getElementById('wikiApiParams') || {}).value || '';
      var params = { action: act };
      String(raw).split('&').forEach(function (pair) {
        var kv = pair.split('=');
        if (kv[0]) params[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
      });
      Promise.resolve(root.PulseKB.action(params)).then(function(res){var out=document.getElementById('wikiApiOut');if(out)out.textContent=JSON.stringify(res,null,2);});
    },
    parse: function (text, title) { return parseWikitext(text, title || 'Page'); }
  };
  ['saveCurrent','composeCommit','toggleVerified','logIncident','closeIncident','seedShow'].forEach(function(name){if(root.PulseKB[name])root.PulseKB[name]=guarded(root.PulseKB[name]);});
  root.PulseKB.action=function(p){return p&&p.action==='edit'?guarded(actionEdit)(p):action(p);};
  root.PulseKB.exportComposer=function(){harvestCompose();var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({kind:_composeKind,title:_composeTitle,fields:_composeFields},null,2)],{type:'application/json'}));a.download='Pulse-wiki-composer-draft.json';a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},1000);};
  root.PulseKB.restoreComposer=async function(){var d=root.PulseRecords&&await root.PulseRecords.getDraft('wiki:composer');if(!d)return;if(!canEdit())return;_composeKind=d.value.kind;_composeTitle=d.value.title;_composeFields=d.value.fields;renderComposer();};
  root.PulseKB.exportDraft=exportDraft;
  root.PulseKB.databaseVersion=function(){load();return _db.nextRev;};
  root.PulseKB.exportDatabase=function(){load();return JSON.parse(JSON.stringify(_db));};
  root.PulseKB.replaceDatabase=guarded(function(data){if(!canEdit())throw Error('Wiki editing is restricted');validateDatabase(data);_db=JSON.parse(JSON.stringify(data));save();render();});
  root.PulseKB.put=guarded(function(meta,text,summary){if(!canEdit())throw Error('Wiki editing is restricted');var r=putPage(meta,text,summary||'update',false);return r;});
  root.PulseKB.raw=function(slug){var p=getPage(slug);return p?latestText(p):'';};
  root.PulseKB.restoreDraft=async function(){var draft=root.PulseRecords&&await root.PulseRecords.getDraft('wiki:'+_sel);if(!draft){if(typeof toast==='function')toast('No recoverable draft');return;}if(draft.value.revision!==(getPage(_sel)||{}).latest){exportDraft();if(typeof toast==='function')toast('Article changed since this draft. Current editor exported; compare recovered text before saving.');}if(_wikiQuill)_wikiQuill.clipboard.dangerouslyPasteHTML(typeof pulseRichClean==='function'?pulseRichClean(draft.value.text):draft.value.text);else if(document.getElementById('wikiEditBody'))document.getElementById('wikiEditBody').value=draft.value.text;};
  root.PulseKB.validateDatabase=validateDatabase;
  root.PulseKB.flushShared=function(){return _wikiBridgeQueue;};
  root.PulseKB.reload=function(){_db=null;load();render();};
  root.addEventListener('storage',function(e){if(e.key!==KEY)return;if(_mode==='edit'){_saveFailure='Another tab changed the Wiki; your draft is retained. Export it before reloading.';var box=document.getElementById('wikiStorageStatus');if(box)box.textContent=_saveFailure;}else{_db=null;_plainCache=Object.create(null);render();}});
})(typeof window !== 'undefined' ? window : this);

