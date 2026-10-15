/* Muse — the Muse Live assistant. Runs fully in the browser: answers come from the live
   production data (museaiAnswer rules) plus keyless public feeds (weather, sports). No
   remote model is configured in this build, so the cloud client always defers to rules. */
(function(root){
  'use strict';
  root.MUSEAI_UNDER_CONSTRUCTION = false;
  root.MUSEAI_AI_ENABLED = false;
  root.MUSEAI_CLOUD_ENABLED = false;
  root.MUSEAI_LOCAL_ENABLED = false;
  root.museaiClient = {
    generate: function(){ return Promise.reject(new Error('No remote model configured')); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
