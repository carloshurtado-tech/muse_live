/* Pages public config — no secrets. Local overrides are not deployed. */
window.MUSE_LIVE_CONFIG = Object.assign(window.MUSE_LIVE_CONFIG || {}, {
  OPEN_METEO_BASE: "https://api.open-meteo.com/v1/forecast",
  USE_VENDOR_CDN: false,
  _source: "pages"
});
window.MUSEAI_EDGE_ENABLED = false;
window.MUSEAI_LOCAL_ENABLED = false;
window.MUSEAI_CLOUD_ENABLED = false;
window.MUSEAI_AI_ENABLED = false;
window.MUSEAI_UNDER_CONSTRUCTION = false;
