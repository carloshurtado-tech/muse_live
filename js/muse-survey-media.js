/* Seeded Site Survey gallery + 360 panos per production.
   Images generated in-session. */
(function (root) {
  'use strict';
  var VER = 20261101; /* bump: seeded JPG venue photos carry the AI-generated label (BUG-08) */
  function cap(src, caption, by, ai) {
    return { src: src, caption: caption, ts: 'seeded walk', by: by || 'Site survey', ai: !!ai };
  }
  /* Third-party photos (CC BY-SA 4.0, cropped to 16:9) — credited on the photo itself */
  var CREDIT = {
    museailaunch: {
      exterior: 'Photo: Epicgenius / Wikimedia Commons · CC BY-SA 4.0',
      around: 'Photo: Epicgenius / Wikimedia Commons · CC BY-SA 4.0'
    }
  };
  function pack(key, venue, ext) {
    var b = 'assets/survey/' + key + '/', c = CREDIT[key] || {}, e = ext || 'jpg';
    /* Seeded JPGs are Grok Imagine renders unless a real-photo credit says
       otherwise (BUG-08); SVG schematics and user uploads are never labelled. */
    function seeded(name, caption, credit) { return cap(b + name + '.' + e, caption, credit, !credit && e === 'jpg'); }
    return {
      gallery: [
        seeded('exterior', venue + ' — exterior / approach', c.exterior),
        seeded('compound', venue + ' — compound / platforms', c.compound)
      ],
      around: [
        seeded('around', venue + ' — surrounding area', c.around)
      ],
      pano: b + 'pano.' + e
    };
  }
  root.MUSE_SURVEY_MEDIA_VER = VER;
  root.MUSE_SURVEY_MEDIA = {
    museaitour: pack('raybangen3', 'Meta HQ · Menlo Park', 'svg'),
    raybangen3: pack('raybangen3', 'Meta HQ · Classroom Stage', 'svg'),
    orion: pack('orion', "Levi's Stadium"),
    museailaunch: pack('museailaunch', 'Meta NYC · Hudson Yards'),
    whatsapp: pack('whatsapp', 'WhatsApp Washington DC Hub'),
    igcreators: pack('igcreators', "Herald Square"),
    charm: pack('charm', 'Milan IBC — Fiera Milano Rho')
  };
  function wrapGetSurvey() {
    if (typeof root.getSurvey !== 'function' || root.getSurvey._media) return false;
    var orig = root.getSurvey;
    root.getSurvey = function (key) {
      var s = orig(key);
      try { root.museApplySurveyMedia(key, s); } catch (e) {}
      return s;
    };
    root.getSurvey._media = true;
    return true;
  }
  function bootWrap() {
    try {
      var m = /[?&]surv=([a-z]+)/.exec(location.search || '');
      if (m && typeof surveyView !== 'undefined') {
        var k = 'museaitour';
        try {
          var h = String(location.hash || '');
          var p = h.replace(/^#\//, '').split('/')[0];
          if (p) k = decodeURIComponent(p);
        } catch (eH) {}
        surveyView[k] = m[1];
      }
    } catch (eS) {}
    try {
      if (/[?&]surv=/.test(location.search || '') && typeof setProjTab === 'function') {
        var hk = 'museaitour';
        try {
          var hx = String(location.hash || '').replace(/^#\//, '').split('/')[0];
          if (hx) hk = decodeURIComponent(hx);
        } catch (eH2) {}
        var tries = 0;
        var iv = setInterval(function () {
          tries++;
          try {
            if (typeof setProjTab === 'function') {
              setProjTab(hk, 'survey');
              if (typeof surveySetView === 'function' && m) surveySetView(hk, m[1]);
              if (tries >= 2) clearInterval(iv);
            }
          } catch (eT) {}
          if (tries > 12) clearInterval(iv);
        }, 400);
      }
    } catch (eTab) {}
    if (wrapGetSurvey()) return;
    var n = 0, t = setInterval(function () {
      n++;
      if (wrapGetSurvey() || n > 40) clearInterval(t);
    }, 200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootWrap);
  else bootWrap();
  root.museApplySurveyMedia = function (key, s) {
    if (!s) return s;
    var pack = root.MUSE_SURVEY_MEDIA[key];
    if (!pack) return s;
    function isUser(im) {
      var src = (im && im.src) || (typeof im === 'string' ? im : '');
      return src.indexOf('data:') === 0 || src.indexOf('blob:') === 0;
    }
    if (s._mediaVer === VER && s.images && s.images.length >= 2 && s.pano && s.pano.img) return s;
    var userMain = (s.images || []).filter(isUser);
    var userAround = (s.imagesAround || []).filter(isUser);
    s.images = pack.gallery.concat(userMain);
    s.imagesAround = (pack.around || []).concat(userAround);
    if (!s.pano) s.pano = { img: null, hotspots: [], marks: [] };
    if (!s.pano.img || String(s.pano.img).indexOf('data:') !== 0) s.pano.img = pack.pano;
    if (!s.pano.hotspots) s.pano.hotspots = [];
    if (!s.pano.marks) s.pano.marks = [];
    s._mediaVer = VER;
    return s;
  };
})(typeof window !== 'undefined' ? window : this);
