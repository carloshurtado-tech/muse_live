/* Existing-screen integration for live operations. All actions are operator records. */
(function installLive(root) {
  'use strict';
  var C=root.PulseLiveCore, PREFIX=root.PULSE_FIELD_COPY?'nbcpulse_field_live_'+root.PULSE_FIELD_BASE+'_':'nbcpulse_live_v1_', dialog=null;
  if(!C)return;
  var groups={ops:['resources','feeds'],schedule:['segments'],crew:['comms'],workflow:['assets','recordings'],omni:['incidents','handovers'],tracking:['closeout'],packlist:['offline']};
  var names={resources:'Path resources',feeds:'Feed and destination matrix',segments:'Live show execution',comms:'Intercom, IFB and mix-minus',assets:'Graphics and playback readiness',recordings:'Recording and deliverables',incidents:'Incident response',handovers:'Technical shift handover',closeout:'As-run and closeout',offline:'Offline field operations'};
  var cache={};
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function clone(v){return C.clone(v);}
  function prod(key){var p=(root.productions||{})[key];if(!p)throw Error('Production not found');return p;}
  function read(key){
    var raw=localStorage.getItem(PREFIX+key),p=prod(key);if(raw&&cache[key]&&cache[key].raw===raw)return cache[key].state;
    var s=raw?C.parse(raw):(p.broadcastOps&&p.broadcastOps.liveOps)||C.empty();C.validate(s);if(raw)cache[key]={raw:raw,state:s};return s;
  }
  function uid(){return root.crypto&&root.crypto.randomUUID?root.crypto.randomUUID():'op_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);}
  function operator(){return sessionStorage.getItem('nbcpulse_live_operator')||'';}
  function tell(s){if(root.toast)root.toast(s);else{var n=document.getElementById('fieldStatus');if(n)n.textContent=s;}}
  function mirror(key,s){var p=prod(key);p.broadcastOps=p.broadcastOps||{};p.broadcastOps.liveOps=clone(s);}
  function persist(key,cmd,actor,operationId){
    function write(){var before=read(key),next=C.apply(before,cmd,{actor:actor,id:operationId||uid(),now:Date.now(),offline:navigator.onLine===false||!!root.PULSE_FIELD_COPY});
      if(next.revision===before.revision)return before;
      // A quota failure must not change RAM or report success.
      localStorage.setItem(PREFIX+key,JSON.stringify(next));mirror(key,next);
      if(root.invalidateShowSignoff&&['upsert','incident','resolveIncident','lineCheck','serviceCheck'].indexOf(cmd.type)>=0)root.invalidateShowSignoff(prod(key));
      if(root.saveState)root.saveState();return next;
    }
    return navigator.locks?navigator.locks.request('nbcpulse-edits',write):Promise.resolve().then(write);
  }
  function button(key,action,label,id,collection){return '<button type="button" class="pui-btn inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold" data-live-action="'+esc(action)+'" data-key="'+esc(key)+'" data-id="'+esc(id||'')+'" data-collection="'+esc(collection||'')+'">'+esc(label)+'</button>';}
  function badge(label,tone){var colors={ready:'bg-emerald-50 text-emerald-700',caution:'bg-amber-50 text-amber-700',blocked:'bg-red-50 text-red-700',info:'bg-blue-50 text-blue-700'};return '<span class="pui-tag px-2 py-1 rounded text-xs font-semibold '+(colors[tone]||colors.info)+' pui-tag-'+(tone||'info')+'">'+esc(label)+'</span>';}
  function time(at){return at?new Date(at).toISOString().replace('T',' ').slice(0,19)+' UTC':'—';}
  function duration(v){var n=Math.round(v),sign=n<0?'−':'';n=Math.abs(n);return sign+Math.floor(n/60)+':'+String(n%60).padStart(2,'0');}
  function labels(s,t,values){return (values||[]).map(function(id){var r=s[t].find(function(r){return r.id===id;});return r?r.name:id;}).join(', ')||'—';}
  function table(headers,rows){return '<div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr>'+headers.map(function(h){return '<th scope="col" class="text-left p-2 border-b border-gray-200">'+esc(h)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(row){return '<tr>'+row.map(function(cell){return '<td class="p-2 border-b border-gray-100 align-top">'+cell+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';}
  function card(key,t,body,extra){return '<section class="pui-card bg-white rounded-2xl border border-gray-200 shadow-sm" data-live-section="'+t+'"><div class="pui-card-head p-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2"><h3 class="pui-card-title text-sm font-semibold">'+esc(names[t])+'</h3><div class="flex flex-wrap gap-2">'+(C.schemas[t]?button(key,'edit','Add '+({resources:'resource',feeds:'feed',segments:'segment',comms:'assignment',assets:'asset',recordings:'recording'})[t],'',t):'')+(extra||'')+'</div></div><div class="pui-card-body p-4">'+body+'</div></section>';}
  function details(s,t,r){var fields=C.schemas[t];return '<details><summary class="cursor-pointer">Details · '+esc(r.id)+'</summary><dl class="text-xs">'+Object.keys(fields).map(function(k){return '<dt class="font-semibold mt-2">'+esc(fields[k])+'</dt><dd>'+esc(Array.isArray(r[k])?r[k].join(', '):String(r[k]===true?'Required':r[k]===false?'Not required':r[k]||'—'))+'</dd>';}).join('')+'</dl></details>';}
  function rowsHTML(key,t,s){
    if(!s[t].length)return '<p class="text-sm text-gray-500">No '+esc(names[t].toLowerCase())+' entered. Add records to begin; no checks are assumed complete.</p>';
    return table(['Record','State / requirements','Actions'],s[t].map(function(r){
      var desc='',actions=button(key,'edit','Edit',r.id,t);
      if(t==='resources'){desc=esc(r.kind+' · '+r.venue)+'<br>Dependencies: '+esc(labels(s,'resources',r.dependencies));actions+=button(key,'impact','Failure impact',r.id);}
      if(t==='feeds'){
        var issues=C.feedIssues(s,r,Date.now());desc=badge(issues.length?'Needs verification':'Operator-verified',issues.length?'caution':'ready')+'<p>'+esc(r.source+' → '+r.controlRoom+' → '+r.destination)+'</p><p>'+esc(r.variant+' · '+r.language+' · '+r.format)+'</p><details><summary>'+issues.length+' readiness issue(s)</summary><ul>'+issues.map(function(v){return '<li>'+esc(v)+'</li>';}).join('')+'</ul></details>';
        actions+=button(key,'lineCheck','Line check',r.id)+button(key,'receive','Receiver acknowledgment',r.id)+button(key,'serviceCheck','Service check',r.id)+button(key,'incident','Log incident',r.id);
      }
      if(t==='segments'){
        var issues=C.segmentIssues(s,r,Date.now());desc=badge(r.status||'planned',r.status==='live'?'blocked':r.status==='complete'?'ready':'info')+'<p>Planned '+duration(r.plannedSeconds)+' · <span data-live-clock="'+esc(key)+'" data-segment="'+r.id+'">'+(r.startedAt?'Elapsed '+duration(((r.endedAt||Date.now())-r.startedAt)/1000):'Not started')+'</span></p><p>Feeds: '+esc(labels(s,'feeds',r.feeds))+'</p><details><summary>'+issues.length+' readiness issue(s)</summary>'+issues.map(function(v){return '<p>'+esc(v)+'</p>';}).join('')+'</details>';
        if(!r.startedAt&&r.status!=='skipped')actions+=button(key,'standby','Acknowledge standby',r.id)+button(key,'start','Mark segment live',r.id)+button(key,'skip','Skip',r.id);
        if(r.status==='live')actions=button(key,'end','End segment',r.id);
        if(r.endedAt)actions='Completed '+esc(time(r.endedAt));
      }
      if(t==='comms'){desc=esc(r.person+' · '+r.role)+'<p>IFB: '+esc(r.ifb||'Unassigned')+' · Mix-minus: '+esc(r.mixMinus||'Unassigned')+'</p>';}
      if(t==='assets'){desc=badge(r.approval?'Approved '+r.version:'Approval needed',r.approval?'ready':'caution')+' '+badge(r.loaded?'Loaded '+r.version:'Load not verified',r.loaded?'ready':'caution');actions+=button(key,'approveAsset','Approve version',r.id)+button(key,'loadAsset','Confirm loaded',r.id);}
      if(t==='recordings'){
        desc=badge(r.status||'planned',r.delivered?'ready':'info')+'<p>'+esc(r.language+' · '+r.destination)+'</p><p>Capacity '+r.capacityMinutes+' / required '+r.requiredMinutes+' min</p>';
        if(r.status==='planned')actions+=button(key,'startRecording','Confirm recording',r.id);
        if(r.status==='recording')actions=button(key,'stopRecording','Complete recording',r.id);
        if(r.status==='complete')actions=button(key,'deliver','Confirm delivery',r.id);
        if(r.delivered)actions='Acknowledged by '+esc(r.delivered.receiver)+' · '+esc(time(r.delivered.at));
      }
      return ['<strong>'+esc(r.name)+'</strong>'+details(s,t,r),desc,'<div class="flex flex-wrap gap-2">'+actions+'</div>'];
    }));
  }
  function incidentHTML(key,s){return s.incidents.length?table(['Incident / owner','Impact / recovery','Actions'],s.incidents.map(function(i){var impact=C.impact(s,i);return ['<strong>'+esc(i.title)+'</strong><p>'+esc(i.owner)+' · '+badge(i.status,i.status==='resolved'?'ready':'warn')+'</p><p>'+esc(time(i.openedAt))+'</p>','Feeds: '+esc(labels(s,'feeds',impact.feeds))+'<p>Segments: '+esc(labels(s,'segments',impact.segments))+'</p><p>Recovery procedure: '+esc(i.procedure||'Not recorded')+'</p><p>'+esc(i.resolution||i.notes)+'</p>',(i.status==='resolved'?'Restored '+esc(time(i.resolvedAt)):(i.status==='open'?button(key,'ackIncident','Acknowledge',i.id):'')+button(key,'resolveIncident','Record restoration',i.id))+(root.PulseWork?'<button type="button" class="pui-btn border rounded px-3 py-2 text-xs" onclick="'+esc('PulseWork.incidentDraft('+JSON.stringify(key)+','+JSON.stringify(i.id)+')')+'">Draft lesson</button>':'')];})):'<p class="text-sm text-gray-500">No incidents logged.</p>';}
  function handoverHTML(key,s){return s.handovers.length?table(['Handover','Frozen snapshot','Acknowledgment'],s.handovers.map(function(h){return [esc(h.from+' → '+h.to)+'<p>'+esc(time(h.at))+'</p><p>'+esc(h.notes)+'</p>','Revision '+h.revision+' · '+h.snapshot.incidents.filter(function(i){return i.status!=='resolved';}).length+' unresolved incidents · '+h.snapshot.undelivered.length+' undelivered recordings'+(s.revision>h.revision+1?'<p>Changes have occurred since this handover.</p>':'')+button(key,'viewHandover','View snapshot',h.id),h.ack?esc(h.ack.actor+' · '+time(h.ack.at)):button(key,'ackHandover','Acknowledge handover',h.id)];})):'<p class="text-sm text-gray-500">Create a handover to freeze the current operational record for the incoming operator.</p>';}
  function syncLabel(key,s){
    if(root.PULSE_FIELD_COPY)return 'Offline field copy · export changes for reconciliation';
    if(navigator.onLine===false)return 'Offline · saved in this browser; shared delivery pending';
    try{var ack=JSON.parse(localStorage.getItem('nbcpulse_shared_revisions')||'{}')[key];var fp=ack&&JSON.parse(ack.fingerprint);if(fp&&fp.broadcastOps&&fp.broadcastOps.liveOps&&fp.broadcastOps.liveOps.revision===s.revision)return 'Shared snapshot acknowledged · revision '+s.revision;}catch(e){}
    return 'Saved in this browser · shared snapshot not acknowledged';
  }
  function paneHTML(key,tab){
    var types=groups[tab];if(!types)return '';
    try{var s=read(key);mirror(key,s);var content='<div class="space-y-4" data-live-root="'+esc(key)+'"><p class="text-xs text-gray-500">'+esc(syncLabel(key,s))+' · Actions record operator confirmations; they do not control equipment.</p>';
      if(tab==='schedule'){var current=s.segments.find(function(r){return r.status==='live';}),next=s.segments.find(function(r){return !r.startedAt&&r.status!=='skipped';});content+='<div class="pui-card pui-card-body"><p><strong>Current:</strong> '+esc(current?current.name:'None')+' · <strong>Next:</strong> '+esc(next?next.name:'None')+'</p><p data-live-hardout="'+esc(key)+'">'+esc(s.settings.hardOut?'Hard out '+s.settings.hardOut:'Hard out not set')+'</p>'+button(key,'settings','Show timing and evidence settings')+'</div>';}
      types.forEach(function(t){var body='',extra='';
        if(C.schemas[t])body=rowsHTML(key,t,s);
        if(t==='incidents'){body=incidentHTML(key,s);extra=button(key,'incident','Log incident');}
        if(t==='handovers'){body=handoverHTML(key,s);extra=button(key,'handover','Create handover');}
        if(t==='closeout'){var r=C.report(s,Date.now());body=table(['Segment','State','Planned','Actual','Variance'],r.segments.map(function(x){return [esc(x.name),esc(x.status),duration(x.plannedSeconds),duration(x.actualSeconds),x.varianceSeconds==null?'—':duration(x.varianceSeconds)];}))+'<p class="text-sm mt-3">Undelivered: '+esc(r.undelivered.join(', ')||'None')+'</p>';extra=button(key,'report','Export closeout')+button(key,'template','Export reusable plan')+button(key,'planImport','Import reusable plan');}
        if(t==='offline'){body='<p class="text-sm">Download a self-contained field copy with contacts, patch information and all live-operation records. It works without network access. Export its edits and reconcile them here; maps, telemetry and cloud services require connectivity.</p><p class="text-xs mt-2">'+esc(syncLabel(key,s))+'</p>';extra=(root.PULSE_FIELD_COPY?'':button(key,'field','Download field copy'))+button(key,'export','Export operations')+button(key,'import','Reconcile field changes');}
        content+=card(key,t,body,extra);
      });
      if(tab==='ops')content+=card(key,'offline','<p class="text-sm">Device reports are imported observations, not authenticated live telemetry. An imported report never automatically clears readiness.</p>'+s.reports.map(function(r){return '<details><summary>'+esc(r.adapter||'Device report')+' · '+esc(time(r.at))+' · imported, unverified</summary>'+table(['Feed','Metric','Result','Observed'],r.observations.map(function(o){return [esc(labels(s,'feeds',[o.feed])),esc(o.metric),esc(o.result),esc(time(o.at))];}))+'</details>';}).join(''),button(key,'deviceImport','Import device report'));
      return content+'</div>';
    }catch(e){return '<section class="pui-card pui-card-body"><p role="alert">Live operations could not load: '+esc(e.message)+'. Existing records have not been replaced.</p></section>';}
  }
  function options(s,type,multiple){return (multiple?'':'<option value="">Choose…</option>')+(s[type]||[]).map(function(r){return '<option value="'+esc(r.id)+'">'+esc(r.name)+'</option>';}).join('');}
  function field(name,label,value,s,collection){
    var refs={dependencies:'resources',primary:'resources',backup:'resources',feeds:'feeds',feed:'feeds',assets:'assets',recordings:'recordings',resource:'resources'},list=Array.isArray(value),html;
    if(refs[name]){html='<select name="'+name+'" '+(list?'multiple size="4"':'')+' class="w-full pui-btn rounded-lg border border-gray-200 bg-white p-2 text-sm">'+options(s,refs[name],list)+'</select>';}
    else if(name==='captions')html='<select name="captions" class="w-full pui-btn rounded-lg border border-gray-200 bg-white p-2 text-sm"><option value="false">Not required</option><option value="true">Required</option></select>';
    else html='<'+(name==='notes'||name==='procedure'||name==='reason'||name==='resolution'?'textarea':'input')+' name="'+esc(name)+'" '+(/Seconds$|Minutes$/.test(name)?'type="number" min="0" step="any"':'')+' class="w-full pui-btn rounded-lg border border-gray-200 bg-white p-2 text-sm" '+(name==='name'||name==='actor'?'required':'')+'>'+(name==='notes'||name==='procedure'||name==='reason'||name==='resolution'?'</textarea>':'');
    return '<label class="block text-xs font-semibold">'+esc(label)+html+'</label>';
  }
  function openForm(key,type,id,collection){
    var s=read(key),values={},fields={},title=({receive:'Receiving-party acknowledgment',deliver:'Delivery acknowledgment',serviceCheck:'Service verification',incident:'Log incident',resolveIncident:'Record restoration',ackIncident:'Acknowledge incident',start:'Mark segment live',end:'End segment',standby:'Acknowledge standby',skip:'Skip segment',stopRecording:'Complete recording',startRecording:'Confirm recording',approveAsset:'Approve asset version',loadAsset:'Confirm asset loaded',handover:'Create handover',ackHandover:'Acknowledge handover',settings:'Show timing and evidence settings'})[type]||type,record;
    if(type==='edit'){record=id?C.item(s,collection,id):{};fields=C.schemas[collection];values=record;title=(id?'Edit ':'Add ')+names[collection];}
    else if(type==='lineCheck'){title='Remote line check';C.checks.forEach(function(k,i){fields['check'+i]=k;values['check'+i]='';});fields.evidence='Evidence / notes';}
    else if(type==='receive'||type==='deliver')fields={receiver:'Receiving party who acknowledged'};
    else if(type==='serviceCheck')fields={service:'Required service',result:'Result',evidence:'Measurement / evidence'};
    else if(type==='incident'){fields={title:'Incident title',owner:'Assigned owner',feed:'Affected feed',resource:'Affected resource',severity:'Severity',procedure:'Recovery procedure',notes:'Observed symptoms'};values.feed=id||'';}
    else if(type==='resolveIncident')fields={resolution:'Restoration steps and evidence'};
    else if(type==='start')fields={reason:'Override reason (only needed if readiness issues remain)'};
    else if(type==='skip')fields={reason:'Reason for skipping'};
    else if(type==='stopRecording')fields={evidence:'Captured asset location and verification'};
    else if(type==='handover')fields={to:'Incoming operator',notes:'Temporary patches, substitutions and instructions'};
    else if(type==='settings'){fields={hardOut:'Hard out (ISO timestamp with timezone)',evidenceMinutes:'Evidence lifetime (minutes)'};values=s.settings;}
    if(dialog){dialog.close();dialog.remove();}dialog=document.createElement('dialog');dialog.className='pui-card bg-white text-gray-900 rounded-2xl border border-gray-200 shadow-sm';dialog.style.cssText='width:min(760px,94vw);max-height:90vh;overflow:auto;padding:20px';
    dialog.setAttribute('aria-label',title);dialog.innerHTML='<form><h2 class="text-lg font-semibold mb-4">'+esc(title)+'</h2><p class="text-xs mb-3">This records an operator action. No switcher, router, intercom or recorder command is sent.</p><div class="grid grid-cols-1 md:grid-cols-2 gap-3">'+field('actor','Operator name',operator(),s)+Object.keys(fields).map(function(k){var value=values[k];if(['dependencies','primary','backup','feeds','assets','recordings'].indexOf(k)>=0&&!Array.isArray(value))value=[];return field(k,fields[k],value,s,collection);}).join('')+'</div><p role="alert" class="text-sm text-red-700 mt-3"></p><div class="flex justify-end gap-2 mt-4"><button type="button" class="pui-btn inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold" data-cancel>Cancel</button><button type="submit" class="pui-btn pui-btn-primary">Save confirmation</button></div></form>';
    document.body.appendChild(dialog);var form=dialog.querySelector('form');form.elements.actor.value=operator();
    Object.keys(fields).forEach(function(k){var el=form.elements[k];if(!el)return;if(type==='lineCheck'&&/^check/.test(k)){var select=document.createElement('select');select.name=k;select.className='w-full pui-btn';select.innerHTML='<option value="">Not checked</option><option value="pass">Pass</option><option value="fail">Fail</option><option value="na">Not applicable (optional captions only)</option>';el.replaceWith(select);}
      else if(k==='result'){var select=document.createElement('select');select.name=k;select.className='w-full pui-btn';select.innerHTML='<option value="fail">Fail</option><option value="pass">Pass</option>';el.replaceWith(select);}
      else if(k==='service'&&id){var select=document.createElement('select');select.name=k;select.className='w-full pui-btn';select.innerHTML=C.item(s,'feeds',id).services.map(function(v){return '<option>'+esc(v)+'</option>';}).join('');el.replaceWith(select);}
      else if(el.multiple)Array.from(el.options).forEach(function(o){o.selected=(values[k]||[]).indexOf(o.value)>=0;});else el.value=Array.isArray(values[k])?values[k].join(', '):String(values[k]==null?'':values[k]);
    });
    form.querySelector('[data-cancel]').onclick=function(){dialog.close();};
    form.onsubmit=function(e){e.preventDefault();var data={};Array.from(form.elements).forEach(function(el){if(el.name)data[el.name]=el.multiple?Array.from(el.selectedOptions).map(function(o){return o.value;}):el.value;});var actor=data.actor;sessionStorage.setItem('nbcpulse_live_operator',actor);
      var cmd=Object.assign({type:type,id:id,expectedRevision:s.revision},data);delete cmd.actor;
      if(type==='edit')cmd={type:'upsert',id:id,collection:collection,values:data,expectedRevision:s.revision};
      if(type==='settings')cmd={type:type,values:data,expectedRevision:s.revision};
      if(type==='lineCheck'){cmd.results={};C.checks.forEach(function(k,i){cmd.results[k]=data['check'+i];});}
      var submit=form.querySelector('[type=submit]');submit.disabled=true;
      persist(key,cmd,actor).then(function(){dialog.close();refresh(key);tell('Saved operator confirmation');}).catch(function(error){form.querySelector('[role=alert]').textContent=error.message;}).finally(function(){submit.disabled=false;});
    };dialog.showModal();form.elements.actor.focus();
  }
  function refresh(key){if(root.renderProjectView)root.renderProjectView(key);}
  function download(name,content,type){var a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type:type||'application/json'}));a.href=url;a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(url);},10000);}
  function exportFile(key){var s=read(key);download('Pulse-'+key+'-operations.json',JSON.stringify({format:'pulse-live-ops-v1',production:key,baseRevision:root.PULSE_FIELD_BASE==null?s.revision:root.PULSE_FIELD_BASE,state:s},null,2));}
  function importFile(key,device,plan){var input=document.createElement('input');input.type='file';input.accept='.json,application/json';var before=read(key);input.onchange=async function(){try{
      if(!input.files[0]||input.files[0].size>4000000)throw Error('Choose a JSON file smaller than 4 MB');var packet=C.parse(await input.files[0].text());
      if(plan){await persist(key,{type:'importPlan',plan:packet,expectedRevision:before.revision},operator());refresh(key);tell('Plan imported with new IDs and all evidence reset');return;}
      if(device){await persist(key,{type:'importReport',report:packet,expectedRevision:before.revision},operator());refresh(key);tell('Report imported as unverified observations');return;}
      if(packet.format!=='pulse-live-ops-v1'||packet.production!==key)throw Error('Choose an operations export for this production');C.validate(packet.state);
      if(packet.baseRevision!==before.revision)throw Error('The main record changed since this field copy. Keep both exports and reconcile differences; nothing was overwritten.');
      if(!operator())throw Error('Set your operator name by saving a confirmation first');
      if(!confirm('Import field changes for '+prod(key).name+'? A backup of the current operations will download first.'))return;exportFile(key);
      function merge(){var current=read(key);if(current.revision!==before.revision)throw Error('Records changed during import; retry after reconciliation');var next=clone(packet.state);next.revision=Math.max(current.revision,next.revision)+1;next.events.push({id:uid(),at:Date.now(),actor:operator(),action:'fieldImport',revision:next.revision,source:'imported-unverified'});
        // Imported evidence remains an operator record; never trust claimed device provenance.
        next.checks.concat(next.serviceChecks).forEach(function(e){e.source='imported-unverified';});
        next.feeds.forEach(function(f){if(f.received)f.received.source='imported-unverified';});
        next.assets.forEach(function(a){delete a.approval;delete a.loaded;});
        C.validate(next);localStorage.setItem(PREFIX+key,JSON.stringify(next));mirror(key,next);if(root.saveState)root.saveState();}
      if(navigator.locks)await navigator.locks.request('nbcpulse-edits',merge);else merge();refresh(key);tell('Field changes imported; retain both exports for audit');
    }catch(e){tell(e.message);}};input.click();}
  function view(title,value){if(dialog){dialog.close();dialog.remove();}dialog=document.createElement('dialog');dialog.className='pui-card bg-white text-gray-900 rounded-2xl border border-gray-200 shadow-sm';dialog.style.cssText='width:min(900px,94vw);max-height:90vh;overflow:auto;padding:20px';dialog.innerHTML='<h2 class="text-lg font-semibold">'+esc(title)+'</h2><pre class="text-xs" style="white-space:pre-wrap">'+esc(JSON.stringify(value,null,2))+'</pre><form method="dialog"><button class="pui-btn inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold">Close</button></form>';document.body.appendChild(dialog);dialog.showModal();}
  async function fieldCopy(key){
    var s=read(key),p=prod(key),styles='';for(var file of ['css/pulse-tokens.css','css/pulse-tw.css','css/pulse-ui.css']){var r=await fetch(file);if(!r.ok)throw Error('Could not load field-copy styles; retry while connected');styles+=await r.text();}
    var seed={name:p.name,dept:[],broadcastOps:{liveOps:s}},payload=JSON.stringify({key:key,production:seed}).replace(/</g,'\\u003c');
    var contactText=JSON.stringify({crew:p.crew||[],crewMatrix:p.crewMatrix||{},vendors:p.vendors||[],technicalFields:p.tbFields||{},patches:p.fiber||[],locations:p.locations||[]},null,2);
    var bootstrap='var packet='+payload+';window.PULSE_FIELD_COPY=true;window.PULSE_FIELD_BASE='+s.revision+';window.productions={};window.productions[packet.key]=packet.production;window.PulseLiveCore='+C.source+';';
    var render='window.renderProjectView=function(k){document.getElementById("fieldMain").innerHTML=["ops","schedule","crew","workflow","omni","tracking","packlist"].map(function(t){return PulseLive.paneHTML(k,t)}).join("");};renderProjectView(packet.key);';
    download('Pulse-'+key+'-field-copy.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pulse field copy</title><style>'+styles.replace(/<\/style/gi,'')+'</style><body class="p-4 bg-gray-50 text-gray-900"><h1 class="text-xl font-bold">'+esc(p.name)+' · Offline field copy</h1><p>Export operations when finished. The main application will reject a conflicting field copy. Operator records only; no live telemetry.</p><p id="fieldStatus" role="status"></p><details><summary>Contacts, technical fields and patch information · captured '+esc(time(Date.now()))+'</summary><pre style="white-space:pre-wrap">'+esc(contactText)+'</pre></details><main id="fieldMain" class="space-y-6"></main><script>'+bootstrap+'<\/script><script>('+installLive.toString()+')(window);'+render+'<\/script></body></html>','text/html');
  }
  function template(key){var s=read(key),plan={format:'pulse-live-plan-v1',productionName:prod(key).name,settings:s.settings};C.types.forEach(function(t){plan[t]=s[t].map(function(r){var out={id:r.id};Object.keys(C.schemas[t]).forEach(function(k){out[k]=r[k];});return out;});});download('Pulse-'+key+'-plan-template.json',JSON.stringify(plan,null,2));}
  function tick(){var tickStates={};function state(k){return tickStates[k]||(tickStates[k]=read(k));}document.querySelectorAll('[data-live-clock]').forEach(function(el){try{var s=state(el.dataset.liveClock),r=C.item(s,'segments',el.dataset.segment);el.textContent=r.startedAt?'Elapsed '+duration(((r.endedAt||Date.now())-r.startedAt)/1000):'Not started';}catch(e){}});document.querySelectorAll('[data-live-hardout]').forEach(function(el){try{var s=state(el.dataset.liveHardout),remaining=s.segments.filter(function(r){return !r.endedAt&&r.status!=='skipped';}).reduce(function(n,r){return n+Math.max(0,r.plannedSeconds-(r.startedAt?(Date.now()-r.startedAt)/1000:0));},0);el.textContent=s.settings.hardOut?'Hard out '+s.settings.hardOut+' · '+duration((Date.parse(s.settings.hardOut)-Date.now())/1000)+' remaining · Projected '+duration((Date.now()+remaining*1000-Date.parse(s.settings.hardOut))/1000)+' over/under':'Hard out not set';}catch(e){}});}
  function readiness(key){var s=read(key);return s.feeds.map(function(f){var issues=C.feedIssues(s,f,Date.now()),critical=s.incidents.some(function(i){return i.status!=='resolved'&&i.severity==='critical'&&C.impact(s,i).feeds.indexOf(f.id)>=0;});return {id:'live-'+f.id,label:f.name+' live readiness',level:critical?'red':issues.length?'amber':'green',detail:issues.join('; ')||'Current operator confirmations'};});}
  function techbookSections(p,key){var s=read(key);return C.types.filter(function(t){return s[t].length;}).map(function(t){return {title:names[t],blocks:[{sub:'Operator records · '+time(Date.now()),head:['Record','Details'],rows:s[t].map(function(r){return [r.name,Object.keys(C.schemas[t]).filter(function(k){return k!=='name';}).map(function(k){return C.schemas[t][k]+': '+(Array.isArray(r[k])?r[k].join(', '):r[k]);}).join('\n')];})}]};});}
  root.PulseLive={read:read,persist:persist,paneHTML:paneHTML,readiness:readiness,techbookSections:techbookSections,exportFile:exportFile};
  document.addEventListener('click',function(e){var b=e.target.closest('[data-live-action]');if(!b)return;var k=b.dataset.key,a=b.dataset.liveAction,id=b.dataset.id,t=b.dataset.collection;
    try{if(a==='export')exportFile(k);else if(a==='report')download('Pulse-'+k+'-closeout.json',JSON.stringify(C.report(read(k),Date.now()),null,2));else if(a==='template')template(k);else if(a==='import')importFile(k,false);else if(a==='deviceImport')importFile(k,true);else if(a==='planImport')importFile(k,false,true);else if(a==='field')fieldCopy(k).catch(function(e){tell(e.message);});else if(a==='impact'){var s=read(k);view('Failure impact',C.impact(s,{resource:id}));}else if(a==='viewHandover')view('Handover snapshot',C.item(read(k),'handovers',id));else openForm(k,a,id,t);}catch(error){tell(error.message);}
  });
  window.addEventListener('storage',function(e){if(!e.key||e.key.indexOf(PREFIX)!==0)return;var k=e.key.slice(PREFIX.length);if((root.productions||{})[k]){mirror(k,read(k));if(!dialog||!dialog.open)refresh(k);else tell('Another tab changed these records. Your draft remains open; stale saves will be rejected.');}});
  setInterval(tick,1000);
})(window);
