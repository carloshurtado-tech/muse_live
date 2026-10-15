/* Local secrets — gitignored. Never deploy. */
window.NBC_PULSE_CONFIG = Object.assign(window.NBC_PULSE_CONFIG || {}, {
  CHARLIE_KEY: "",
  OPEN_METEO_BASE: "https://api.open-meteo.com/v1/forecast",
  USE_VENDOR_CDN: false,
  _source: "local"
});
window.CHARLIE_EDGE_ENABLED = false;
window.CHARLIE_LOCAL_ENABLED = false;
window.CHARLIE_CLOUD_ENABLED = false;
window.CHARLIE_AI_ENABLED = false;
window.CHARLIE_UNDER_CONSTRUCTION = true;
