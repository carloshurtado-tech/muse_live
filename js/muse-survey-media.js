/* Seeded Site Survey gallery + 360 panos per production.
   Images generated in-session. */
(function (root) {
  'use strict';
  var VER = 20260827;
  function cap(src, caption) {
    return { src: src, caption: caption, ts: 'seeded walk', by: 'Site survey' };
  }
  function pack(key, venue, shots) {
    var b = 'assets/survey/' + key + '/';
    return {
      gallery: [
        cap(b + 'exterior.jpg', venue + ' — exterior / approach'),
        cap(b + 'compound.jpg', venue + ' — compound / platforms')
      ],
      around: [
        cap(b + 'around.jpg', venue + ' — surrounding area')
      ],
      pano: b + 'pano.jpg'
    };
  }
  root.MUSE_SURVEY_MEDIA_VER = VER;
  root.MUSE_SURVEY_MEDIA = {
    museaitour: pack('museaitour', 'MetLife Stadium'),
    raybangen3: pack('raybangen3', 'New York Harbor'),
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
