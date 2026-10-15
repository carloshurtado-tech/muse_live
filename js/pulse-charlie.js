/* Charlie is under construction — no remote assistant. */
(function(root){
  'use strict';
  root.CHARLIE_UNDER_CONSTRUCTION = true;
  root.CHARLIE_AI_ENABLED = false;
  root.CHARLIE_CLOUD_ENABLED = false;
  root.CHARLIE_LOCAL_ENABLED = false;
  root.charlieClient = {
    generate: function(){ return Promise.reject(new Error('Charlie is under construction')); }
  };
  function closed(){
    if (typeof toast === 'function') toast('Charlie is under construction');
  }
  function openDrawer(){
    if (typeof toggleCharlie === 'function' && !root.charlieOpen) toggleCharlie();
  }
  root.charlieSend = closed;
  root.charlieAsk = openDrawer;
  root.openCharlieSettings = function(){};
  root.charlieChip = function(){};
})(typeof window !== 'undefined' ? window : globalThis);
