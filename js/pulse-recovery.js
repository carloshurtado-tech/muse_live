/* Validated recovery without changing Pulse's established screen layout. */
(function (root) {
  'use strict';
  function parse(text) {
    return JSON.parse(text, function (key, value) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error('Unsafe backup key');
      return value;
    });
  }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function validate(text) {
    var backup = parse(text);
    if (!object(backup) || !backup.edits || !backup.custom) throw new Error('Not a Pulse backup');
    if (backup.formatVersion && backup.formatVersion !== 2) throw new Error('Unsupported backup version');
    var edits = typeof backup.edits === 'string' ? parse(backup.edits) : backup.edits;
    var custom = typeof backup.custom === 'string' ? parse(backup.custom) : backup.custom;
    if (!object(edits) || !object(custom) || !object(custom.custom) || !Array.isArray(custom.order)) throw new Error('Invalid backup records');
    var records = backup.productionRecords || custom.custom;
    if (!object(records)) throw new Error('Invalid production records');
    Object.keys(records).forEach(function (key) {
      if (!object(records[key]) || typeof records[key].name !== 'string' || !Array.isArray(records[key].dept)) throw new Error('Invalid production: ' + key);
    });
    Object.keys(edits).forEach(function (key) {
      var d = Array.isArray(edits[key]) ? edits[key] : edits[key] && edits[key].dept;
      if (!Array.isArray(d) || d.some(function (row) { return !Array.isArray(row) || typeof row[0] !== 'string' || ['approved','pending','missing'].indexOf(row[1]) < 0; })) throw new Error('Invalid department records: ' + key);
    });
    if (custom.order.some(function (key) { return typeof key !== 'string'; })) throw new Error('Invalid production order');
    var inventory = backup.inventory ? parse(backup.inventory) : null;
    var gear = backup.gear ? parse(backup.gear) : null;
    if (inventory !== null && !Array.isArray(inventory)) throw new Error('Invalid inventory');
    if (gear !== null && !object(gear)) throw new Error('Invalid gear catalog');
    var connected=backup.connectedRecords?parse(backup.connectedRecords):null,wiki=backup.wikiDatabase?parse(backup.wikiDatabase):null;
    if(connected){if(!root.PulseWorkCore||!object(connected)||!Number.isSafeInteger(connected.version))throw new Error('Connected records cannot be validated');root.PulseWorkCore.validate(connected.value);}
    if(wiki){if(!root.PulseWikiSchema)throw new Error('Wiki validation is unavailable');root.PulseWikiSchema.validate(wiki);}
    return { edits: edits, custom: custom, records: records, inventory: inventory, gear: gear,connected:connected,wiki:wiki };
  }
  function restore(text) {
    var b = validate(text), writes = {}, before = {};
    var existing = parse(localStorage.getItem('nbcpulse_edits') || '{}');
    var existingCustom = parse(localStorage.getItem('nbcpulse_custom') || '{"order":[],"custom":{}}');
    Object.keys(b.records).forEach(function (key) { existingCustom.custom[key] = b.records[key]; });
    Object.keys(b.edits).forEach(function (key) { existing[key] = b.edits[key]; });
    b.custom.order.forEach(function (key) { if (existingCustom.order.indexOf(key) < 0) existingCustom.order.push(key); });
    writes.nbcpulse_custom = JSON.stringify(existingCustom);
    if (b.inventory) writes.nbcpulse_inventory_v1 = JSON.stringify(b.inventory);
    if (b.gear) writes.nbcpulse_gear = JSON.stringify(b.gear);
    writes.nbcpulse_edits = JSON.stringify(existing);
    // Restore live-operation records in the same rollback-protected transaction.
    Object.keys(b.records).forEach(function (key) {
      var record = b.edits[key] || b.records[key];
      var state = (record.broadcastOps && record.broadcastOps.liveOps) || (b.records[key].broadcastOps && b.records[key].broadcastOps.liveOps);
      if (state && root.PulseLiveCore) {
        state = root.PulseLiveCore.clone(state);
        root.PulseLiveCore.validate(state);
        var previous = parse(localStorage.getItem('nbcpulse_live_v1_' + key) || 'null');
        state.revision = Math.max(state.revision, previous ? previous.revision : 0) + 1;
        writes['nbcpulse_live_v1_' + key] = JSON.stringify(state);
      }
    });
    if(b.connected){var current=parse(localStorage.getItem('nbcpulse_records_v1_operations')||'{"version":0,"serverVersion":null,"value":{"revision":0}}');b.connected.version=current.version+1;b.connected.serverVersion=current.serverVersion;b.connected.dirty=true;b.connected.mutationId=root.crypto.randomUUID();b.connected.value.revision=Math.max(b.connected.value.revision,current.value.revision)+1;writes.nbcpulse_records_v1_operations=JSON.stringify(b.connected);}
    if(b.wiki){writes.nbcpulse_wiki_v2=JSON.stringify(b.wiki);var wr=parse(localStorage.getItem('nbcpulse_records_v1_wiki')||'{"version":0,"serverVersion":null}');writes.nbcpulse_records_v1_wiki=JSON.stringify({version:wr.version+1,serverVersion:wr.serverVersion,dirty:true,mutationId:root.crypto.randomUUID(),savedAt:Date.now(),value:b.wiki});}
    Object.keys(writes).forEach(function (key) { before[key] = localStorage.getItem(key); });
    try { Object.keys(writes).forEach(function (key) { localStorage.setItem(key, writes[key]); }); }
    catch (error) {
      Object.keys(before).forEach(function (key) { try { if (before[key] === null) localStorage.removeItem(key); else localStorage.setItem(key, before[key]); } catch (rollbackError) {} });
      throw new Error('Restore could not be saved. Keep the backup file and free browser storage before retrying.');
    }
    // Only update working records after every persistent write succeeds.
    Object.keys(b.records).forEach(function (key) { root.productions[key] = b.records[key]; });
    if (b.inventory) root.inventory = b.inventory;
    if (b.gear) root.deptFields = b.gear;
    root.loadState();
    if(b.wiki&&root.PulseKB)root.PulseKB.reload();
    if(b.connected&&root.dispatchEvent)root.dispatchEvent(new CustomEvent('pulse-records-change',{detail:{name:'operations'}}));
    return Object.keys(b.edits).length;
  }
  function chooseFile() {
    var input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = function () {
      var file = input.files && input.files[0]; if (!file) return;
      file.text().then(function (text) {
        var backup = validate(text);
        if (!confirm('Restore ' + Object.keys(backup.edits).length + ' production records from this backup? A backup of your current work will download first.')) return;
        root.pulseExportStateBackup();
        function run() { var n = restore(text); root.renderAll(); root.toast('Restored ' + n + ' production records'); }
        function locked(i){var names=['nbcpulse-edits','pulse-records-operations','pulse-wiki-write','pulse-records-wiki'];return i===names.length?run():navigator.locks.request(names[i],function(){return locked(i+1);});}return navigator.locks?locked(0):run();
      }).catch(function (error) { root.toast(error.message || 'Restore failed'); });
    };
    input.click();
  }
  root.PulseRecovery = { validate: validate, restore: restore, chooseFile: chooseFile };
})(window);
