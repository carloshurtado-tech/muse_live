/* Muse is under construction — no remote assistant. */
(function(root){
  'use strict';
  root.MUSEAI_UNDER_CONSTRUCTION = true;
  root.MUSEAI_AI_ENABLED = false;
  root.MUSEAI_CLOUD_ENABLED = false;
  root.MUSEAI_LOCAL_ENABLED = false;
  root.museaiClient = {
    generate: function(){ return Promise.reject(new Error('Muse is under construction')); }
  };
  function closed(){
    if (typeof toast === 'function') toast('Muse is under construction');
  }
  function openDrawer(){
    if (typeof toggleMuseAi === 'function' && !root.museaiOpen) toggleMuseAi();
  }
  root.museaiSend = closed;
  root.museaiAsk = openDrawer;
  root.openMuseAiSettings = function(){};
  root.museaiChip = function(){};
})(typeof window !== 'undefined' ? window : globalThis);
