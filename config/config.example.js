/* Pages public config — no secrets. Local overrides are not deployed. */
window.NBC_PULSE_CONFIG = Object.assign(window.NBC_PULSE_CONFIG || {}, {
  OPEN_METEO_BASE: "https://api.open-meteo.com/v1/forecast",
  USE_VENDOR_CDN: false,
  _source: "pages"
});
window.CHARLIE_EDGE_ENABLED = false;
window.CHARLIE_LOCAL_ENABLED = false;
window.CHARLIE_CLOUD_ENABLED = false;
window.CHARLIE_AI_ENABLED = false;
window.CHARLIE_UNDER_CONSTRUCTION = true;
