/* Pulse live operations: deterministic workflow engine, no device-control side effects. */
(function (root, factory) {
  var api = factory();
  api.source = '(' + factory.toString() + ')()';
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PulseLiveCore = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var TYPES = ['resources','feeds','segments','comms','assets','recordings'];
  var CHECKS = ['Picture','Audio mapping','Lip sync','Program return','IFB','Mix-minus','Intercom','Captions'];
  var SCHEMAS = {
    resources: {name:'Name',kind:'Type',venue:'Venue',dependencies:'Depends on resource IDs'},
    feeds: {name:'Feed ID / name',venue:'Venue',source:'Source',controlRoom:'Control room',destination:'Destination',variant:'Clean / dirty / other',language:'Language',format:'Video format',audioMap:'Audio channel mapping',windowStart:'Booking start (ISO with timezone)',windowEnd:'Booking end (ISO with timezone)',primary:'Primary resource IDs',backup:'Backup resource IDs',captions:'Captions required',services:'Required service IDs',contact:'Receiving contact'},
    segments: {name:'Segment',plannedSeconds:'Planned duration (seconds)',feeds:'Feed IDs',assets:'Asset IDs',recordings:'Recording IDs',crew:'Standby crew / roles',notes:'Production notes'},
    comms: {name:'Circuit / assignment',feed:'Feed ID',person:'Talent / operator',role:'Role',panel:'Panel / beltpack',ifb:'IFB destination',returnFeed:'Program return',mixMinus:'Mix-minus source',interrupt:'Interrupt source',contact:'Escalation contact'},
    assets: {name:'Graphic / clip',kind:'Graphic / playback',version:'Version',language:'Language',durationSeconds:'Duration (seconds)',system:'Playout system',location:'Asset identifier / location'},
    recordings: {name:'Recording / deliverable',feed:'Feed ID',kind:'Program / clean / ISO / other',language:'Language',destination:'Recording destination',capacityMinutes:'Available capacity (minutes)',requiredMinutes:'Required duration (minutes)',deliveryDestination:'Delivery destination'}
  };
  var LISTS = ['dependencies','primary','backup','services','feeds','assets','recordings'];
  function fail(message) { throw new Error(message); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function parse(text) {
    if (typeof text !== 'string' || text.length > 4000000) fail('File is too large');
    return JSON.parse(text, function (k,v) { if (['__proto__','constructor','prototype'].indexOf(k)>=0) fail('Unsafe object key'); return v; });
  }
  function empty() { var s={version:1,revision:0,events:[],checks:[],incidents:[],handovers:[],serviceChecks:[],reports:[],settings:{evidenceMinutes:60,hardOut:''}}; TYPES.forEach(function(t){s[t]=[];});return s; }
  function item(s,t,id) { var r=(s[t]||[]).find(function(x){return x.id===id;});if(!r)fail('Missing '+t+' record: '+id);return r; }
  function ids(v) { return Array.isArray(v)?v.map(String):String(v||'').split(',').map(function(x){return x.trim();}).filter(Boolean); }
  function stamp(v) { var n=Date.parse(v); if(!Number.isFinite(n)||!/(Z|[+-]\d\d:\d\d)$/.test(v))fail('Use an ISO timestamp with timezone');return n; }
  function clean(t,input) {
    var out={};if(!SCHEMAS[t])fail('Unknown record type');
    Object.keys(SCHEMAS[t]).forEach(function(k){
      var v=input[k]; if(LISTS.indexOf(k)>=0)out[k]=ids(v);
      else if(k==='captions')out[k]=v===true||v==='true';
      else if(/Seconds$|Minutes$/.test(k)){out[k]=v===''||v==null?0:Number(v);if(!Number.isFinite(out[k])||out[k]<0)fail('Invalid '+SCHEMAS[t][k]);}
      else {out[k]=String(v==null?'':v).trim();if(out[k].length>2000)fail('Field exceeds 2000 characters');}
    });
    if(!out.name)fail('A name is required');
    if(t==='segments'&&out.plannedSeconds<=0)fail('Planned duration must be positive');
    if(t==='assets'&&!out.version)fail('An asset version is required');
    if(t==='feeds'){
      if(!!out.windowStart!==!!out.windowEnd)fail('Provide both booking start and end');
      if(out.windowStart&&stamp(out.windowEnd)<=stamp(out.windowStart))fail('Booking end must follow start');
    }
    return out;
  }
  function reference(s,t,id){if(id)item(s,t,id);}
  function validate(s) {
    if(!s||s.version!==1||!Number.isSafeInteger(s.revision)||s.revision<0)fail('Unsupported live operations data');
    TYPES.concat(['checks','incidents','events','handovers','serviceChecks','reports']).forEach(function(t){
      if(!Array.isArray(s[t])||s[t].length>10000)fail('Invalid '+t+' collection');
      var seen={};s[t].forEach(function(r){if(!r||typeof r.id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(r.id)||seen[r.id])fail('Invalid or duplicate record ID');seen[r.id]=true;});
    });
    TYPES.forEach(function(t){s[t].forEach(function(r){clean(t,r);if(!Number.isSafeInteger(r.revision)||r.revision<1)fail('Invalid record revision');});});
    s.resources.forEach(function(r){r.dependencies.forEach(function(id){reference(s,'resources',id);});});
    s.feeds.forEach(function(f){f.primary.concat(f.backup).forEach(function(id){reference(s,'resources',id);});});
    s.segments.forEach(function(r){r.feeds.forEach(function(id){reference(s,'feeds',id);});r.assets.forEach(function(id){reference(s,'assets',id);});r.recordings.forEach(function(id){reference(s,'recordings',id);});});
    s.comms.concat(s.recordings).forEach(function(r){reference(s,'feeds',r.feed);});
    s.resources.forEach(function(r){expand(s,[r.id]);});
    function evidence(e){if(!e||!Number.isFinite(e.at)||e.at<0||typeof e.actor!=='string'||!e.actor.trim())fail('Invalid operator evidence');}
    s.checks.forEach(function(e){evidence(e);reference(s,'feeds',e.feed);if(!Number.isSafeInteger(e.feedRevision)||e.feedRevision<1||!e.results)fail('Invalid line check');CHECKS.forEach(function(k){if(['pass','fail','na'].indexOf(e.results[k])<0)fail('Invalid line-check result');});});
    s.serviceChecks.forEach(function(e){evidence(e);reference(s,'feeds',e.feed);if(typeof e.service!=='string'||['pass','fail'].indexOf(e.result)<0||!Number.isSafeInteger(e.feedRevision))fail('Invalid service check');});
    s.events.forEach(function(e){evidence(e);if(typeof e.action!=='string'||!Number.isSafeInteger(e.revision))fail('Invalid audit event');});
    s.feeds.forEach(function(f){if(f.received)evidence(f.received);});
    s.assets.forEach(function(a){if(a.approval)evidence(a.approval);if(a.loaded)evidence(a.loaded);});
    s.incidents.forEach(function(i){if(['open','acknowledged','resolved'].indexOf(i.status)<0||!Number.isFinite(i.openedAt)||typeof i.title!=='string'||!i.title||!i.owner||(!i.feed&&!i.resource))fail('Invalid incident');reference(s,'feeds',i.feed);reference(s,'resources',i.resource);});
    s.handovers.forEach(function(h){if(!Number.isFinite(h.at)||typeof h.to!=='string'||!h.to.trim()||!h.snapshot||!Array.isArray(h.snapshot.events))fail('Invalid handover');if(h.ack)evidence(h.ack);});
    s.reports.forEach(function(r){evidence(r);if(!Array.isArray(r.observations))fail('Invalid device report');});
    s.segments.concat(s.recordings).forEach(function(r){['startedAt','endedAt'].forEach(function(k){if(r[k]!=null&&(!Number.isFinite(r[k])||r[k]<0))fail('Invalid execution timestamp');});if(r.endedAt&&(!r.startedAt||r.endedAt<r.startedAt))fail('Invalid execution interval');});

    if(!s.settings||!Number.isFinite(s.settings.evidenceMinutes)||s.settings.evidenceMinutes<1||s.settings.evidenceMinutes>1440)fail('Evidence lifetime must be 1–1440 minutes');
    if(s.settings.hardOut)stamp(s.settings.hardOut);
    return s;
  }
  function expand(s,roots) {
    var out=[],visiting={};function visit(id){if(visiting[id])fail('Resource dependency cycle');if(out.indexOf(id)>=0)return;visiting[id]=true;item(s,'resources',id).dependencies.forEach(visit);visiting[id]=false;out.push(id);}roots.forEach(visit);return out;
  }
  function shared(s,f){var a=expand(s,f.primary),b=expand(s,f.backup);return a.filter(function(id){return b.indexOf(id)>=0;});}
  function affected(s,resource){return s.feeds.filter(function(f){return expand(s,f.primary.concat(f.backup)).indexOf(resource)>=0;}).map(function(f){return f.id;});}
  function impact(s,incident) {
    var feeds=incident.feed?[incident.feed]:incident.resource?affected(s,incident.resource):[];
    return {feeds:feeds,segments:s.segments.filter(function(r){return r.feeds.some(function(id){return feeds.indexOf(id)>=0;});}).map(function(r){return r.id;}),destinations:s.feeds.filter(function(f){return feeds.indexOf(f.id)>=0;}).map(function(f){return f.destination;})};
  }
  function fresh(s,e,now){return e&&Number.isFinite(e.at)&&e.at<=now&&now-e.at<=s.settings.evidenceMinutes*60000;}
  function feedIssues(s,f,now){
    var out=[];['source','destination','format','audioMap','language'].forEach(function(k){if(!f[k])out.push('Missing '+SCHEMAS.feeds[k]);});
    if(!f.primary.length)out.push('Primary path unspecified');if(!f.backup.length)out.push('Backup path unspecified');
    var common=shared(s,f);if(common.length)out.push('Shared primary/backup dependencies: '+common.join(', '));
    if(!f.windowStart)out.push('Booking window unspecified');else if(now<stamp(f.windowStart)||now>=stamp(f.windowEnd))out.push('Outside booking window');
    var check=s.checks.filter(function(c){return c.feed===f.id;}).slice(-1)[0];
    if(!check||check.source!=='operator-confirmed'||check.feedRevision!==f.revision||!fresh(s,check,now))out.push('Line check missing, stale, or invalidated');
    else CHECKS.forEach(function(k){if(k==='Captions'&&!f.captions)return;if(check.results[k]!=='pass')out.push(k+' not verified');});
    if(!f.received||f.received.source!=='operator-confirmed'||f.received.revision!==f.revision||!fresh(s,f.received,now))out.push('Receiving party has not confirmed current feed');
    var circuits=s.comms.filter(function(c){return c.feed===f.id;});
    if(!circuits.length)out.push('Comms assignment missing');
    circuits.forEach(function(c){if(['person','ifb','returnFeed','mixMinus','interrupt'].some(function(k){return !c[k];}))out.push('Incomplete comms assignment: '+c.name);});
    (f.services||[]).forEach(function(id){var e=s.serviceChecks.filter(function(c){return c.feed===f.id&&c.service===id;}).slice(-1)[0];if(!e||e.source!=='operator-confirmed'||e.feedRevision!==f.revision||!fresh(s,e,now)||e.result!=='pass')out.push('Service not verified: '+id);});
    s.incidents.filter(function(i){return i.status!=='resolved'&&impact(s,i).feeds.indexOf(f.id)>=0;}).forEach(function(i){out.push('Open incident: '+i.title);});
    return out;
  }
  function segmentIssues(s,r,now){var out=[];r.feeds.forEach(function(id){var f=item(s,'feeds',id);feedIssues(s,f,now).forEach(function(x){out.push(f.name+': '+x);});});
    r.assets.forEach(function(id){var a=item(s,'assets',id);if(!a.approval||a.approval.version!==a.version||!a.loaded||a.loaded.version!==a.version)out.push('Asset not approved and loaded: '+a.name);});
    r.recordings.forEach(function(id){var a=item(s,'recordings',id);if(a.status!=='recording')out.push('Recording not confirmed running: '+a.name);});return out;}
  function report(s,now){
    var durations=s.segments.map(function(r){var actual=r.startedAt?((r.endedAt||now)-r.startedAt)/1000:0;return {id:r.id,name:r.name,status:r.status||'planned',plannedSeconds:r.plannedSeconds,actualSeconds:Math.max(0,Math.round(actual)),varianceSeconds:r.endedAt?Math.round(actual-r.plannedSeconds):null,override:r.override||'',feeds:r.feeds};});
    return {generatedAt:now,revision:s.revision,segments:durations,incidents:clone(s.incidents),undelivered:s.recordings.filter(function(r){return !r.delivered;}).map(function(r){return r.name;}),resourceSubstitutions:s.events.filter(function(e){return e.action==='upsert'&&e.collection==='feeds';}),feedIssues:s.feeds.map(function(f){return {id:f.id,name:f.name,issues:feedIssues(s,f,now)};}),events:clone(s.events)};
  }
  function apply(state,command,context){
    validate(state);var s=clone(state),c=command||{},ctx=context||{},now=ctx.now||Date.now(),actor=String(ctx.actor||'').trim();
    if(!actor||actor.length>160)fail('Enter the operator name before making a change');
    var id=ctx.id;if(!/^[-a-zA-Z0-9_]{1,100}$/.test(id||''))fail('A unique operation ID is required');
    if(s.events.some(function(e){return e.id===id;}))return s;
    if(c.expectedRevision!==s.revision)fail('These records changed. Refresh and reconcile your draft before saving.');
    var row,recordId=c.id||id;
    if(c.type==='upsert'){
      var input=clean(c.collection,c.values||{}),existing=s[c.collection].find(function(r){return r.id===c.id;});
      if(existing&&JSON.stringify(clean(c.collection,existing))===JSON.stringify(input))return s;
      if(existing&&c.collection==='segments'&&existing.startedAt)fail('A started segment cannot be rewritten; add a new segment for changes');
      if(existing&&c.collection==='recordings'&&existing.status&&existing.status!=='planned')fail('A started recording cannot be rewritten; add a replacement recording');
      row=Object.assign({},input,{id:recordId,revision:existing?existing.revision+1:1,status:'planned'});
      if(existing)s[c.collection][s[c.collection].indexOf(existing)]=row;else s[c.collection].push(row);
      if(c.collection==='resources'){affected(s,row.id).forEach(function(fid){item(s,'feeds',fid).revision++;});}
      if(c.collection==='comms'){[row.feed,existing&&existing.feed].filter(Boolean).filter(function(x,i,a){return a.indexOf(x)===i;}).forEach(function(fid){item(s,'feeds',fid).revision++;});}
    } else if(c.type==='settings'){
      s.settings={evidenceMinutes:Number(c.values.evidenceMinutes),hardOut:String(c.values.hardOut||'')};
    } else if(c.type==='lineCheck'){
      row=item(s,'feeds',c.id);var results={};CHECKS.forEach(function(k){var v=c.results&&c.results[k];if(['pass','fail','na'].indexOf(v)<0)fail('Complete every line-check item');if(v==='na'&&(k!=='Captions'||row.captions))fail(k+' cannot be marked not applicable');results[k]=v;});
      s.checks.push({id:id,feed:row.id,feedRevision:row.revision,results:results,at:now,actor:actor,evidence:String(c.evidence||''),source:'operator-confirmed'});
    } else if(c.type==='receive'){
      row=item(s,'feeds',c.id);if(!String(c.receiver||'').trim())fail('Receiving-party name is required');row.received={revision:row.revision,at:now,actor:actor,receiver:String(c.receiver),source:'operator-confirmed'};
    } else if(c.type==='serviceCheck'){
      row=item(s,'feeds',c.id);if(row.services.indexOf(c.service)<0)fail('Choose a required service from this feed');if(['pass','fail'].indexOf(c.result)<0)fail('Choose pass or fail');
      s.serviceChecks.push({id:id,feed:row.id,feedRevision:row.revision,service:c.service,result:c.result,at:now,actor:actor,evidence:String(c.evidence||''),source:'operator-confirmed'});
    } else if(c.type==='standby'){
      row=item(s,'segments',c.id);if(row.startedAt||row.status==='skipped')fail('Segment is no longer waiting');row.standby={at:now,actor:actor};row.status='standby';
    } else if(c.type==='start'){
      row=item(s,'segments',c.id);if(row.startedAt||row.status==='skipped')fail('Segment already started or skipped');if(s.segments.some(function(r){return r.status==='live';}))fail('Finish the current segment first');if(!row.standby)fail('Acknowledge standby first');
      var problems=segmentIssues(s,row,now);if(problems.length&&!String(c.reason||'').trim())fail('Resolve readiness issues or record an override reason');
      row.startedAt=now;row.status='live';row.override=String(c.reason||'');row.startIssues=problems;
    } else if(c.type==='end'){
      row=item(s,'segments',c.id);if(row.status!=='live')fail('Segment is not live');row.endedAt=now;row.status='complete';
    } else if(c.type==='skip'){
      row=item(s,'segments',c.id);if(row.startedAt)fail('Cannot skip a started segment');if(!String(c.reason||'').trim())fail('A skip reason is required');row.status='skipped';row.skipReason=String(c.reason);
    } else if(c.type==='incident'){
      if(!c.feed&&!c.resource)fail('Link a feed or resource');reference(s,'feeds',c.feed);reference(s,'resources',c.resource);if(!c.title||!c.owner)fail('Incident title and owner are required');
      s.incidents.push({id:id,title:String(c.title),owner:String(c.owner),feed:c.feed||'',resource:c.resource||'',status:'open',openedAt:now,actor:actor,procedure:String(c.procedure||''),notes:String(c.notes||''),severity:c.severity==='critical'?'critical':'warning'});
      impact(s,s.incidents[s.incidents.length-1]).feeds.forEach(function(fid){item(s,'feeds',fid).revision++;});
    } else if(c.type==='ackIncident'){
      row=item(s,'incidents',c.id);if(row.status!=='open')fail('Incident is no longer open');row.status='acknowledged';row.acknowledgedAt=now;row.acknowledgedBy=actor;
    } else if(c.type==='resolveIncident'){
      row=item(s,'incidents',c.id);if(row.status==='resolved')fail('Incident already resolved');if(!String(c.resolution||'').trim())fail('Record the restoration evidence');row.status='resolved';row.resolvedAt=now;row.resolvedBy=actor;row.resolution=String(c.resolution);
      impact(s,row).feeds.forEach(function(fid){item(s,'feeds',fid).revision++;});
    } else if(c.type==='approveAsset'||c.type==='loadAsset'){
      row=item(s,'assets',c.id);if(c.type==='loadAsset'&&(!row.approval||row.approval.version!==row.version))fail('Approve this asset version first');if(c.type==='loadAsset'&&(!row.system||!row.location))fail('Specify the playout system and asset location');row[c.type==='approveAsset'?'approval':'loaded']={version:row.version,at:now,actor:actor,source:'operator-confirmed'};
    } else if(c.type==='startRecording'){
      row=item(s,'recordings',c.id);if(row.status!=='planned')fail('Recording already started');if(!row.feed||!row.destination||row.requiredMinutes<=0||row.capacityMinutes<row.requiredMinutes)fail('Specify feed, destination and sufficient recording capacity');row.status='recording';row.startedAt=now;row.startedBy=actor;
    } else if(c.type==='stopRecording'){
      row=item(s,'recordings',c.id);if(row.status!=='recording')fail('Recording is not running');if(!String(c.evidence||'').trim())fail('Record the captured asset location / evidence');row.status='complete';row.endedAt=now;row.evidence=String(c.evidence);
    } else if(c.type==='deliver'){
      row=item(s,'recordings',c.id);if(row.status!=='complete')fail('Complete the recording first');if(!row.deliveryDestination||!String(c.receiver||'').trim())fail('Delivery destination and receiving-party acknowledgment required');row.status='delivered';row.delivered={at:now,actor:actor,receiver:String(c.receiver)};
    } else if(c.type==='handover'){
      if(!String(c.to||'').trim())fail('Name the incoming operator');s.handovers.push({id:id,from:actor,to:String(c.to),at:now,revision:s.revision,notes:String(c.notes||''),snapshot:report(s,now)});
    } else if(c.type==='ackHandover'){
      row=item(s,'handovers',c.id);if(row.ack)fail('Handover already acknowledged');if(actor.toLowerCase()!==row.to.trim().toLowerCase())fail('Only the named incoming operator can acknowledge');row.ack={actor:actor,at:now,acknowledgedRevision:row.revision};
    } else if(c.type==='importPlan'){
      var plan=c.plan;if(!plan||plan.format!=='pulse-live-plan-v1')fail('Choose a Pulse live plan template');var maps={},count=0;
      TYPES.forEach(function(t){if(!Array.isArray(plan[t])||plan[t].length>500)fail('Invalid plan collection');maps[t]={};plan[t].forEach(function(r){if(!r.id||maps[t][r.id])fail('Duplicate plan ID');maps[t][r.id]=id+'_'+(++count);});});
      function remap(t,v){if(!maps[t][v])fail('Unresolved plan reference: '+v);return maps[t][v];}
      TYPES.forEach(function(t){plan[t].forEach(function(r){var n=clean(t,r);n.id=maps[t][r.id];n.revision=1;n.status='planned';
        if(t==='resources')n.dependencies=n.dependencies.map(function(v){return remap('resources',v);});
        if(t==='feeds'){n.primary=n.primary.map(function(v){return remap('resources',v);});n.backup=n.backup.map(function(v){return remap('resources',v);});n.windowStart='';n.windowEnd='';}
        if(t==='segments')['feeds','assets','recordings'].forEach(function(f){n[f]=n[f].map(function(v){return remap(f,v);});});
        if(t==='recordings'||t==='comms')n.feed=n.feed?remap('feeds',n.feed):'';s[t].push(n);
      });});
    } else if(c.type==='importReport'){
      var data=c.report;if(!data||data.format!=='pulse-device-report-v1'||!Array.isArray(data.observations)||data.observations.length>500)fail('Invalid device report');
      data.observations.forEach(function(o){reference(s,'feeds',o.feed);if(!o.feed||!o.metric||!['pass','fail','unknown'].includes(o.result)||!Number.isFinite(o.at)||o.at>now)fail('Invalid device observation');});
      s.reports.push({id:id,at:now,actor:actor,source:'imported-unverified',adapter:String(data.adapter||''),observations:clone(data.observations)});
    } else fail('Unknown operation');
    s.revision++;s.events.push({id:id,at:now,actor:actor,action:c.type,collection:c.collection||'',record:recordId,revision:s.revision,offline:!!ctx.offline});validate(s);return s;
  }
  return {empty:empty,parse:parse,clone:clone,validate:validate,apply:apply,schemas:SCHEMAS,types:TYPES,checks:CHECKS,item:item,feedIssues:feedIssues,segmentIssues:segmentIssues,shared:shared,impact:impact,report:report};
});
