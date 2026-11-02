/* Muse Live app core (state, productions, project views) — Wave B extract */
(function museRosterOnce(){
  try{
    if(localStorage.getItem('muselive_roster_v1')==='1')return;
    ['muselive_inventory_v1','muselive_travel_v1','muselive_comms_v1',
     'muselive_personnel_v1','muselive_custom_personnel_v1','muselive_operators_v1',
     'muselive_custom_operators_v1','muselive_perids_v1','muselive_portal_v1',
     'muselive_accounts_v1','muselive_edits','muselive_edits_rev'].forEach(function(k){
      try{localStorage.removeItem(k);}catch(e){}
    });
    localStorage.setItem('muselive_roster_v1','1');
  }catch(e){}
})();
(function museCatalogOnce(){
  try{
    if(localStorage.getItem('muselive_catalog_v3')==='1')return;
    ['muselive_inventory_v1','muselive_travel_v1','muselive_comms_v1',
     'muselive_personnel_v1','muselive_custom_personnel_v1','muselive_operators_v1',
     'muselive_custom_operators_v1','muselive_perids_v1','muselive_portal_v1',
     'muselive_accounts_v1','muselive_edits','muselive_edits_rev','muselive_talent_v1',
     'muselive_gear','muselive_museai_key'].forEach(function(k){
      try{localStorage.removeItem(k);}catch(e){}
    });
    localStorage.setItem('muselive_catalog_v3','1');
  }catch(e){}
})();
/* ============================================================================
   v31 PHASE 0/7 — SHARED PLATFORM INFRASTRUCTURE
   (config accessors · event bus · append-only audit log · export redaction)
   These are the client-side seams that make the Phase 7 backend migration
   cheap: every external call reads museCfg, every mutation can emit on
   museBus, every export passes museRedact, every state transition can
   append to museAudit. See ARCHITECTURE.md.
   ==========================================================================*/
/* ---- config: window.MUSE_LIVE_CONFIG (head loader) + runtime localStorage overrides.
   Precedence: user-entered runtime key (localStorage) > config.local.js > config.example.js
   > inline keyless fallback. NO key value is ever hardcoded here. ---- */
function museCfg(name){
  var c=window.MUSE_LIVE_CONFIG||{};
  var v=c[name]!=null?c[name]:'';
  return (typeof v==='string')?v.trim():v;
}
function museCfgSource(){var c=window.MUSE_LIVE_CONFIG||{};return c._source||'none';}
/* non-blocking banner — demo ship: no key nag */
function cfgBannerInit(){
  var host=document.getElementById('cfgBannerHost');if(!host)return;
  host.innerHTML='';
}
/* ---- museBus: in-page publish/subscribe. Event names are the API contract
   (personnel.updated, travel.request.*, expense.*) — the backend swaps this
   for a durable stream without renaming events. ---- */
var museBus=(function(){
  var subs={};
  return {
    on:function(evt,fn){(subs[evt]=subs[evt]||[]).push(fn);return fn;},
    off:function(evt,fn){var a=subs[evt]||[];var i=a.indexOf(fn);if(i>-1)a.splice(i,1);},
    emit:function(evt,payload){
      (subs[evt]||[]).concat(subs['*']||[]).forEach(function(fn){try{fn(payload,evt);}catch(e){}});
    }
  };
})();
/* ---- museAudit: append-only audit log of state transitions {ts,actor,evt,detail}.
   Client-side prototype of the server-side hash-chained log. Capped at 400 entries. ---- */
var _auditLog=null;
function museAuditLoad(){if(_auditLog)return _auditLog;
  try{_auditLog=JSON.parse(localStorage.getItem('muselive_audit_v1')||'[]');}catch(e){_auditLog=[];}
  if(!Array.isArray(_auditLog))_auditLog=[];return _auditLog;}
function museAudit(evt,detail){
  var log=museAuditLoad();
  log.push({ts:new Date().toISOString(),actor:(typeof permUser==='function'?permUser():'system'),evt:evt,detail:detail||{}});
  if(log.length>400)log.splice(0,log.length-400);
  try{localStorage.setItem('muselive_audit_v1',JSON.stringify(log));}catch(e){}
  museBus.emit('audit.appended',{evt:evt});
}
/* ---- museRedact: THE serialization-layer redaction choke point. Every export
   (techbook, personnel JSON/CSV, xlsx) passes data through here. Strips secrets
   regardless of UI settings — independent of exportExempt. ---- */
var REDACT_FIELDS=['portalAccessKey','apiKey','api_key','token','password','cred','accessKey'];
function museRedact(obj){
  if(obj==null)return obj;
  if(Array.isArray(obj))return obj.map(museRedact);
  if(typeof obj==='object'){
    var out={};
    for(var k in obj){if(!obj.hasOwnProperty(k))continue;
      var redact=false;for(var i=0;i<REDACT_FIELDS.length;i++){if(k.toLowerCase()===REDACT_FIELDS[i].toLowerCase()){redact=true;break;}}
      if(/api_key$/i.test(k))redact=true;
      if(redact)continue; // stripped, not masked — the field never leaves the app
      out[k]=museRedact(obj[k]);
    }
    return out;
  }
  return obj;
}
/* strings that look like keys never leave via free-text fields either */
function museRedactText(s){
  return String(s==null?'':s)
    .replace(/duffel_(test|live)_[A-Za-z0-9_-]+/g,'[redacted-key]')
    .replace(/AIza[0-9A-Za-z_-]{30,}/g,'[redacted-key]')
    .replace(/\bAQ\.[0-9A-Za-z_-]{20,}/g,'[redacted-key]');
}
/* ---- versioned state + idempotency hooks (Phase 7 seams) ---- */
var MUSE_SCHEMA_VERSION=31;
function museVer(rec){if(rec&&typeof rec==='object')rec._v=(rec._v||0)+1;return rec;}
function museIdemKey(){return 'idem-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);}

var productions={
 museaitour:{name:"Muse AI World Tour 2026",customer:"Meta AI",venue:"Meta HQ · Menlo Park Grand Finale + 13 Meta offices worldwide",vendors:[{id:"v_lenses",docs:[{name:"Camera_Rental_Agreement.pdf"},{name:"COI_2026.pdf"}]},{id:"v_clearwave",docs:[{name:"RF_Coordination_Plan.pdf"}]}],pct:82,status:"Pre-Production",date:"Jul 2026",tag:"MPK Finale · Jul 19",tagColor:"blue",risk:false,notif:"3",
  bottleneck:{label:"Critical Path Bottleneck",text:"Line-up locked · MPK campus power + Harmonic XOS line-up for Jul 19"},foot:"Sony HDC-5500 · Harmonic XOS · Calrec Apollo/DM7C",
  version:"Rev 2.0 · Jul 19 2026",editedBy:"Lila Hart",lastEdited:"",
  schedule:[
   ["Jul 12, 2026","07:00","MPK Compound Load-In · Tech Manager / EIC on site","05:00","—","Meta HQ · Hacker Square Compound"],
   ["Jul 13, 2026","08:00","Transmission Engineer · Harmonic XOS commission","06:00","—","Double Technical Cabin"],
   ["Jul 14, 2026","09:00","Network Architect · 1GB×2 MPK NetEng hand-off","07:00","—","Tech Cabin Sw1/Sw2"],
   ["Jul 16, 2026","08:00","Studio + Platform camera build (HDC-3500 + FR7)","06:30","—","Presentation Studio / Outside Announce"],
   ["Jul 17, 2026","09:00","Fiber Fiber 100–102 cert · TIA strand map","07:00","—","Tech Cabin → CIR / Prod Office"],
   ["Jul 18, 2026","10:00","Full Technical Rehearsal · RVON IFB1–6","07:30","—","FlyPack + Meta NYC TOC"],
   ["Jul 19, 2026","12:00","MUSE AI WORLD TOUR — GRAND FINALE — LIVE","08:00","Jul 19, 2026 · Final","Meta HQ · Hacker Square, Menlo Park"]],
  dept:[
   ["Audio","approved","Calrec Apollo + DM7C · RIO 3216 · Live Link · Shure Axient Digital AD4Q + AD1 + Sennheiser MD 46"],
   ["Cameras / Video","approved","7× Sony HDC-5500 + FR7 PTZ · Canon CJ45ex9.7B/22x · Studio Build-Up"],
   ["Transmission / Signal","approved","Harmonic XOS–6 MPK→NYC TOC FO · LiveU LU800/U · Harmonic XOS returns"],
   ["Power / Electrical","approved","MPK campus power primary · 3×125V 2-phase 100A Cam-Lock · APC Smart-UPS SRT 8kVA"],
   ["Engineering / CAD","approved","Evertz EQX 32×32 · Leader LT4610 · Evertz 7707 fiber Rx · TSL tally · Field Ops Flypack"],
   ["Replay / EVS","approved","EVS XS-VIA · NYC TOC ingest path"],
   ["Graphics (GFX)","approved","Chyron Prime engine ready"],
   ["Comms & IFB","approved","RTS ADAM + FreeSpeak + RTS ADAM · Clear-Com FreeSpeak II · RVON IFB1–6"],
   ["RF / Wireless Mics","approved","Shure Axient Digital AD4Q + AD1 kit + Sennheiser MD 46 · Elite IFB cord 1–6"],
   ["Talent / Production","approved","Presentation Studio + Outside Announce Platform hosts"],
   ["Legal / Rights","pending","3 music sync clearances in final review"]]},
 raybangen3:{name:"Ray-Ban Meta Gen 3 Launch",customer:"Reality Labs",venue:"Meta HQ · Classroom Stage · Menlo Park, CA",pct:100,status:"Complete",date:"Jun 2026",tag:"Meta HQ · MPK",tagColor:"blue",risk:false,notif:"",
  bottleneck:{label:"Showcase · 100% complete",text:"All departments approved · ready for air"},foot:"EVS XT-VIA · Sony HDC-5500",
  version:"Rev 2.0 · Final",editedBy:"Lila Hart",lastEdited:"",
  completeShowcase:true,
  schedule:[
   ["Jun 24, 2026","06:00","Flypack Load-In · Classroom Stage","04:30","—","Meta HQ · 1 Hacker Way, MPK"],
   ["Jun 25, 2026","07:00","LiveU LU800 test & Signal Path","05:30","—","MPK Stage → PCR 4"],
   ["Jun 25, 2026","13:00","TOC Final Signal Confirmation","—","—","PCR 4 / TOC"],
   ["Jun 26, 2026","05:30","Crew Call · In Position","05:30","—","Classroom Stage"],
   ["Jun 26, 2026","09:00","Ray-Ban Meta Gen 3 Reveal — LIVE","06:30","Jun 26, 2026 · 09:00 PT","Meta HQ · Classroom Stage"]],
  dept:[
   ["Audio","approved","16ch MADI / Calrec Apollo — mapped"],
   ["Cameras / Video","approved","Sony HDC-5500 · verified"],
   ["Transmission / Signal","approved","16× HD-SDI verified · 4× LU600 deployed"],
   ["Power / Electrical","approved","Motion Laboratories 400A distro · confirmed"],
   ["Engineering / CAD","approved","EVS XT-VIA · MPK Classroom Stage CAD filed"],
   ["Replay / EVS","approved","EVS XT-VIA · 4ch — stage compound, local storage"],
   ["Graphics (GFX)","approved","Lower-third package loaded"],
   ["Comms & IFB","approved","Remotes 1–4 · RTS IFB-325"],
   ["RF / Wireless Mics","approved","DPA 4066 + Shure Axient Digital AD4Q coordinated"],
   ["Talent / Production","approved","Keynote host confirmed · Classroom Stage"],
   ["Legal / Rights","approved","TOC final signal confirmed · rights cleared"]]},
 orion:{name:"Orion AR Glasses Reveal",customer:"Reality Labs",venue:"Levi's Stadium · Santa Clara, CA",pct:38,status:"AT RISK",date:"Feb 2027",tag:"Levi's Stadium",tagColor:"blue",risk:true,notif:"!",
  bottleneck:{label:"Immediate Follow-Up Required",text:"Venue Power Confirmation Outstanding"},foot:"Engineering Kick-Off: TBD",
  version:"Rev 0.4 · Draft",editedBy:"Lila Hart",lastEdited:"",
  schedule:[
   ["Feb 1, 2027","TBD","Engineering Kick-Off (pending)","TBD","—","Levi's Stadium · TBD"],
   ["Feb 3, 2027","TBD","Compound Build (pending power)","TBD","—","Levi's Stadium Compound"],
   ["Feb 5, 2027","TBD","Technical Rehearsal (planned)","TBD","—","PCR TBD"],
   ["Feb 8, 2027","15:00","Orion AR Glasses Reveal — LIVE","09:00","Feb 8, 2027 · 18:30 ET","Levi's Stadium"]],
  dept:[
   ["Audio","pending","64ch MADI — routing TBD"],
   ["Cameras / Video","pending","128× IP design phase"],
   ["Transmission / Signal","missing","6,000m fiber survey pending"],
   ["Power / Electrical","missing","400A distro not confirmed (escalated to VP)"],
   ["Engineering / CAD","missing","Replay nodes not reserved · CAD pending approval"],
   ["Replay / EVS","missing","Replay nodes not reserved — replay chain unassigned"],
   ["Graphics (GFX)","pending","Template build not started"],
   ["Comms & IFB","pending","24× IFB sourcing"],
   ["RF / Wireless Mics","pending","Mic spec draft awaiting approval"],
   ["Talent / Production","missing","Lead host contract not executed"],
   ["Legal / Rights","pending","Rights & insurance paperwork in progress"]]},
 museailaunch:{name:"Muse AI Launch Keynote",customer:"Meta AI",venue:"Meta NYC · Studio M1 · Hudson Yards",pct:61,status:"Active",date:"Oct 2026",tag:"Studio M1 · Meta NYC",tagColor:"blue",risk:false,notif:"",
  bottleneck:{label:"Key Dependency",text:"LiveU LU800 Serial Number Validation"},foot:"Chyron Prime · 4K UHD Output",
  version:"Rev 1.1 · Active",editedBy:"Lila Hart",lastEdited:"",
  schedule:[
   ["Oct 12, 2026","08:00","Studio M1 Set & Lighting Build","06:00","—","Meta NYC · Studio M1"],
   ["Oct 14, 2026","09:00","Camera & GFX Integration","07:00","—","Studio M1 / PCR 6"],
   ["Oct 16, 2026","10:00","Full Dress Rehearsal","08:00","—","Studio M1"],
   ["Oct 18, 2026","18:00","Muse AI Launch Keynote — LIVE","13:00","Oct 18, 2026 · 20:00 ET","Studio M1"]],
  dept:[
   ["Audio","approved","Calrec Artemis / 96ch Dante"],
   ["Cameras / Video","pending","32× HD-SDI routed · final cam check pending"],
   ["Transmission / Signal","approved","SMPTE 2110 internal plant active"],
   ["Power / Electrical","approved","House power · confirmed"],
   ["Engineering / CAD","pending","Encoder serial number validation outstanding"],
   ["Replay / EVS","pending","Replay server not yet assigned"],
   ["Graphics (GFX)","pending","Chyron Prime package in build"],
   ["Comms & IFB","approved","16× Riedel Bolero"],
   ["RF / Wireless Mics","approved","Sennheiser MD 46 + lav array"],
   ["Talent / Production","approved","4 host riders active · confirmed"],
   ["Legal / Rights","pending","Meta archive clearances in review"]]},
 whatsapp:{name:"WhatsApp Business Summit",customer:"WhatsApp",venue:"Multi-Market Remote · Nov 2026",pct:22,status:"Planning",date:"Nov 2026",tag:"Multi-Market Remote",tagColor:"blue",risk:false,notif:"",
  bottleneck:{label:"Planning Phase",text:"CAD Document Pending Upload"},foot:"Live Q&A Desk: WhatsApp Channels feed",
  version:"Rev 0.6 · Planning",editedBy:"Lila Hart",lastEdited:"",
  schedule:[
   ["Oct 28, 2026","TBD","Multi-Market Site Surveys","TBD","—","8× Markets"],
   ["Nov 1, 2026","TBD","Live Q&A Desk Infra Build","TBD","—","Meta Miami"],
   ["Nov 2, 2026","12:00","Full Network Rehearsal","09:00","—","Live Q&A Desk / PCR"],
   ["Nov 3, 2026","17:00","WhatsApp Business Summit Keynote — LIVE","12:00","Nov 3, 2026 · 18:00 ET","Multi-Market + TC"]],
  dept:[
   ["Audio","pending","Per-market audio design pending"],
   ["Cameras / Video","pending","Mixed SDI/IP spec TBD"],
   ["Transmission / Signal","pending","8× markets — fiber quoting"],
   ["Power / Electrical","pending","Power survey scheduled (8 sites)"],
   ["Engineering / CAD","missing","CAD document pending upload"],
   ["Replay / EVS","missing","Replay TBD — planning phase"],
   ["Graphics (GFX)","pending","Q&A-desk GFX not started"],
   ["Comms & IFB","pending","24× IFB — budget review"],
   ["RF / Wireless Mics","pending","Sennheiser MD 46 speccing"],
   ["Talent / Production","approved","Host confirmed · Maya Chen"],
   ["Legal / Rights","missing","Q&A desk infrastructure spec awaited"]]},
 igcreators:{name:"Instagram Creator Week",customer:"Instagram",venue:"Central Park W → Herald Sq. · NYC",pct:55,status:"Active",date:"Nov 2026",tag:"CPW → Herald Sq.",tagColor:"blue",risk:false,notif:"2",
  bottleneck:{label:"Critical Path Bottleneck",text:"All Flight Information Excel Pending Upload"},foot:"Aerial Drone: FAA Class B Waiver TBD",
  version:"Rev 1.2 · Active",editedBy:"Lila Hart",lastEdited:"",
  schedule:[
   ["Nov 24, 2026","06:00","Route Fiber Pull & Float Cam Mount","04:00","—","CPW → Herald Square"],
   ["Nov 25, 2026","07:00","Camera Build & Comms Check","05:00","—","Takeover Route"],
   ["Nov 26, 2026","05:00","Crew Call · In Position","05:00","—","Herald Square Host Stage"],
   ["Nov 27, 2026","09:00","Instagram Creator Week Street Takeover — LIVE","05:30","Nov 27, 2026 · 09:00 ET","CPW → Herald Square"]],
  dept:[
   ["Audio","approved","Dante 24ch / SoundGrid node"],
   ["Cameras / Video","pending","24× HD-SDI route confirmed · float cams pending"],
   ["Transmission / Signal","approved","5,400m fiber · 12× LU600 float-mounted"],
   ["Power / Electrical","pending","3× 200A generators — pending"],
   ["Engineering / CAD","pending","All flight information Excel pending upload"],
   ["Replay / EVS","pending","Replay requirements under review"],
   ["Graphics (GFX)","approved","Creator Week GFX package ready"],
   ["Comms & IFB","approved","18× RTS IFB-325"],
   ["RF / Wireless Mics","approved","Shure Axient Digital AD4Q + AD1 lavs"],
   ["Talent / Production","approved","Lead host confirmed · Broadway platform"],
   ["Legal / Rights","missing","NYC DCAS camera mount permits pending · FAA drone waiver TBD"]]},
 charm:{name:"Meta Charm Launch (Milan Design Week)",customer:"Reality Labs",venue:"Fiera Milano Rho · Milan, Italy",pct:100,status:"Resource Locked",date:"Feb 2026",tag:"Milan Design Week IBC",tagColor:"blue",risk:false,notif:"",
  bottleneck:{label:"Status",text:"All departments approved — fully cleared"},foot:"EVS XT-VIA · Sony HDC-5500",
  version:"Rev 2.0 · Final",editedBy:"Lila Hart",lastEdited:"",
  schedule:[
   ["Feb 4, 2026","08:00","Facilities Load-In & Rigging","06:00","—","Milan IBC · Hall A"],
   ["Feb 5, 2026","09:00","Signal Path & Fiber Commissioning","07:00","—","Milan IBC + Design Week Venues"],
   ["Feb 6, 2026","10:00","Full Technical Rehearsal","07:30","—","PCR 1 / ACR 2"],
   ["Feb 6, 2026","18:00","Meta Charm Launch Keynote — LIVE","14:00","Feb 6, 2026 · 20:00 CET","Fiera Milano Rho · Hall 1"],
   ["Feb 7–22, 2026","Varies","Daily Showcase Coverage","Per day-sheet","Daily · 09:00–23:00 CET","All Milan Design Week Venues"],
   ["Feb 22, 2026","18:00","Closing Showcase — LIVE","13:00","Feb 22, 2026 · 20:00 CET","Triennale di Milano"]],
  dept:[
   ["Audio","approved","Calrec Artemis · 128ch Dante / 5.1.4 immersive"],
   ["Cameras / Video","approved","60× Sony HDC-5500 · all positions locked"],
   ["Transmission / Signal","approved","256× SMPTE 2110 · dual-path LTN fiber + satellite backup"],
   ["Power / Electrical","approved","Motion Laboratories 400A distro distro · UPS confirmed"],
   ["Engineering / CAD","approved","EVS XT-VIA cluster provisioned · all CAD final v4"],
   ["Replay / EVS","approved","EVS XT-VIA cluster · 6ch replay provisioned · Milan IBC"],
   ["Graphics (GFX)","approved","Chyron Prime package signed off"],
   ["Comms & IFB","approved","48× RTS ADAM · RVON trunked · all programs mapped"],
   ["RF / Wireless Mics","approved","Sennheiser MKH 416 + Shure Axient Digital AD4Q + AD1 · full RF coordination cleared"],
   ["Talent / Production","approved","Full broadcast team confirmed · all riders executed"],
   ["Legal / Rights","approved","Partner rights & all music clearances fully executed"]]}
};
var order=["museaitour","raybangen3","orion","museailaunch","whatsapp","igcreators","charm"];
;
var statusMap={approved:{label:"Approved",dot:"emerald",text:"text-emerald-700",bg:"bg-emerald-50",bd:"border-emerald-200",badge:"bg-emerald-100 text-emerald-800 border-emerald-300"},
 pending:{label:"Pending",dot:"amber",text:"text-amber-600",bg:"bg-amber-50",bd:"border-amber-200",badge:"bg-amber-100 text-amber-800 border-amber-300"},
 missing:{label:"Missing",dot:"red",text:"text-red-600",bg:"bg-red-50",bd:"border-red-200",badge:"bg-red-100 text-red-800 border-red-300"}};
function deptIsVisible(p,deptName){
  try{var ui=typeof deptUIGet==='function'?deptUIGet(p):null;if(ui&&ui.hidden&&ui.hidden[deptName])return false;}catch(e){}
  return true;
}
function countStatus(p){
  var c={approved:0,pending:0,missing:0};
  (p.dept||[]).forEach(function(d){
    if(!deptIsVisible(p,d[0]))return; /* hidden tiles do not affect Requirements Cleared */
    if(c[d[1]]!=null)c[d[1]]++;else c.missing++;
  });
  return c;
}
function computePct(p){
  var vis=(p.dept||[]).filter(function(d){return deptIsVisible(p,d[0]);});
  var t=vis.length||1;
  var approved=0;
  vis.forEach(function(d){if(d[1]==='approved')approved++;});
  return Math.round(approved/t*100);
}
function applyReadiness(p){
  if(!p)return {pct:0,c:{approved:0,pending:0,missing:0}};
  var c=countStatus(p);
  var pct=computePct(p);
  p.pct=pct;
  var vis=(p.dept||[]).filter(function(d){return deptIsVisible(p,d[0]);});
  var miss=vis.filter(function(d){return d[1]==='missing';});
  var pend=vis.filter(function(d){return d[1]==='pending';});
  if(p.signoff&&p.signoff.done&&!miss.length&&!pend.length){
    p.status='Show Locked';p.risk=false;p.notif='';
    p.bottleneck={label:'Show locked',text:'Sign-off on file · every department approved'};
  }else if(miss.length){
    p.status='AT RISK';p.risk=true;p.notif='!';
    p.bottleneck={label:'Critical path',text:miss[0][0]+' — '+(miss[0][2]&&miss[0][2]!=='—'?miss[0][2]:'missing')};
  }else if(pend.length){
    p.status='In Production';p.risk=false;p.notif='';
    p.bottleneck={label:'Pending',text:pend[0][0]+' — '+(pend[0][2]&&pend[0][2]!=='—'?pend[0][2]:'awaiting approval')};
  }else{
    p.status='Complete';p.risk=false;p.notif='';
    p.bottleneck={label:'All clear',text:c.approved+' / '+vis.length+' departments approved'};
  }
  return {pct:pct,c:c};
}
function refreshProjPct(key){
  var p=productions[key];if(!p)return;
  var r=applyReadiness(p);
  var pctEl=document.getElementById('projPct-'+key);
  if(pctEl){pctEl.textContent=r.pct+'%';pctEl.className='text-4xl font-bold '+pctColor(r.pct)+' mono';}
  return r;
}
function pctColor(p){return p>=90?"text-emerald-600":p>=60?"text-yellow-600":p>=40?"text-orange-500":"text-red-500";}
function progClass(p){return p>=90?"green":p>=60?"yellow":p>=40?"orange":"red";}
function museBadgeCount(n){n=parseInt(n,10);if(!n||n<1)return 0;return n;}
function museBadgeHTML(n){
  n=museBadgeCount(n);
  if(!n)return '';
  return '<span class="muse-badge" aria-hidden="true">'+(n>9?'9+':n)+'</span>';
}
function museMountBadge(parent,n,ariaBase){
  if(!parent)return;
  n=museBadgeCount(n);
  var el=null,kids=parent.children;
  for(var i=0;i<kids.length;i++){if(kids[i].classList&&kids[i].classList.contains('muse-badge')){el=kids[i];break;}}
  if(n<=0){
    if(el&&el.parentNode)el.parentNode.removeChild(el);
    if(ariaBase)parent.setAttribute('aria-label',ariaBase);
    return;
  }
  if(!el){
    el=document.createElement('span');
    el.className='muse-badge';
    el.setAttribute('aria-hidden','true');
    parent.appendChild(el);
  }
  el.textContent=n>9?'9+':String(n);
  if(ariaBase)parent.setAttribute('aria-label',ariaBase+', '+n+' need'+(n===1?'s':'')+' attention');
}
function notifBadge(n){return museBadgeHTML(n);}
function badgeAckRead(){try{return JSON.parse(localStorage.getItem('muselive_badge_ack_v1')||'{}');}catch(e){return {};}}
function badgeAckWrite(k,n){try{var o=badgeAckRead();o[k]=n|0;localStorage.setItem('muselive_badge_ack_v1',JSON.stringify(o));}catch(e){}}
function badgeUnacked(k,n){n=museBadgeCount(n);var ack=badgeAckRead()[k]|0;return n>ack?n:0;}
// derive phase label + colors from completion
function phaseFor(p){
  var c=countStatus(p);
  if(p.custom&&c.approved===0&&c.pending===0&&c.missing===0)return{label:"New · Intake",risk:true};
  if(c.missing)return{label:"At Risk",risk:true};
  if(c.pending)return{label:"In Production",risk:false};
  if(p.signoff&&p.signoff.done)return{label:"Show Locked",risk:false};
  return{label:"Complete",risk:false};
}
var tagColorList=["amber","emerald","red","purple","blue","orange","teal","indigo","rose","cyan"];
var barGrad={amber:"#F7B928",emerald:"#1E7B34",red:"#E41E3F",purple:"#0866FF",blue:"#0866FF",orange:"#F5832A",teal:"#1E7B34",indigo:"#0866FF",rose:"#E41E3F",cyan:"#0866FF",gray:"linear-gradient(90deg,#B0B3B8,#B0B3B8)"};
var dotBg={amber:"#F7B928",emerald:"#1E7B34",red:"#E41E3F",purple:"#0866FF",blue:"#0866FF",orange:"#F5832A",teal:"#1E7B34",indigo:"#0866FF",rose:"#E41E3F",cyan:"#0866FF",gray:"#b0b3b8"};
var customerList=["Reality Labs","Meta AI","WhatsApp","Facebook","Instagram","External Productions"];
var customerStyle={
 "Reality Labs":{bg:"#e7f3ff",tx:"#0064E0",bd:"#b9d7ff"},
 "Meta AI":{bg:"#f5edff",tx:"#7A3EFE",bd:"#d9c7ff"},
 "WhatsApp":{bg:"#e6f4ea",tx:"#1E7B34",bd:"#a8dab5"},
 "Facebook":{bg:"#e7f3ff",tx:"#0866ff",bd:"#b9d7ff"},
 "Instagram":{bg:"#ffe6ef",tx:"#D1005C",bd:"#ffb3cd"},
 "External Productions":{bg:"#f7f8fa",tx:"#4b4f56",bd:"#e4e6eb"}
};
var CUST_DARK_TX={"Reality Labs":"#6CB2FF","Meta AI":"#B79CFF","WhatsApp":"#4ADE80","Facebook":"#6CB2FF","Instagram":"#FF7EB6","External Productions":"#B0B3B8"};
function custChip(c){
  var s=customerStyle[c]||customerStyle["External Productions"];
  var dark=false;try{dark=document.documentElement.classList.contains('dark');}catch(e){}
  var bg=dark?'rgba(28,30,33,.72)':s.bg;
  var tx=dark?(CUST_DARK_TX[c]||"#B0B3B8"):s.tx;
  var bd=dark?(CUST_DARK_TX[c]||"#B0B3B8"):s.bd;
  return '<span class="text-[9px] font-bold mono px-2 py-0.5 rounded-full" style="background:'+bg+';color:'+tx+';border:1px solid '+bd+'">'+(c||"Unassigned")+'</span>';
}
/* equipment / spec dropdown options per department */
/* ===== RVON ALPHA POOL — controlled vocabulary for intercom port labels ("alphas").
   Unifies the former "RVON Channels" (port quantity) + "RVON Alphas" (per-port label) into one
   model: a production stores tbFields.Audio.rvon = [alpha, alpha, ...]. Array LENGTH = channel
   count (port quantity); each ENTRY = the alpha assigned to that port ('' = unassigned port).
   Alphas are globally unique across productions — see rvonAlphaOwner() / the conflict checks. ===== */
var RVON_ALPHA_POOL=["XZ32","FB63","OK36","TG89","EB49","NY93","IM20","DJ34","II12","AT19","JA50","NC97","OR41","VX35","QO48","WK22","DG84","IF47","UL83","HE97","IF49","UF30","GH78","AE37","ZF45","RN24","HF58","UT86","GC35","GN31","GC16","JY81","RW85","HT80","SU61","TY82","GU47","MI23","HT57","LB29","TR63","NN34","EO61","GS74","UD54","XB33","TO63","EF16","FW20","EO83","AK79","RA33","JM52","FM16","GY23","WD43","CE35","JW45","HI22","AS22","NK89","YX77","IE26","BO48","EO29","XI97","HK64","TT95","PM85","SU19","AH59","CX16","KH48","FY26","UJ29","CZ15","TT73","HQ96"];
/* Full technical field set per department — every option drives the Techbook PDF.
   Each field: [key, label, [options]] */
/* the maintainable talent roster (single source): extended by customTalent
   (muselive_talent_v1, Excel-importable) and the crew roster at picker time */
var IFB_HOST_TALENT=['Dana Whitfield','Marcus Cole','Priya Shah','Elena Brooks','James Calder','Nina Park','Owen Grant','Lila Cho','Theo Barnes','Maya Singh','Chris Dalton','Harper Quinn'];
var DEFAULT_DEPT_FIELDS={"Audio":[["_h1","Mixing & Console","header"],["console","Audio Console",["Calrec Artemis","Calrec Apollo"]],["channels","Channel Count",[],"num"],["mapping","Audio Mapping",["5.1.4 immersive map","Custom crash mix L/R","Discrete 16-track","FS1 / FS2 / FS3 standard","Stereo PGM"]],["stagebox","Stage Box / Node",["Calrec Hydra2","Calrec Apollo"]],["_h2","RF / Wireless Mics","header"],["rxmodel","Microphone Receiver",["Shure Axient Digital AD4Q","Shure Axient Digital AD4Q + AD1"]],["txmodel","Microphone Transmitter",["Shure AD1"]],["micmodel","Microphone / Capsule (Lav & Handheld)",["Sennheiser MKH 416","Sennheiser MD 46","DPA 4066"]],["rffreq","RF / Radio Frequencies",[],"text"],["_h3","Comms & IFB","header"],["intercom","Intercom System",["RTS ADAM","Riedel Bolero"]],["ifb","IFB Transmitter",["RTS IFB-325"]],["ifbphone","IFB Phone Line (REM / TIFF)",["REM 1 · 212-431-1001","REM 2 · 212-431-1002","REM 3 · 212-431-1003","REM 4 · 212-431-1004","REM 5 · 212-431-1005","REM 6 · 212-431-1006","REM 7 · 212-431-1007","REM 8 · 212-431-1008","REM 9 · 212-431-1009","REM 10 · 212-431-1010","REM 11 · 212-431-1011","REM 12 · 212-431-1012","REM 13 · 212-431-1013","REM 14 · 212-431-1014","REM 15 · 212-431-1015","REM 16 · 212-431-1016","REM 17 · 212-431-1017","REM 18 · 212-431-1018","REM 19 · 212-431-1019","REM 20 · 212-431-1020","REM 21 · 212-431-1021","REM 22 · 212-431-1022","REM 23 · 212-431-1023","REM 24 · 212-431-1024","REM 25 · 212-431-1025","REM 26 · 212-431-1026","REM 27 · 212-431-1027","REM 28 · 212-431-1028","REM 29 · 212-431-1029","REM 30 · 212-431-1030","REM 31 · 212-431-1031","REM 32 · 212-431-1032","REM 33 · 212-431-1033","REM 34 · 212-431-1034","REM 35 · 212-431-1035","REM 36 · 212-431-1036","REM 37 · 212-431-1037","REM 38 · 212-431-1038","REM 39 · 212-431-1039","REM 40 · 212-431-1040","TIFF 1 · 212-431-1041","TIFF 2 · 212-431-1042","TIFF 3 · 212-431-1043","TIFF 4 · 212-431-1044","TIFF 5 · 212-431-1045","TIFF 6 · 212-431-1046","TIFF 7 · 212-431-1047","TIFF 8 · 212-431-1048","TIFF 9 · 212-431-1049","TIFF 10 · 212-431-1050","TIFF 11 · 212-431-1051","TIFF 12 · 212-431-1052","TIFF 13 · 212-431-1053","TIFF 14 · 212-431-1054","TIFF 15 · 212-431-1055","TIFF 16 · 212-431-1056","TIFF 17 · 212-431-1057","TIFF 18 · 212-431-1058","TIFF 19 · 212-431-1059","TIFF 20 · 212-431-1060","TIFF 21 · 212-431-1061","TIFF 22 · 212-431-1062"]],["rvon","RVON (Channels · Alphas)",RVON_ALPHA_POOL.slice(),"rvon"],["_h4","PA & Foldback","header"],["pa","PA System",["L-Acoustics X12"]],["foldback","Foldback / Monitors",["d&b audiotechnik M4"]],["_h5","Networking & Cable","header"],["dante","Dante Config",["44.1 kHz / 2ms","48 kHz / 0.5ms / Follower","48 kHz / 1ms / Leader clock","96 kHz / 1ms / Leader","AES67 interop mode","Dante Domain Manager managed"]],["cabletype","Cable Type",["Cat5e (Dante / AES67)","Cat6 (Dante / AES67)","Cat6a shielded (Dante)","EtherCON Cat6 (Dante)","Fiber (Dante long-haul)","3-Pin XLR (analog)","5-Pin XLR (AES/EBU)","Multi-pin audio snake","Digital coax BNC (AES3id)","MADI coax / optical"]],["cablelen","Cable Length / Quality",["10 ft (studio)","25 ft","50 ft","100 ft (touring grade)","150 ft","250 ft","Custom run"]],["_h6","Talent Audio","header"],["sportscaster","Sportscaster",["Booth A/B confirmed","Sennheiser HMD 300-XQ","Calrec Type R commentator","Commentator + analyst","Sideline RF pack","TBD"]],["_h7","Musical Performances","header"],["musicmics","Instrument / Vocal Mics",["Shure SM57","Shure Beta 52A","Sennheiser MD 46"]],["musiciem","IEM / Monitoring",["d&b audiotechnik M4","Shure PSM 1000","L-Acoustics X12"]],["backline","Backline / Stage Audio",["Radial JDI Duplex","Canare 8ch analog snake","Shure PGA Drum Kit","Countryman Type 85","Sound Devices 970"]],["_hval","Validation & Sync","header"],["hitomi","Leader LV5600",["Leader LV5600","Lip-sync validated","— none —"]],["danterf","Dante RF Channels",[],"addable"],["comtek","COMTEK / Assistive IFB",["RTS RM-325","RTS IFB-325","— none —"]]],"Cameras / Video":[["model","Camera Body",["Sony HDC-3500","Sony HDC-5500","Grass Valley LDX 86N","Sony HDC-P31"]],["count","Camera Count",[],"num"],["lens","Lens Package",["Fujinon UA107x8.4","Canon CJ45ex9.7B","Fujinon UA80x9","Canon CJ14ex4.3B"]],["config","Configuration",["Hand Held","Hard cam + handheld","Hard cam · pedestal","Jib 12 ft","Jib 30 ft","Jib 9 ft","PTZ rig","Robotic / POV","RF Steadicam","Sky cam / aerial","Spy / POV rig","Steadicam","Studio Build-Up · Vinten Vector 750","Studio Build-Up · Vinten Vector 750","Studio pedestal · Vinten Vector 750","Studio tripod"]],["signal","Signal Standard",["12G-SDI","6G-SDI","3G-SDI","HD-SDI","SMPTE 2110","NDI"]],["transport","Transport Medium",["SMPTE 311M hybrid fiber","Tactical fiber","Triax","Coax (BNC)","Single-mode fiber (TAC-12)"]],["cablelen","Run / Length Class",["150 ft","250 ft","500 ft","1000 ft","Tactical / deployable","Installed"]],["_hvf","Viewfinder / Returns / Build-Up","header"],["viewfinder","Viewfinder",["Sony HDVF-EL30","No VF (PTZ / POV)"]],["vanitymon","Vanity / Talent Monitor",["— none —","7\" on-cam","9\" talent","17\" confidence","Sony PVM-X2400","55\" talent return"]],["ccuret1","CCU Return 1",["PCR PGM 01","PCR PGM 02","Clean feed","ISO record","Match return","— none —"]],["ccuret2","CCU Return 2",["PCR PGM 01","PCR PGM 02","Clean feed","ISO record","Match return","— none —"]],["shed","Shed / CCU #",[],"text"],["buildkit","Studio Build-Up Kit",["Vinten Vector 750","No build-up (handheld/PTZ)"]],["_hprompter","Prompter","header"],["software","Autoscript WinPlus",["Autoscript WinPlus","Autoscript WinPlus","Autoscript WinPlus","CueScript CSF-17"]],["engine","Autoscript LED 17",["Autoscript LED 17"]],["controller","Controller",["CueScript CSF-17"]],["xboxip","Autoscript IP",[],"ip"],["_hhdr","Image · HDR / Color / Rate","header"],["framerate","Frame Rate",["23.98p","24p","25p","29.97p","30p","50i","59.94i","50p","59.94p","60p"]],["colorspace","Color Space / Transfer",["Rec.709 SDR","Rec.2020 HDR","HLG","PQ / ST 2084","S-Log3","V-Log","Custom LUT pipeline"]],["hdr","HDR Workflow",["SDR only","HDR PQ master + SDR sim","HLG live","Dual SDR/HDR path","Not applicable"]],["shutter","Shutter / Angle",["1/60","1/100","1/120","180°","90°","Custom"]],["whitebal","White Balance",["3200K","4300K","5600K","6500K","Preset A/B","Auto"]],["_hpos","Positions & Coverage","header"],["hardcams","Hard Camera Count",[],"num"],["handhelds","Handheld / Steadicam Count",[],"num"],["ptzcount","PTZ / Robotic Count",[],"num"],["specialcams","Specialty (Jib / Sky / RF / Spy)",[],"text"],["camplot","Camera Plot Status",["Not started","Draft","Locked · signed off","Revised after walkthrough"]],["iso","ISO / Recording Policy",["ISO all cameras","ISO hard cams only","No ISO (PGM only)","Replay ingest ISO"]]],"Transmission / Signal":[["transport","Transmission Method",["Harmonic XOS (MPK→NYC TOC)","AT&T (1G fiber)","AWS Elemental","Harmonic XOS","LiveU LU800","LiveU LU800 bonded","LTN Fiber","Fiber + satellite contribution (dual-path)","Evertz 570IP + Haivision Makito X4","Satellite Truck (C-band)","Satellite Truck (Ku-band)","Haivision Makito X4 SRT","The Switch (1G internet)"]],["format","Signal Format",["16× HD-SDI","32× HD-SDI","64× SMPTE 2110","128× SMPTE 2110","256× SMPTE 2110","Mixed SDI/IP","NDI"]],["medium","Transport Medium",["HD-SDI / 3G / 12G coax","Fiber","IP over Ethernet","Satellite RF / coax","ASI (legacy)"]],["connector","Connector / Interface",["BNC","LC fiber","SC fiber","ST fiber","RJ45 / etherCON","Neutrik OpticalCON"]],["bandwidth","Required Bandwidth",[],"text"],["liveumodel","LiveU LU800 Model #",["LiveU LU800","Harmonic XOS"]],["liveuserial","LiveU LU800 Serial #",[],"text"],["_henc","Encoders / Decoders","header"],["encoder","Encoder",["Harmonic XOS","— none —"]],["encmap","ENC / DEC Mapping",[],"text"],["_hsat","Satellite Parameters","header"],["satellite","Satellite / Transponder",["Galaxy 16 / 20C","Galaxy 19 / Tp 12","Eutelsat 113 / Tp 7","SES-1 @ 101W","Intelsat (Ku)","— none —"]],["satslot","Transponder Slot / Channel",[],"text"],["confnum","Booking / Confirmation #",[],"text"],["handoff","Hand-off Location",["Double Technical Cabin · MPK NetEng Port 1/2","Salon CITO","Meta Miami","Meta NYC TOC","TC Master Control","Telmex POP","MCM Rack","CIR · MPK","Production Office · MPK"]],["satfreq","Satellite Dish Frequency",[],"text"],["backup","Backup Path",["Dual fiber path","LiveU LU800/U","None","Satellite (SES-1 @ 101W)","Starlink B/U","LiveU LU800 B/U"]],["_hpath","Path Engineering","header"],["primarypath","Primary Contribution Path",["Harmonic XOS (MPK→NYC TOC)","LTN fiber","Dedicated dark fiber","Bonded cellular (LiveU LU800/TVU)","Ku satellite","C-band satellite","SRT over public IP","The Switch / managed Ethernet","Internal plant only"]],["latency","End-to-End Latency Budget",["<200 ms (IP local)","200–500 ms","0.5–1.5 s bonded","1.5–3 s satellite","Variable / best effort"]],["redundancy","Path Diversity",["A/B diverse fiber","Fiber + cellular B/U","Fiber + sat B/U","Single path","Triple path"]],["failover","Failover Method",["Manual switcher","Automatic hitless","Encoder auto-failover","TOC operator","Not configured"]],["returnpath","Return / Confidence",["PGM return fiber","PGM return bonded","IFB only","None"]],["toc","TOC / Master Control Hand-off",["Confirmed","Pending test","Not scheduled"]],["bitrate","Encode Bitrate / Profile",[],"text"],["nmos","NMOS / ST 2110 Control",["Not applicable (SDI)","IS-04 registered","IS-04 + IS-05 connected","Manual SDP only","Pending"]]],"Engineering":[["router","Router / Infrastructure",["Harmonic XOS","Evertz 7707 fiber Rx","Evertz EQX 32×32","Evertz MAGNUM"]],["sync","Sync / Reference",["Leader LT4610","Leader LT4610","Leader LV5600","PTP / SMPTE 2059","Leader LV5600","Tri-level + LTC","TSL tally interface"]],["cable","Connectivity / Cable",["Cat6 (control VLAN)","Cat6a shielded","Single-mode fiber LC","Multi-mode fiber SC","12G-SDI coax","ST fiber (TAC-12)","Neutrik OpticalCON"]],["_ht","Tally","header"],["remoteprod","Remote Production",["Remote Prod 1","Remote Prod 2"]],["tallysys","Tally System",["TSL TallyMan"]],["dataprobe","Data Probe",["Data Probe 1","Data Probe 2","Data Probe 3"]],["probeqty","Data Probe Qty",[],"num"],["probeip","Data Probe IP",[],"ip"],["_hv","VLAN IP Tracking","header"],["vlan_rts","VLAN IP — RTS",[],"ip"],["vlan_router","VLAN IP — Router",[],"ip"],["vlan_dante","VLAN IP — DANTE",[],"ip"],["vlan_light","VLAN IP — Lighting Console",[],"ip"],["vlan_net","VLAN IP — Internet",[],"ip"],["_hplant","Plant · Sync · Master Control","header"],["genlock","Genlock / Reference",["House black + burst","Tri-level","PTP grandmaster locked","Free-run (not for air)","External GPS-locked"]],["ptpdomain","PTP Domain #",[],"num"],["multiview","Multiviewer Layout",["Quad","8-up","16-up","Custom mosaic","Ultriscape / MVP"]],["routersize","Router Crosspoints",["32×32","64×64","128×128","256×256","IP fabric (virtual)"]],["ccupos","CCU / Base Station Location",["Truck bay","IBC tech core","Venue MDF","Remote / cloud","Mixed"]],["walkie","Radio / Walkie System",["UHF analog","Digital DMR","NXDN","Trunked","Venue-provided"]]],"Lighting":[["fixture","Primary Fixtures",["ARRI SkyPanel S60-C","ETC Source Four LED Series 3"]],["fixturetype","Fixture Types (structured)",["Fresnel","Softbox / LED panel","Leko / ellipsoidal spot","Moving head / automated fixture","Practical","Ring light","Kicker / rim light"]],["colortemp","Color Temperature",["3200K — Tungsten","5600K — Daylight","4300K — Mixed / neutral","2700K — Warm practical","6500K — Overcast daylight","Bi-color (2700K–6500K adjustable)"]],["console","Lighting Console",["MA Lighting grandMA3"]],["cabletype","Cable Type",["5-pin DMX","3-pin DMX","Cat5e EtherCON (sACN / Art-Net)","Cat6 EtherCON (sACN / Art-Net)","Socapex 19-pin (power)","TRUE1 power","Cam-Lock feeder","Edison stinger"]],["cablelen","Cable Length",["25 ft","50 ft","100 ft","250 ft","Custom run"]],["power","Power / Wattage per fixture",[],"text"]],"Power / Electrical":[["source","Power Source",["Campus Power (A/B utility feeds)","Dual Generator (A/B)","Generator (on standby)","House Power","House Power + Generator","Shore Power"]],["distro","Distribution",["Motion Laboratories 400A distro"]],["generator","Backup Generator",["MQ Power DCA-70SS"]],["ups","UPS / Battery",["APC Smart-UPS SRT 8kVA"]],["redundancy","Redundant Solution",["A/B power with ATS","Generator + UPS bridge","Shore + generator failover","Dual utility feed","None"]],["_hload","Load · Safety · Bonding","header"],["loadkw","Estimated Load (kW)",[],"num"],["phases","Service Phases",["Single-phase","3-phase 208V","3-phase 480V","Mixed"]],["bonding","Grounding / Bonding",["Verified","Pending electrician","Issue logged","N/A"]],["tiein","Venue Tie-in Status",["Confirmed","Pending","Rejected — using gen"]],["ats","ATS / Transfer Switch",["Installed & tested","Installed untested","None"]],["safety","Electrical Safety Lead",[],"text"]],"Replay / EVS":[["status","Replay Status",["Provisioned · online","Channels mapped","Standby · awaiting config","Not assigned","Fault — see notes"]],["server","Server Platform",["EVS XT-VIA"]],["channels","Record / Play Channels",["4ch · 3R/1P","6ch · 4R/2P","8ch · 6R/2P","12ch · 8R/4P","16ch · 12R/4P","24ch cluster"]],["storage","Shared Storage",["Local only","XFile3 archive","XStore SAN","IP · ST 2110 fabric","Cloud proxy · C-Next"]],["_hop","Replay Operations","header"],["opsmode","Ops Mode",["Live sports multi-iso","News / package","Entertainment live","Training / dry run"]],["operators","Replay Operators",[],"num"],["pgmfeed","PGM Feed Source",["Router dest","Direct camera","Clean feed","External"]],["clipnaming","Clip Naming Convention",[],"text"],["archive","Archive Policy",["Match + hold 48h","Full event XFile3","Highlight only","Client handoff"]],["slo","Slo-Mo Profiles",["100% / 50% / 25%","Variable","Super-mo cameras only","Not used"]],["netstatus","ST 2110 / PTP Status",["Locked","Degraded","N/A (SDI)","Unknown"]]],"CAD":[["status","CAD Status",["CAD final · signed off","CAD pending approval","CAD pending upload","CAD v3 · in review"]],["version","Drawing Set Version",[],"text"],["filetype","File Type",["AutoCAD DWG","PDF set","SketchUp","Vectorworks"]],["siteplan","Site Plan",["Filed","In review","Pending survey"]]],"Monitors":[["size","Monitor Size",["17\"","27\"","40\"","43\"","55\"","65\""]],["mount","Mount",["Floor stand","RACK mount","Stand","Table top"]],["feed","Feed",["MATCH","Multiviewer","MVP","PCR Return","Routable"]],["_hmv","Confidence · Multiview","header"],["count","Monitor Count",[],"num"],["hdrcap","HDR Capable",["Yes","No","Mixed"]],["calibration","Calibration",["Factory","ISF / calibrated","Not calibrated"]],["confidence","Confidence / PGM Position",["TD desk","Producer","A1","Talent return","Truck wall"]]],"Graphics (GFX)":[["system","Graphics System",["Chyron Prime"]],["status","Package Status",["In build","Not started","Signed off"]],["_hopg","Graphics Ops","header"],["operator","GFX Operator Count",[],"num"],["templates","Template Set",["Show package locked","In review","Legacy templates","TBD"]],["scorebug","Scorebug / Bug",["Live data feed","Manual","None"]],["ar","AR / Virtual",["None","Chyron Prime","Custom AR","LED wall integration"]],["brand","Brand / Legal Bugs",["Cleared","Pending legal","N/A"]]],"Talent / Production":[["talent","Talent Status",["Anchor confirmed","Contract not executed","Full broadcast team confirmed","Host riders executed","Sportscasters confirmed","Talent TBD"]],["position","Production Position",["Anchor desk","Booth A/B","Broadway platform","Dockside","Field / sideline","Sky cam position","Studio"]],["_hh","Meta Hosts","header"],["host_role","Host Role",["Co-Host","Product Commentator","Main Host","Keynote Presenter","Floor Reporter","Product Analyst","Event Commentator"]],["host_name","Host Name",IFB_HOST_TALENT.slice()]],"Miscellaneous / Consumables":[["expendables","Expendables / Consumables",["Duracell Procell AA","Panduit PLT2S-C","ProTapes Pro Gaff","PEC-12 emulsion cleaner","PEC-PAD lint-free wipe","Giottos rocket blower","Husky clear polyethylene sheeting","Petrol rain cover","Dymo Rhino 6000","Wiha insulated driver set","Yellow Jacket cable ramp","HellermannTyton T50R"]],["qty","Quantity",[],"num"],["notes","Notes",[],"text"]],"Networking / IT":[["_hcirc","Circuits & Bandwidth","header"],["circuit","Primary Circuit",["1 GB Fiber","500 Mbps Fiber","1 GB Microwave","10 GB Fiber","100 Mbps internet","Bonded cellular","Starlink"]],["circuit2","Secondary Circuit",["1 GB Fiber","500 Mbps Fiber","1 GB Microwave","Bonded cellular","Starlink","— none —"]],["provider","Provider / Carrier",["Telmex","AT&T","Lumen","MCM","The Switch","Verizon","Starlink"]],["handoffloc","Hand-off Location",["Salon CITO","Telmex Rack","MCM Rack","TC Demarc","Venue MPOE"]],["_hsw","Switching & SD-WAN","header"],["switch","Core Switch",["Cisco Catalyst 9300"]],["sdwan","SD-WAN / Edge",["Cisco Meraki MX250","— none —"]],["datadrops","Data Drops (Cat5E/6 ports)",[],"addable"],["_hip","IP / VLAN","header"],["wanip","WAN IP / Gateway",[],"ip"],["mgmtvlan","Management VLAN IP",[],"ip"],["wifi","Wi-Fi / WAP",["Cisco Catalyst 9130AX","— none —"]],["_hsec","Security · QoS · Remote","header"],["qos","QoS / DSCP for Media",["Configured","Partial","Not configured"]],["firewall","Firewall / ACL",["Hardened","Default","Open for load-in"]],["remoteaccess","Remote Engineering Access",["VPN only","Jump host","None","Vendor remote"]],["bandwidthtest","Bandwidth Test Status",["Passed","Failed","Not run"]],["dnsntp","DNS / NTP Sources",[],"text"]],"Legal / Rights":[["rights","Rights Status",["Fully executed","In progress","In review","Pending"]],["clearances","Clearances",["All music cleared","Archive in review","FAA drone waiver","Permits pending (DCAS/FAA)","Rights & insurance in progress"]],["_hcomp","Compliance · Insurance · Talent","header"],["coi","Vendor COI Status",["All current","1+ expiring ≤30d","1+ expired","Not tracked"]],["union","Union / Labor Notices",["Filed","Pending","N/A"]],["talentrel","Talent Releases",["Complete","Partial","Outstanding"]],["music","Music / ASCAP-BMI",["Cleared","Cue sheet pending","Live band TBD"]],["privacy","Privacy / GDPR / Likeness",["Reviewed","N/A","Issues open"]]]};
// deep clone so edits via the gear manager don't mutate the defaults
var deptFields=JSON.parse(JSON.stringify(DEFAULT_DEPT_FIELDS));

/* ============================================================================
   EQUIPMENT INVENTORY  (PRD §5)
   Structured, barcode-driven inventory database modeled on enterprise rental
   systems (CHEQROOM / Flex). Each item carries a barcode + serial, a status
   lifecycle (available → checked-out → in-maintenance / missing), a home
   location, and (when out) the project + person it's assigned to.
   Workflow: Scan barcode → Add to Inventory → Check out to Project → PackList.
   ============================================================================ */
var INV_CATEGORIES=["Cameras","Lenses","Audio","RF & Comms","Lighting","Transmission","IT / Network","Replay & Servers","Cable & Distribution","Power","Grip & Rigging","Cases & Carts"];
var INV_STATUSES={
  "available":{label:"Available",cls:"bg-emerald-50 text-emerald-700 border-emerald-200",dot:"#1E7B34"},
  "checked-out":{label:"Checked Out",cls:"bg-blue-50 text-blue-700 border-blue-200",dot:"#0866ff"},
  "maintenance":{label:"In Maintenance",cls:"bg-amber-50 text-amber-700 border-amber-200",dot:"#f5832a"},
  "missing":{label:"Missing",cls:"bg-red-50 text-red-700 border-red-200",dot:"#e41e3f"}
};
var INV_LOCATIONS=["Meta Live Events — Menlo Park MPK","Meta Miami","Meta NYC — NYC","Meta Business — Austin","West Coast — Burbank","In Transit"];
var _invSeq=1;
function newInvId(){return 'inv'+(Date.now().toString(36))+(_invSeq++);}
// barcode generator: MUSE-<cat prefix>-<6 digits>
function genBarcode(cat){var pre=(cat||'GEN').replace(/[^A-Za-z]/g,'').slice(0,3).toUpperCase();var n=Math.floor(100000+Math.random()*899999);return 'MUSE-'+pre+'-'+n;}
var inventory=[
 {id:'inv_0001',barcode:"MUSE-EQ-341506",name:"Sony HDC-5500",category:'Cameras',serial:"",status:'checked-out',location:'In Transit',project:'museaitour',assignedTo:'Avery Nolan',value:78000,condition:'Excellent',notes:'4K/HDR system camera · Muse AI World Tour hard cam 1'},
 {id:'inv_0002',barcode:"MUSE-EQ-206907",name:"Sony HDC-5500",category:'Cameras',serial:"",status:'checked-out',location:'In Transit',project:'museaitour',assignedTo:'Jordan Lane',value:78000,condition:'Excellent',notes:'Hard cam 2'},
 {id:'inv_0003',barcode:"MUSE-EQ-271113",name:"Sony HDC-5500",category:'Cameras',serial:"",status:'available',location:'Meta Live Events — Menlo Park MPK',project:'',assignedTo:'',value:62000,condition:'Good',notes:'System camera'},
 {id:'inv_0004',barcode:"MUSE-EQ-338198",name:"Fujinon UA80x9",category:'Lenses',serial:"",status:'checked-out',location:'In Transit',project:'museaitour',assignedTo:'Avery Nolan',value:215000,condition:'Excellent',notes:'90x box lens · long camera position'},
 {id:'inv_0005',barcode:"MUSE-EQ-932447",name:"Fujinon UA80x9",category:'Lenses',serial:"",status:'available',location:'Meta Live Events — Menlo Park MPK',project:'',assignedTo:'',value:198000,condition:'Good',notes:'107x box lens'},
 {id:'inv_0006',barcode:"MUSE-EQ-497365",name:"Calrec Artemis",category:'Audio',serial:"",status:'available',location:'Meta Live Events — Menlo Park MPK',project:'',assignedTo:'',value:340000,condition:'Excellent',notes:'96ch Dante console'},
 {id:'inv_0007',barcode:"MUSE-EQ-633334",name:"Shure Axient Digital AD4Q + AD1",category:'RF & Comms',serial:"",status:'checked-out',location:'In Transit',project:'museaitour',assignedTo:'Jordan Reyes',value:4200,condition:'Good',notes:'Quad digital receiver'},
 {id:'inv_0008',barcode:"MUSE-EQ-725025",name:"RTS ADAM",category:'RF & Comms',serial:"",status:'available',location:'Meta Miami',project:'',assignedTo:'',value:28000,condition:'Excellent',notes:'48ch trunked'},
 {id:'inv_0009',barcode:"MUSE-EQ-248969",name:"LiveU LU800",category:'Transmission',serial:"",status:'checked-out',location:'In Transit',project:'raybangen3',assignedTo:'MPK Classroom Stage A',value:24000,condition:'Excellent',notes:'5-band bonded cellular'},
 {id:'inv_0010',barcode:"MUSE-EQ-255338",name:"LiveU LU800",category:'Transmission',serial:"",status:'maintenance',location:'Meta Live Events — Menlo Park MPK',project:'',assignedTo:'',value:18000,condition:'Needs repair',notes:'Modem 3 intermittent — bench repair'},
 {id:'inv_0011',barcode:"MUSE-EQ-244274",name:"EVS XT-VIA",category:'Replay & Servers',serial:"",status:'checked-out',location:'In Transit',project:'charm',assignedTo:'Shay Donovan',value:165000,condition:'Excellent',notes:'6-channel replay server · Milan IBC'},
 {id:'inv_0012',barcode:"MUSE-EQ-589622",name:"Cisco Catalyst 9300",category:'IT / Network',serial:"",status:'available',location:'Meta Live Events — Menlo Park MPK',project:'',assignedTo:'',value:42000,condition:'Excellent',notes:'100G spine switch · SMPTE 2110'},
 {id:'inv_0013',barcode:"MUSE-EQ-427865",name:"ARRI SkyPanel S60-C",category:'Lighting',serial:"",status:'available',location:'West Coast — Burbank',project:'',assignedTo:'',value:6500,condition:'Good',notes:'LED soft panel'},
 {id:'inv_0014',barcode:"MUSE-EQ-297027",name:"SMPTE 311M hybrid fiber",category:'Cable & Distribution',serial:"",status:'checked-out',location:'In Transit',project:'museaitour',assignedTo:'Riley Stanton',value:3800,condition:'Good',notes:'Hybrid camera fiber'},
 {id:'inv_0015',barcode:"MUSE-EQ-284187",name:"Kohler 100REOZJF",category:'Power',serial:"",status:'available',location:'Meta Miami',project:'',assignedTo:'',value:5200,condition:'Good',notes:'7kVA inverter generator'},
 {id:'inv_0016',barcode:"MUSE-EQ-644227",name:"Pelican 1650",category:'Cases & Carts',serial:"",status:'available',location:'Meta Live Events — Menlo Park MPK',project:'',assignedTo:'',value:450,condition:'Good',notes:'Watertight transit case'}
];
function saveInventory(){try{localStorage.setItem('muselive_inventory_v1',JSON.stringify(inventory));}catch(e){}}
function loadInventory(){try{var r=localStorage.getItem('muselive_inventory_v1');if(r){var l=JSON.parse(r);if(Array.isArray(l)&&l.length)inventory=l;}}catch(e){}}
var _invLoaded=false;function loadInvOnce(){if(_invLoaded)return;_invLoaded=true;loadInventory();}
function invById(id){for(var i=0;i<inventory.length;i++)if(inventory[i].id===id)return inventory[i];return null;}
function invByBarcode(code){code=(code||'').trim().toUpperCase();for(var i=0;i<inventory.length;i++)if((inventory[i].barcode||'').toUpperCase()===code)return inventory[i];return null;}
function invStatusCount(st){loadInvOnce();return inventory.filter(function(it){return it.status===st;}).length;}
function invValueTotal(){loadInvOnce();return inventory.reduce(function(a,it){return a+(it.value||0);},0);}

/* ---- inventory view state ---- */
var invFilter={cat:'all',status:'all',q:''};
function setInvFilter(field,val){invFilter[field]=(invFilter[field]===val&&field!=='q')?'all':val;renderEquipView();}
function setInvSearch(v){invFilter.q=v;renderEquipView();}

/* ---- CRUD ---- */
function invAddNew(){loadInvOnce();var cat=INV_CATEGORIES[0];
  var item={id:newInvId(),barcode:genBarcode(cat),name:'New Equipment Item',category:cat,serial:'',status:'available',location:INV_LOCATIONS[0],project:'',assignedTo:'',value:0,condition:'Good',notes:''};
  inventory.unshift(item);saveInventory();renderEquipView();openInvDetail(item.id);}
function invDelete(id){var it=invById(id);if(!it)return;if(!confirm('Delete "'+it.name+'" ('+it.barcode+') from inventory? This cannot be undone.'))return;
  var i=inventory.map(function(x){return x.id;}).indexOf(id);if(i>-1)inventory.splice(i,1);saveInventory();closeInvDetail();renderEquipView();toast('Item deleted from inventory');}
function invSetField(id,field,val){var it=invById(id);if(!it)return;
  if(field==='value'){var n=parseFloat((''+val).replace(/[^0-9.]/g,''));it.value=isNaN(n)?0:n;}
  else it[field]=val;
  if(field==='serial'||field==='name'||field==='category'){
    var isLu=/liveu|tvu/i.test((it.name||'')+' '+(it.category||''));
    if(isLu&&!(it.serial||'').trim()){/* keep empty but surface on next open */}
  }
  saveInventory();
  if(field==='status'||field==='category'||field==='name'||field==='serial')renderEquipView();}
function invNeedsSerial(it){if(!it)return false;return /liveu|tvu/i.test((it.name||'')+' '+(it.category||'')+' '+(it.notes||''));}

/* ---- check-in / check-out (the enterprise flow) ---- */
function invCheckout(id,projKey,who){var it=invById(id);if(!it)return;
  it.status='checked-out';it.project=projKey||'';it.assignedTo=who||'';it.location='In Transit';
  // push onto the project's inventory-sourced pack items so it flows to the PackList
  if(projKey&&productions[projKey]){var p=productions[projKey];if(!p.invItems)p.invItems=[];
    if(p.invItems.map(function(x){return x.invId;}).indexOf(it.id)<0){
      p.invItems.push({invId:it.id,barcode:it.barcode,name:it.name,category:it.category,serial:it.serial});
      stampEdit(projKey);}}
  saveInventory();renderEquipView();
  toast(it.name+' checked out'+(projKey&&productions[projKey]?' to '+productions[projKey].name:''));}
function invCheckin(id){var it=invById(id);if(!it)return;var prevProj=it.project;
  // remove from the previous project's pack items
  if(prevProj&&productions[prevProj]&&productions[prevProj].invItems){
    productions[prevProj].invItems=productions[prevProj].invItems.filter(function(x){return x.invId!==it.id;});stampEdit(prevProj);}
  it.status='available';it.project='';it.assignedTo='';it.location=(it.location==='In Transit'?INV_LOCATIONS[0]:it.location);
  saveInventory();renderEquipView();toast(it.name+' checked in — now available');}
function invSetMaintenance(id){var it=invById(id);if(!it)return;
  if(it.project&&productions[it.project]&&productions[it.project].invItems){productions[it.project].invItems=productions[it.project].invItems.filter(function(x){return x.invId!==it.id;});stampEdit(it.project);}
  it.status='maintenance';it.project='';it.assignedTo='';saveInventory();renderEquipView();toast(it.name+' flagged for maintenance');}

/* ---- main Equipment view render ---- */
function renderEquipView(){loadInvOnce();
  var host=document.getElementById('equipBody');if(!host)return;
  // role scoping: restricted roles only see gear assigned to them (Work Item 1)
  var scoped=(typeof permInventory==='function')?permInventory():inventory;
  var ownOnly=(typeof permScope==='function'&&permScope('equipment')==='own');
  function scCount(st){return scoped.filter(function(it){return it.status===st;}).length;}
  // stat band
  var band=document.getElementById('equipStatBand');
  if(band){function tile(lbl,val,tone){return '<div class="rounded-xl border p-3 text-center '+tone+'"><div class="text-xl font-bold leading-none">'+val+'</div><div class="text-[8px] font-bold uppercase tracking-wider mt-1 opacity-70">'+lbl+'</div></div>';}
    band.innerHTML=tile(ownOnly?'My Assets':'Total Assets',scoped.length,'bg-white border-gray-200 text-gray-800')+
      tile('Available',scCount('available'),'bg-emerald-50 border-emerald-200 text-emerald-700')+
      tile('Checked Out',scCount('checked-out'),'bg-blue-50 border-blue-200 text-blue-700')+
      tile('Maintenance',scCount('maintenance'),'bg-amber-50 border-amber-200 text-amber-700')+
      tile('Asset Value','$'+(scoped.reduce(function(a,it){return a+(it.value||0);},0)/1000000).toFixed(2)+'M','bg-white border-gray-200 text-gray-800');}
  // category chips
  var chipHost=document.getElementById('equipCatChips');
  if(chipHost){var cats=['all'].concat(INV_CATEGORIES);
    chipHost.innerHTML=cats.map(function(c){var on=(invFilter.cat===c);var n=c==='all'?scoped.length:scoped.filter(function(it){return it.category===c;}).length;
      if(c!=='all'&&!n)return '';
      return '<button onclick="setInvFilter(\'cat\',\''+c+'\')" class="text-[10px] font-semibold px-2.5 py-1 rounded-full border '+(on?'bg-gray-900 text-white border-gray-900':'bg-white text-gray-600 border-gray-200 hover:border-gray-400')+'">'+(c==='all'?'All':esc(c))+' <span class="opacity-60">'+n+'</span></button>';
    }).join('');}
  // status filter buttons
  ['all','available','checked-out','maintenance','missing'].forEach(function(st){var b=document.getElementById('isf_'+st);if(!b)return;
    var on=(invFilter.status===st);b.className='text-[10px] font-bold px-2.5 py-1 rounded-md '+(on?'bg-white shadow-sm text-gray-900':'text-gray-500 hover:text-gray-700');});
  // filtered list
  var q=(invFilter.q||'').toLowerCase();
  var list=scoped.filter(function(it){
    if(invFilter.cat!=='all'&&it.category!==invFilter.cat)return false;
    if(invFilter.status!=='all'&&it.status!==invFilter.status)return false;
    if(q){var hay=(it.name+' '+it.barcode+' '+it.serial+' '+it.category+' '+(it.assignedTo||'')+' '+(it.location||'')+' '+(it.project&&productions[it.project]?productions[it.project].name:'')).toLowerCase();if(hay.indexOf(q)<0)return false;}
    return true;});
  if(!list.length){host.innerHTML='<div class="text-center py-12 text-[12px] text-gray-400">No equipment matches. <button onclick="setInvFilter(\'cat\',\'all\');setInvFilter(\'status\',\'all\');setInvSearch(\'\')" class="text-blue-700 font-bold hover:underline">Clear filters</button></div>';return;}
  host.innerHTML='<div class="overflow-x-auto"><table class="w-full text-left text-xs" style="min-width:920px"><thead><tr class="text-gray-500 uppercase tracking-wider text-[9px] border-b border-gray-200"><th class="pb-2 pr-3">Item</th><th class="pb-2 pr-3">Barcode</th><th class="pb-2 pr-3">Serial</th><th class="pb-2 pr-3">Category</th><th class="pb-2 pr-3">Status</th><th class="pb-2 pr-3">Location / Assignment</th><th class="pb-2"></th></tr></thead><tbody class="divide-y divide-gray-100">'+
    list.map(function(it){var s=INV_STATUSES[it.status]||INV_STATUSES.available;
      var assignTxt=it.status==='checked-out'?((it.project&&productions[it.project]?productions[it.project].name:'—')+(it.assignedTo?' · '+esc(it.assignedTo):'')):esc(it.location||'—');
      return '<tr class="hover:bg-gray-50/60 align-middle">'+
        '<td class="py-2.5 pr-3"><button onclick="openInvDetail(\''+it.id+'\')" class="font-semibold text-gray-900 hover:text-blue-700 hover:underline text-left">'+esc(it.name)+'</button></td>'+
        '<td class="py-2.5 pr-3 mono text-[11px] text-gray-600 tabular-nums whitespace-nowrap">'+esc(it.barcode)+'</td>'+
        '<td class="py-2.5 pr-3 mono text-[11px] tabular-nums whitespace-nowrap '+(invNeedsSerial(it)&&!(it.serial||'').trim()?'text-red-600 font-bold':'text-gray-500')+'">'+(invNeedsSerial(it)&&!(it.serial||'').trim()?'⚠ Serial required':esc(it.serial||'—'))+'</td>'+
        '<td class="py-2.5 pr-3 text-[11px] text-gray-600">'+esc(it.category)+'</td>'+
        '<td class="py-2.5 pr-3"><span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap '+s.cls+'" style="letter-spacing:.01em"><span class="w-1.5 h-1.5 rounded-full flex-shrink-0" style="background:'+s.dot+'"></span>'+s.label+'</span></td>'+
        '<td class="py-2.5 pr-3 text-[11px] text-gray-600">'+assignTxt+'</td>'+
        '<td class="py-2.5 text-right whitespace-nowrap">'+
          (it.status==='available'?'<button onclick="openCheckout(\''+it.id+'\')" class="text-[10px] font-bold text-blue-700 hover:underline">Check Out →</button>':
           it.status==='checked-out'?'<button onclick="invCheckin(\''+it.id+'\')" class="text-[10px] font-bold text-emerald-700 hover:underline">Check In ↩</button>':
           it.status==='maintenance'?'<button onclick="invCheckin(\''+it.id+'\')" class="text-[10px] font-bold text-emerald-700 hover:underline">Mark Ready</button>':'<span class="text-[10px] text-gray-400">—</span>')+
        '</td></tr>';
    }).join('')+'</tbody></table></div>';
}

/* ---- barcode scan workflow: Scan → Inventory → Project → PackList ---- */
function openScan(){var ov=document.getElementById('scanOverlay');if(!ov)return;
  var inp=document.getElementById('scanInput');if(inp)inp.value='';
  var res=document.getElementById('scanResult');if(res)res.innerHTML='';
  ov.style.display='flex';setTimeout(function(){if(inp)inp.focus();},60);}
function closeScan(){var ov=document.getElementById('scanOverlay');if(ov)ov.style.display='none';}
function scanSimulate(){ // demo: pick a random known barcode to mimic a hardware scan
  var inp=document.getElementById('scanInput');if(!inp)return;
  var pick=inventory[Math.floor(Math.random()*inventory.length)];inp.value=pick.barcode;scanLookup();}
function scanLookup(){var inp=document.getElementById('scanInput');var res=document.getElementById('scanResult');if(!inp||!res)return;
  var code=(inp.value||'').trim();if(!code){res.innerHTML='<p class="text-[11px] text-gray-400 text-center py-3">Enter or scan a barcode.</p>';return;}
  var it=invByBarcode(code);
  if(!it){
    res.innerHTML='<div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center"><p class="text-[12px] font-bold text-amber-800 mb-1">Unknown barcode</p>'+
      '<p class="text-[10px] text-amber-700 mb-2 mono">'+esc(code)+' is not in inventory.</p>'+
      '<button onclick="scanAddNew('+JSON.stringify(code).replace(/"/g,'&quot;')+')" class="text-[11px] font-bold text-white bg-amber-600 rounded-lg px-3 py-1.5 hover:bg-amber-700">+ Add to Inventory</button></div>';
    return;}
  var s=INV_STATUSES[it.status]||INV_STATUSES.available;
  res.innerHTML='<div class="bg-white border border-gray-200 rounded-xl p-3">'+
    '<div class="flex items-center justify-between gap-2 mb-2"><div class="min-w-0"><p class="text-[13px] font-bold text-gray-900 truncate">'+esc(it.name)+'</p><p class="text-[10px] mono text-gray-500">'+esc(it.barcode)+' · SN '+esc(it.serial||'—')+'</p></div>'+
      '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] mono flex-shrink-0 '+s.cls+'"><span class="w-1.5 h-1.5 rounded-full" style="background:'+s.dot+'"></span>'+s.label+'</span></div>'+
    '<div class="text-[10px] text-gray-600 mb-3">'+esc(it.category)+' · '+esc(it.condition||'')+(it.status==='checked-out'&&it.project&&productions[it.project]?' · on '+esc(productions[it.project].name):'')+'</div>'+
    (it.status==='available'?
      '<div><label class="text-[9px] font-bold uppercase tracking-wider text-gray-500 block mb-1">Check out to project</label>'+
        '<div class="flex items-center gap-2"><select id="scanProj" class="flex-1 text-[11px] border border-gray-300 rounded-lg px-2 py-1.5" style="outline:none">'+order.map(function(k){return '<option value="'+k+'">'+esc(productions[k].name)+'</option>';}).join('')+'</select>'+
        '<button onclick="scanCheckout(\''+it.id+'\')" class="text-[11px] font-bold text-white bg-blue-600 rounded-lg px-3 py-1.5 hover:bg-blue-700 whitespace-nowrap">Check Out →</button></div>'+
        '<p class="text-[9px] text-gray-400 mt-1.5">Adds to the project and its PackList automatically.</p></div>':
      it.status==='checked-out'?
        '<button onclick="invCheckin(\''+it.id+'\');scanLookup()" class="w-full text-[11px] font-bold text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg py-2 hover:bg-emerald-100">Check In ↩ (return to available)</button>':
        '<button onclick="openInvDetail(\''+it.id+'\');closeScan()" class="w-full text-[11px] font-bold text-gray-700 border border-gray-200 rounded-lg py-2 hover:bg-gray-50">View item details →</button>')+
  '</div>';}
function scanAddNew(code){loadInvOnce();var cat=INV_CATEGORIES[0];
  var item={id:newInvId(),barcode:code,name:'New Scanned Item',category:cat,serial:'',status:'available',location:INV_LOCATIONS[0],project:'',assignedTo:'',value:0,condition:'Good',notes:'Added via barcode scan'};
  inventory.unshift(item);saveInventory();renderEquipView();closeScan();openInvDetail(item.id);toast('Added to inventory — complete the details');}
function scanCheckout(id){var sel=document.getElementById('scanProj');var projKey=sel?sel.value:order[0];
  invCheckout(id,projKey,'');closeScan();
  // jump to that project's packlist so the user sees the result
  if(productions[projKey]){projSubTab[projKey]='packlist';switchView(projKey);}}

/* ---- inventory detail / edit modal ---- */
function openInvDetail(id){var it=invById(id);if(!it)return;
  if(typeof permScope==='function'&&permScope('equipment')==='own'&&(it.assignedTo||'')!==permUser()){toast('🔒 Equipment view is limited to gear assigned to you');return;}
  var ov=document.getElementById('invDetailOverlay');var bx=document.getElementById('invDetailBox');if(!ov||!bx)return;
  function fld(label,field,ph,mono){return '<div><label class="text-[9px] font-bold uppercase tracking-wider text-gray-500 block mb-0.5">'+label+'</label><input value="'+(''+(it[field]||'')).replace(/"/g,'&quot;')+'" onchange="invSetField(\''+it.id+'\',\''+field+'\',this.value)" placeholder="'+(ph||'')+'" class="w-full text-[12px] '+(mono?'mono ':'')+'border border-gray-300 rounded-lg px-2.5 py-1.5" style="outline:none"></div>';}
  function sel(label,field,opts){return '<div><label class="text-[9px] font-bold uppercase tracking-wider text-gray-500 block mb-0.5">'+label+'</label><select onchange="invSetField(\''+it.id+'\',\''+field+'\',this.value)" class="w-full text-[12px] border border-gray-300 rounded-lg px-2 py-1.5 bg-white" style="outline:none">'+opts.map(function(o){return '<option value="'+esc(o)+'"'+(it[field]===o?' selected':'')+'>'+esc(o)+'</option>';}).join('')+'</select></div>';}
  var s=INV_STATUSES[it.status]||INV_STATUSES.available;
  bx.innerHTML='<div class="flex items-start justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">'+
      '<div class="min-w-0"><h3 class="text-base font-bold text-gray-900 truncate">'+esc(it.name)+'</h3><p class="text-[10px] mono text-gray-500">'+esc(it.barcode)+'</p></div>'+
      '<button onclick="closeInvDetail()" class="text-gray-400 hover:text-gray-700 text-lg leading-none ml-2">✕</button></div>'+
    '<div class="overflow-y-auto flex-1 p-4 space-y-3">'+
      '<div class="grid grid-cols-2 gap-3">'+fld('Item Name','name',"e.g. Sony HDC-5500")+sel('Category','category',INV_CATEGORIES)+
        fld((invNeedsSerial(it)?"Serial Number (required for LiveU LU800)":'Serial Number'),'serial',invNeedsSerial(it)?"Encoder serial # required":'SN…',true)+fld('Barcode','barcode','MUSE-…',true)+
        sel('Status','status',Object.keys(INV_STATUSES).map(function(k){return k;}))+sel('Condition','condition',['Excellent','Good','Fair','Needs repair'])+
        sel('Home Location','location',INV_LOCATIONS)+fld('Replacement Value ($)','value','0',true)+'</div>'+
      '<div><label class="text-[9px] font-bold uppercase tracking-wider text-gray-500 block mb-0.5">Notes</label>'+
        museRichBox({id:'invn_'+it.id,value:it.notes||'',toolbar:'note',height:'72px',placeholder:'Condition, serials, handling…',onchange:'function(v){invSetField(\''+it.id+'\',\'notes\',v)}'})+'</div>'+
      // status / assignment summary
      '<div class="bg-gray-50 border border-gray-100 rounded-xl p-3"><div class="flex items-center justify-between"><span class="text-[10px] font-bold uppercase tracking-wider text-gray-500">Current Status</span><span class="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] mono '+s.cls+'"><span class="w-1.5 h-1.5 rounded-full" style="background:'+s.dot+'"></span>'+s.label+'</span></div>'+
        (it.status==='checked-out'?'<p class="text-[11px] text-gray-700 mt-2">On <span class="font-bold">'+(it.project&&productions[it.project]?esc(productions[it.project].name):'—')+'</span>'+(it.assignedTo?' · assigned to '+esc(it.assignedTo):'')+'</p>':'<p class="text-[11px] text-gray-500 mt-2">At '+esc(it.location||'—')+'</p>')+'</div>'+
    '</div>'+
    '<div class="px-4 py-3 border-t border-gray-100 flex-shrink-0 flex items-center gap-2">'+
      (it.status==='available'?'<button onclick="closeInvDetail();openCheckout(\''+it.id+'\')" class="flex-1 bg-blue-600 text-white text-[12px] font-bold rounded-lg py-2 hover:bg-blue-700">Check Out to Project →</button>':
       it.status==='checked-out'?'<button onclick="invCheckin(\''+it.id+'\');closeInvDetail()" class="flex-1 bg-emerald-600 text-white text-[12px] font-bold rounded-lg py-2 hover:bg-emerald-700">Check In ↩</button>':'')+
      (it.status!=='maintenance'?'<button onclick="invSetMaintenance(\''+it.id+'\');closeInvDetail()" class="text-[11px] font-bold text-amber-700 border border-amber-200 rounded-lg px-3 py-2 hover:bg-amber-50">Maintenance</button>':'')+
      '<button onclick="invDelete(\''+it.id+'\')" class="text-[11px] font-bold text-red-600 border border-red-200 rounded-lg px-3 py-2 hover:bg-red-50">Delete</button>'+
    '</div>';
  ov.style.display='flex';}
function closeInvDetail(){var ov=document.getElementById('invDetailOverlay');if(ov)ov.style.display='none';}

/* ---- check-out modal (assign to project + person) ---- */
var checkoutCtx=null;
function openCheckout(id){var it=invById(id);if(!it)return;checkoutCtx=id;var ov=document.getElementById('checkoutOverlay');var bx=document.getElementById('checkoutBox');if(!ov||!bx)return;
  bx.innerHTML='<div class="flex items-center justify-between px-4 py-3 border-b border-gray-100"><h3 class="text-sm font-bold text-gray-900">Check Out — '+esc(it.name)+'</h3><button onclick="closeCheckout()" class="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button></div>'+
    '<div class="p-4 space-y-3">'+
      '<p class="text-[10px] mono text-gray-500">'+esc(it.barcode)+' · SN '+esc(it.serial||'—')+'</p>'+
      '<div><label class="text-[9px] font-bold uppercase tracking-wider text-gray-500 block mb-1">Project</label>'+
        '<select id="coProj" class="w-full text-[12px] border border-gray-300 rounded-lg px-2 py-1.5 bg-white" style="outline:none">'+order.map(function(k){return '<option value="'+k+'">'+esc(productions[k].name)+'</option>';}).join('')+'</select></div>'+
      '<div><label class="text-[9px] font-bold uppercase tracking-wider text-gray-500 block mb-1">Assign to (optional)</label>'+
        '<input id="coWho" placeholder="Crew member or kit name" class="w-full text-[12px] border border-gray-300 rounded-lg px-2.5 py-1.5" style="outline:none"></div>'+
      '<div class="bg-blue-50 border border-blue-100 rounded-lg p-2.5"><p class="text-[10px] text-blue-800">This marks the item <b>Checked Out</b>, attaches it to the project, and adds it to that project\'s <b>PackList</b>.</p></div>'+
    '</div>'+
    '<div class="px-4 py-3 border-t border-gray-100 flex items-center gap-2"><button onclick="confirmCheckout()" class="flex-1 bg-blue-600 text-white text-[12px] font-bold rounded-lg py-2 hover:bg-blue-700">Confirm Check Out</button><button onclick="closeCheckout()" class="text-[11px] font-bold text-gray-600 px-3 py-2">Cancel</button></div>';
  ov.style.display='flex';}
function closeCheckout(){var ov=document.getElementById('checkoutOverlay');if(ov)ov.style.display='none';}
function confirmCheckout(){if(!checkoutCtx)return;var proj=(document.getElementById('coProj')||{}).value||order[0];var who=(document.getElementById('coWho')||{}).value||'';
  invCheckout(checkoutCtx,proj,who);closeCheckout();}
function equipInit(){loadInvOnce();}

/* ============================================================================
   CSV IMPORT  — equipment, vendors, crew, travel
   A small RFC-4180-ish parser (quoted fields, embedded commas/quotes/newlines),
   header auto-mapping, and a shared preview/import modal.
   ============================================================================ */
function parseCSV(text){
  text=String(text||'').replace(/^\uFEFF/,''); // strip BOM
  var rows=[],row=[],field='',i=0,inQ=false;
  while(i<text.length){var c=text[i];
    if(inQ){
      if(c==='"'){if(text[i+1]==='"'){field+='"';i+=2;continue;}inQ=false;i++;continue;}
      field+=c;i++;continue;
    }
    if(c==='"'){inQ=true;i++;continue;}
    if(c===','){row.push(field);field='';i++;continue;}
    if(c==='\r'){i++;continue;}
    if(c==='\n'){row.push(field);rows.push(row);row=[];field='';i++;continue;}
    field+=c;i++;
  }
  if(field.length||row.length){row.push(field);rows.push(row);}
  // drop fully-empty trailing rows
  return rows.filter(function(r){return r.some(function(c){return (c||'').trim()!=='';});});
}
function csvToObjects(text){var rows=parseCSV(text);if(rows.length<1)return {headers:[],rows:[]};
  var headers=rows[0].map(function(h){return (h||'').trim();});
  var objs=rows.slice(1).map(function(r){var o={};headers.forEach(function(h,idx){o[h]=(r[idx]!=null?String(r[idx]).trim():'');});return o;});
  return {headers:headers,rows:objs};}
// fuzzy header pick: find a value across several possible column names (case-insensitive)
function pick(o,names){for(var i=0;i<names.length;i++){for(var k in o){if(k.toLowerCase().replace(/[^a-z0-9]/g,'')===names[i].toLowerCase().replace(/[^a-z0-9]/g,''))return o[k];}}return '';}

var csvImportCtx={domain:null,rows:[],headers:[],key:null};
function openCsvImport(domain,key){csvImportCtx={domain:domain,rows:[],headers:[],key:key||null};
  var ov=document.getElementById('csvOverlay');var bx=document.getElementById('csvBox');if(!ov||!bx)return;
  var titles={equipment:'Import Equipment',vendors:'Import Vendors',crew:'Import Crew',travel:'Import Travel'};
  var cols={equipment:'name, category, serial, barcode, status, location, value, condition, notes',
            vendors:'name, category, contact, title, phone, email, address, notes',
            crew:'name, position, group, email, phone, provider',
            travel:'name, airline, flight, dep, deptime, depgate, arr, arrtime, arrgate'};
  bx.innerHTML='<div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0"><h3 class="text-sm font-bold text-gray-900">'+titles[domain]+' — CSV</h3><button onclick="closeCsvImport()" class="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button></div>'+
    '<div class="p-4 space-y-3 overflow-y-auto flex-1">'+
      '<div class="bg-blue-50 border border-blue-100 rounded-lg p-2.5"><p class="text-[10px] text-blue-800">Expected columns (header row, any order): <span class="mono">'+cols[domain]+'</span>. Unknown columns are ignored.</p></div>'+
      '<div class="flex items-center gap-2"><label class="flex-1 text-[11px] font-bold text-white bg-gray-900 rounded-lg px-3 py-2 hover:bg-gray-800 cursor-pointer text-center">Choose CSV file<input type="file" accept=".csv,text/csv" onchange="csvFilePicked(event)" style="display:none"></label>'+
        '<button onclick="csvLoadSample()" class="text-[10px] font-bold text-gray-600 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50">Paste / sample</button></div>'+
      '<textarea id="csvPaste" rows="4" placeholder="…or paste CSV text here, then click Preview" class="w-full text-[11px] mono border border-gray-300 rounded-lg px-2.5 py-2" style="outline:none;resize:vertical"></textarea>'+
      '<button onclick="csvPreviewFromPaste()" class="text-[10px] font-bold text-blue-700 hover:underline">Preview pasted text →</button>'+
      '<div id="csvPreview"></div>'+
    '</div>'+
    '<div id="csvActions" class="px-4 py-3 border-t border-gray-100 flex-shrink-0" style="display:none"></div>';
  ov.style.display='flex';}
function closeCsvImport(){var ov=document.getElementById('csvOverlay');if(ov)ov.style.display='none';}
function csvFilePicked(e){var f=e.target.files&&e.target.files[0];if(!f)return;var r=new FileReader();r.onload=function(){csvRenderPreview(r.result);};r.readAsText(f);}
function csvPreviewFromPaste(){var t=(document.getElementById('csvPaste')||{}).value||'';if(!t.trim()){toast('Paste some CSV first');return;}csvRenderPreview(t);}
function csvLoadSample(){var d=csvImportCtx.domain;var samples={
  equipment:"name,category,serial,barcode,status,location,value,condition\nSony HDC-5500,Cameras,3500-99001,MUSE-CAM-200111,available,Meta Miami,62000,Good\nCanon CJ45ex9.7B,Lenses,CJ45-0021,MUSE-LEN-200140,available,Meta Live Events — Menlo Park MPK,82000,Excellent",
  vendors:'name,category,contact,title,phone,email\nLens & Friends,Lenses,Dana Pratt,Account Mgr,(212) 559-7788,dana@lensfriends.tv\nBexel,Broadcast Rental,Marco Reyes,Sales,(818) 555-3300,marco@bexel.com',
  crew:'name,position,group,email,phone,provider\nJordan Lee,Technical Director,PCR / Control Room,jordan.lee@meta.com,(212) 555-0190,Staff\nDrew Kessler,A1,Field & Technical,drew.k@meta.com,(212) 556-0144,Freelance',
  travel:'name,airline,flight,dep,deptime,depgate,arr,arrtime,arrgate\nJordan Lee,AA,AA1455,JFK,2026-07-10T07:30,22,MIA,2026-07-10T10:45,D14\nDrew Kessler,DL,DL880,ATL,2026-07-10T08:00,A12,MIA,2026-07-10T09:55,E4'};
  var ta=document.getElementById('csvPaste');if(ta){ta.value=samples[d]||'';csvRenderPreview(ta.value);}}
function csvRenderPreview(text){var parsed=csvToObjects(text);csvImportCtx.headers=parsed.headers;csvImportCtx.rows=parsed.rows;
  var box=document.getElementById('csvPreview');var act=document.getElementById('csvActions');if(!box)return;
  if(!parsed.rows.length){box.innerHTML='<p class="text-[11px] text-red-600">No data rows found. Check that the first line is a header row.</p>';if(act)act.style.display='none';return;}
  var cols=parsed.headers.slice(0,6);
  var head='<tr>'+cols.map(function(h){return '<th class="text-left pr-3 pb-1 text-[8px] font-bold uppercase tracking-wider text-gray-400">'+esc(h)+'</th>';}).join('')+'</tr>';
  var body=parsed.rows.slice(0,5).map(function(o){return '<tr class="border-t border-gray-100">'+cols.map(function(h){return '<td class="pr-3 py-1 text-[10px] text-gray-700 truncate" style="max-width:120px">'+esc(o[h]||'')+'</td>';}).join('')+'</tr>';}).join('');
  box.innerHTML='<p class="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Preview — '+parsed.rows.length+' row(s)</p><div class="overflow-x-auto border border-gray-200 rounded-lg p-2"><table class="w-full">'+head+body+'</table></div>'+(parsed.rows.length>5?'<p class="text-[9px] text-gray-400 mt-1">…and '+(parsed.rows.length-5)+' more</p>':'');
  if(act){act.style.display='block';act.innerHTML='<button onclick="csvDoImport()" class="w-full bg-blue-600 text-white text-[12px] font-bold rounded-lg py-2 hover:bg-blue-700">Import '+parsed.rows.length+' row(s)</button>';}}
function csvDoImport(){var d=csvImportCtx.domain,rows=csvImportCtx.rows,n=0;
  if(d==='equipment'){loadInvOnce();rows.forEach(function(o){var name=pick(o,['name','item','equipment']);if(!name)return;
    var cat=pick(o,['category','cat'])||INV_CATEGORIES[0];var st=(pick(o,['status'])||'available').toLowerCase();if(!INV_STATUSES[st])st='available';
    inventory.unshift({id:newInvId(),barcode:pick(o,['barcode','code'])||genBarcode(cat),name:name,category:cat,serial:pick(o,['serial','sn']),
      status:st,location:pick(o,['location','loc'])||INV_LOCATIONS[0],project:'',assignedTo:'',value:parseFloat((pick(o,['value','cost'])||'0').replace(/[^0-9.]/g,''))||0,
      condition:pick(o,['condition'])||'Good',notes:pick(o,['notes','note'])});n++;});
    saveInventory();renderEquipView();}
  else if(d==='vendors'){rows.forEach(function(o){var name=pick(o,['name','vendor','company']);if(!name)return;
    vendors.push({id:'v_'+Date.now()+'_'+n,name:name,category:pick(o,['category','specialty','type']),contact:pick(o,['contact','poc','contactname']),
      contactTitle:pick(o,['title','contacttitle','role']),phone:pick(o,['phone','tel']),email:pick(o,['email','mail']),
      address:pick(o,['address','addr']),pobox:pick(o,['pobox']),sales:pick(o,['sales']),afterHours:pick(o,['afterhours','emergency']),notes:pick(o,['notes','note']),geo:null});n++;});
    saveVendors();try{renderVendorsView();}catch(e){}}
  else if(d==='crew'){var key=csvImportCtx.key||order[0];var crew=getProjectCrew(key);rows.forEach(function(o){var name=pick(o,['name','crew','person']);var posn=pick(o,['position','pos','role','title']);if(!name&&!posn)return;
    var grp=pick(o,['group','dept','department'])||CREW_GROUPS[0];if(CREW_GROUPS.indexOf(grp)<0){var gl=grp.toLowerCase();grp=CREW_GROUPS.filter(function(g){return g.toLowerCase().indexOf(gl)>-1;})[0]||CREW_GROUPS[0];}
    crew.push({id:newSlotId(),pos:posn||'Crew',group:grp,name:name||'',email:pick(o,['email','mail']),phone:pick(o,['phone','tel']),prov:pick(o,['provider','prov','vendor','providedby'])});n++;});
    stampEdit(key);if(productions[key])renderProjectView(key);}
  else if(d==='travel'){loadTravelOnce();rows.forEach(function(o){var name=pick(o,['name','crew','traveler','person']);if(!name)return;
    var alRaw=pick(o,['airline','carrier']);var alc=alRaw.toUpperCase();
    if(!AIRLINES[alc]){var all=alRaw.toLowerCase();var hit=Object.keys(AIRLINES).filter(function(c){return AIRLINES[c].name.toLowerCase().indexOf(all)>-1;})[0];alc=hit||'XX';}
    var dep=(pick(o,['dep','from','origin','depcode'])||'').toUpperCase();var arr=(pick(o,['arr','to','dest','arrcode'])||'').toUpperCase();
    var fno=(pick(o,['flight','flightno','flightnumber','fltno'])||(alc+Math.floor(100+Math.random()*8999))).toUpperCase();
    function tm(v){v=(v||'').trim();if(!v)return '';if(/\d{2}:\d{2}$/.test(v)&&v.indexOf('T')>-1)return v+':00';return v;}
    crewFlights[name]={airlineCode:alc,flightNumber:fno,bookedOn:nowStamp(),bookedBy:(typeof permUser==='function')?permUser():'',projKey:csvImportCtx.key||null,
      dep:{code:dep,terminal:pick(o,['depterminal','depterm']),gate:pick(o,['depgate','gate']),localTime:tm(pick(o,['deptime','departure','depdatetime']))},
      arr:{code:arr,terminal:pick(o,['arrterminal','arrterm']),gate:pick(o,['arrgate']),localTime:tm(pick(o,['arrtime','arrival','arrdatetime']))}};n++;});
    saveTravel();travelRerender(csvImportCtx.key);}
  closeCsvImport();renderAll();toast('Imported '+n+' '+d+' row(s)');}

function deptSummary(p,deptName){var f=(p.tbFields&&p.tbFields[deptName])||{};var fields=deptFields[deptName]||[];
  var vals=[];for(var i=0;i<fields.length&&vals.length<3;i++){var ft=fields[i][3]||(typeof fields[i][2]==='string'?fields[i][2]:'');if(ft==='header'||ft==='addable')continue;var v=f[fields[i][0]];if(fields[i][0]==='rvon'||ft==='rvon'){var rn=Array.isArray(v)?v.filter(function(e){return e&&(typeof e==='object'?e.a:e);}).length:0;if(rn)vals.push(rn+' RVON ch');continue;}if(Array.isArray(v)&&v.length)vals.push(v.join(' / '));else if(v&&typeof v==='string')vals.push(v);}
  return vals.join(' · ');}

/* ===== VENDOR DIRECTORY (third-party rental vendors) ===== */
var vendors=[
 {id:"v_lenses",name:"Lenses & Friends",category:"Cameras / Lenses",address:"4820 Production Way, Burbank, CA 91505",pobox:"P.O. Box 5521, Burbank, CA 91508",geo:[34.1808,-118.3290],contact:"Dana Reyes",contactTitle:"Account Manager",phone:"(818) 555-0142",email:"dana@lensesandfriends.com",sales:"Marcus Lee · sales@lensesandfriends.com · (818) 555-0188",notes:"Cameras, cine lenses, pedestals. 24/7 on-rental support line.",afterHours:"(818) 555-0911"},
 {id:"v_clearwave",name:"ClearWave RF Rentals",category:"RF / Comms",address:"77 Signal Park Dr, Secaucus, NJ 07094",pobox:"P.O. Box 990, Secaucus, NJ 07096",geo:[40.7895,-74.0565],contact:"Priya Anand",contactTitle:"Rentals Lead",phone:"(201) 555-0771",email:"priya@clearwaverf.com",sales:"sales@clearwaverf.com · (212) 558-0780",notes:"RF mics, IFB, intercom, frequency coordination.",afterHours:"(212) 558-0700"},
 {id:"v_brightline",name:"BrightLine Grip & Lighting",category:"Lighting / Grip",address:"2200 Lumen Ave, Chicago, IL 60616",pobox:"—",geo:[41.8480,-87.6260],contact:"Paul Lohr",contactTitle:"Lighting Director",phone:"(312) 555-9589",email:"lohr@brightline.com",sales:"rentals@brightline.com",notes:"LDG lighting package, grip, generators.",afterHours:"(312) 555-0033"},
 {id:"v_northstar",name:"North Star Transmission",category:"Transmission / Satellite",address:"1500 Uplink Rd, Englewood Cliffs, NJ 07632",pobox:"P.O. Box 414, Englewood Cliffs, NJ 07632",geo:[40.8859,-73.9465],contact:"Marisol Ortega",contactTitle:"Operations Manager",phone:"(201) 555-2104",email:"marisol@northstar-tx.com",sales:"booking@northstar-tx.com · (201) 555-2100",notes:"Ku-band + Ka-band uplinks, SRT/RIST paths, MediaConnect peering.",afterHours:"(201) 555-9100"},
 {id:"v_atlas_fiber",name:"Atlas Fiber Services",category:"Fiber / Networking",address:"88 Trunk Line Way, Jersey City, NJ 07305",pobox:"—",geo:[40.7055,-74.0760],contact:"Noah Pelletier",contactTitle:"Fiber Lead",phone:"(201) 555-6611",email:"noah@atlasfiber.net",sales:"orders@atlasfiber.net · (201) 555-6600",notes:"TAC-12, SMPTE hybrid cam fiber, OTDR traces, strand maps.",afterHours:"(201) 555-9000"},
 {id:"v_portersound",name:"Porter Sound Co.",category:"Audio / Mix",address:"312 Mixdown Blvd, Nashville, TN 37203",pobox:"P.O. Box 221, Nashville, TN 37203",geo:[36.1532,-86.7905],contact:"Hannah Porter",contactTitle:"Owner / A1",phone:"(615) 555-0812",email:"hannah@portersound.com",sales:"book@portersound.com",notes:"Yamaha Rivage / DiGiCo consoles, Dante, broadcast loudness tuning.",afterHours:"(615) 555-9988"},
 {id:"v_signalchain",name:"Signal Chain Engineering",category:"Engineering / Integration",address:"4040 Patchbay Pl, Hoboken, NJ 07030",pobox:"—",geo:[40.7439,-74.0323],contact:"Jules Okafor",contactTitle:"Director of Engineering",phone:"(201) 555-3312",email:"jules@signalchain.io",sales:"ops@signalchain.io",notes:"ST 2110 commissioning, PTP, Nevion/Riedel routing. T&M kit on standby.",afterHours:"(201) 555-9312"},
 {id:"v_meridian_power",name:"Meridian Power Services",category:"Power / Generators",address:"7 Breaker Rd, Linden, NJ 07036",pobox:"—",geo:[40.6220,-74.2446],contact:"Carla DeLuca",contactTitle:"Power Supervisor",phone:"(908) 555-2277",email:"carla@meridianpower.com",sales:"dispatch@meridianpower.com · (908) 555-2200",notes:"400A tie-ins, 100-500 kW gensets, UPS packages, isolated-ground distros.",afterHours:"(908) 555-9000"},
 {id:"v_skybridge_eng",name:"Skybridge ENG",category:"ENG / Backpacks",address:"920 Field Dr, Astoria, NY 11106",pobox:"P.O. Box 76, Astoria, NY 11106",geo:[40.7637,-73.9230],contact:"Theo Nakamura",contactTitle:"ENG Coordinator",phone:"(718) 555-0177",email:"theo@skybridge-eng.com",sales:"dispatch@skybridge-eng.com",notes:"LiveU LU800, TVU One, bonded 5G, 4G modems, local uplink van.",afterHours:"(718) 555-9177"},
 {id:"v_canvas_gfx",name:"Canvas Graphics Workshop",category:"Graphics / Playback",address:"55 Pixel Ave, Brooklyn, NY 11201",pobox:"—",geo:[40.6965,-73.9875],contact:"Lena Hoang",contactTitle:"Executive Producer",phone:"(347) 555-4433",email:"lena@canvasgfx.studio",sales:"book@canvasgfx.studio",notes:"Vizrt / Pixotope / Unreal real-time GFX, AR insertion, playback ops.",afterHours:"(347) 555-9433"},
 {id:"v_truenorth_captions",name:"TrueNorth Captions",category:"Captions / Accessibility",address:"120 Transcript Row, Toronto, ON M5V 3M2",pobox:"—",geo:[43.6450,-79.3920],contact:"Omar Haddad",contactTitle:"Access Services Lead",phone:"(416) 555-2200",email:"omar@truenorthcaps.ca",sales:"booking@truenorthcaps.ca",notes:"Live stenocaptions (EN/ES), AD narration, 608/708 encoding, SRT-ingest.",afterHours:"(416) 555-9200"}
];
var vmSel=null;
function vendorById(id){for(var i=0;i<vendors.length;i++)if(vendors[i].id===id)return vendors[i];return null;}
function saveVendors(){try{localStorage.setItem('muselive_vendors',JSON.stringify(vendors));}catch(e){}}
function openVendorManager(){if(typeof permCan==='function'&&!permCan('vendors')){toast('🔒 Vendors are not available for your role');return;}
  vmSel=vendors.length?vendors[0].id:null;renderVmList();renderVmPanel();var m=document.getElementById('vendorModal');m.style.display='flex';m.classList.remove('hidden');}
function closeVendorManager(){var m=document.getElementById('vendorModal');m.style.display='none';m.classList.add('hidden');renderTabs&&renderTabs();}
function vmSelect(id){vmSel=id;renderVmList();renderVmPanel();}
function renderVmList(){var box=document.getElementById('vmList');if(!box)return;
  box.innerHTML=vendors.map(function(v){var active=v.id===vmSel;
    return '<button onclick="vmSelect(\''+v.id+'\')" class="w-full text-left px-3 py-2 rounded-lg mb-1 '+(active?'bg-gray-900 text-white':'text-gray-700 hover:bg-gray-200')+'"><span class="text-[11px] font-semibold block leading-tight truncate">'+esc(v.name)+'</span><span class="text-[8px] '+(active?'text-gray-400':'text-gray-500')+'">'+esc(v.category||'Vendor')+'</span></button>';
  }).join('')||'<p class="text-[10px] text-gray-500 p-2">No vendors yet.</p>';
}
function addVendor(){var id="v_"+Date.now();vendors.push({id:id,name:"New Vendor",category:"",address:"",pobox:"",geo:null,contact:"",contactTitle:"",phone:"",email:"",sales:"",notes:"",afterHours:""});vmSel=id;saveVendors();renderVmList();renderVmPanel();}
function delVendor(id){if(!confirm('Delete this vendor? It will be removed from all production dropdowns.'))return;var i=vendors.map(function(v){return v.id;}).indexOf(id);if(i>-1)vendors.splice(i,1);vmSel=vendors.length?vendors[0].id:null;saveVendors();renderVmList();renderVmPanel();renderAll();}
function setVendor(id,field,val){var v=vendorById(id);if(!v)return;v[field]=val;if(field==='address')v.geo=null;saveVendors();if(field==='name'||field==='category')renderVmList();if(field==='address'){var mp=document.getElementById('vmMap');if(mp)mp.innerHTML=projectMapSVG(val);}}
function renderVmPanel(){var panel=document.getElementById('vmPanel');if(!panel)return;var v=vendorById(vmSel);
  if(!v){panel.innerHTML='<p class="text-sm text-gray-500">Select or add a vendor.</p>';return;}
  function fld(label,field,ph){return '<div class="mb-3"><label class="text-[10px] font-bold uppercase tracking-wider text-gray-600 block mb-1">'+label+'</label><input value="'+(''+ (v[field]||'')).replace(/"/g,'&quot;')+'" onchange="setVendor(\''+v.id+'\',\''+field+'\',this.value)" placeholder="'+(ph||'')+'" class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" style="outline:none"></div>';}
  function area(label,field,ph){return '<div class="mb-3"><label class="text-[10px] font-bold uppercase tracking-wider text-gray-600 block mb-1">'+label+'</label>'+
    museRichBox({id:'vend_'+v.id+'_'+field,value:v[field]||'',toolbar:'note',height:'80px',placeholder:(ph||''),onchange:'function(x){setVendor(\''+v.id+'\',\''+field+'\',x)}'})+'</div>';}
  panel.innerHTML=
    '<div class="flex items-start justify-between mb-3"><h3 class="text-base font-bold text-gray-900">'+esc(v.name)+'</h3><button onclick="delVendor(\''+v.id+'\')" class="text-[10px] text-red-600 font-bold hover:underline">Delete Vendor</button></div>'+
    '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">'+
      '<div>'+fld('Vendor Name','name','e.g. Lenses & Friends')+fld('Category / Specialty','category','e.g. Cameras / Lenses')+area('Street Address','address','Street, City, State ZIP')+fld('P.O. Box','pobox','P.O. Box …')+
        '<div class="rounded-lg overflow-hidden border border-gray-200" style="height:110px"><div id="vmMap" style="width:100%;height:100%">'+projectMapSVG(v.address||v.name)+'</div></div></div>'+
      '<div>'+fld('Point of Contact','contact','Name')+fld('Contact Title','contactTitle','e.g. Account Manager')+fld('Phone','phone','(xxx) xxx-xxxx')+fld('Email','email','name@vendor.com')+fld('Sales','sales','Sales rep · email · phone')+fld('After-Hours / Emergency','afterHours','24/7 line')+area('Notes','notes','What they provide, terms, etc.')+'</div>'+
    '</div>'+
    '<div class="mt-2 pt-3 border-t border-gray-100"><p class="text-[10px] text-gray-500">Per-project rental documents (contracts, COIs, pull sheets) are uploaded on each production page under "Vendors on this Production."</p></div>';
}
/* ===== STANDALONE VENDORS PAGE (burger-menu top-level) ===== */
var vendorsPageSel=null;
function renderVendorsView(){
  if(!vendorsPageSel&&vendors.length)vendorsPageSel=vendors[0].id;
  var listBox=document.getElementById('vendorsListPage');var detail=document.getElementById('vendorsDetailPage');if(!listBox||!detail)return;
  var q=((document.getElementById('vendorsSearch')||{}).value||'').toLowerCase().trim();
  var list=vendors.filter(function(v){if(!q)return true;return (v.name+' '+(v.category||'')+' '+(v.contact||'')+' '+(v.email||'')).toLowerCase().indexOf(q)>-1;});
  listBox.innerHTML=list.map(function(v){var active=v.id===vendorsPageSel;
    return '<button onclick="vendorsPageSelect(\''+v.id+'\')" class="w-full text-left px-3 py-2.5 rounded-lg '+(active?'bg-gray-900 text-white':'text-gray-700 hover:bg-gray-100 border border-gray-100')+'"><span class="text-[12px] font-semibold block leading-tight truncate">'+esc(v.name)+'</span><span class="text-[9px] '+(active?'text-gray-400':'text-gray-500')+'">'+esc(v.category||'Vendor')+'</span></button>';
  }).join('')||'<p class="text-[10px] text-gray-500 p-2">No vendors match.</p>';
  var v=vendorById(vendorsPageSel);
  if(!v){detail.innerHTML='<div class="bg-white rounded-2xl p-8 border border-gray-200/60 text-center text-sm text-gray-400" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">Select or add a vendor.</div>';return;}
  function fld(label,field,ph){return '<div class="mb-3"><label class="text-[10px] font-bold uppercase tracking-wider text-gray-600 block mb-1">'+label+'</label><input value="'+(''+(v[field]||'')).replace(/"/g,'&quot;')+'" onchange="setVendorPage(\''+v.id+'\',\''+field+'\',this.value)" placeholder="'+(ph||'')+'" class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" style="outline:none"></div>';}
  function area(label,field,ph){return '<div class="mb-3"><label class="text-[10px] font-bold uppercase tracking-wider text-gray-600 block mb-1">'+label+'</label>'+
    museRichBox({id:'vendp_'+v.id+'_'+field,value:v[field]||'',toolbar:'note',height:'80px',placeholder:(ph||''),onchange:'function(x){setVendorPage(\''+v.id+'\',\''+field+'\',x)}'})+'</div>';}
  detail.innerHTML='<div class="bg-white rounded-2xl p-5 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">'+
    '<div class="flex items-start justify-between mb-3"><h3 class="text-lg font-bold text-gray-900">'+esc(v.name)+'</h3><button onclick="delVendorPage(\''+v.id+'\')" class="text-[10px] text-red-600 font-bold hover:underline">Delete Vendor</button></div>'+
    '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">'+
      '<div>'+fld('Vendor Name','name','e.g. Lenses & Friends')+fld('Category / Specialty','category','e.g. Cameras / Lenses')+area('Street Address','address','Street, City, State ZIP')+fld('P.O. Box','pobox','P.O. Box …')+
        '<div class="rounded-lg overflow-hidden border border-gray-200" style="min-height:240px;height:240px"><div id="vmMapPage" style="width:100%;height:100%">'+vendorMapHTML(v)+'</div></div></div>'+
      '<div>'+fld('Point of Contact','contact','Name')+fld('Contact Title','contactTitle','e.g. Account Manager')+fld('Phone','phone','(xxx) xxx-xxxx')+fld('Email','email','name@vendor.com')+fld('Sales','sales','Sales rep · email · phone')+fld('After-Hours / Emergency','afterHours','24/7 line')+area('Notes','notes','What they provide, terms, etc.')+'</div>'+
    '</div>'+
    '<div class="mt-2 pt-3 border-t border-gray-100"><p class="text-[10px] text-gray-500">Per-project rental documents (contracts, COIs, pull sheets) are uploaded on each production page under "Vendors on this Production."</p></div>'+
  '</div>';
  try{setTimeout(mountVisibleMaps,30);}catch(e){}
}
function vendorsPageSelect(id){vendorsPageSel=id;renderVendorsView();}
function setVendorPage(id,field,val){var v=vendorById(id);if(!v)return;v[field]=val;if(field==='address')v.geo=null;saveVendors();
  if(field==='name'||field==='category')renderVendorsView();
  if(field==='address'){var mp=document.getElementById('vmMapPage');if(mp){mp.innerHTML=vendorMapHTML(v);try{setTimeout(mountVisibleMaps,30);}catch(e){}}}}
function vendorMapHTML(v){var g=geoLookup(v.address||v.name||'');
  if(g)return liveMapHTML({id:'vmap_'+v.id,lat:g.lat,lng:g.lng,zoom:13,label:v.name||g.name,seed:v.address||v.name});
  return projectMapSVG(v.address||v.name);}
function delVendorPage(id){if(!confirm('Delete this vendor? It will be removed from all production dropdowns.'))return;var i=vendors.map(function(v){return v.id;}).indexOf(id);if(i>-1)vendors.splice(i,1);vendorsPageSel=vendors.length?vendors[0].id:null;saveVendors();renderVendorsView();renderAll();}
function vendorsAddNew(){var id="v_"+Date.now();vendors.push({id:id,name:"New Vendor",category:"",address:"",pobox:"",geo:null,contact:"",contactTitle:"",phone:"",email:"",sales:"",notes:"",afterHours:""});vendorsPageSel=id;saveVendors();renderVendorsView();}

function setCustomer(key,val){if(!productions[key])return;productions[key].customer=val;stampEdit(key);renderAll();if(document.getElementById('view-'+key))renderProjectView(key);}

/* ---- techbook / schedule fields ---- */
function nowStamp(){try{return (typeof museNow==='function'?museNow():new Date()).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(e){return new Date().toString();}}
function ensureFields(p){if(!p.schedule)p.schedule=[];if(!p.version)p.version="Rev 1.0 · Draft";if(!p.editedBy)p.editedBy="Lila Hart";if(!p.lastEdited)p.lastEdited=nowStamp();
  /* v30 Module 5: fold any saved standalone-Prompter data into Cameras / Video.
     Idempotent — runs whenever a production (or a per-location snapshot) is bound. */
  if(p.tbFields&&p.tbFields.Prompter){var cv=p.tbFields['Cameras / Video']=p.tbFields['Cameras / Video']||{};
    Object.keys(p.tbFields.Prompter).forEach(function(k){if(cv[k]==null||cv[k]==='')cv[k]=p.tbFields.Prompter[k];});
    delete p.tbFields.Prompter;}
  if(p.tbEquip&&p.tbEquip.Prompter){var camLines=p.tbEquip['Cameras / Video']=p.tbEquip['Cameras / Video']||[];
    p.tbEquip.Prompter.forEach(function(ln){if(!ln||ln._link)return; // auto-linked rows were derived from camera hood/glass — dropped
      // review fix: the item name rides in `model` (renders + names the PackList row); notes stay notes
      camLines.push({model:'Prompter: '+(ln.item||'prompter'),qty:ln.qty||1,scanid:ln.scanid||'',notes:ln.notes||''});});
    delete p.tbEquip.Prompter;}
  /* review fix: legacy v28 Lighting/Talent lines used the old item/notes shape the new
     schemas don't render — surface them (Lighting: item→model; Talent: item→notes). */
  if(p.tbEquip&&p.tbEquip.Lighting){p.tbEquip.Lighting.forEach(function(ln){
    if(ln&&ln.item&&!ln.model&&!ln.ftype){ln.model=ln.item;delete ln.item;}});}
  if(p.tbEquip&&p.tbEquip['Talent / Production']){p.tbEquip['Talent / Production'].forEach(function(ln){
    if(ln&&ln.item&&!ln.name){ln.notes=(ln.notes?ln.notes+' — ':'')+ln.item;}});}
  if(p.dept){var byName={};p.dept.forEach(function(d){byName[d[0]]=d;});
    /* review fix: fold the retired Prompter row's status + note into Cameras / Video
       instead of silently discarding them (weaker status wins; note appended). */
    var pr=byName['Prompter'];
    if(pr){var cv2=byName['Cameras / Video'];
      if(cv2){var rank={approved:2,pending:1,missing:0};
        if((rank[pr[1]]!=null)&&(rank[pr[1]]<(rank[cv2[1]]!=null?rank[cv2[1]]:1)))cv2[1]=pr[1];
        if(pr[2]&&pr[2]!=='—'){cv2[2]=(cv2[2]&&cv2[2]!=='—'?cv2[2]+' · ':'')+'Prompter: '+pr[2];if(pr.__customNote)cv2.__customNote=true;}}
      delete byName['Prompter'];}
    /* v38: Engineering's legacy "evs" field became the Replay / EVS department's
       "server" field — carry a saved answer across, then drop the duplicate. */
    if(p.tbFields&&p.tbFields["Engineering"]&&p.tbFields["Engineering"].evs!=null){
      var _evs=p.tbFields["Engineering"].evs;
      if(!p.tbFields["Replay / EVS"])p.tbFields["Replay / EVS"]={};
      if(_evs&&!p.tbFields["Replay / EVS"].server)p.tbFields["Replay / EVS"].server=_evs;
      delete p.tbFields["Engineering"].evs;}
    p.dept=DEPT_NAMES.map(function(nm){return byName[nm]||[nm,p.completeShowcase?"approved":"pending",p.completeShowcase?"Showcase · locked":"—"];});if(p.deptLoc&&p.__locBound&&p.deptLoc[p.__locBound])p.deptLoc[p.__locBound].dept=p.dept;}
  return p;}
function stampEdit(key){var p=productions[key];if(!p)return;p.lastEdited=nowStamp();try{saveState();}catch(e){}}
function museSyncCalendar(key){
  var p=productions[key];if(!p){toast&&toast('Open a production first');return;}
  var rows=p.schedule||[];if(!rows.length){toast&&toast('No schedule rows to export');return;}
  function icsEsc(s){return String(s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');}
  function pad(n){return n<10?'0'+n:''+n;}
  function toIcsDate(dateStr,timeStr){
    var d=Date.parse(String(dateStr)+' '+String(timeStr||'09:00'));
    if(isNaN(d))d=Date.parse(String(dateStr));
    if(isNaN(d))d=Date.now();
    var x=new Date(d);
    return x.getUTCFullYear()+pad(x.getUTCMonth()+1)+pad(x.getUTCDate())+'T'+pad(x.getUTCHours())+pad(x.getUTCMinutes())+'00Z';
  }
  var lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Muse Live//Schedule//EN','CALSCALE:GREGORIAN'];
  rows.forEach(function(r,i){
    var title=r[2]||p.name;var loc=r[5]||p.venue||'';
    var start=toIcsDate(r[0],r[1]);
    var endD=Date.parse(String(r[0])+' '+String(r[1]||'09:00'));if(isNaN(endD))endD=Date.now();
    endD+=2*3600000;var en=new Date(endD);
    var end=en.getUTCFullYear()+pad(en.getUTCMonth()+1)+pad(en.getUTCDate())+'T'+pad(en.getUTCHours())+pad(en.getUTCMinutes())+'00Z';
    lines.push('BEGIN:VEVENT','UID:muse-'+key+'-'+i+'@meta.local','DTSTAMP:'+toIcsDate(new Date().toISOString().slice(0,10),'12:00'),
      'DTSTART:'+start,'DTEND:'+end,'SUMMARY:'+icsEsc('['+p.name+'] '+title),'LOCATION:'+icsEsc(loc),
      'DESCRIPTION:'+icsEsc('Exported from Muse Live'),'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  var blob=new Blob([lines.join('\r\n')],{type:'text/calendar;charset=utf-8'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Muse_'+key+'_schedule.ics';
  document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},500);
  toast&&toast('Downloaded '+rows.length+' event(s) as .ics for Outlook / Calendar');
}
/* ---- per-production technical specs that drive the Techbook ---- */
/* venue GPS coordinates [lat,lng] for the Locations page maps & links */
var venueGeo={
 museaitour:[40.8135,-74.0745], raybangen3:[37.4848,-122.1484], orion:[37.4030,-121.9698],
 museailaunch:[40.7536,-74.0007], whatsapp:[25.7617,-80.1918], igcreators:[40.7505,-73.9878], charm:[45.4642,9.1900]
};
function projGeo(p,key){if(p.geo&&p.geo.length===2)return p.geo;return venueGeo[key]||null;}
function mapUrls(venue,geo){var q=encodeURIComponent(venue||'');var g,a;
  if(geo){g='https://www.google.com/maps/search/?api=1&query='+geo[0]+','+geo[1];a='https://maps.apple.com/?ll='+geo[0]+','+geo[1]+'&q='+q;}
  else{g='https://www.google.com/maps/search/?api=1&query='+q;a='https://maps.apple.com/?q='+q;}
  return {google:g,apple:a};}
var tbSpecs={
 museaitour:{cams:7,camModel:"Sony HDC-5500",lens:"Canon CJ45ex9.7B",console:"Calrec Apollo",audioCh:32,micModel:"Sennheiser MD 46",rfMic:"Shure Axient Digital AD4Q + AD1",ifb:"RTS IFB-325",intercom:"Riedel Bolero",fiberType:"TAC-12 ST single-mode (Fiber 100–102)",fiberLen:"1,500 ft TAC-12 reels · 50–1000 ft runs",transport:"Harmonic XOS",evs:"EVS XS-VIA",venueAddr:"Meta HQ · Hacker Square, 1 Hacker Way, Menlo Park, CA 94025",truck:"Grass Valley Kayenne"},
 raybangen3:{cams:4,camModel:"Sony HDC-5500",lens:"Canon CJ45ex9.7B",console:"Calrec Apollo",audioCh:16,micModel:"DPA 4066",rfMic:"Shure Axient Digital AD4Q",ifb:"RTS IFB-325",intercom:"RTS ADAM",fiberType:"Tactical single-mode",fiberLen:"800 ft",transport:"LiveU LU800",evs:"EVS XT-VIA",venueAddr:"Meta HQ · 1 Hacker Way, Menlo Park, CA 94025",truck:"Grass Valley Kayenne"},
 orion:{cams:24,camModel:"Sony HDC-5500",lens:"Fujinon UA80x9",console:"64ch MADI (routing TBD)",audioCh:64,micModel:"Sennheiser MKH 416",rfMic:"Shure Axient Digital AD4Q + AD1",ifb:"RTS IFB-325",intercom:"RTS ADAM",fiberType:"SMPTE 2110 (design)",fiberLen:"6,000 ft (survey pending)",transport:"SMPTE 2110 contribution",evs:"EVS XT-VIA",venueAddr:"4900 Marie P DeBartolo Way, Santa Clara, CA 95054",truck:"TBD — Engineering Kick-Off Pending"},
 museailaunch:{cams:8,camModel:"Sony HDC-5500",lens:"Canon CJ45ex9.7B",console:"Calrec Artemis",audioCh:96,micModel:"Sennheiser MD 46",rfMic:"Shure Axient Digital AD4Q + AD1",ifb:"Riedel Bolero",intercom:"RTS ADAM",fiberType:"SMPTE 2110 internal plant",fiberLen:"House Plant",transport:"SMPTE 2110 internal",evs:"EVS XT-VIA",venueAddr:"50 Hudson Yards, New York, NY 10001 · Studio M1",truck:"Meta NYC Central Plant"},
 whatsapp:{cams:12,camModel:"Sony HDC-5500",lens:"Canon CJ45ex9.7B",console:"Per-market design pending",audioCh:24,micModel:"Sennheiser MD 46",rfMic:"Shure Axient Digital AD4Q + AD1",ifb:"RTS IFB-325",intercom:"RTS ADAM",fiberType:"Per-market (quoting)",fiberLen:"8× markets",transport:"Mixed SDI/IP",evs:"Live Q&A Desk · AP feed",venueAddr:"Multi-Market Remote · Live Q&A Desk @ TC",truck:"Grass Valley Kayenne"},
 igcreators:{cams:12,camModel:"Sony HDC-5500",lens:"Fujinon UA80x9",console:"Calrec Artemis",audioCh:24,micModel:"Shure Axient Digital AD4Q + AD1",rfMic:"Shure Axient Digital AD4Q + AD1",ifb:"RTS IFB-325",intercom:"RTS ADAM",fiberType:"Route single-mode",fiberLen:"5,400 ft",transport:"LiveU LU800",evs:"EVS XT-VIA",venueAddr:"Central Park West → Herald Square, New York, NY",truck:"Grass Valley Kayenne"},
 charm:{cams:48,camModel:"Sony HDC-5500",lens:"Fujinon UA80x9",console:"Calrec Artemis",audioCh:128,micModel:"Sennheiser MKH 416",rfMic:"Shure Axient Digital AD4Q + AD1",ifb:"RTS IFB-325",intercom:"RTS ADAM",fiberType:"Dual-path SMPTE 2110",fiberLen:"Dual-path + Satellite B/U",transport:"Fiber + satellite contribution",evs:"EVS XT-VIA",venueAddr:"Milan Design Week d'Ampezzo, Italy · IBC Hall A",truck:"Meta Milan IBC · Milano"}
};
/* Muse AI World Tour packlist / fiber / sub-sites when empty so local edits win. */
function seedWorldcupPacklist(p,key){
  if(key!=='museaitour'||!p)return;
  try{
    /* pack list — MPK Hacker Square finale flypack */
    if(!p.tbEquip||typeof p.tbEquip!=='object')p.tbEquip={};
    var te=p.tbEquip;
    function ensureLines(dep,lines){
      if(!te[dep]||!te[dep].length)te[dep]=lines.map(function(x){return Object.assign({},x);});
    }
    ensureLines('Cameras / Video',[
      {model:"Sony HDC-5500",qty:7,lens:"Canon CJ45ex9.7B",ped:"Vinten Vector 750",monitor:"Sony HDVF-EL30",notes:'Presentation Studio + TBC Platform'},
      {model:"Grass Valley LDX 86N",qty:3,lens:"Fujinon UA107x8.4",ped:"Vinten Vector 750 ceiling mount",monitor:'—',notes:'1× Presentation Studio ceiling + 2× Outside Announce Platform'},
      {model:"Sony HDCU-3500",qty:6,notes:'CCU base stations · Shed 1–6'},
      {model:"Sony RCP-3500",qty:6,notes:'Remote control panels'},
      {model:"Vinten Vector 750",qty:7,notes:"Vinten Vector 750 kits"},
      {model:"Sony HDC-5500",qty:3,notes:'Presentation Studio prompters'},
      {model:"Evertz 7707 fiber Tx",qty:6,notes:'Field fiber sheds'},
      {model:"Evertz 7707 fiber Tx/Rx",qty:6,notes:'Fiber media converters'}
    ]);
    ensureLines('Audio',[
      {item:"Calrec Apollo",qty:1,notes:'Primary console · Field Ops Flypack'},
      {item:"Calrec Apollo",qty:1,notes:'Secondary console'},
      {item:"Calrec Hydra2",qty:3,notes:"Evertz 7707 fiber Rx/B + stage"},
      {item:"RTS KP-5032",qty:1,notes:'Outside Announce Platform'},
      {item:"Calrec Type R commentator",qty:1,notes:'Commentator booth'},
      {item:"Shure Axient Digital AD4Q + AD1",qty:1,notes:'RF mics'},
      {item:"Sennheiser MD 46",qty:1,notes:'MD46 host mics'},
      {item:"RTS IFB-325",qty:1,notes:'RTS IFB-325 1–6'}
    ]);
    ensureLines('Comms & IFB',[
      {item:"RTS ADAM",qty:1,notes:'Main intercom matrix'},
      {item:"Riedel Bolero",qty:1,notes:'Wireless belt packs'},
      {item:"RTS ADAM",qty:1,notes:'A2 / utility / producer packs'},
      {item:"RTS ADAM",qty:1,notes:'KP32 panels · Flypack TM/EIC/VCO/A1'},
      {item:"Clear-Com FreeSpeak II",qty:6,notes:'Hardwire PL positions'},
      {item:"Shure UA874",qty:1,notes:''},
      {item:"Neutrik NYS-SPP-L1 patchbay",qty:1,notes:''}
    ]);
    ensureLines('Transmission / Signal',[
      {item:"Harmonic XOS",qty:1,notes:'ENC1–6 Presentation Studio + Outside Announce → Meta NYC TOC FO'},
      {item:"Evertz EQX 32×32",qty:1,notes:'128×128 router'},
      {item:"Furman P-8 PRO C",qty:1,notes:''},
      {item:"Leader LT4610",qty:1,notes:''},
      {item:"Imagine Selenio X100",qty:1,notes:''},
      {item:"TSL TallyMan",qty:1,notes:''},
      {item:"Leader LV5600",qty:1,notes:'Waveform monitor'},
      {item:"EVS XS-VIA",qty:2,notes:'ISO record'},
      {item:"Camplex TAC-12 reel",qty:6,notes:'Muse Live trunks'},
      {item:"SMPTE 311M hybrid fiber",qty:6,notes:'CAM 1–6 shed runs'},
      {item:"LiveU LU800",qty:2,notes:'Presentation Studio Cam 2 + Outside Announce Cam 1 B/U'}
    ]);
    ensureLines('Power / Electrical',[
      {item:"Motion Laboratories 400A distro",qty:1,notes:'Double Technical Cabin · Lunch Box distro'},
      {item:"Motion Laboratories 400A distro",qty:2,notes:'Presentation Studio + Outside Announce Platform'},
      {item:"APC Smart-UPS SRT 8kVA",qty:3,notes:'Flypack + lighting worlds'},
      {item:"Furman P-8 PRO C",qty:2,notes:''},
      {item:"Anton/Bauer Dionic XT",qty:6,notes:''}
    ]);
    ensureLines('Monitors',[
      {item:"Sony PVM-X2400",qty:12,notes:'Production Office + set returns · routable'},
      {item:"TVLogic LUM-310R",qty:1,notes:'Tech / audio'},
      {item:"SKB 6U shock rack",qty:3,notes:''}
    ]);
    ensureLines('Engineering / CAD',[
      {item:"Sony RCP-1500",qty:1,notes:'FR7 PTZ control'},
      {item:"Vinten Vector 750",qty:1,notes:'Ped package'},
      {item:"Wiha insulated driver set",qty:1,notes:''},
      {item:"Pelican 1510",qty:1,notes:''},
      {item:"Magliner senior cart",qty:2,notes:''}
    ]);

    /* MPK finale fiber plant — 100 / 101 / 102 */
    if(!p.fiberLoc)p.fiberLoc={};
    var mid='mpk';
    var fl=p.fiberLoc[mid];
    if(!fl||!((fl.strands||[]).length)){
      function tid(s){return 'ftr-fwc-'+s;}
      function sid(t,i){return 'fst-fwc-'+t+'-'+i;}
      var trunks=[
        {id:tid('100'),label:'Fiber 100',cable:'TAC-12 Utility',mode:'OS2 · single-mode',from:'Tech Cabin',to:'Production Office',len:'150 ft',path:'A',notes:'Utility TAC-12 · Tech Cabin → Production Office'},
        {id:tid('101'),label:'Fiber 101',cable:'TAC-12 Utility',mode:'OS2 · single-mode',from:'Tech Cabin',to:'CIR',len:'1000 ft',path:'A',notes:'Utility TAC-12 · Tech Cabin → CIR'},
        {id:tid('102'),label:'Fiber 102',cable:'TAC-12 Utility',mode:'OS2 · single-mode',from:'Tech Cabin',to:'CIR',len:'1001 ft',path:'B',notes:'Utility TAC-12 · Tech Cabin → CIR (secondary)'}
      ];
      var map100=[
        [1,'TX','Prod Office Mon 1'],[2,'RX','Prod Office Mon 2'],[3,'TX','IPTV Media Converter'],[4,'RX',''],[5,'TX',''],[6,'RX',''],
        [7,'TX',''],[8,'RX',''],[9,'TX','Security Cam Media Converter'],[10,'RX','Security Cam Media Converter'],[11,'TX','Dante'],[12,'RX','Dante']
      ];
      var map101=[
        [1,'TX','Cam 1A'],[2,'RX','Cam 1B'],[3,'TX','Cam 2A'],[4,'RX','Cam 2B'],[5,'TX','Cam 3A'],[6,'RX','Cam 3B'],
        [7,'TX',"Evertz 7707 fiber Rx"],[8,'RX',"Evertz 7707 fiber Rx"],[9,'TX',"Evertz 7707 fiber Rx"],[10,'RX',"Evertz 7707 fiber Rx"],[11,'TX','Dante Primary'],[12,'RX','Dante Primary']
      ];
      var map102=[
        [1,'TX','Dante Secondary'],[2,'RX','Dante Secondary'],[3,'TX','DATA'],[4,'RX','Live Link'],[5,'TX','Live Link'],[6,'RX',''],
        [7,'TX',''],[8,'RX',''],[9,'TX',''],[10,'RX',''],[11,'TX',''],[12,'RX','']
      ];
      var strands=[];
      function pushMap(trunkId,from,to,len,map){
        map.forEach(function(row){
          strands.push({id:sid(trunkId,row[0]),trunk:trunkId,pos:row[0],mode:'OS2 · single-mode',path:row[1]==='TX'?'A':'B',
            from:from,to:to,conn:'ST',signal:row[2]||'',len:len,status:row[2]?'Terminated':'Spare',loss:'',cadRef:'',notes:row[1]||''});
        });
      }
      pushMap(tid('100'),'Tech Cabin','Production Office','150 ft',map100);
      pushMap(tid('101'),'Tech Cabin','CIR','1000 ft',map101);
      pushMap(tid('102'),'Tech Cabin','CIR','1001 ft',map102);
      p.fiberLoc[mid]={trunks:trunks,strands:strands};
      if(!p.fiber||!((p.fiber.strands||[]).length))p.fiber=p.fiberLoc[mid];
    }

    /* enrich the finale site */
    if(Array.isArray(p.locations)){
      p.locations.forEach(function(L){
        if(L.id==='mpk'){
          if(!L.address)L.address='1 Hacker Way, Menlo Park, CA 94025';
          L.note='Hacker Square · MUSE AI WORLD TOUR 2026 FINAL · Meta Field Ops · Jul 19 2026';
          L.role='FINAL · Meta Field Ops Flypack';
        }
      });
    }
  }catch(e){try{console&&console.warn&&console.warn('seedWorldcupPacklist',e);}catch(e2){}}
}

function ensureTB(p,key){
  var d=tbSpecs[key]||{};var t=p.tb||{};
  var def={cams:6,camModel:"Sony HDC-5500",lens:"Canon CJ45ex9.7B",console:"Calrec Apollo · Dante",audioCh:16,micModel:"Sennheiser MKH 416",rfMic:"Shure Axient Digital AD4Q + AD1",ifb:"RTS IFB-325",intercom:"RTS ADAM · Riedel Bolero",fiberType:"SMPTE single-mode",fiberLen:"1,000 ft",transport:"LiveU LU800",evs:"EVS XT-VIA",venueAddr:p.venue||"Location TBD",truck:"Jupiter"};
  for(var k in def){if(t[k]===undefined)t[k]=(d[k]!==undefined?d[k]:def[k]);}
  p.tb=t;
  // initialize editable per-department field values from specs (only if not already set)
  if(!p.tbFields)p.tbFields={};
  var tf=p.tbFields;
  function init(dep,obj){if(!tf[dep])tf[dep]={};for(var fk in obj){if(tf[dep][fk]===undefined&&obj[fk])tf[dep][fk]=obj[fk];}}
  var immersive=(parseInt(t.audioCh,10)||0)>=96;
  var isFwc=(key==='museaitour');
  init("Audio",{console:t.console,channels:t.audioCh+"ch",mics:t.micModel,mapping:isFwc?"Presentation Studio + Outside Announce map":(immersive?"5.1.4 immersive map":"FS1 / FS2 / FS3 standard"),ifb:t.ifb,stagebox:isFwc?"Calrec Hydra2":undefined,intercom:isFwc?t.intercom:undefined});
  seedRvonFor(p,t,key);
  init("Cameras / Video",{model:t.camModel,count:""+t.cams,lens:t.lens,config:isFwc?"Studio pedestal + Porta Jib + FR7 PTZ":"Studio · Vinten Vector 750",hardcams:isFwc?"3":undefined,ptzcount:isFwc?"3":undefined,transport:isFwc?"Single-mode fiber (TAC-12)":undefined,viewfinder:isFwc?"Sony HDVF-EL30":undefined,buildkit:isFwc?"Vinten Vector 750":undefined});
  init("Transmission / Signal",{transport:t.transport,format:(parseInt(t.cams,10)>=40?"256× SMPTE 2110":parseInt(t.cams,10)>=10?"64× SMPTE 2110":"16× HD-SDI"),backup:isFwc?"LiveU LU800/U":(t.transport.indexOf('Satellite')>-1?"Satellite (SES-1 @ 101W)":"LiveU LU800/U"),encoder:isFwc?"Harmonic XOS":undefined,encmap:isFwc?"ENC1–4 Presentation Studio · ENC5–6 Outside Announce · DEC1–6 Harmonic XOS returns":undefined,primarypath:isFwc?"Harmonic XOS (MPK→NYC TOC)":undefined,handoff:isFwc?"Double Technical Cabin · MPK NetEng Port 1/2":undefined,returnpath:isFwc?"PGM return fiber":undefined,redundancy:isFwc?"Fiber + cellular B/U":undefined,bandwidth:isFwc?"1 GB ×2 compound + 50 Mbps studio/platform":undefined});
  init("Power / Electrical",{source:isFwc?"Campus Power (A/B utility feeds)":"House Power + Generator",distro:isFwc?"Motion Laboratories 400A distro":(parseInt(t.cams,10)>=40?"Motion Laboratories 400A distro":"Motion Laboratories 400A distro"),ups:isFwc?"APC Smart-UPS SRT 8kVA":"APC Smart-UPS SRT 8kVA",tiein:isFwc?"Confirmed":undefined});
  init("Engineering / CAD",{evs:t.evs,cad:isFwc?"MPK Hacker Square CAD · Jul 19 2026":"CAD final · v4 signed off",siteplan:"Filed",router:isFwc?"Evertz EQX 32×32":undefined,sync:isFwc?"Leader LT4610":undefined});
  init("Graphics (GFX)",{system:"Chyron Prime",status:"In build"});
  init("Comms & IFB",{intercom:t.intercom,beltpacks:isFwc?"Riedel Bolero + RTS ADAM":"Riedel Bolero",backup:isFwc?"RTS ADAM + RTS IFB-325":"RTS ADAM"});
  init("RF / Wireless Mics",{mics:t.rfMic,coord:isFwc?"Coordinated · MPK compound":"In progress",band:"470–616 MHz"});
  init("Talent / Production",{talent:isFwc?"Presentation Studio hosts + Outside Announce Platform":"Sportscasters confirmed",position:isFwc?"Presentation Studio · Outside Announce Platform":"Booth A/B"});
  init("Legal / Rights",{rights:"In progress",clearances:"Archive in review"});
  init("Monitors",{size:isFwc?'55"':undefined,mount:isFwc?"Floor stand":undefined,feed:isFwc?"Routable":undefined,count:isFwc?"12":undefined});
  try{if(typeof seedWorldcupPacklist==='function')seedWorldcupPacklist(p,key);}catch(eFwc){}
  return p;
}
function normalizeAll(){for(var k in productions){ensureFields(productions[k]);ensureTB(productions[k],k);}}

/* ---- persistence (best-effort; in-memory always authoritative) ---- */
function museStorageBytes(){
  try{var n=0;for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);n+=(k?k.length:0)+((localStorage.getItem(k)||'').length);}return n*2;}catch(e){return 0;}
}
function museStoragePct(){ /* ~5MB soft ceiling for most browsers */
  var b=museStorageBytes();return Math.min(100,Math.round(b/(5*1024*1024)*100));
}
function museRefreshStorageChip(){
  try{
    var el=document.getElementById('museStorageChip');if(!el)return;
    var pct=museStoragePct();var mb=(museStorageBytes()/(1024*1024)).toFixed(1);
    el.textContent=mb+' MB';
    el.title='Browser storage used by Muse Live (~'+pct+'% of typical 5 MB quota). Export backup if high.';
    el.className='text-[9px] mono font-bold px-1.5 py-0.5 rounded border '+(pct>=85?'bg-red-50 text-red-700 border-red-200':(pct>=65?'bg-amber-50 text-amber-700 border-amber-200':'bg-gray-50 text-gray-500 border-gray-200'));
  }catch(e){}
}
function museExportStateBackup(){
  try{
    var blob=new Blob([JSON.stringify({
      formatVersion:2,
      productionRecords:productions,
      connectedRecords:localStorage.getItem("muselive_records_v1_operations"),
      wikiDatabase:localStorage.getItem("muselive_wiki_v2"),
      attachmentNote:"Attachment references are included. Export offline knowledge packs with media or upload attachments to shared storage to retain the files themselves.",
      exportedAt:new Date().toISOString(),
      version:(typeof document!=='undefined'?document.title:''),
      edits:museSerializeState(museBuildEdits(),false),
      custom:museSerializeState(museCustomState(),false),
      inventory:JSON.stringify(inventory),
      gear:JSON.stringify(deptFields)
    },null,2)],{type:'application/json'});
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);
    a.download='Muse_Live_backup_'+new Date().toISOString().slice(0,10)+'.json';
    document.body.appendChild(a);a.click();a.remove();
    toast&&toast('State backup downloaded — retain attachment files with an offline pack or shared storage');
    setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
  }catch(e){toast&&toast('Backup failed — storage may be full');}
}
function museBuildEdits(){
  var edits={};order.forEach(function(k){edits[k]={dept:productions[k].dept,tbFields:productions[k].tbFields,tbEquip:productions[k].tbEquip,vendors:productions[k].vendors,crewMatrix:productions[k].crewMatrix,crew:productions[k].crew,invItems:productions[k].invItems,survey:productions[k].survey,labor:productions[k].labor,sched:productions[k].sched,approvals:productions[k].approvals,activity:productions[k].activity,tasks:productions[k].tasks,signoff:productions[k].signoff,packStatus:productions[k].packStatus,deptLoc:productions[k].deptLoc,surveyLoc:productions[k].surveyLoc,vendorsLoc:productions[k].vendorsLoc,fiber:productions[k].fiber,fiberLoc:productions[k].fiberLoc,locations:productions[k].locations,ifbRoute:productions[k].ifbRoute,deptUI:productions[k].deptUI,audioAssets:productions[k].audioAssets,replay:productions[k].replay,gfxAssets:productions[k].gfxAssets,travelReqs:productions[k].travelReqs,plan:productions[k].plan,deptChecks:productions[k].deptChecks,siteCheckins:productions[k].siteCheckins,broadcastOps:productions[k].broadcastOps};});
  return edits;
}
function museSerializeState(value,omitMedia){
  return JSON.stringify(value,omitMedia?function(key,item){
    if(item&&typeof item==='object'&&typeof item.dataUri==='string'){
      var copy={};Object.keys(item).forEach(function(k){if(k!=='dataUri')copy[k]=item[k];});
      copy.persisted=false;return copy;
    }
    return item;
  }:undefined);
}
function museCustomState(){var custom={};order.forEach(function(k){if(productions[k].custom)custom[k]=productions[k];});return {order:order,custom:custom};}
var _museStorageBase=null,_museSavedWorking=null,_museSaveScheduled=false;
function saveState(){
  if(typeof navigator!=='undefined'&&navigator.locks){
    if(_museSaveScheduled)return true;
    _museSaveScheduled=true;
    navigator.locks.request('muselive-edits',function(){_museSaveScheduled=false;return museSaveStateNow();})
      .catch(function(){_museSaveScheduled=false;if(typeof toast==='function')toast('Save failed. Export a recovery backup before closing.');});
    return true;
  }
  return museSaveStateNow();
}
function museSaveStateNow(){
  var edits=museBuildEdits(),ok=false,omitMedia=false;
  var stored=typeof localStorage.getItem==='function'?(localStorage.getItem('muselive_edits')||''):'';
  if(typeof _museStorageBase!=='undefined'&&_museStorageBase!==null&&stored!==_museStorageBase){
    if(typeof toast==='function')toast('Another tab changed these records. Your work is retained. Export a backup before reloading to reconcile.');
    return false;
  }
  try{var serialized=museSerializeState(edits,false);if(serialized!==stored)localStorage.setItem('muselive_edits',serialized);ok=true;}
  catch(eq){
    try{
      // Strip inline media only from the serialized copy. Keep working data intact.
      localStorage.setItem('muselive_edits',museSerializeState(edits,true));ok=true;omitMedia=true;
      if(typeof toast==='function')toast('Storage full — media remains in this session only. Export a backup before closing.');
    }catch(eq2){
      if(typeof toast==='function')toast('SAVE FAILED — current work is not saved. Downloading a recovery backup.');
      try{museExportStateBackup();}catch(e3){}
    }
  }
  if(ok){
    if(typeof _museStorageBase!=='undefined')_museStorageBase=museSerializeState(edits,omitMedia);
    if(typeof _museSavedWorking!=='undefined')_museSavedWorking=museSerializeState(edits,false);
    if(museSerializeState(edits,omitMedia)!==stored){try{localStorage.setItem('muselive_edits_rev',String(Date.now()));}catch(eRev){}}
  }
  try{localStorage.setItem('muselive_custom',museSerializeState(museCustomState(),omitMedia));}catch(e){
    if(typeof toast==='function')toast('Custom productions could not be saved. Export a backup before closing.');
  }
  try{museRefreshStorageChip();}catch(e4){}
  
  return ok;
}
function saveGear(){try{localStorage.setItem('muselive_gear',JSON.stringify(deptFields));}catch(e){}}
function loadState(){try{
  _museStorageBase=localStorage.getItem('muselive_edits')||'';
  var g=localStorage.getItem('muselive_gear');if(g){var gl=JSON.parse(g);if(gl&&typeof gl==='object'){deptFields=gl;
    // merge in any newly-added default options so fresh gear always appears
    try{Object.keys(DEFAULT_DEPT_FIELDS).forEach(function(dep){
      if(!deptFields[dep]){deptFields[dep]=JSON.parse(JSON.stringify(DEFAULT_DEPT_FIELDS[dep]));return;}
      DEFAULT_DEPT_FIELDS[dep].forEach(function(df){
        var ef=deptFields[dep].filter(function(x){return x[0]===df[0];})[0];
        if(!ef){deptFields[dep].push(JSON.parse(JSON.stringify(df)));}
        else if(Array.isArray(df[2])&&Array.isArray(ef[2])){df[2].forEach(function(opt){if(ef[2].indexOf(opt)<0)ef[2].push(opt);});}
      });
    });
    // v3: collapse legacy Audio RVON gear into the unified control (drop "rvonalphas", retype "rvon")
    try{if(deptFields.Audio){deptFields.Audio=deptFields.Audio.filter(function(fld){return fld[0]!=='rvonalphas';});
      for(var _ri=0;_ri<deptFields.Audio.length;_ri++){if(deptFields.Audio[_ri][0]==='rvon'){deptFields.Audio[_ri]=["rvon","RVON (Channels \u00b7 Alphas)",RVON_ALPHA_POOL.slice(),"rvon"];break;}}}}catch(e){}
    // v30 review fix: saved v28 catalogs typed host_name as free text \u2014 retype it to the
    // roster dropdown (keeping any custom names the user had added as extra options)
    try{if(deptFields['Talent / Production']){var _tp=deptFields['Talent / Production'];
      for(var _hi=0;_hi<_tp.length;_hi++){if(_tp[_hi][0]==='host_name'){
        var _old=Array.isArray(_tp[_hi][2])?_tp[_hi][2]:[];
        var _mg=IFB_HOST_TALENT.slice();_old.forEach(function(o){if(_mg.indexOf(o)<0)_mg.push(o);});
        _tp[_hi]=["host_name","Host Name",_mg];break;}}}}catch(e){}
    saveGear();}catch(e){}
  }}
  var vd=localStorage.getItem('muselive_vendors');if(vd){var vl=JSON.parse(vd);if(Array.isArray(vl)&&vl.length)vendors=vl;}
  var raw=localStorage.getItem('muselive_custom');if(raw){var o=JSON.parse(raw);if(o&&o.custom){for(var k in o.custom){if(!productions[k]){productions[k]=o.custom[k];productions[k].name=museCleanName(productions[k].name);}}if(o.order&&o.order.length){o.order.forEach(function(k){if(order.indexOf(k)<0&&productions[k])order.push(k);});}}}
  var er=localStorage.getItem('muselive_edits');if(er){var e=JSON.parse(er);for(var k2 in e){if(!productions[k2])continue;var ed=e[k2];
    if(Array.isArray(ed)){if(ed.length===productions[k2].dept.length)productions[k2].dept=ed;} // legacy format
    else if(ed){if(Array.isArray(ed.dept)){ed.dept.forEach(function(sd){if(!Array.isArray(sd))return;var cur=null;for(var z=0;z<productions[k2].dept.length;z++){if(productions[k2].dept[z][0]===sd[0]){cur=productions[k2].dept[z];break;}}if(cur){cur[1]=sd[1];cur[2]=sd[2];if(sd.__customNote)cur.__customNote=sd.__customNote;}else{productions[k2].dept.push(sd.slice());}});}if(ed.tbFields)productions[k2].tbFields=ed.tbFields;if(ed.tbEquip)productions[k2].tbEquip=ed.tbEquip;if(ed.vendors)productions[k2].vendors=ed.vendors;if(ed.crewMatrix)productions[k2].crewMatrix=ed.crewMatrix;if(ed.crew)productions[k2].crew=ed.crew;if(ed.invItems)productions[k2].invItems=ed.invItems;if(ed.survey)productions[k2].survey=ed.survey;if(ed.labor)productions[k2].labor=ed.labor;if(ed.sched)productions[k2].sched=ed.sched;if(ed.approvals)productions[k2].approvals=ed.approvals;if(ed.activity)productions[k2].activity=ed.activity;if(ed.tasks)productions[k2].tasks=ed.tasks;if(ed.signoff)productions[k2].signoff=ed.signoff;if(ed.packStatus)productions[k2].packStatus=ed.packStatus;if(ed.deptLoc)productions[k2].deptLoc=ed.deptLoc;if(ed.surveyLoc)productions[k2].surveyLoc=ed.surveyLoc;if(ed.vendorsLoc)productions[k2].vendorsLoc=ed.vendorsLoc;if(ed.fiber)productions[k2].fiber=ed.fiber;if(ed.fiberLoc)productions[k2].fiberLoc=ed.fiberLoc;if(ed.locations)productions[k2].locations=ed.locations;if(ed.ifbRoute)productions[k2].ifbRoute=ed.ifbRoute;if(ed.deptUI)productions[k2].deptUI=ed.deptUI;if(ed.audioAssets)productions[k2].audioAssets=ed.audioAssets;if(ed.replay)productions[k2].replay=ed.replay;if(ed.gfxAssets)productions[k2].gfxAssets=ed.gfxAssets;if(ed.travelReqs)productions[k2].travelReqs=ed.travelReqs;if(ed.plan)productions[k2].plan=ed.plan;if(ed.deptChecks)productions[k2].deptChecks=ed.deptChecks;if(ed.siteCheckins)productions[k2].siteCheckins=ed.siteCheckins;if(ed.broadcastOps)productions[k2].broadcastOps=ed.broadcastOps;}}}
  /* permanent showcase: Ray-Ban Meta Gen 3 Launch always fully approved / 100% */
  try{ensureSail250Complete();}catch(eS){}
  try{if(typeof MuseBOps!=='undefined'&&MuseBOps.seedShowcase)MuseBOps.seedShowcase();}catch(eB){}
}catch(e){}}
function ensureSail250Complete(){
  var p=productions.raybangen3;if(!p)return;
  function take(name){
    var i,d=null;
    for(i=0;i<(p.dept||[]).length;i++){if(p.dept[i][0]===name){d=p.dept[i];break;}}
    return d;
  }
  function put(name,status,note){
    var d=take(name);
    if(d){d[1]=status||'approved';if(note&&(!d[2]||d[2]==='—'))d[2]=note;}
    else p.dept.push([name,status||'approved',note||'—']);
  }
  var engCad=take('Engineering / CAD');
  put('Engineering','approved',(engCad&&engCad[2])||"EVS XT-VIA · MPK plant confirmed");
  put('CAD','approved','MPK Classroom Stage site plan filed · flypack layout locked');
  put('Lighting','approved','Classroom Stage LED grid + practicals · house power');
  put('Monitors','approved','Director + talent returns at HB-2');
  put('Networking / IT','approved',"LiveU LU800 + PCR 4 plant VLAN");
  put('Miscellaneous / Consumables','approved','MPK Classroom Stage pack closed');
  try{ensureAllDepts(p);}catch(eA){}
  try{ensureFields(p);}catch(eF){}
  (p.dept||[]).forEach(function(d){
    if(!d||!d.length)return;
    d[1]='approved';
    if(d[0]==='Legal / Rights'&&(!d[2]||/outstanding|pending/i.test(d[2])))d[2]='TOC final signal confirmed · rights cleared';
  });
  if(!p.tbFields)p.tbFields={};
  if(!p.tbFields['Transmission / Signal'])p.tbFields['Transmission / Signal']={};
  var tx=p.tbFields['Transmission / Signal'];
  if(!tx.transport)tx.transport="LiveU LU800";
  if(!tx.liveuserial)tx.liveuserial='LU600-SAIL-7741';
  if(!tx.bandwidth)tx.bandwidth='25 Mbps bonded';
  if(!p.tbFields['Cameras / Video'])p.tbFields['Cameras / Video']={};
  var cam=p.tbFields['Cameras / Video'];
  if(!cam.transport)cam.transport='SMPTE fiber · stage run';
  if(!cam.cable)cam.cable='SMPTE 311m';
  if(!cam.lens)cam.lens="Canon CJ45ex9.7B";
  if(!cam.config)cam.config='Classroom Stage sticks · 4× HDC-3500';
  p.completeShowcase=true;p.tagColor='emerald';
  applyReadiness(p);
}

/* ---- dynamic tabs ---- */
function renderTabs(){var box=document.getElementById('projectTabs');if(box){
  box.innerHTML=order.map(function(k){var p=productions[k];var c=countStatus(p);var pct=computePct(p);
    var badge=museBadgeHTML(c.missing);
    return '<button data-view="'+k+'" class="tab-inactive prod-menu-row w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left">'+
      '<span class="flex items-center gap-2 min-w-0"><span class="w-2 h-2 rounded-full flex-shrink-0" style="background:'+(dotBg[p.tagColor]||'#b0b3b8')+'"></span><span class="truncate font-semibold">'+(p.tab||p.name)+'</span></span>'+
      '<span class="flex items-center gap-2 flex-shrink-0"><span class="mono text-[9px] font-bold '+pctColor(pct)+'">'+pct+'%</span>'+badge+'</span></button>';
  }).join('');}

  renderMobileNav();
}
/* aggregate everything that needs the user's attention → drives the hamburger badge */
/* Only things that need someone to act: shows still ahead with missing departments (one per
   show), unread critical messages, schedule conflicts, overdue AP and open SEV-1/2 incidents. */
function attentionCount(){var n=0;
  try{order.forEach(function(k){var p=productions[k];if(!p||p.status==='Complete')return;if(countStatus(p).missing)n++;});}catch(e){}
  try{if(typeof MuseSchedule!=='undefined'&&MuseSchedule.conflicts)n+=MuseSchedule.conflicts().length;else if(typeof npcAlertConflicts==='function')n+=npcAlertConflicts().length;}catch(e){}
  try{if(typeof commsUnreadCritical==='function')n+=commsUnreadCritical();}catch(e){}
  try{if(typeof apExceptionCount==='function')n+=apExceptionCount();}catch(e){}
  try{if(typeof MuseIncidents!=='undefined')n+=MuseIncidents.all().filter(function(i){return (i.severity==='SEV-1'||i.severity==='SEV-2')&&(i.status==='Open'||i.status==='Monitoring');}).length;}catch(e){}
  return n;}
/* ---- LEFT NAV RAIL (icon sidebar) — always mounted, no slide animation ---- */
function renderBurgerBadge(){
  /* the menu items carry their own badges — the burger shows none (no duplicate totals) */
  var n=0;
  var hb=document.getElementById('navRailHeaderToggle');
  var rb=document.getElementById('navRailToggle');
  museMountBadge(hb,n,'Open menu');
  museMountBadge(rb,n,'Expand menu');
  ['burgerBadge','headerBurgerBadge'].forEach(function(id){
    var el=document.getElementById(id);
    if(el&&el.classList&&(el.classList.contains('omni-fab-badge')||el.classList.contains('muse-burger-dot')||el.classList.contains('nav-rail-attn'))){
      el.innerHTML='';
    }
  });
}
function _navSvg(name){
  var p={
    dashboard:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    schedule:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    eng:'<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3"/>',
    personnel:'<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><circle cx="18" cy="9" r="2.5"/><path d="M16.5 14c2.8.3 5 2.3 5 5"/>',
    portal:'<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    omni:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    equipment:'<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12"/>',
    vendors:'<path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/>',
    finance:'<path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    kb:'<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    telemetry:'<path d="M12 20v-6"/><circle cx="12" cy="10" r="2.2"/><path d="M5.1 8.1a9 9 0 0 1 13.8 0"/><path d="M2.5 5.2a13 13 0 0 1 19 0"/><path d="M8.5 16.5 6 21h12l-2.5-4.5"/>',
    streams:'<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M10 9.5v5l4.5-2.5z"/><path d="M6 2.5l2 2.5M18 2.5l-2 2.5"/>',
    incidents:'<path d="M12 3 2.5 19.5h19z"/><path d="M12 10v4.5M12 17.2v.01"/>',
    folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    glasses:'<rect x="2.5" y="9" width="7.5" height="6" rx="3"/><rect x="14" y="9" width="7.5" height="6" rx="3"/><path d="M10 12h4"/><path d="M2.5 10.5 1.5 7M21.5 10.5l1-3.5"/>',
    command:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'
  }[name]||'';
  return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg>';
}
function _navRailBadge(n,kind){
  if(!n)return '';
  var cls=kind==='red'?'nav-rail-badge is-red':(kind==='live'?'nav-rail-badge is-live':'nav-rail-badge is-blue');
  return museBadgeHTML(n);
}
function navRailActiveView(){
  var id=(document.querySelector('.view-pane.active')||{}).id||'';
  return id.replace('view-','')||'dashboard';
}
/** Full rebuild of rail contents (data/badges changed). Keep cheap. */
function renderMobileNav(){renderNavRail();}
function renderNavRail(){
  var prim=document.getElementById('navRailPrimary');
  var prods=document.getElementById('navRailProds');
  if(!prim||!prods)return;
  var active=navRailActiveView();
  /* Priority order: live ops → active work → reference. Daily-use ranking, not alphabetical. */
  var primary=[
    ['dashboard','Dashboard','dashboard'],
    ['schedule','Master Schedule','schedule'],
    ['streams','Live Streams','streams'],
    ['comms','Omni','omni'],
    ['engrequests','ENG Requests','eng'],
    ['incidents','Incidents','incidents'],
    ['telemetry','Telemetry','telemetry'],
    ['personnel','Personnel','personnel'],
    ['equipment','Equipment','equipment'],
    ['portal',((typeof permIsAdmin!=='function')||permIsAdmin())?'Travel Portal':'My Travel','portal']
  ];
  if(typeof permCan!=='function'||permCan('finance'))primary.push(['finance','Finance','finance']);
  if(typeof permCan!=='function'||permCan('vendors'))primary.push(['vendors','Vendors','vendors']);
  primary.push(['kb','Wiki','kb']);

  var engN=0; /* ENG requests in flight are informational, not a call to action */
  var omniN=(typeof commsUnreadCritical==='function')?commsUnreadCritical():0;
  var apN=(typeof apExceptionCount==='function')?apExceptionCount():0;
  var schedConflicts=0;try{schedConflicts=MuseSchedule.conflicts().length;}catch(e){} // same count as the Muse Schedule drawer
  var npcN=schedConflicts;

  /* Glasses sits directly under Dashboard: the companion is second, not last. */
  var glassesBtn='<button type="button" data-nav="glasses" class="nav-rail-btn" onclick="window.open(\'/glasses/preview.html\',\'_blank\',\'noopener\')" title="Glasses — Meta Ray-Ban Display companion" aria-label="Open the Meta Ray-Ban Display companion app">'+
      '<span class="nav-rail-ico">'+_navSvg('glasses')+'</span><span class="nav-rail-label">Glasses</span></button>';
  var primItems=primary.map(function(it){
    var id=it[0],label=it[1],icon=it[2];
    var badge='';
    if(id==='engrequests'&&engN)badge=_navRailBadge(engN,'blue');
    if(id==='finance'&&apN)badge=_navRailBadge(apN,'red');
    if(id==='comms'&&omniN)badge=_navRailBadge(omniN,'red');
    if(id==='schedule'&&schedConflicts)badge=_navRailBadge(schedConflicts,'live');
    var onNav=(active===id)||(id==='telemetry'&&!!window._museTeleFocus);
    // Finance with overdue AP goes straight to the Accounts Payable tab — the bubble names its origin.
    var go=(id==='finance'&&apN)?'navGoFin()':('navGo(\''+id+'\')');
    var tip=(id==='finance'&&apN)?(apN+' overdue AP invoice'+(apN>1?'s':'')+' — open Accounts Payable'):(id==='comms'&&omniN)?(omniN+' unread critical — open Omni'):label.replace(/"/g,'&quot;');
    return '<button type="button" data-nav="'+id+'" class="nav-rail-btn'+(onNav?' is-active':'')+'" onclick="'+go+'" title="'+tip+'" aria-label="'+tip+'" aria-current="'+(onNav?'page':'false')+'">'+
      '<span class="nav-rail-ico">'+_navSvg(icon)+'</span><span class="nav-rail-label">'+label+'</span>'+badge+'</button>';
  });
  /* Glasses rides second, right under Dashboard — splice, don't append. */
  primItems.splice(1,0,glassesBtn);
  prim.innerHTML=primItems.join('')+
    (npcN?
    '<button type="button" data-nav="schedule" class="nav-rail-btn nav-rail-btn-warn" onclick="navGo(\'schedule\');MuseSchedule.openFor(\'\',\'conflicts\')" title="⚠ '+npcN+' conflict'+(npcN>1?'s':'')+'" aria-label="Conflicts">'+
      '<span class="nav-rail-ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>'+
      '<span class="nav-rail-label">Conflicts</span>'+_navRailBadge(npcN,'live')+'</button>':'');

  var prodOpen=false;
  try{prodOpen=localStorage.getItem('muselive_nav_projects')==='1';}catch(eP){}
  if(productions[active])prodOpen=true;
  var missTotal=0;
  var kids=order.map(function(k){
    var p=productions[k];if(!p)return '';
    var c=countStatus(p);var on=(active===k);var pct=computePct(p);
    var name=p.tab||p.name||k;
    var tip=name+' · '+pct+'%'+(c.missing?' · '+c.missing+' open':'');
    var miss=(c.missing&&p.status!=='Complete')?_navRailBadge(c.missing,'red'):'';
    if(c.missing)missTotal+=c.missing;
    var letter=((name).charAt(0)||'?').toUpperCase();
    return '<button type="button" data-nav="'+k+'" class="nav-rail-btn nav-rail-prod'+(on?' is-active':'')+'" onclick="navGo(\''+k+'\')" title="'+tip.replace(/"/g,'&quot;')+'" aria-label="'+tip.replace(/"/g,'&quot;')+'" aria-current="'+(on?'page':'false')+'">'+
      '<span class="nav-rail-ico nav-rail-prod-ico"><span class="nav-rail-prod-dot" style="background:'+(dotBg[p.tagColor]||'#b0b3b8')+'"></span><span class="nav-rail-prod-letter">'+letter+'</span></span>'+
      '<span class="nav-rail-label">'+esc(name)+'</span>'+miss+
    '</button>';
  }).join('');
  var folderOn=!!productions[active];
  /* collapsed only (open = children show their own): number of upcoming shows with missing departments */
  var showsNeeding=0;try{order.forEach(function(k){var p=productions[k];if(p&&p.status!=='Complete'&&countStatus(p).missing)showsNeeding++;});}catch(eF){}
  var folderBadge=(!prodOpen&&showsNeeding)?_navRailBadge(showsNeeding,'red'):'';
  prods.innerHTML=
    '<button type="button" data-nav="projects" class="nav-rail-btn'+(folderOn?' is-active':'')+(prodOpen?' is-open':'')+'" onclick="toggleNavProjects()" title="Projects" aria-label="Projects" aria-expanded="'+(prodOpen?'true':'false')+'">'+
      '<span class="nav-rail-ico">'+_navSvg('folder')+'</span><span class="nav-rail-label">Projects</span>'+folderBadge+
    '</button>'+
    '<div id="navRailProdList" class="nav-rail-folder'+(prodOpen?' is-open':'')+'">'+kids+'</div>';
  try{renderBurgerBadge();}catch(e){}
  try{syncNavRailExpandUI();}catch(e){}
}
/** Zero-lag active highlight — classList only, no rebuild */
function navRailSetActive(view){
  var rail=document.getElementById('navRail');if(!rail)return;
  var btns=rail.querySelectorAll('[data-nav]');
  for(var i=0;i<btns.length;i++){
    var b=btns[i];
    var nav=b.getAttribute('data-nav');
    var on=nav===view;
    if(nav==='projects'&&productions[view])on=true;
    if(nav==='telemetry'&&window._museTeleFocus)on=true;
    if(nav==='dashboard'&&window._museTeleFocus)on=false;
    if(on){b.classList.add('is-active');b.setAttribute('aria-current','page');}
    else{b.classList.remove('is-active');b.setAttribute('aria-current','false');}
  }
}
function toggleNavProjects(){
  var open=false;
  try{open=localStorage.getItem('muselive_nav_projects')==='1';}catch(e){}
  open=!open;
  try{localStorage.setItem('muselive_nav_projects',open?'1':'0');}catch(e2){}
  if(open&&!navRailExpanded())toggleNavRail(true);
  var folder=document.querySelector('#navRailProds [data-nav="projects"]');
  var list=document.getElementById('navRailProdList');
  if(folder){folder.classList.toggle('is-open',open);folder.setAttribute('aria-expanded',open?'true':'false');}
  if(list)list.classList.toggle('is-open',open);
}
function navGoFin(){
  try{if(typeof finWsTab!=='undefined')finWsTab['all']='ap';}catch(e){}
  navGo('finance');
}
function navGo(view){
  window._museTeleFocus=false;
  /* collapse expanded rail on mobile after pick so content regains width */
  try{if(window.matchMedia&&window.matchMedia('(max-width:767px)').matches)toggleNavRail(false);}catch(e){}
  switchView(view);
}
function navRailExpanded(){return document.body.classList.contains('nav-rail-expanded');}
function museIsPhone(){try{return !!(window.matchMedia&&window.matchMedia('(max-width:767px)').matches);}catch(e){return false;}}
function syncNavRailExpandUI(){
  var exp=navRailExpanded();
  var t=document.getElementById('navRailToggle');
  var hb=document.getElementById('navRailHeaderToggle');
  var scrim=document.getElementById('navRailScrim');
  if(t){t.setAttribute('aria-expanded',exp?'true':'false');t.title=exp?'Collapse menu':'Expand menu';}
  if(hb){hb.setAttribute('aria-expanded',exp?'true':'false');hb.title=exp?'Close menu':'Open menu';hb.setAttribute('aria-label',exp?'Close menu':'Open menu');}
  if(scrim){if(exp&&window.matchMedia&&window.matchMedia('(max-width:900px)').matches){scrim.hidden=false;}else{scrim.hidden=true;}}
}
function toggleNavRail(force){
  var on=(force===true||force===false)?force:!navRailExpanded();
  document.body.classList.toggle('nav-rail-expanded',on);
  try{if(!museIsPhone())localStorage.setItem('muselive_navrail',on?'1':'0');}catch(e){}
  syncNavRailExpandUI();
}
function navRailInit(){
  try{
    if(museIsPhone())document.body.classList.remove('nav-rail-expanded');
    else if(localStorage.getItem('muselive_navrail')==='1')document.body.classList.add('nav-rail-expanded');
  }catch(e){}
  syncNavRailExpandUI();
}
/* legacy aliases (call sites / harness) */
var mobileMenuOpen=false;
function toggleMobileMenu(){toggleNavRail();}
function mobileGo(view){navGo(view);}

/* ---- portfolio overview (stats + rows) ---- */
var portfolioFilter='all';
function setPortfolioFilter(f){portfolioFilter=(portfolioFilter===f?'all':f);renderPortfolio();}
function portfolioPhase(k){var pct=computePct(productions[k]);if(pct>=60)return'active';if(pct>=40)return'prep';if(pct>=20)return'plan';return'risk';}
function renderPortfolio(){
  var stats=document.getElementById('portfolioStats');var rows=document.getElementById('portfolioRows');if(!rows)return;
  var total=order.length,active=0,prep=0,risk=0,plan=0;
  order.forEach(function(k){var ph=portfolioPhase(k);if(ph==='active')active++;else if(ph==='prep')prep++;else if(ph==='plan')plan++;else risk++;});
  function tile(id,n,label,dot){var on=(portfolioFilter===id);
    return '<button type="button" onclick="setPortfolioFilter(\''+id+'\')" aria-pressed="'+on+'" class="meta-stat'+(on?' is-on':'')+'">'+
      '<span class="meta-stat-n">'+n+'</span><span class="meta-stat-l">'+(dot?'<i style="background:'+dot+'"></i>':'')+label+'</span></button>';}
  if(stats)stats.innerHTML=
    tile('all',total,'Total','')+
    tile('active',active,'Active','#31A24C')+
    tile('prep',prep,'Pre-production','#F7B928')+
    tile('risk',risk,'At risk','#E41E3F')+
    tile('plan',plan,'Planning','#8A8D91');
  var shownKeys=order.filter(function(k){return portfolioFilter==='all'||portfolioPhase(k)===portfolioFilter;});
  if(!shownKeys.length){rows.innerHTML='<p class="text-[11px] text-gray-400 text-center py-6">No productions in this category. <button onclick="setPortfolioFilter(\'all\')" class="text-blue-700 font-bold hover:underline">Show all</button></p>';return;}
  rows.innerHTML=(portfolioFilter!=='all'?'<div class="flex items-center justify-between mb-1"><span class="text-[9px] font-bold uppercase tracking-wider text-gray-400">Filtered: '+portfolioFilter+' ('+shownKeys.length+')</span><button onclick="setPortfolioFilter(\'all\')" class="text-[9px] font-bold text-blue-700 hover:underline">Clear filter ✕</button></div>':'')+
    shownKeys.map(function(k){var p=productions[k];var pct=computePct(p);var ph=phaseFor(p);var tc=p.tagColor||'gray';
    return '<div onclick="openProject(\''+k+'\')" class="flex items-center gap-3 cursor-pointer hover:bg-gray-50 rounded-lg -mx-1 px-1 py-0.5 transition-colors">'+
      '<div class="w-2 h-2 rounded-full flex-shrink-0" title="'+pct+'% ready" style="background:'+(pct>=90?'#31A24C':pct>=60?'#F7B928':pct>=40?'#F5832A':'#E41E3F')+'"></div>'+
      '<span class="text-[11px] font-semibold text-gray-800 flex-shrink-0 truncate" style="width:13rem">'+(p.tab||p.name)+'</span>'+
      '<div class="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden"><div class="h-full rounded-full" style="width:'+pct+'%;background:linear-gradient(90deg,#E4E6EB 0%,#0866FF 65%,#0064E0 100%)"></div></div>'+
      '<span class="text-[11px] font-semibold text-gray-600 flex-shrink-0" style="width:9.5rem">'+pct+'% · '+ph.label+'</span>'+
      '<span class="text-[11px] text-right text-gray-500 flex-shrink-0" style="width:4.5rem">'+(p.date||'TBD')+'</span></div>';
  }).join('');
}

/* ---- ENG Requests dashboard overview (mirror of Portfolio Overview) ---- */
var engPortFilter='all';
function setEngPortFilter(f){engPortFilter=(engPortFilter===f?'all':f);renderEngPortfolio();}
function engStatusGroup(s){if(s==='Complete')return'complete';if(s==='On Location'||s==='Gear Pulled')return'inflight';return'planning';}
function renderEngPortfolio(){
  if(typeof engRequests==='undefined'){return;}
  try{loadEngOnce();}catch(e){}
  var stats=document.getElementById('engPortfolioStats');var rows=document.getElementById('engPortfolioRows');if(!rows)return;
  var total=engRequests.length;
  var planning=engRequests.filter(function(e){return engStatusGroup(e.status)==='planning';}).length;
  var inflight=engRequests.filter(function(e){return engStatusGroup(e.status)==='inflight';}).length;
  var complete=engRequests.filter(function(e){return engStatusGroup(e.status)==='complete';}).length;
  function tile(id,n,label,dot){var on=(engPortFilter===id);
    return '<button type="button" onclick="setEngPortFilter(\''+id+'\')" aria-pressed="'+on+'" class="meta-stat'+(on?' is-on':'')+'">'+
      '<span class="meta-stat-n">'+n+'</span><span class="meta-stat-l">'+(dot?'<i style="background:'+dot+'"></i>':'')+label+'</span></button>';}
  if(stats)stats.innerHTML=
    tile('all',total,'Total','')+
    tile('inflight',inflight,'In flight','#F5832A')+
    tile('complete',complete,'Complete','#31A24C')+
    '<button type="button" onclick="setEngPortFilter(\'planning\')" aria-pressed="'+(engPortFilter==='planning')+'" class="meta-stat col-span-3'+(engPortFilter==='planning'?' is-on':'')+'"><span class="meta-stat-n">'+planning+'</span><span class="meta-stat-l"><i style="background:#8A8D91"></i>Planning / requested</span></button>';
  var shown=engRequests.filter(function(e){return engPortFilter==='all'||engStatusGroup(e.status)===engPortFilter;});
  if(!shown.length){rows.innerHTML='<div class="text-center py-6"><p class="text-[11px] text-gray-400">'+(total?'No ENG requests in this category. ':'No ENG requests yet. ')+'<button onclick="'+(total?'setEngPortFilter(\'all\')':'switchView(\'engrequests\')')+'" class="text-blue-700 font-bold hover:underline">'+(total?'Show all':'Create one →')+'</button></p></div>';return;}
  rows.innerHTML=(engPortFilter!=='all'?'<div class="flex items-center justify-between mb-1"><span class="text-[9px] font-bold uppercase tracking-wider text-gray-400">Filtered ('+shown.length+')</span><button onclick="setEngPortFilter(\'all\')" class="text-[9px] font-bold text-blue-700 hover:underline">Clear ✕</button></div>':'')+
    shown.map(function(e){var p=productions[e.prod]||{name:e.prod};var locked=engIsLocked(e);
    return '<div onclick="openProjEng(\''+e.id+'\')" class="flex items-center gap-3 cursor-pointer hover:bg-gray-50 rounded-lg -mx-1 px-1.5 py-1 transition-colors">'+
      '<div class="w-2 h-2 rounded-full flex-shrink-0" style="background:'+(dotBg[p.tagColor]||'#b0b3b8')+'"></div>'+
      '<div class="min-w-0 flex-1"><div class="flex items-center gap-1.5"><span class="text-[11px] font-semibold text-gray-800 truncate">'+esc(e.name)+'</span></div>'+
        '<p class="text-[9px] text-gray-500 mono truncate">'+esc(p.tab||p.name)+' · '+(function(){var nc=(e.cameras&&e.cameras.length)?e.cameras.length:1;var b=(e.cameras&&e.cameras.length?e.cameras[0].camera:e.camera)||'camera TBD';return esc(nc>1?nc+'× cam · '+b:b);})()+((e.liveus&&e.liveus.length)?' · '+esc(e.liveus.length>1?e.liveus.length+"× LiveU LU800":e.liveus[0].model):'')+'</p></div>'+
      '<span class="flex-shrink-0">'+engStatusPill(e.status)+'</span>'+
      '<span class="text-[9px] mono font-bold text-right text-gray-500 flex-shrink-0" style="width:5rem">'+esc(e.window||'TBD')+'</span></div>';
  }).join('');
}
function openProjEng(id){var e=engById(id);if(!e)return;
  // open editor if not locked, otherwise jump to the ENG board
  if(engIsLocked(e)){switchView('engrequests');toast(e.id+' is locked ('+e.status+')');}
  else openEngModal(id);}
var snapFilter="All";
function setSnapFilter(c){snapFilter=c;renderSnapFilters();renderSnapshot();}
function renderSnapFilters(){var box=document.getElementById('snapFilterPills');if(!box)return;
  // clients that actually have productions, in canonical order
  var present=customerList.filter(function(c){return order.some(function(k){return productions[k].customer===c;});});
  var pills=["All"].concat(present);
  box.innerHTML=pills.map(function(c){var active=(snapFilter===c);
    var n=(c==="All")?order.length:order.filter(function(k){return productions[k].customer===c;}).length;
    if(c==="All"){
      var allSt=active
        ?'background:#18191A;color:#ffffff;border:1px solid #18191A'
        :'background:#ffffff;color:#3E4042;border:1px solid #ced0d4';
      return '<button type="button" onclick="setSnapFilter(\'All\')" class="text-xs font-semibold px-3.5 py-1.5 rounded-full whitespace-nowrap" style="'+allSt+'">All <span style="font-weight:800;margin-left:4px;color:'+(active?'#ffffff':'#18191A')+'">'+n+'</span></button>';
    }
    var s=customerStyle[c]||customerStyle["External Productions"];
    var st=active?('background:'+s.tx+';color:#ffffff;border:1px solid '+s.tx):('background:'+s.bg+';color:'+s.tx+';border:1px solid '+s.bd);
    return '<button onclick="setSnapFilter(\''+c.replace(/'/g,"\\'")+'\')" class="text-xs font-semibold px-3.5 py-1.5 rounded-full whitespace-nowrap" style="'+st+'">'+c+' <span style="opacity:.6;margin-left:4px">'+n+'</span></button>';
  }).join('');
}
function renderSnapshot(){
  var g=document.getElementById('snapshotGrid');if(!g)return;
  var keys=order.filter(function(k){return snapFilter==="All"||productions[k].customer===snapFilter;});
  if(!keys.length){g.innerHTML='<div class="col-span-full text-center text-sm text-gray-500 py-10">No productions under “'+snapFilter+'”.</div>';return;}
  /* subsections by customer when unfiltered — single column grouping, cards still responsive inside */
  if(snapFilter==='All'){
    var present=customerList.filter(function(c){return keys.some(function(k){return productions[k].customer===c;});});
    /* trailing group for anything with an unknown customer, so no card is dropped */
    var known={};present.forEach(function(c){known[c]=1;});
    var others=keys.filter(function(k){return !known[productions[k].customer];});
    if(others.length)present.push('Other');
    g.className='grid grid-cols-1 gap-4';
    g.innerHTML=present.map(function(c){
      var ks=(c==='Other')?others:keys.filter(function(k){return productions[k].customer===c;});
      return '<section><div class="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200"><h2 class="text-sm font-bold tracking-tight text-gray-900">'+c+'</h2><span class="text-[10px] mono font-bold text-gray-500">'+ks.length+'</span></div>'+
        '<div class="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-3">'+ks.map(_snapshotCard).join('')+'</div></section>';
    }).join('');
    return;
  }
  g.className='grid grid-cols-1 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-3';
  g.innerHTML=keys.map(_snapshotCard).join('');
}
function _snapshotCard(k){var p=productions[k];var c=countStatus(p);var pct=computePct(p);var ph=phaseFor(p);
    var risky=ph.risk;var border=risky?'border-red-100':'border-gray-200/60';
    var badge=museBadgeHTML(c.missing);
    var pillCls=risky?'bg-red-50 text-red-800 border-red-200':'bg-emerald-50 text-emerald-800 border-emerald-200';
    var bottleneck=(function(){var miss=p.dept.filter(function(d){return d[1]==='missing';});var pend=p.dept.filter(function(d){return d[1]==='pending';});
      if(miss.length)return{lab:'Critical Path Bottleneck',txt:miss[0][0]+' — '+miss[0][2],tone:'red'};
      if(pend.length)return{lab:'Next Milestone',txt:pend[0][0]+' — '+pend[0][2],tone:'amber'};
      return{lab:'Status',txt:'All departments approved',tone:'emerald'};})();
    var bt={red:'bg-red-50 border-red-100',amber:'bg-amber-50 border-amber-100',emerald:'bg-emerald-50 border-emerald-100'}[bottleneck.tone];
    var btl={red:'text-red-600',amber:'text-amber-600',emerald:'text-emerald-600'}[bottleneck.tone];
    return '<div onclick="openProject(\''+k+'\')" class="project-card bg-white rounded-xl p-3 border '+border+' flex flex-col justify-between cursor-pointer relative" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">'+badge+
      '<div><div class="flex justify-between items-start gap-1 mb-2"><div class="min-w-0"><h3 class="text-sm font-semibold truncate '+(risky?'text-red-900':'text-gray-950')+'">'+p.name+'</h3><p class="text-[9px] text-gray-500 truncate">'+p.venue+'</p></div><div class="flex flex-col items-end gap-1 flex-shrink-0">'+custChip(p.customer)+'<span class="text-[8px] font-bold '+pillCls+' px-2 py-0.5 rounded-full border whitespace-nowrap tracking-wide">'+ph.label+'</span></div></div>'+
      '<div class="space-y-1 mb-2"><div class="flex justify-between items-end mono"><span class="text-[10px] font-semibold '+(risky?'text-red-800':'text-gray-700')+'">Requirements Cleared</span><span class="text-xl font-bold '+pctColor(pct)+'">'+pct+'<span class="text-xs">%</span></span></div><progress class="w-full '+progClass(pct)+'" style="height:6px" value="'+pct+'" max="100"></progress></div></div>'+
      '<button type="button" onclick="event.stopPropagation();museaiAsk(\''+((bottleneck.lab+': '+bottleneck.txt+' ('+c.approved+' approved, '+c.pending+' pending, '+c.missing+' missing) for '+p.name+'. Suggest a fix.').replace(/\'/g,'').replace(/"/g,''))+'\')" title="Ask Muse for a fix" class="'+bt+' rounded-lg p-2 border mt-auto text-left w-full cursor-pointer"><p class="text-[8px] font-bold '+btl+' uppercase tracking-wider mb-0.5">'+bottleneck.lab+'</p><div class="flex items-center justify-between gap-1"><p class="text-[11px] font-semibold leading-tight '+(risky?'text-red-900':'text-gray-800')+'">'+bottleneck.txt+'</p><span class="text-[9px] font-bold '+(risky?'text-red-700':'text-blue-700')+' mono whitespace-nowrap ml-1 flex-shrink-0">Ask Muse →</span></div>'+
      '<div class="snap-counts flex items-center gap-2 mt-1.5 pt-1.5 border-t border-gray-100 text-[9px] mono font-bold"><span class="text-emerald-600">'+c.approved+' Approved</span><span class="text-amber-600">'+c.pending+' Pending</span><span class="text-red-600">'+c.missing+' Missing</span></div></button></div>';
}

/* ---- master re-render after any data change ---- */
/* Portfolio Risk board removed — Production Portfolio Overview is the single portfolio surface */
function renderRiskHeatmap(){/* no-op: section removed to avoid duplicate of Portfolio Overview */}
function renderAll(){renderTabs();renderPortfolio();try{renderEngPortfolio();}catch(e){}try{renderNPCAlert();}catch(e){}try{if(typeof renderRoutingBoard==='function')renderRoutingBoard();}catch(e){}try{commsNavBadge();}catch(e){}try{renderBurgerBadge();}catch(e){}renderSnapFilters();renderSnapshot();renderMatrix();buildMuseAiChips();saveState();}

/* ---- status & note editing (works on ALL projects) ---- */
/* ===== APPROVAL + RESOURCE-LOCK WORKFLOW (Salesforce-style) ===== */
// critical, approval-defining fields per department — editing these after approval triggers re-approval
var CRITICAL_FIELDS={
 "Audio":["console","rxmodel","txmodel","rffreq","rvon"],
 "Cameras / Video":["model","count","lens","config","signal","software","engine","xboxip"],
 "Transmission / Signal":["transport","format","medium","liveuserial","satfreq"],
 "Engineering":["router","sync","tallysys","probeip","vlan_rts","vlan_router","vlan_dante","vlan_light","vlan_net"],
 "Lighting":["fixture","console","cabletype"],
 "Power / Electrical":["source","distro","generator","ups"],
 "CAD":["status","version"],
 "Replay / EVS":["status","server"],
 "Monitors":["size","feed"],
 "Graphics (GFX)":["system"],
 "Talent / Production":["talent","host_role"],
 "Miscellaneous / Consumables":["expendables"],
 "Legal / Rights":["rights","clearances"]
};
function getAppr(p,dept){if(!p.approvals)p.approvals={};if(!p.approvals[dept])p.approvals[dept]={state:"Not Started",by:"",on:"",notes:"",summary:"",changeCount:0};return p.approvals[dept];}
function logEvent(key,text){var p=productions[key];if(!p)return;if(!p.activity)p.activity=[];p.activity.unshift({when:nowStamp(),actor:"Lila Hart",text:text});if(p.activity.length>200)p.activity.length=200;}
function deptLockSummary(p,dept){ // build a concise resource-lock summary from fields + equipment
  var parts=[];var fields=deptFields[dept]||[];var fv=(p.tbFields&&p.tbFields[dept])||{};
  fields.forEach(function(f){var ft=f[3]||(typeof f[2]==='string'?f[2]:'');if(ft==='header')return;var v=fv[f[0]];
    if(f[0]==='rvon'||ft==='rvon'){var rl=(typeof rvonLabel==='function')?rvonLabel(p):'';if(rl&&rl!=='RVON — no channels')parts.push(f[1]+': '+rl);return;} // v30: rvon entries are objects
    if(Array.isArray(v))v=v.join(' · ');if(v&&(''+v).trim())parts.push(f[1]+': '+v);});
  var eq=(p.tbEquip&&p.tbEquip[dept])||[];eq.forEach(function(ln){if(dept==='Cameras / Video'){if(ln.model)parts.push((ln.qty?ln.qty+'× ':'')+ln.model+(ln.lens?' / '+ln.lens:''));}else if(ln.item)parts.push((ln.qty?ln.qty+'× ':'')+ln.item);});
  return parts.join('  •  ')||'No resources selected';
}
function approveDept(key,dept,state,by,notes){var p=productions[key];var a=getAppr(p,dept);
  a.state=state;a.by=by||a.by||"Lila Hart";a.on=nowStamp();a.notes=notes||"";a.changeCount=0;a.reapprove=false;
  var di=-1;for(var i=0;i<p.dept.length;i++){if(p.dept[i][0]===dept){di=i;break;}}
  if(state==="Approved"||state==="Locked"){a.summary=deptLockSummary(p,dept);if(di>-1)p.dept[di][1]="approved";}
  else {if(di>-1)p.dept[di][1]="pending";invalidateShowSignoff(p);}
  logEvent(key,'['+dept+'] '+state+(notes?' — "'+notes+'"':'')+' · '+a.by);
  // roll the project status up to Resource Locked when all departments are approved/locked
  var roll=approvalRollup(p);
  if(roll.allLocked)p.status=p.signoff&&p.signoff.done?"Show Locked":"Resource Locked";
  else if(p.status==="Resource Locked"||p.status==="Show Locked"||(p.signoff&&p.signoff.done))invalidateShowSignoff(p);
  stampEdit(key);renderAll();if(document.getElementById('view-'+key))renderProjectView(key);}
function approvalRollup(p){var approved=0,pending=0,missing=0,locked=0,risks=0;
  p.dept.forEach(function(d){var a=(p.approvals&&p.approvals[d[0]])||{};
    if(d[1]==='missing'){missing++;risks++;}
    else if(a.reapprove||a.state==="Changes Requested"||d[1]!=='approved')pending++;
    else if(a.state==="Approved")approved++;
    else if(a.state==="Locked")locked++;
    else pending++;
  });
  var total=p.dept.length;var done=approved+locked;
  return {approved:approved,locked:locked,pending:pending,missing:missing,risks:risks,total:total,done:done,lockedAll:total>0&&done===total,allLocked:total>0&&done===total};
}
function invalidateShowSignoff(p){
  if(p.signoff)p.signoff.done=false;
  p.status='In Production';
  if(p.deptLoc&&p.__locBound&&p.deptLoc[p.__locBound]){p.deptLoc[p.__locBound].signoff=p.signoff;p.deptLoc[p.__locBound].status=p.status;}
}
function checkReapproval(key,dept,fk){var p=productions[key];var a=p.approvals&&p.approvals[dept];if(!a||(a.state!=="Approved"&&a.state!=="Locked"))return;
  var crit=CRITICAL_FIELDS[dept]||[];if(crit.indexOf(fk)>-1){a.reapprove=true;a.state="Changes Requested";a.changeCount=(a.changeCount||0)+1;
    p.dept.forEach(function(d){if(d[0]===dept)d[1]='pending';});
    invalidateShowSignoff(p);
    logEvent(key,'⚠ ['+dept+'] critical field changed after approval — re-approval required');}
}

/* ===== RULES ENGINE — conditional readiness checks (Salesforce-style business rules) ===== */
function fval(p,dept,fk){var v=p.tbFields&&p.tbFields[dept]&&p.tbFields[dept][fk];if(Array.isArray(v))return v.join(' · ');return v||'';}
function hasEquip(p,dept){return p.tbEquip&&p.tbEquip[dept]&&p.tbEquip[dept].length>0;}
function evalRules(p){ // returns array of {dept, severity:'risk'|'warn', text}
  var out=[];function add(dep,sev,text){out.push({dept:dep,severity:sev,text:text});}
  // Transmission: LiveU / bonded → require serial + backup + bandwidth
  var tx=fval(p,"Transmission / Signal","transport")+' '+fval(p,"Transmission / Signal","medium");
  if(/liveu|bonded|tvu/i.test(tx)){
    if(!fval(p,"Transmission / Signal","liveuserial"))add("Transmission / Signal","risk","LiveU LU800/bonded selected — log unit Serial #");
    if(!fval(p,"Transmission / Signal","bandwidth"))add("Transmission / Signal","warn","Bonded path — confirm required bandwidth");
    if(!fval(p,"Transmission / Signal","backup")||/none/i.test(fval(p,"Transmission / Signal","backup")))add("Transmission / Signal","warn","No backup path set for bonded transmission");
  }
  if(/satellite/i.test(tx)&&!fval(p,"Transmission / Signal","satfreq"))add("Transmission / Signal","warn","Satellite path — log dish frequency");
  // Audio: Dante → require VLAN / network readiness
  var aud=fval(p,"Audio","console")+' '+fval(p,"Audio","cabletype")+' '+fval(p,"Audio","dante");
  if(/dante/i.test(aud)){
    if(!fval(p,"Engineering","vlan_dante"))add("Audio","risk","Dante in use — assign DANTE VLAN IP (Engineering)");
  }
  // Cameras: count>0 → require lens + config + camera cable
  var ncam=parseInt(fval(p,"Cameras / Video","count"),10)||0;var camLines=(p.tbEquip&&p.tbEquip["Cameras / Video"])||[];
  if(ncam>0||camLines.length){
    if(!fval(p,"Cameras / Video","lens")&&!camLines.some(function(l){return l.lens;}))add("Cameras / Video","warn","Cameras present — specify lens package");
    if(!fval(p,"Cameras / Video","config")&&!camLines.some(function(l){return l.ped;}))add("Cameras / Video","warn","Cameras present — specify pedestal/config (CCU path)");
    if(!fval(p,"Cameras / Video","transport")&&!fval(p,"Cameras / Video","cable")&&!camLines.some(function(l){return l.smptelen;}))add("Cameras / Video","warn","Cameras present — specify camera cable / SMPTE run");
  }
  // Lighting: console → require control transport + power
  if(fval(p,"Lighting","console")){
    if(!fval(p,"Lighting","cabletype"))add("Lighting","warn","Lighting console set — specify control transport (DMX/Art-Net)");
    if(!fval(p,"Lighting","power"))add("Lighting","warn","Lighting console set — specify power/wattage");
  }
  // Power: source set → require distribution
  if(fval(p,"Power / Electrical","source")&&!fval(p,"Power / Electrical","distro"))add("Power / Electrical","warn","Power source set — specify distribution");
  // Engineering: data probe → require probe IP
  if(fval(p,"Engineering","dataprobe")&&!fval(p,"Engineering","probeip"))add("Engineering","warn","Data Probe added — log Data Probe IP");
  // Prompter (inside Cameras / Video since v30): Autoscript engine → require XBox IP
  if(fval(p,"Cameras / Video","engine")&&!fval(p,"Cameras / Video","xboxip"))add("Cameras / Video","warn","Autoscript engine set — log controller IP");
  // IP / VLAN validation (basic format)
  ["vlan_rts","vlan_router","vlan_dante","vlan_light","vlan_net"].forEach(function(fk){var v=fval(p,"Engineering",fk);if(v&&!/^\d{1,3}(\.\d{1,3}){3}$/.test(v.trim()))add("Engineering","warn","Invalid IP format: "+v);});
  var pip=fval(p,"Cameras / Video","xboxip");if(pip&&!/^\d{1,3}(\.\d{1,3}){3}$/.test(pip.trim()))add("Cameras / Video","warn","Invalid XBox IP format: "+pip);
  return out;
}
/* readiness scoring — operational visibility */
function readiness(p){var dl=p.dept.length;
  var deptDone=p.dept.filter(function(d){return d[1]==='approved';}).length;
  var roll=approvalRollup(p);
  var legal=p.dept.filter(function(d){return d[0]==='Legal / Rights';})[0];
  var legalPct=legal&&legal[1]==='approved'?100:legal&&legal[1]==='pending'?50:0;
  var crewConf=Math.round((CREW_FIELD.length+CREW_PCR.length)/(CREW_FIELD.length+CREW_IT.length+CREW_PCR.length+CREW_EXEC.length)*100); // demo: confirmed core
  var vendorOk=(p.vendors&&p.vendors.length)?100:60;
  var schedOk=(p.schedule&&p.schedule.length)?100:0;
  try{ var _sk=null; for(var _si=0;_si<order.length;_si++){ if(productions[order[_si]]===p){_sk=order[_si];break;} }
    if(_sk&&typeof planEVMFor==='function'){ var _sev=planEVMFor(_sk); if(isFinite(_sev.SPI)) schedOk=Math.max(0,Math.min(100,Math.round(_sev.SPI*100))); } }catch(e){}
  var techbookPct=computePct(p);
  var risks=evalRules(p).filter(function(r){return r.severity==='risk';}).length+roll.missing;
  var air=Math.max(0,Math.round((computePct(p)*0.4)+(roll.done/dl*100*0.3)+(legalPct*0.1)+(schedOk*0.1)+(vendorOk*0.1)-(risks*4)));
  if(air>100)air=100;
  return {dept:Math.round(deptDone/dl*100),techbook:techbookPct,schedule:schedOk,vendor:vendorOk,crew:crewConf,legal:legalPct,air:air,risks:risks};
}
/* ===== TASKS — auto-created from gaps + manual ===== */
function getTasks(p){if(!p.tasks)p.tasks=[];return p.tasks;}
function todayISO(){return new Date().toISOString().slice(0,10);}
function taskState(t){if(t.done)return'completed';if(t.blocked)return'blocked';if(t.due&&isISO(t.due)&&t.due<todayISO())return'overdue';return'open';}
function syncAutoTasks(key){var p=productions[key];var tasks=getTasks(p);
  var desired={};function want(dep,text){desired['auto:'+dep+'::'+text]={dept:dep,text:text};}
  evalRules(p).forEach(function(r){want(r.dept,(r.severity==='risk'?'⚠ ':'')+r.text);});
  p.dept.forEach(function(d){if(d[1]==='missing')want(d[0],'Resolve MISSING: '+d[0]);
    var a=p.approvals&&p.approvals[d[0]];if(a&&a.state==='Pending Review')want(d[0],'Approval pending review: '+d[0]);
    if(a&&a.reapprove)want(d[0],'Re-approval required: '+d[0]+' (critical change)');});
  /* Mind tree: Drawings + vendor meeting, schedule-with-venue + site survey → tasks → LBA */
  try{
    var cad=(typeof getCadPlans==='function')?getCadPlans(key):[];
    if(!(cad&&cad.length))want('CAD','Drawings on file (feeds vendor meeting)');
    if(!(p.vendors&&p.vendors.length))want('Vendors','Vendor meeting scheduled');
    if(!(p.schedule&&p.schedule.length))want('Schedule','Schedule with venue locked');
    var ev=(typeof eventChecklistPct==='function')?eventChecklistPct(key):{pct:0};
    var sv=(typeof surveyReadiness==='function')?surveyReadiness(key):{pct:0};
    if((ev.pct||0)<40&&(sv.pct||0)<50)want('Site Survey','Site survey + Event Check List before LBA');
    if(!(p.signoff&&p.signoff.done))want('Workflow','LBA — live before air (all gates green)');
  }catch(eWf){}
  // remove auto tasks no longer needed AND not completed
  for(var i=tasks.length-1;i>=0;i--){var t=tasks[i];if(t.auto&&!t.done&&!desired[t.id])tasks.splice(i,1);}
  // add only NEW auto tasks (deterministic id prevents duplicates)
  var existing={};tasks.forEach(function(t){if(t.auto)existing[t.id]=1;});
  Object.keys(desired).forEach(function(id){if(!existing[id]){var w=desired[id];tasks.push({id:id,text:w.text,dept:w.dept,assignee:deptOwner(w.dept),due:'',notes:'',dependency:'',blocked:false,done:false,completedOn:'',auto:true});}});
}
function deptOwner(dep){var map={"Audio":"Noah Barrett","Cameras / Video":"Quinn Adler","Transmission / Signal":"Sam Okada","Engineering":"Micah Trent","Prompter":"Remy Colton","Lighting":"Harper Sloan","Power / Electrical":"Riley Stanton","Networking / IT":"Casey Whitaker","Talent / Production":"Taylor Grayson"};return map[dep]||"Lila Hart";}
// PackList "Provided By" — companies / vendors, NOT individual people (per broadcast tech-book convention)
function deptProvider(dep){var map={
  "Audio":"Meta Field Ops","Cameras / Video":"Meta Field Ops","Transmission / Signal":"Meta Transmission",
  "Engineering":"Meta Engineering","Prompter":"Meta Field Ops","Lighting":"Meta Field Ops",
  "Power / Electrical":"Aggreko","CAD":"Meta Engineering","Replay / EVS":"Meta Engineering","Monitors":"Meta Field Ops",
  "Graphics (GFX)":"Meta GFX","Talent / Production":"Meta Live Events",
  "Networking / IT":"Meta IT","Miscellaneous / Consumables":"Meta Field Ops","Legal / Rights":"Meta Legal"};
  return map[dep]||"Muse Live";}
function addTask(key){var p=productions[key];getTasks(p).push({id:'t'+Date.now(),text:'New task',dept:'',assignee:'Lila Hart',due:'',notes:'',dependency:'',blocked:false,done:false,completedOn:'',auto:false});stampEdit(key);renderProjectView(key);}
function setTask(key,id,field,val){var p=productions[key];var t=getTasks(p).filter(function(x){return x.id===id;})[0];if(t){t[field]=val;stampEdit(key);}}
function toggleTask(key,id){var p=productions[key];var t=getTasks(p).filter(function(x){return x.id===id;})[0];if(!t)return;t.done=!t.done;t.completedOn=t.done?nowStamp():'';if(t.done){t.blocked=false;logEvent(key,'✓ Task done: '+t.text);}stampEdit(key);renderProjectView(key);}
function toggleTaskBlocked(key,id){var p=productions[key];var t=getTasks(p).filter(function(x){return x.id===id;})[0];if(!t||t.done)return;t.blocked=!t.blocked;stampEdit(key);renderProjectView(key);}
function delTask(key,id){var p=productions[key];p.tasks=getTasks(p).filter(function(x){return x.id!==id;});stampEdit(key);renderProjectView(key);}
var wfTaskFilter='all';
function setTaskFilter(f){wfTaskFilter=f;var key=document.querySelector('.view-pane.active');if(key){key=key.id.replace('view-','');if(productions[key])renderProjectView(key);}}
// approval modal
var apprKey=null,apprDept=null;
function openApproval(key,dept){apprKey=key;apprDept=dept;var p=productions[key];var a=getAppr(p,dept);
  document.getElementById('apprTitle').textContent=dept+' — Section Approval';
  document.getElementById('apprState').value=a.state||"Not Started";
  document.getElementById('apprBy').value=a.by||"Lila Hart";
  museRichFill('apprNotes',a.notes||'','note','80px','Sign-off notes, conditions, exceptions…');
  document.getElementById('apprSummary').innerHTML=deptLockSummary(p,dept);
  var m=document.getElementById('approvalModal');m.style.display='flex';m.classList.remove('hidden');}
function closeApproval(){var m=document.getElementById('approvalModal');m.style.display='none';m.classList.add('hidden');}
function submitApproval(state){if(!apprKey)return;approveDept(apprKey,apprDept,state,document.getElementById('apprBy').value,museRichGet('apprNotes'));closeApproval();toast(apprDept+' → '+state);}
/* PRODUCTION SIGN-OFF (global, final) */
function openSignoff(key){var p=productions[key];var r=approvalRollup(p);if(!r.allLocked){toast('All sections must be approved/locked first');return;}
  signoffKey=key;document.getElementById('soTitle').textContent=p.name+' — Production Sign-Off';
  document.getElementById('soBy').value=(p.signoff&&p.signoff.by)||"Lila Hart";
  museRichFill('soNotes',(p.signoff&&p.signoff.notes)||'','note','80px','Final notes for air…');
  document.getElementById('soSummary').innerHTML=p.dept.map(function(d){return '<div class="flex justify-between py-0.5"><span>'+d[0]+'</span><span class="text-emerald-700 font-bold">'+((p.approvals[d[0]]||{}).state==='Locked'?'Locked':'Approved')+'</span></div>';}).join('');
  var m=document.getElementById('signoffModal');m.style.display='flex';m.classList.remove('hidden');}
function closeSignoff(){var m=document.getElementById('signoffModal');m.style.display='none';m.classList.add('hidden');}
function confirmSignoff(){if(!signoffKey)return;var p=productions[signoffKey];if(!approvalRollup(p).allLocked){toast("Approvals changed — review all sections before sign-off");closeSignoff();return;}p.signoff={done:true,by:document.getElementById('soBy').value||"Lila Hart",on:nowStamp(),notes:museRichGet('soNotes')||""};p.status="Show Locked";if(p.deptLoc&&p.__locBound&&p.deptLoc[p.__locBound]){p.deptLoc[p.__locBound].signoff=p.signoff;p.deptLoc[p.__locBound].status=p.status;}
  logEvent(signoffKey,'🔒 PRODUCTION SIGN-OFF — Show Locked · '+p.signoff.by);stampEdit(signoffKey);closeSignoff();renderAll();renderProjectView(signoffKey);toast('Production signed off — Show Locked');}
function revokeSignoff(key){if(!confirm('Revoke Production Sign-Off? The show will no longer be locked.'))return;var p=productions[key];p.signoff={done:false};p.status="In Production";if(p.deptLoc&&p.__locBound&&p.deptLoc[p.__locBound]){p.deptLoc[p.__locBound].signoff=p.signoff;p.deptLoc[p.__locBound].status=p.status;}logEvent(key,'Production Sign-Off revoked');stampEdit(key);renderAll();renderProjectView(key);}
var signoffKey=null;
function apprSummaryStrip(key){var p=productions[key];var r=approvalRollup(p);var signedOff=p.signoff&&p.signoff.done;
  function stat(n,label,col){return '<div class="flex items-center gap-1.5"><span class="text-lg font-bold '+col+'">'+n+'</span><span class="text-[9px] uppercase tracking-wider text-gray-400 leading-tight">'+label+'</span></div>';}
  var soBadge=signedOff?
    '<span class="flex items-center gap-1.5 text-[11px] font-bold mono px-3 py-1.5 rounded-lg bg-emerald-600 text-white"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>SHOW LOCKED</span>':
    (r.allLocked?'<button onclick="openSignoff(\''+key+'\')" class="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">Production Sign-Off →</button>':'<span class="text-[10px] font-bold mono px-3 py-1.5 rounded-lg bg-gray-100 text-gray-500 border border-gray-200">SIGN-OFF PENDING · '+r.done+'/'+r.total+' sections</span>');
  return '<div class="bg-white rounded-2xl border '+(signedOff?'border-emerald-300':'border-gray-200/60')+' px-5 py-3 flex flex-wrap items-center justify-between gap-4" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">'+
    '<div class="flex items-center gap-5 flex-wrap">'+
      stat(r.done,'Sections<br>Approved','text-emerald-600')+
      stat(r.pending,'Sections<br>Pending','text-amber-600')+
      stat(r.missing,'Sections<br>Missing','text-red-600')+
      stat(r.risks,'Critical<br>Risks','text-gray-700')+
    '</div>'+
    '<div class="flex items-center gap-2">'+(signedOff?'<span class="text-[9px] text-gray-400 mono hidden sm:inline">'+esc(p.signoff.by)+' · '+esc(p.signoff.on)+'</span>':'')+soBadge+'</div>'+
  '</div>';
}
function resourceLockCardHTML(key){var p=productions[key];var r=approvalRollup(p);
  var pctLocked=Math.round(r.done/r.total*100);
  var lockedRows=p.dept.filter(function(d){var a=p.approvals&&p.approvals[d[0]];return a&&(a.state==='Approved'||a.state==='Locked');}).map(function(d){var a=p.approvals[d[0]];
    return '<div class="py-1.5 border-b border-gray-100 last:border-0"><div class="flex items-center justify-between"><span class="text-[11px] font-bold text-gray-800">'+d[0]+'</span><span class="text-[8px] mono px-1.5 py-0.5 rounded '+(a.state==='Locked'?'bg-blue-600 text-white':'bg-emerald-600 text-white')+'">'+(a.state==='Locked'?'Section Locked':'Section Approved')+(a.reapprove?' ⚠':'')+'</span></div><p class="text-[9px] text-gray-500 mt-0.5 leading-snug">'+(a.summary||deptLockSummary(p,d[0]))+'</p><p class="text-[8px] text-gray-400 mono mt-0.5">'+(a.by||'')+' · '+(a.on||'')+'</p></div>';
  }).join('')||'<p class="text-[10px] text-gray-400 italic">No sections approved yet. Use “Section Approval” on each category.</p>';
  var signedOff=p.signoff&&p.signoff.done;
  var badge=signedOff?'<span class="flex items-center gap-1 text-[10px] font-bold mono px-2.5 py-1 rounded bg-emerald-600 text-white"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>SHOW LOCKED</span>':(r.allLocked?'<span class="text-[9px] font-bold mono px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">READY FOR SIGN-OFF</span>':'<span class="text-[9px] font-bold mono px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">IN PROGRESS</span>');
  var signBtn=signedOff?'<button onclick="revokeSignoff(\''+key+'\')" class="w-full mt-3 text-[11px] font-bold text-gray-600 border border-gray-300 rounded-lg py-2 hover:bg-gray-50">Revoke Production Sign-Off</button>':'<button onclick="openSignoff(\''+key+'\')" '+(r.allLocked?'':'disabled')+' class="w-full mt-3 text-[11px] font-bold text-white rounded-lg py-2 '+(r.allLocked?'bg-emerald-600 hover:bg-emerald-700':'bg-gray-300 cursor-not-allowed')+'">'+(r.allLocked?'Production Sign-Off →':'Sign-Off — '+(r.total-r.done)+' section'+((r.total-r.done)===1?'':'s')+' left')+'</button>';
  return '<div class="bg-white rounded-2xl p-6 border '+(signedOff?'border-emerald-300 ring-1 ring-inset ring-emerald-200':'border-gray-200/60')+'" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">'+
    '<div class="flex items-center justify-between mb-2 gap-2"><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">Production Sign-Off</h3>'+badge+'</div>'+
    (signedOff?'<p class="text-[10px] text-emerald-700 font-semibold mb-2">Signed off by '+esc(p.signoff.by)+' · '+esc(p.signoff.on)+(p.signoff.notes?' — "'+esc(p.signoff.notes)+'"':'')+'</p>':'')+
    '<progress class="w-full '+(r.allLocked?'green':'yellow')+'" style="height:12px" value="'+r.done+'" max="'+r.total+'"></progress>'+
    '<div class="grid grid-cols-4 gap-1 text-center mt-2 mb-1">'+
      '<div><div class="text-base font-bold text-emerald-600">'+r.done+'</div><div class="text-[8px] uppercase tracking-wider text-gray-400">Locked</div></div>'+
      '<div><div class="text-base font-bold text-amber-600">'+r.pending+'</div><div class="text-[8px] uppercase tracking-wider text-gray-400">Pending</div></div>'+
      '<div><div class="text-base font-bold text-red-600">'+r.missing+'</div><div class="text-[8px] uppercase tracking-wider text-gray-400">Missing</div></div>'+
      '<div><div class="text-base font-bold text-gray-700">'+r.risks+'</div><div class="text-[8px] uppercase tracking-wider text-gray-400">Risks</div></div>'+
    '</div>'+signBtn+
    '<p class="text-[9px] font-bold uppercase tracking-wider text-gray-500 mb-1 mt-4">Locked Section Summary</p>'+
    '<div class="max-h-56 overflow-y-auto">'+lockedRows+'</div></div>';
}

function setDeptStatus(key,idx,status){var p=productions[key];if(!p||!p.dept[idx]||!statusMap[status])return;
  var d=p.dept[idx];if(d[1]===status)return;d[1]=status;
  if(status!=='approved'){
    var a=p.approvals&&p.approvals[d[0]];
    if(a&&(a.state==='Approved'||a.state==='Locked')){a.state='Changes Requested';a.reapprove=true;a.changeCount=(a.changeCount||0)+1;}
    invalidateShowSignoff(p);
  }
  logEvent(key,'['+d[0]+'] status → '+statusMap[status].label);try{refreshProjPct(key);}catch(e){}stampEdit(key);renderAll();if(document.getElementById('view-'+key))renderProjectView(key);}
function setDeptNote(key,idx,val){if(!productions[key])return;productions[key].dept[idx][2]=val||'—';productions[key].dept[idx].__customNote=!!(val&&val.trim());stampEdit(key);saveState();
  // light refresh of counts/snapshot without rebuilding the textarea the user is typing in
  renderTabs();renderPortfolio();renderSnapshot();renderMatrix();}
function setDeptField(key,dept,fk,val){if(!productions[key])return;var p=productions[key];if(!p.tbFields)p.tbFields={};if(!p.tbFields[dept])p.tbFields[dept]={};
  if(p.tbFields[dept][fk]===val)return;
  p.tbFields[dept][fk]=val;checkReapproval(key,dept,fk);
  var di=-1;for(var i=0;i<p.dept.length;i++){if(p.dept[i][0]===dept){di=i;break;}}
  if(di>-1&&!p.dept[di].__customNote){var sum=deptSummary(p,dept);if(sum)p.dept[di][2]=sum;}
  stampEdit(key);renderAll();if(document.getElementById('view-'+key))renderProjectView(key);}
function stepDeptCount(key,dept,fk,delta){if(!productions[key])return;var p=productions[key];if(!p.tbFields)p.tbFields={};if(!p.tbFields[dept])p.tbFields[dept]={};
  var q=parseInt(p.tbFields[dept][fk],10);if(isNaN(q))q=0;q+=delta;if(q<0)q=0;if(q>50)q=50;
  setDeptField(key,dept,fk,''+q);}
function addDeptAddable(key,dept,fk,val){val=(val||'').trim();if(!val||!productions[key])return;var p=productions[key];if(!p.tbFields)p.tbFields={};if(!p.tbFields[dept])p.tbFields[dept]={};
  var arr=p.tbFields[dept][fk];if(!Array.isArray(arr))arr=arr?(''+arr).split(',').map(function(x){return x.trim();}).filter(Boolean):[];
  arr.push(val);/* duplicates allowed */p.tbFields[dept][fk]=arr;stampEdit(key);renderProjectView(key);}
function removeDeptAddable(key,dept,fk,idx){var p=productions[key];var arr=p.tbFields&&p.tbFields[dept]&&p.tbFields[dept][fk];if(!Array.isArray(arr))return;arr.splice(idx,1);stampEdit(key);renderProjectView(key);}
/* multi-value dropdown fields: add/remove any number of items */
function deptArr(p,dept,fk){var v=p.tbFields&&p.tbFields[dept]&&p.tbFields[dept][fk];return Array.isArray(v)?v:(v?[v]:[]);}
function addDeptValue(key,dept,fk,val){val=(val||'').trim();if(!val||val==='__custom'||!productions[key])return;var p=productions[key];if(!p.tbFields)p.tbFields={};if(!p.tbFields[dept])p.tbFields[dept]={};
  var arr=deptArr(p,dept,fk);arr.push(val);/* duplicates allowed — add identical items independently */p.tbFields[dept][fk]=arr;checkReapproval(key,dept,fk);
  var di=-1;for(var i=0;i<p.dept.length;i++){if(p.dept[i][0]===dept){di=i;break;}}if(di>-1&&!p.dept[di].__customNote){var sm=deptSummary(p,dept);if(sm)p.dept[di][2]=sm;}
  stampEdit(key);renderAll();renderProjectView(key);}
function removeDeptValue(key,dept,fk,idx){var p=productions[key];var arr=deptArr(p,dept,fk);arr.splice(idx,1);p.tbFields[dept][fk]=arr;checkReapproval(key,dept,fk);
  var di=-1;for(var i=0;i<p.dept.length;i++){if(p.dept[i][0]===dept){di=i;break;}}if(di>-1&&!p.dept[di].__customNote){var sm=deptSummary(p,dept);p.dept[di][2]=sm||'—';}
  stampEdit(key);renderAll();renderProjectView(key);}
function museAfterPaint(fn){
  try{
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){try{fn();}catch(e){}});
    });
  }catch(e0){setTimeout(function(){try{fn();}catch(e1){}},0);}
}
function openProject(k){
  try{if(k){_notifAck['snap:'+k]=1;_notifAck['tab:'+k]=1;}}catch(eA){}
  museAfterPaint(function(){switchView(k);});
}

function renderMatrix(){
  var g=document.getElementById('matrixGrid');if(!g)return;
  g.innerHTML=order.map(function(k){var p=productions[k];var c=countStatus(p);
    var border=p.risk?'border-red-100':'border-gray-200/60';
    var badge=museBadgeHTML(p.notif);
    var rows=p.dept.map(function(d){var s=statusMap[d[1]];
      return '<div class="flex items-center justify-between gap-2"><span class="text-gray-600 flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-'+s.dot+'-500 flex-shrink-0"></span>'+d[0]+'</span><span class="mono font-bold '+s.text+' text-right text-[10px]">'+s.label+'</span></div>';}).join('');
    var counts='<span class="text-emerald-600 font-bold">'+c.approved+'✓</span> <span class="text-amber-600 font-bold">'+c.pending+'⋯</span> <span class="text-red-600 font-bold">'+c.missing+'✕</span>';
    var btn=p.risk?'<button onclick="event.stopPropagation();toast(\'Escalation sent to Engineering VP\')" class="text-[10px] text-red-700 font-bold hover:underline">Escalate →</button>':'<button onclick="event.stopPropagation();openProject(\''+k+'\')" class="text-[10px] text-blue-700 font-bold hover:underline">Full Brief →</button>';
    return '<div onclick="openProject(\''+k+'\')" class="bg-white rounded-2xl p-5 border '+border+' cursor-pointer relative" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">'+badge+
      '<div class="flex items-center justify-between mb-3 pb-3 border-b '+(p.risk?'border-red-100':'border-gray-100')+'"><h3 class="text-sm font-bold '+(p.risk?'text-red-900':'text-gray-900')+'">'+txt(p.name)+'</h3><span class="text-[9px] font-bold bg-'+p.tagColor+'-100 border border-'+p.tagColor+'-300 text-'+p.tagColor+'-800 px-2 py-0.5 rounded-md mono">'+txt(p.tag||'')+'</span></div>'+
      '<div class="space-y-1.5 text-xs">'+rows+'</div>'+
      '<div class="pt-3 border-t '+(p.risk?'border-red-100':'border-gray-100')+' mt-3 flex justify-between items-center"><span class="text-[10px] mono">'+counts+'</span>'+btn+'</div></div>';
  }).join('');
}

function openProjectCrew(key){projSubTab[key]='crew';museAfterPaint(function(){switchView(key);});}
/* ===== MASTER SCHEDULE — tabbed: Muse Schedule · Portfolio · Broadcast Grid · Facilities ===== */
var schedTab='muse';
function setSchedTab(t){schedTab=t;renderSchedule();}
function schedConflictTotal(){var n=0;
  try{if(typeof npcAllConflicts==='function')n+=npcAllConflicts().length;}catch(e){}
  try{if(typeof bcastConflicts==='function')n+=bcastConflicts().length;}catch(e){}
  try{if(typeof MuseSchedule!=='undefined')n+=MuseSchedule.conflicts().length;}catch(e){}
  return n;}
function schedFacilityHTML(){
  // ---- Productions crew-scheduling list (click a project -> its Crew schedule) ----
  var prodHTML=order.map(function(k){var p=productions[k];var m=crewMilestones(p);var tc=p.tagColor||'gray';
    var chips=[["Start",m.start],["Load-In",m.loadin],["Cam Blocking",m.camblock],["TX Check",m.txcheck],["Rehearsal",m.rehearsal],["Broadcast",m.broadcast],["Strike",m.strike]]
      .map(function(x){return '<span class="text-[9px] mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200 whitespace-nowrap"><b class="text-gray-500">'+x[0]+'</b> '+(x[1]?fmtDate(x[1]):'TBD')+'</span>';}).join(' ');
    return '<div onclick="openProjectCrew(\''+k+'\')" class="cursor-pointer hover:bg-gray-50 rounded-xl border border-gray-100 p-3 mb-2 transition-colors">'+
      '<div class="flex items-center justify-between gap-2 mb-1.5"><div class="flex items-center gap-2 min-w-0"><span class="w-2 h-2 rounded-full flex-shrink-0" style="background:'+(dotBg[tc]||dotBg.gray)+'"></span><span class="text-sm font-semibold text-gray-900 truncate">'+p.name+'</span>'+custChip(p.customer)+'</div><span class="text-[10px] font-bold text-blue-700 flex-shrink-0">View Crew →</span></div>'+
      '<div class="flex flex-wrap gap-1">'+chips+'</div></div>';
  }).join('');
  // ---- facility gantt (control-room bookings) ----
  var days=NPC_DAYS;
  var rows=FACILITY_ROWS;
  var g='<div style="min-width:820px"><div class="grid grid-cols-8 gap-1 mb-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider"><div></div>'+days.map(function(d){return '<div class="text-center">'+d+'</div>';}).join('')+'</div>';
  rows.forEach(function(r){g+='<div class="grid grid-cols-8 gap-1 mb-1 items-center"><div class="text-[10px] font-bold mono text-gray-600">'+r[0]+'</div><div class="col-span-7 relative bg-gray-50 rounded border border-gray-100" style="height:32px">';
    r[1].forEach(function(b){var left=(b[0]/7*100);var w=(b[1]/7*100);
      g+='<div onclick="MuseSchedule.focusRes(\''+r[0]+'\')" title="'+esc(b[2]+' · '+r[0]+(b[5]?' · '+b[5]:''))+'" class="absolute rounded text-[9px] font-semibold flex items-center px-2 cursor-pointer truncate text-white" style="top:2px;height:28px;left:'+left+'%;width:calc('+w+'% - 2px);background:#242526">'+b[2]+'</div>';});
    g+='</div></div>';});
  g+='</div>';
  return '<div class="mb-5"><div class="flex items-center justify-between mb-3"><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">Facility &amp; Control-Room Bookings</h3><span class="text-[10px] text-gray-500">Studio, PCR/ACR, circuits &amp; REMI from Muse Schedule · Week of '+esc(typeof MuseSchedule!=='undefined'?MuseSchedule.weekLabel():'this week')+'</span></div><div class="overflow-x-auto">'+g+'</div></div>'+
    '<div class="pt-4 mt-4 border-t border-gray-200"><div class="flex items-center justify-between mb-3"><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">National Press Club — Planned Events Overlay</h3><span class="text-[10px] text-gray-500">Click any planned event to review &amp; crew it</span></div><div class="overflow-x-auto">'+npcGanttHTML()+'</div></div>'+
    '<div class="pt-4 mt-4 border-t border-gray-200"><div class="flex items-center justify-between mb-3"><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">Production Milestone Overview</h3><span class="text-[10px] text-gray-500">Click any production to open its crew schedule</span></div>'+prodHTML+'</div>';
}
function renderSchedule(){
  var el=document.getElementById('scheduleGantt');if(!el)return;
  if(schedTab==='muse'&&typeof permCan==='function'&&!permCan('scheduling'))schedTab='facility';
  /* conflict count still drives the tab-bar badges below; the title pill was removed per request */
  var nConf=schedConflictTotal();
  // ---- tab bar ----
  var bar=document.getElementById('schedTabBar');
  function tb(id,label,badge){var on=(schedTab===id);
    return '<button onclick="setSchedTab(\''+id+'\')" class="text-[11px] font-bold px-4 py-2 rounded-lg inline-flex items-center gap-1.5 '+(on?'bg-gray-900 text-white shadow-sm':'text-gray-600 hover:bg-gray-200')+'">'+label+(badge?'<span class="text-[8px] font-bold bg-red-500 text-white rounded-full min-w-[15px] h-[15px] px-1 flex items-center justify-center">'+badge+'</span>':'')+'</button>';}
  if(bar)bar.innerHTML='<div class="inline-flex items-center gap-1 bg-gray-100 rounded-xl p-1 flex-wrap justify-center">'+
    ((typeof permCan!=='function'||permCan('scheduling'))?tb('muse','Muse Schedule',(typeof MuseSchedule!=='undefined'?MuseSchedule.conflicts().length:0)||''):'')+
    tb('portfolio','Portfolio Controls','')+tb('broadcast','Broadcast Schedule','')+tb('facility','Facilities & Productions',(nConf-(typeof MuseSchedule!=='undefined'?MuseSchedule.conflicts().length:0))||'')+'</div>';
  // ---- content ----
  if(schedTab==='portfolio'&&typeof portfolioControlsHTML==='function'){try{el.innerHTML=portfolioControlsHTML();}catch(e){el.innerHTML='<div class="text-sm text-gray-500 p-4">Portfolio controls unavailable.</div>';}}
  else if(schedTab==='broadcast'&&typeof bcastPaneHTML==='function'){el.innerHTML=bcastPaneHTML();}
  else if(schedTab==='muse'&&typeof MuseSchedule!=='undefined'){MuseSchedule.renderInto(el);}
  else{el.innerHTML=schedFacilityHTML();}
}

/* v30 Module 8: live talent + position pools for the Talent / Production tile */
function talentRosterPool(key){var out=[];
  try{if(typeof ifbHostPool==='function'){out=ifbHostPool(key).slice();}}catch(e){}
  if(!out.length)out=IFB_HOST_TALENT.slice();
  try{if(typeof customTalent!=='undefined')customTalent.forEach(function(t){if(t&&t.name&&out.indexOf(t.name)<0)out.push(t.name);});}catch(e){}
  return out;}
function talentPositionPool(key){
  var base=((deptFields['Talent / Production']||[]).filter(function(f){return f[0]==='position';})[0]||[null,null,[]])[2].slice();
  try{if(typeof locsOf==='function')locsOf(key).forEach(function(L){if(L&&L.name&&base.indexOf(L.name)<0)base.push(L.name);});}catch(e){}
  return base;}
/* ===== MULTI-LINE EQUIPMENT per department (multiple cameras/mics with qty etc.) ===== */
/* v30 Module 1: every tile equipment line carries a unique scannable ID (barcode value),
   plus serial / status / location-assignment — same identity model as the central inventory. */
var EQUIP_LINE_STATUSES=["Planned","Requested","Confirmed","Packed","Shipped","On Site","Returned","Missing"];
var DEPT_SCAN_PREFIX={"Audio":"AUD","Cameras / Video":"CAM","Transmission / Signal":"TRX","Engineering":"ENG","Prompter":"PRM","Lighting":"LGT","Power / Electrical":"PWR","CAD":"CAD","Monitors":"MON","Graphics (GFX)":"GFX","Talent / Production":"TAL","Networking / IT":"NET","Miscellaneous / Consumables":"MSC","Legal / Rights":"LGL","Replay / EVS":"RPL"};
function equipScanExists(code){if(!code)return false;code=(''+code).toLowerCase();
  try{if(typeof inventory!=='undefined'){for(var i=0;i<inventory.length;i++){if((inventory[i].barcode||'').toLowerCase()===code)return true;}}}catch(e){}
  for(var k in productions){var te=productions[k].tbEquip;if(!te)continue;
    for(var d in te){var lines=te[d]||[];for(var j=0;j<lines.length;j++){if(((lines[j]&&lines[j].scanid)||'').toLowerCase()===code)return true;}}}
  return false;}
function genEquipScanId(dept){var pre=DEPT_SCAN_PREFIX[dept]||'EQP';var code,guard=0;
  do{code='MUSE-'+pre+'-'+String(Math.floor(100000+Math.random()*900000));guard++;}while(equipScanExists(code)&&guard<50);
  return code;}
var equipSchema={
 "Cameras / Video":{add:"+ Add Camera",wrap:true,cols:[
   {key:"model",label:"Camera Body",field:"model"},
   {key:"lens",label:"Lens",field:"lens"},
   {key:"ped",label:"Pedestal / Config",field:"config"},
   {key:"hood",label:"Prompter Hood",opts:["— none —","12\" hood","15\" hood","17\" hood","On-cam hood"]},
   {key:"glass",label:"Glass",opts:["— none —","Beam-splitter","70/30 glass","On-cam glass"]},
   {key:"monitor",label:"Monitor",opts:["— none —","7\" on-cam","9\" talent","17\" confidence"]},
   {key:"retsrc",label:"Return from",opts:["Camera","BSP / CCU"]},
   {key:"promptsrc",label:"Prompter from",opts:["Camera","BSP / CCU"]},
   {key:"smptelen",label:"SMPTE Length",opts:["150 ft","250 ft","500 ft","1000 ft","Custom"]},
   {key:"qty",label:"Qty",num:true},
   {key:"scanid",label:"Scan ID",scan:true},
   {key:"serial",label:"Serial",text:true},
   {key:"status",label:"Status",opts:EQUIP_LINE_STATUSES},
   {key:"loc",label:"Location / Assignment",text:true},
   {key:"notes",label:"Detail / Notes",text:true}]},
 "Lighting":{add:"+ Add Fixture",wrap:true,cols:[
   /* v30 Module 4: structured per-fixture lines — type, count, rigging position,
      power draw (feeds the Power/Electrical cross-link), gel, DMX channel */
   {key:"ftype",label:"Fixture Type",opts:["Fresnel","Softbox / LED panel","Leko / ellipsoidal spot","Moving head / automated fixture","Practical","Ring light","Kicker / rim light"]},
   {key:"model",label:"Fixture / Model",field:"fixture"},
   {key:"qty",label:"Count",num:true},
   {key:"pos",label:"Position / Rigging Point",text:true},
   {key:"watts",label:"Power Draw (W each)",text:true},
   {key:"gel",label:"Gel / Color",opts:["— none —","CTB full","CTB 1/2","CTO full","CTO 1/2","Plus green","Minus green","ND .3","ND .6","Diffusion 216","Opal","Custom (notes)"]},
   {key:"dmx",label:"DMX / Control Ch",text:true},
   {key:"scanid",label:"Scan ID",scan:true},
   {key:"serial",label:"Serial",text:true},
   {key:"status",label:"Status",opts:EQUIP_LINE_STATUSES},
   {key:"loc",label:"Location / Assignment",text:true},
   {key:"notes",label:"Detail / Notes",text:true}]},
 "Talent / Production":{add:"+ Add Talent Assignment",wrap:true,title:"Talent Assignments — add multiple",cols:[
   /* v30 Module 8: structured talent assignment lines — roster dropdown, role,
      wardrobe/mic pack, call time, position (incl. Site Survey locations), contact */
   {key:"name",label:"Talent (roster)",optsFn:function(k){return talentRosterPool(k);}},
   {key:"role",label:"Role",opts:["Host","Co-Host","Analyst","Reporter","Floor Reporter","Product Commentator","Keynote Presenter","Guest"]},
   {key:"micpack",label:"Wardrobe / Mic Pack",text:true},
   {key:"calltime",label:"Call Time",text:true},
   {key:"position",label:"Position / Location on site",optsFn:function(k){return talentPositionPool(k);}},
   {key:"contact",label:"Contact (cell / email)",text:true},
   {key:"status",label:"Status",opts:["Confirmed","Pending","Travel booked","On site","Released"]},
   {key:"notes",label:"Notes",text:true}]},
 "_default":{add:"+ Add Item",wrap:true,cols:[
   {key:"item",label:"Item / Equipment",pool:true},
   {key:"qty",label:"Qty",num:true},
   {key:"scanid",label:"Scan ID",scan:true},
   {key:"serial",label:"Serial",text:true},
   {key:"status",label:"Status",opts:EQUIP_LINE_STATUSES},
   {key:"loc",label:"Location / Assignment",text:true},
   {key:"notes",label:"Detail / Notes",text:true}]}
};
function equipSchemaFor(dept){return equipSchema[dept]||equipSchema["_default"];}
function gearPool(dept){var fields=deptFields[dept]||[];var out=[];fields.forEach(function(f){if(Array.isArray(f[2]))f[2].forEach(function(o){if(out.indexOf(o)<0)out.push(o);});});return out;}
function getEquip(p,dept){if(!p.tbEquip)p.tbEquip={};if(!p.tbEquip[dept])p.tbEquip[dept]=[];return p.tbEquip[dept];}

/* ===== Shot-Designer blocking gear from Department Status — Production Areas
   Cameras / Video (tbEquip lines + field pools). Used by pano-engine + cad-3d-engine
   so blocking only offers bodies/lenses/mounts already planned for the show. */
function museBlockingGear(key){
  var empty={packages:[],bodies:[],lenses:[],mounts:[],operators:[],empty:true,source:'',count:0};
  try{
    var p=(typeof productions!=='undefined'&&productions[key])?productions[key]:null;
    if(!p)return empty;
    var packages=[],bodies=[],lenses=[],mounts=[],operators=[];
    function uniqPush(arr,v){v=String(v||'').trim();if(!v)return;if(arr.indexOf(v)<0)arr.push(v);}
    function fieldPool(fk){
      var fields=(typeof deptFields!=='undefined'&&deptFields['Cameras / Video'])||[];
      for(var i=0;i<fields.length;i++){if(fields[i][0]===fk&&Array.isArray(fields[i][2]))return fields[i][2].slice();}
      return [];
    }
    /* catalog pools from Department Status field definitions */
    fieldPool('model').forEach(function(v){uniqPush(bodies,v);});
    fieldPool('lens').forEach(function(v){uniqPush(lenses,v);});
    fieldPool('config').forEach(function(v){uniqPush(mounts,v);});
    /* always expose jib + steadicam as mount options for blocking */
    ['Jib 9 ft','Jib 12 ft','Jib 30 ft','Steadicam','RF Steadicam','Hard cam · pedestal','Hand Held','PTZ rig','Sky cam / aerial','Spy / POV rig'].forEach(function(v){uniqPush(mounts,v);});

    function isCameraBody(model){
      if(!model)return false;
      if(/\b(HDCU|RCP|Build-?up|Prompter|Autoscript|Shed|Rattler|CCU|XBox|monitor only)\b/i.test(model)&&!/\b(HDC-|LDX|UHK|FR7|FR-7|PXW|FX9|FX6|camera)\b/i.test(model))return false;
      return true;
    }
    function inferRole(mount,body){
      var s=((mount||'')+' '+(body||'')).toLowerCase();
      if(/\bjib\b/.test(s))return 'jib';
      if(/steadi|steadicam/.test(s))return 'steadicam';
      if(/\bptz\b|fr7|robo/.test(s))return 'ptz';
      if(/hand.?held|eng/.test(s))return 'handheld';
      return 'camera';
    }
    var camN=0;
    var lines=(p.tbEquip&&p.tbEquip['Cameras / Video'])||[];
    lines.forEach(function(ln,li){
      if(!ln||!isCameraBody(ln.model))return;
      var qty=parseInt(ln.qty,10);if(isNaN(qty)||qty<1)qty=1;
      if(qty>24)qty=24;
      var i;
      for(i=0;i<qty;i++){
        camN++;
        var body=ln.model||'';
        var lens=ln.lens||'';
        var mount=ln.ped||ln.config||'';
        var op=(ln.notes&&/op[:\s]/i.test(ln.notes))?(ln.notes.replace(/^[\s\S]*?op[:\s]+/i,'').split(/[·|;]/)[0]||'').trim():'';
        if(ln.opname)op=ln.opname;
        uniqPush(bodies,body);uniqPush(lenses,lens);uniqPush(mounts,mount);if(op)uniqPush(operators,op);
        packages.push({
          id:'dept_'+li+'_'+i,
          n:camN,
          label:'CAM '+camN+(body?(' · '+body):''),
          shortLabel:'CAM '+camN,
          body:body,
          lens:lens,
          mount:mount,
          role:inferRole(mount,body),
          smpte:ln.smptelen||'',
          monitor:ln.monitor||'',
          hood:ln.hood||'',
          glass:ln.glass||'',
          scanid:ln.scanid||'',
          serial:ln.serial||'',
          operator:op,
          notes:ln.notes||'',
          source:'Department Status · Cameras / Video'
        });
      }
    });
    /* if equip empty, seed packages from summary count + model/lens fields */
    if(!packages.length){
      var fv=(p.tbFields&&p.tbFields['Cameras / Video'])||{};
      var body0=fv.model||'';
      var lens0=fv.lens||'';
      var mount0=fv.config||'';
      var n=parseInt(fv.count,10)||0;
      if(body0||lens0||n){
        if(!n)n=1;
        if(n>24)n=24;
        var j;
        for(j=0;j<n;j++){
          camN++;
          uniqPush(bodies,body0);uniqPush(lenses,lens0);uniqPush(mounts,mount0);
          packages.push({
            id:'field_'+j,n:camN,label:'CAM '+camN+(body0?(' · '+body0):''),shortLabel:'CAM '+camN,
            body:body0,lens:lens0,mount:mount0,role:inferRole(mount0,body0),
            smpte:'',monitor:'',hood:'',glass:'',scanid:'',serial:'',operator:'',notes:'',
            source:'Department Status · Cameras / Video (fields)'
          });
        }
      }
    }
    /* ENG hits for this production — extra camera packages */
    if(typeof engRequests!=='undefined'&&Array.isArray(engRequests)){
      engRequests.forEach(function(e){
        if(!e||e.prod!==key)return;
        try{if(typeof engMigrate==='function')engMigrate(e);}catch(_e){}
        var cams=(e.cameras&&e.cameras.length)?e.cameras:[{camera:e.camera,lens:e.lens,lenstype:e.lenstype,opname:e.opname}];
        cams.forEach(function(c,ci){
          if(!c||(!c.camera&&!c.lens))return;
          camN++;
          uniqPush(bodies,c.camera);uniqPush(lenses,c.lens);if(c.opname)uniqPush(operators,c.opname);
          var mnt=c.lenstype||'ENG / handheld';
          uniqPush(mounts,mnt);
          packages.push({
            id:'eng_'+(e.id||'x')+'_'+ci,n:camN,
            label:'CAM '+camN+(c.camera?(' · '+c.camera):'')+' · ENG '+(e.id||''),
            shortLabel:'CAM '+camN,
            body:c.camera||'',lens:c.lens||'',mount:mnt,role:inferRole(mnt,c.camera),
            smpte:'',monitor:c.vanityspec||'',hood:'',glass:'',scanid:'',serial:'',
            operator:c.opname||'',notes:(e.name||'')+(c.prompter?' · prompter':''),
            source:'ENG · '+(e.id||'request')
          });
        });
      });
    }
    bodies.sort();lenses.sort();mounts.sort();operators.sort();
    return {
      packages:packages,
      bodies:bodies,
      lenses:lenses,
      mounts:mounts,
      operators:operators,
      empty:!packages.length&&!bodies.length,
      source:'Department Status — Production Areas · Cameras / Video',
      count:packages.length,
      prodName:p.name||key
    };
  }catch(err){return empty;}
}
try{if(typeof window!=='undefined')window.museBlockingGear=museBlockingGear;}catch(e){}
function equipLinesHTML(key,dept){var p=productions[key];var sch=equipSchemaFor(dept);var lines=getEquip(p,dept);var wrap=sch.wrap;
  var rows=lines.map(function(ln,li){
    var cells=sch.cols.map(function(col){var cur=ln[col.key]||'';
      var cap=wrap?'<span class="text-[7px] uppercase tracking-wider text-gray-400 block leading-none mb-0.5">'+col.label+'</span>':'';
      // v30 Module 1: scannable ID — mono input, auto-generated on add, regen button when blank
      if(col.scan){return '<div'+(wrap?' style="flex:0 1 auto;min-width:148px"':'')+'>'+cap+'<div class="flex items-center gap-1"><input value="'+(''+cur).replace(/"/g,'&quot;')+'" onchange="setEquip(\''+key+'\',\''+dept.replace(/'/g,"\\'")+'\','+li+',\''+col.key+'\',this.value)" placeholder="Scan / barcode ID" class="text-[10px] mono text-gray-700 bg-white border border-gray-200 rounded px-1.5 py-1" style="outline:none;width:100%;min-width:118px" title="Unique scannable ID — used by PackList &amp; barcode workflows">'+
        (cur?'':'<button onclick="setEquip(\''+key+'\',\''+dept.replace(/'/g,"\\'")+'\','+li+',\''+col.key+'\',genEquipScanId(\''+dept.replace(/'/g,"\\'")+'\'))" title="Generate a unique scan ID" class="text-[9px] font-bold text-blue-700 hover:underline flex-shrink-0">gen</button>')+'</div></div>';}
      if(col.num){var qn=parseInt(cur,10);if(isNaN(qn))qn=1;
        return '<div>'+cap+'<div class="flex items-center border border-gray-200 rounded bg-white flex-shrink-0" style="height:24px">'+
          '<button onclick="stepEquip(\''+key+'\',\''+dept.replace(/'/g,"\\'")+'\','+li+',\''+col.key+'\',-1)" class="text-gray-600 hover:text-gray-800 px-1.5 leading-none" style="font-size:12px">−</button>'+
          '<span class="mono text-[11px] font-bold text-gray-800 text-center" style="width:22px">'+qn+'</span>'+
          '<button onclick="stepEquip(\''+key+'\',\''+dept.replace(/'/g,"\\'")+'\','+li+',\''+col.key+'\',1)" class="text-gray-600 hover:text-gray-800 px-1.5 leading-none" style="font-size:12px">+</button>'+
        '</div></div>';}
      if(col.text){return '<div'+(wrap?' style="flex:1 1 auto;min-width:90px"':'')+'>'+cap+'<input value="'+(''+cur).replace(/"/g,'&quot;')+'" onchange="setEquip(\''+key+'\',\''+dept.replace(/'/g,"\\'")+'\','+li+',\''+col.key+'\',this.value)" placeholder="'+col.label+'" class="text-[10px] text-gray-700 bg-white border border-gray-200 rounded px-1.5 py-1" style="outline:none;width:100%;min-width:60px"></div>';}
      var pool0=col.optsFn?col.optsFn(key):(col.opts?col.opts:(col.pool?gearPool(dept):((deptFields[dept]||[]).filter(function(f){return f[0]===col.field;})[0]||[null,null,[]])[2]));
      var pool=pool0.slice().sort(function(a,b){return (''+a).localeCompare((''+b),undefined,{numeric:true,sensitivity:'base'});});
      var os='<option value="">'+esc(col.label)+'</option>'+pool.map(function(o){return '<option value="'+esc(o).replace(/"/g,'&quot;')+'"'+(cur===o?' selected':'')+'>'+esc(o)+'</option>';}).join('');
      if(cur&&pool.indexOf(cur)<0)os+='<option value="'+esc(''+cur).replace(/"/g,'&quot;')+'" selected>'+esc(''+cur)+'</option>';
      return '<div'+(wrap?' style="flex:1 1 auto;min-width:110px"':' style="flex:1 1 auto;min-width:70px"')+'>'+cap+'<select onchange="setEquip(\''+key+'\',\''+dept.replace(/'/g,"\\'")+'\','+li+',\''+col.key+'\',this.value)" class="text-[10px] text-gray-700 bg-white border border-gray-200 rounded px-1.5 py-1" style="outline:none;width:100%">'+os+'</select></div>';
    }).join('');
    return '<div class="dept-equipment-row flex '+(wrap?'flex-wrap':'items-center')+' gap-1 mb-1 '+(wrap?'items-end bg-gray-50/60 border border-gray-100 rounded-lg p-2':'')+'">'+cells+'<button onclick="removeEquip(\''+key+'\',\''+dept.replace(/'/g,"\\'")+'\','+li+')" title="Remove" class="text-red-400 hover:text-red-600 flex-shrink-0 self-center" style="width:18px">✕</button></div>';
  }).join('');
  return '<div class="mt-2 pt-2 border-t border-gray-200/70">'+
    '<div class="flex items-center justify-between mb-1"><label class="text-[8px] font-bold uppercase tracking-wider text-gray-500">'+(sch.title||'Equipment — add multiple')+'</label>'+
    '<button onclick="addEquip(\''+key+'\',\''+dept.replace(/'/g,"\\'")+'\')" class="text-[9px] font-bold text-blue-700 hover:underline">'+sch.add+'</button></div>'+
    (rows||'<p class="text-[9px] text-gray-500 italic mb-1">No line items — click '+sch.add.replace('+','')+'</p>')+'</div>';
}
function addEquip(key,dept){var p=productions[key];getEquip(p,dept).push({scanid:genEquipScanId(dept)});stampEdit(key);renderProjectView(key);}
function removeEquip(key,dept,i){var p=productions[key];getEquip(p,dept).splice(i,1);stampEdit(key);renderAll();renderProjectView(key);}
function setEquip(key,dept,i,col,val){var p=productions[key];var ln=getEquip(p,dept)[i];if(!ln)return;ln[col]=val;stampEdit(key);
  /* v30 Module 5: the old camera→Prompter auto-link is gone — Prompter merged into
     Cameras / Video, and hood/glass now live directly on the camera line itself. */
  if(dept==="Cameras / Video"&&(col==="hood"||col==="glass")){
    if(document.getElementById('view-'+key)){renderProjectView(key);return;}
  }
  // numbers/text update quietly; selects re-render so dependent dropdowns stay consistent
  renderTabs();renderPortfolio();renderSnapshot();renderMatrix();}
function stepEquip(key,dept,i,col,delta){var p=productions[key];var ln=getEquip(p,dept)[i];if(!ln)return;var q=parseInt(ln[col],10);if(isNaN(q))q=1;q+=delta;if(q<1)q=1;if(q>50)q=50;ln[col]=q;stampEdit(key);renderProjectView(key);renderTabs();renderPortfolio();renderSnapshot();renderMatrix();}

/* ===== PER-PROJECT VENDORS + document uploads ===== */
function prodKeyOf(p){for(var k in productions)if(productions.hasOwnProperty(k)&&productions[k]===p)return k;return null;}
/* [{id, docs:[{name,data}]}] — on multi-venue productions each venue keeps its own
   vendor list (p.vendorsLoc[locId], surveyLoc-style alias: p.vendors always points
   at the ACTIVE venue's array, so every existing caller keeps working). */
function getProjVendors(p){
  var k=prodKeyOf(p);
  if(k&&typeof hasLocs==='function'&&hasLocs(k)){
    var L=(typeof activeLocation==='function')?activeLocation(k):null;
    if(L){
      if(!p.vendorsLoc){p.vendorsLoc={};var first=locsOf(k)[0];p.vendorsLoc[first.id]=(p.vendors&&p.vendors.length)?p.vendors:[];}
      if(!p.vendorsLoc[L.id])p.vendorsLoc[L.id]=[];
      p.vendors=p.vendorsLoc[L.id];
      return p.vendors;}}
  if(!p.vendors)p.vendors=[];return p.vendors;}
function projVendorEntry(p,vid){var pv=getProjVendors(p);for(var i=0;i<pv.length;i++)if(pv[i].id===vid)return pv[i];return null;}
function vendorsByVenueBar(key){
  if(typeof hasLocs!=='function'||!hasLocs(key))return '';
  var p=productions[key];var act=activeLocation(key);
  var chips=locsOf(key).map(function(L){
    var n=((p.vendorsLoc&&p.vendorsLoc[L.id])||[]).length;var on=act&&act.id===L.id;
    return '<button onclick="setActiveLoc(\''+key+'\',\''+L.id+'\')" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold '+(on?'bg-gray-900 text-white border-gray-900':'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')+'">'+(L.flag||'\uD83D\uDCCD')+' '+esc(L.name)+' <span class="mono '+(on?'text-white/70':'text-gray-400')+'">'+n+'</span></button>';}).join('');
  return '<div class="bg-white rounded-2xl px-4 py-3 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">'+
    '<div class="flex items-center gap-2 flex-wrap"><span class="text-[9px] font-bold uppercase tracking-wider text-gray-500">Vendors — by venue</span>'+chips+'</div>'+
    '<p class="text-[9px] text-gray-400 mt-1.5">Multi-venue production — every venue keeps its own vendor list. Click a venue to switch the workspace to it.</p></div>';}
function vendorCoiDays(exp){
  if(!exp)return null;var t=Date.parse(exp);if(isNaN(t))return null;
  var now=(typeof museNow==='function')?museNow():new Date();
  return Math.ceil((t-now.getTime())/86400000);
}
function vendorCoiBadge(exp){
  var d=vendorCoiDays(exp);
  if(d==null)return '<span class="text-[8px] font-bold mono bg-gray-100 text-gray-500 border border-gray-200 rounded px-1.5 py-0.5">COI not set</span>';
  if(d<0)return '<span class="text-[8px] font-bold mono bg-red-50 text-red-700 border border-red-200 rounded px-1.5 py-0.5 attn-badge">COI EXPIRED '+(-d)+'d</span>';
  if(d<=30)return '<span class="text-[8px] font-bold mono bg-amber-50 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5">COI expires in '+d+'d</span>';
  return '<span class="text-[8px] font-bold mono bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.5">COI OK · '+d+'d</span>';
}
function vendorCoiHTML(key,e){
  var exp=e.coiExpiry||'';
  return '<div class="flex flex-wrap items-center gap-2 mt-1.5">'+vendorCoiBadge(exp)+
    '<label class="text-[8px] font-bold uppercase tracking-wider text-gray-400">COI expiry <input type="date" value="'+esc(exp)+'" onchange="setVendorCoi(\''+key+'\',\''+e.id+'\',this.value)" class="text-[10px] mono border border-gray-200 rounded px-1.5 py-0.5 ml-1" style="outline:none"></label></div>';
}
function setVendorCoi(key,vid,val){
  var p=productions[key];var e=projVendorEntry(p,vid);if(!e)return;
  e.coiExpiry=val||'';stampEdit(key);renderProjectView(key);
  var d=vendorCoiDays(e.coiExpiry);
  if(d!=null&&d<0)toast&&toast('⚠ COI expired for '+(vendorById(vid).name||vid));
  else if(d!=null&&d<=30)toast&&toast('COI expires in '+d+' days — renew before load-in');
}
function vendorCoiAlertsHTML(key){
  var p=productions[key];var pv=getProjVendors(p);var bad=[];
  pv.forEach(function(e){var d=vendorCoiDays(e.coiExpiry);var v=vendorById(e.id);
    if(d==null)bad.push({name:v?v.name:e.id,msg:'no COI date'});
    else if(d<0)bad.push({name:v?v.name:e.id,msg:'EXPIRED '+(-d)+'d ago'});
    else if(d<=30)bad.push({name:v?v.name:e.id,msg:'expires in '+d+'d'});
  });
  if(!bad.length)return '';
  return '<div class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 mb-3 text-[10px] text-amber-900">'+
    '<b>Insurance / COI attention</b> — '+bad.map(function(b){return esc(b.name)+' ('+esc(b.msg)+')';}).join(' · ')+'</div>';
}
function vendorsCardHTML(key){var p=productions[key];var pv=getProjVendors(p);
  var vAct=(typeof hasLocs==='function'&&hasLocs(key)&&typeof activeLocation==='function')?activeLocation(key):null;
  var assignedIds=pv.map(function(x){return x.id;});
  var available=vendors.filter(function(v){return assignedIds.indexOf(v.id)<0;});
  var addSel='<select id="vendorAdd_'+key+'" class="text-[10px] text-gray-700 bg-white border border-gray-300 rounded-lg px-2 py-1.5" style="outline:none"><option value="">+ Add vendor to this production…</option>'+
    available.map(function(v){return '<option value="'+v.id+'">'+esc(v.name)+' — '+esc(v.category||'')+'</option>';}).join('')+'</select>';
  var rows=pv.map(function(e){var v=vendorById(e.id);if(!v)return '';
    var docs=(e.docs||[]).map(function(dc,di){return '<span class="inline-flex items-center gap-1 bg-gray-100 border border-gray-200 rounded px-2 py-0.5 text-[9px] mono mr-1 mb-1"><button onclick="openVendorDocPDF(\''+key+'\',\''+v.id+'\','+di+')" class="hover:text-blue-700 hover:underline" title="Open document">📄 '+esc(dc.name)+'</button> <button onclick="removeVendorDoc(\''+key+'\',\''+v.id+'\','+di+')" class="text-red-400 hover:text-red-600">✕</button></span>';}).join('')||'<span class="text-[9px] text-gray-500 italic">No documents uploaded</span>';
    return '<div class="border border-gray-200 rounded-xl p-3 mb-2">'+
      '<div class="flex items-start justify-between gap-2">'+
        '<div class="flex items-start gap-2.5"><div class="rounded-md overflow-hidden border border-gray-200 flex-shrink-0" style="width:54px;height:40px">'+projectMapSVG(v.address||v.name)+'</div>'+
        '<div><p class="text-xs font-bold text-gray-900 leading-tight">'+esc(v.name)+'</p><p class="text-[9px] text-gray-500">'+esc(v.category||'')+'</p>'+
        '<p class="text-[10px] text-gray-600 mt-0.5">'+esc(v.contact||'')+(v.phone?' · <span class="mono">'+esc(v.phone)+'</span>':'')+'</p>'+
        (typeof vendorCoiHTML==='function'?vendorCoiHTML(key,e):'')+'</div></div>'+
        '<button onclick="removeProjVendor(\''+key+'\',\''+v.id+'\')" class="text-[10px] text-red-500 hover:underline flex-shrink-0">Remove</button>'+
      '</div>'+
      '<div class="mt-2 pt-2 border-t border-gray-100"><div class="flex items-center justify-between mb-1"><span class="text-[8px] font-bold uppercase tracking-wider text-gray-500">Rental Documents</span>'+
        '<label class="text-[9px] font-bold text-blue-700 hover:underline cursor-pointer">+ Upload<input type="file" multiple style="display:none" onchange="uploadVendorDoc(\''+key+'\',\''+v.id+'\',event)"></label></div>'+
        '<div>'+docs+'</div></div>'+
    '</div>';
  }).join('');
  return '<div class="space-y-4">'+vendorsByVenueBar(key)+(typeof vendorCoiAlertsHTML==='function'?vendorCoiAlertsHTML(key):'')+'<div class="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">'+
    '<div class="flex flex-wrap items-center justify-between gap-2 mb-4"><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">Vendors on this Production'+(vAct?' — '+esc(vAct.name):'')+'</h3><button onclick="openVendorManager()" class="text-[10px] font-bold text-blue-700 hover:underline">Manage Directory →</button></div>'+
    (rows||'<p class="text-xs text-gray-500 mb-3">No third-party vendors assigned yet.</p>')+
    '<div class="mt-1 flex items-center gap-2">'+addSel+'<button onclick="addProjVendorFromSel(\''+key+'\')" class="text-[10px] font-bold text-white bg-blue-600 rounded-lg px-3 py-1.5 hover:bg-blue-700">Add</button></div>'+
  '</div></div>';
}
function addProjVendorFromSel(key){var sel=document.getElementById('vendorAdd_'+key);if(!sel||!sel.value)return;addProjVendor(key,sel.value);}
function addProjVendor(key,vid){var p=productions[key];var pv=getProjVendors(p);if(pv.map(function(x){return x.id;}).indexOf(vid)<0){pv.push({id:vid,docs:[]});stampEdit(key);renderProjectView(key);toast(vendorById(vid).name+' added to '+p.name);}}
function removeProjVendor(key,vid){var p=productions[key];var pv=getProjVendors(p);var i=pv.map(function(x){return x.id;}).indexOf(vid);if(i>-1)pv.splice(i,1);stampEdit(key);renderProjectView(key);}
function uploadVendorDoc(key,vid,ev){var p=productions[key];var e=projVendorEntry(p,vid);if(!e)return;var files=ev.target.files;if(!files||!files.length)return;
  var pending=files.length;
  for(var i=0;i<files.length;i++){(function(f){var r=new FileReader();r.onload=function(){e.docs=e.docs||[];e.docs.push({name:f.name,data:(''+r.result).slice(0,8)==='data:'?'(stored)':''});stampEdit(key);pending--;if(pending<=0){renderProjectView(key);toast('Uploaded '+files.length+' document(s) for '+vendorById(vid).name);}};r.readAsDataURL(f);})(files[i]);}
}
function removeVendorDoc(key,vid,di){var p=productions[key];var e=projVendorEntry(p,vid);if(!e||!e.docs)return;e.docs.splice(di,1);stampEdit(key);renderProjectView(key);}

var projSubTab={};
/* Master crew roster — SYNTHETIC demo identities only (no real PII).
   Import real people via Personnel → Template / Import, or link Microsoft contacts later. */
var CREW_FIELD=[
 {pos:"Tech Manager — Lead",name:"Riley Stanton",email:"morgan.hale@meta.com",phone:"(212) 555-0101",prov:"Meta Field Ops"},
 {pos:"Coordinator, Field Operations",name:"Cameron Holt",email:"jordan.ellis@meta.com",phone:"(212) 555-0102",prov:"Meta Field Ops"},
 {pos:"Production Manager",name:"Alex Marlowe",email:"riley.quinn@meta.com",phone:"(212) 561-0103",prov:"Meta Live Events"},
 {pos:"EIC",name:"Quinn Adler",email:"casey.navarro@meta.com",phone:"(212) 555-0104",prov:"Meta Field Ops"},
 {pos:"EIC 2 / Video Shader",name:"Ellis Voss",email:"drew.patel@meta.com",phone:"(212) 555-0105",prov:"Meta Field Ops"},
 {pos:"Transmission Engineer",name:"Pat Wynn",email:"sam.ortega@meta.com",phone:"(212) 555-0106",prov:"Meta Field Ops"},
 {pos:"Audio / Comms Guarantee",name:"Noah Barrett",email:"alex.rivera@meta.com",phone:"(212) 556-0107",prov:"Meta Field Ops"},
 {pos:"A1",name:"Kimber Rhodes",email:"taylor.brooks@meta.com",phone:"(212) 556-0108",prov:"Meta Field Ops"},
 {pos:"Lighting Director",name:"Harper Sloan",email:"cameron.west@meta.com",phone:"(212) 555-0109",prov:"Meta Live Production"},
 {pos:"Lead Utility",name:"Reese Callahan",email:"jamie.soto@meta.com",phone:"(212) 556-0110",prov:"Meta Field Ops"},
 {pos:"Utility",name:"Eden Walsh",email:"blair.kim@meta.com",phone:"(212) 555-0111",prov:"Scripted"},
 {pos:"Floor / Stage Manager",name:"Jamie Calder",email:"reese.delgado@meta.com",phone:"(212) 561-0112",prov:"Mediapro"},
 {pos:"Hard Cam Op",name:"Avery Nolan",email:"logan.cruz@meta.com",phone:"(212) 561-0113",prov:"Mediapro"},
 {pos:"Hard Cam Op",name:"Jordan Lane",email:"harper.diaz@meta.com",phone:"(212) 561-0114",prov:"Mediapro"},
 {pos:"Hard Cam Op",name:"Logan Pierce",email:"quinn.morales@meta.com",phone:"(212) 561-0115",prov:"Mediapro"},
 {pos:"Steadicam Op",name:"Drew Lang",email:"avery.park@meta.com",phone:"(212) 561-0116",prov:"Mediapro"},
 {pos:"Jib Op",name:"Skyler Boone",email:"nolan.vega@meta.com",phone:"(212) 561-0117",prov:"Mediapro"},
 {pos:"Utility 1",name:"Dana Crowe",email:"skyler.james@meta.com",phone:"(212) 561-0118",prov:"Mediapro"},
 {pos:"Utility 2",name:"Parker Ames",email:"hayden.cole@meta.com",phone:"(212) 561-0119",prov:"Mediapro"}
];
var CREW_IT=[
 {pos:"Network Architect",name:"Casey Whitaker",email:"morgan.blake@meta.com",phone:"(212) 555-0120",prov:"Muse Live"},
 {pos:"IT Networking Engineer",name:"Parker Amestte",email:"parker.singh@meta.com",phone:"(212) 562-0121",prov:"Muse Live"},
 {pos:"IT Client Services",name:"Chris Dalton",email:"rowan.wells@meta.com",phone:"(212) 563-0122",prov:"Muse Live"},
 {pos:"Director of Engineering",name:"Micah Trent",email:"dana.frost@meta.com",phone:"—",prov:"Mediapro"},
 {pos:"Engineering Manager",name:"Morgan Pryce",email:"kai.bennett@meta.com",phone:"(212) 561-0123",prov:"Mediapro"}
];
var CREW_PCR=[
 {pos:"Show Director",name:"Taylor Grayson",email:"jordan.vale@meta.com",phone:"(212) 556-0124",prov:"Meta Live Production"},
 {pos:"Assistant Director",name:"Blair Hendrix",email:"morgan.shaw@meta.com",phone:"—",prov:"Meta Live Production"},
 {pos:"Technical Director",name:"Sam Ellison",email:"riley.torres@meta.com",phone:"ext. 4401",prov:"Meta Live Production"},
 {pos:"PCR Tech Manager",name:"Rowan Blake",email:"casey.okonkwo@meta.com",phone:"(212) 555-0125",prov:"Meta Live Production"},
 {pos:"Graphics Operator",name:"Sasha Keene",email:"avery.lin@meta.com",phone:"(212) 555-0126",prov:"Meta Live Production"},
 {pos:"Replay Operator",name:"Shay Donovan",email:"drew.fontaine@meta.com",phone:"ext. 4414",prov:"Meta Live Production"},
 {pos:"Teleprompter Operator",name:"Remy Colton",email:"blair.santos@meta.com",phone:"(212) 556-0127",prov:"Meta Live Production"}
];
var CREW_EXEC=[
 {pos:"VP, Technical Production",name:"Lila Hart",email:"avery.chen@meta.com",phone:"—",prov:"Muse Live"},
 {pos:"VP Live Production & Partnerships",name:"Finley Brooks",email:"cameron.ruiz@meta.com",phone:"—",prov:"Mediapro"},
 {pos:"Dir. Live Production & XR",name:"Lee Ashford",email:"taylor.mendes@meta.com",phone:"(954) 555-0128",prov:"Mediapro"}
];

/* ---- Project Overview: interactive Operational Matrix (at-a-glance dept status, click to anchor) ---- */
function projectMatrixHTML(key,p){
  var cells=p.dept.map(function(d){var s=statusMap[d[1]];var anchor='dept-'+key+'-'+d[0].replace(/[^a-z0-9]/gi,'');
    return '<button onclick="overviewGoCat(\''+key+'\',\''+esc(d[0]).replace(/'/g,"\\'")+'\')" class="group flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all hover:shadow-sm hover:-translate-y-0.5 min-h-[72px]" style="border-color:#e4e6eb;background:#ffffff">'+
      '<div class="flex items-center justify-between w-full gap-2"><span class="w-2 h-2 rounded-full bg-'+s.dot+'-500 flex-shrink-0"></span><span class="text-[8.5px] font-bold uppercase '+s.text+'" style="letter-spacing:.08em">'+s.label+'</span></div>'+
      '<span class="text-[11px] font-semibold text-gray-800 leading-snug group-hover:text-blue-700" style="letter-spacing:-.005em">'+esc(d[0])+'</span></button>';
  }).join('');
  return '<div class="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">'+
    '<div class="flex flex-wrap items-center justify-between gap-2 mb-3"><div><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">Operational Matrix</h3><p class="text-[10px] text-gray-500 mt-0.5">Every department at a glance — tap a tile to jump to its section.</p></div>'+
      '<span class="text-[9px] mono text-gray-400">'+p.dept.length+' areas</span></div>'+
    '<div class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">'+cells+'</div></div>';
}
/* selectable category chips above the mosaic — filter the dept tiles to reduce density */
function overviewCatChips(key,p){
  var cur=overviewCat[key]||'all';
  var chips='<button onclick="setOverviewCat(\''+key+'\',\'all\')" class="text-[10px] font-bold px-2.5 py-1 rounded-lg border '+(cur==='all'?'bg-gray-900 text-white border-gray-900':'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')+'">All ('+p.dept.length+')</button>';
  chips+=p.dept.map(function(d){var s=statusMap[d[1]];var on=(cur===d[0]);
    return '<button onclick="setOverviewCat(\''+key+'\',\''+esc(d[0]).replace(/'/g,"\\'")+'\')" class="text-[10px] font-bold px-2.5 py-1 rounded-lg border inline-flex items-center gap-1.5 '+(on?'bg-gray-900 text-white border-gray-900':'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')+'"><span class="w-1.5 h-1.5 rounded-full bg-'+s.dot+'-500"></span>'+esc(d[0])+'</button>';
  }).join('');
  return '<div class="flex flex-wrap gap-1.5 mb-4">'+chips+'</div>';
}
var overviewCat={};
function setOverviewCat(key,cat){overviewCat[key]=(overviewCat[key]===cat?'all':cat);applyOverviewCat(key);
  // re-render just the chips + tiles visibility without rebuilding the whole view
  renderProjectView(key);
  // after re-render, if a specific category, scroll to it
  if(overviewCat[key]&&overviewCat[key]!=='all')setTimeout(function(){overviewScrollTo(key,overviewCat[key]);},60);
}
function applyOverviewCat(key){var cat=overviewCat[key]||'all';
  var tiles=document.querySelectorAll('#view-'+key+' .dept-t');
  tiles.forEach(function(t){var c=t.getAttribute('data-deptcat');t.style.display=(cat==='all'||c===cat)?'':'none';});
}
function overviewScrollTo(key,cat){var id='dept-'+key+'-'+cat.replace(/[^a-z0-9]/gi,'');var el=document.getElementById(id);
  if(el&&el.scrollIntoView)el.scrollIntoView({behavior:'smooth',block:'start'});
  if(el){el.classList.add('ring-2','ring-blue-400');setTimeout(function(){el.classList.remove('ring-2','ring-blue-400');},1400);}}
/* matrix tile click → ensure the category is shown, expand its board tile, then anchor to it */
function overviewGoCat(key,cat){if(overviewCat[key]&&overviewCat[key]!=='all'&&overviewCat[key]!==cat){overviewCat[key]='all';}
  if(!deptTileOpen(key)[cat]){deptTileOpen(key)[cat]=1;renderDeptBoard(key);}
  if(deptUIGet(productions[key]).hidden[cat]){deptTileRestore(key,cat);}
  applyOverviewCat(key);overviewScrollTo(key,cat);}

/* ================================================================================
   v30 MODULE 0 — DEPARTMENT STATUS TILE BOARD
   One tile per department: collapsed = status + item/alert counts + summary;
   expanded (click) = status row → equipment lines → field sub-sections → notes.
   Any tile or labeled sub-section can be hidden (display-only — data kept) and
   restored later. Hidden state persists per production in p.deptUI.
   ================================================================================ */
function deptUIGet(p){if(!p.deptUI||typeof p.deptUI!=='object')p.deptUI={};
  if(!p.deptUI.hidden)p.deptUI.hidden={};if(!p.deptUI.secHidden)p.deptUI.secHidden={};return p.deptUI;}
var deptTileOpenMap={}; // transient: which tiles are expanded, per production
function deptTileOpen(key){if(!deptTileOpenMap[key])deptTileOpenMap[key]={};return deptTileOpenMap[key];}
/* group a department's field schema into sub-sections split on "header" pseudo-fields;
   fields before the first header form the unlabeled '_gen' section */
function deptSections(dept){var fields=deptFields[dept]||[];var secs=[];var cur={hkey:'_gen',label:'',fields:[]};
  fields.forEach(function(f){var ftype=f[3]||(typeof f[2]==='string'?f[2]:'');
    if(ftype==='header'){if(cur.fields.length)secs.push(cur);cur={hkey:f[0],label:f[1],fields:[]};return;}
    cur.fields.push(f);});
  if(cur.fields.length)secs.push(cur);return secs;}
function deptItemCount(p,dept){var fv=(p.tbFields&&p.tbFields[dept])||{};var n=0;
  (deptFields[dept]||[]).forEach(function(f){var ftype=f[3]||(typeof f[2]==='string'?f[2]:'');if(ftype==='header')return;
    var v=fv[f[0]];if(Array.isArray(v)){n+=v.filter(function(x){if(x==null||x==='')return false;
      if(typeof x==='object')return !!x.a; // rvon channel objects count only when an alpha is assigned
      return true;}).length;}
    else if(v!=null&&v!==''){n++;}});
  n+=((p.tbEquip&&p.tbEquip[dept])||[]).length;return n;}
function deptAlertCount(p,dept){var n=0;try{evalRules(p).forEach(function(r){if(r.dept===dept)n++;});}catch(e){}return n;}
/* one field control — the shared editor builder used inside every tile (extracted
   from the old tabbed master-detail so all tiles render fields identically) */
function deptFieldControlHTML(key,dept,f,fv){var cur=fv[f[0]]||'';var ftype=f[3]||(typeof f[2]==='string'?f[2]:'');var opts=Array.isArray(f[2])?f[2]:[];var dq=dept.replace(/'/g,"\\'");
  if(ftype==='header')return '';
  // pure-count fields (and num-typed fields) use a +/- stepper (max 50)
  if(f[0]==='count'||ftype==='num'){var qn=parseInt(cur,10);if(isNaN(qn))qn=0;
    return '<div class="mb-1.5"><label class="text-[8px] font-bold uppercase tracking-wider text-gray-500 block mb-0.5">'+f[1]+'</label>'+
      '<div class="inline-flex items-center border border-gray-200 rounded bg-white" style="height:28px">'+
        '<button onclick="stepDeptCount(\''+key+'\',\''+dq+'\',\''+f[0]+'\',-1)" class="text-gray-600 hover:text-gray-800 px-2 leading-none" style="font-size:14px">−</button>'+
        '<span class="mono text-[12px] font-bold text-gray-800 text-center" style="width:30px">'+qn+'</span>'+
        '<button onclick="stepDeptCount(\''+key+'\',\''+dq+'\',\''+f[0]+'\',1)" class="text-gray-600 hover:text-gray-800 px-2 leading-none" style="font-size:14px">+</button>'+
      '</div></div>';}
  // addable list — chips + input; new entries persist into options
  if(ftype==='addable'){var arr=Array.isArray(cur)?cur:(cur?(''+cur).split(',').map(function(x){return x.trim();}).filter(Boolean):[]);
    var chips=arr.map(function(v,vi){return '<span class="inline-flex items-center gap-1 bg-gray-100 border border-gray-200 rounded px-2 py-0.5 text-[10px] mono mr-1 mb-1">'+v.replace(/</g,'&lt;')+' <button onclick="removeDeptAddable(\''+key+'\',\''+dq+'\',\''+f[0]+'\','+vi+')" class="text-red-400 hover:text-red-600">✕</button></span>';}).join('');
    return '<div class="mb-1.5 dept-span-full"><label class="text-[8px] font-bold uppercase tracking-wider text-gray-500 block mb-0.5">'+f[1]+'</label>'+
      '<div class="dept-chip-row mb-1">'+(chips||'<span class="text-[9px] text-gray-400 italic">none yet</span>')+'</div>'+
      '<input onkeydown="if(event.key===\'Enter\'){addDeptAddable(\''+key+'\',\''+dq+'\',\''+f[0]+'\',this.value);this.value=\'\';}" placeholder="Type an alpha + Enter" class="w-full text-[10px] mono text-gray-700 bg-white border border-blue-200 rounded px-2 py-1.5" style="outline:none"></div>';}
  // unified RVON control — channel count + per-port alpha picker with conflict guard
  if(ftype==='rvon'){return rvonControlHTML(key,dept,f);}
  // free-text / IP fields
  if(ftype==='ip'||ftype==='text'){var ph=ftype==='ip'?'e.g. 192.168.10.50':'Type value';
    return '<div class="mb-1.5"><label class="text-[8px] font-bold uppercase tracking-wider text-gray-500 block mb-0.5">'+f[1]+'</label>'+
      '<input value="'+(''+cur).replace(/"/g,'&quot;')+'" onchange="setDeptField(\''+key+'\',\''+dq+'\',\''+f[0]+'\',this.value)" placeholder="'+ph+'" class="w-full text-[10px] '+(ftype==='ip'?'mono ':'')+'text-gray-700 bg-white border border-gray-200 rounded px-2 py-1.5" style="outline:none"></div>';}
  // IFB phone lines are managed ONLY on the unified IFB platform — read-only mirror here
  if(f[0]==='ifbphone'){var p2=productions[key];var rl=(typeof ifbGet==='function')?ifbGet(p2).lines.filter(function(l){return l.ref;}):[];
    var mirrorChips=rl.map(function(l){return '<span class="inline-flex items-center gap-1 bg-white border border-gray-200 rounded px-2 py-0.5 text-[10px] mono mr-1 mb-1">'+esc(l.ref)+(l.person?' <span class="text-gray-400">·</span> <span class="font-semibold" style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif">'+esc(l.person)+'</span>':'')+'</span>';}).join('');
    return '<div class="mb-1.5 dept-span-full"><label class="text-[8px] font-bold uppercase tracking-wider text-gray-500 block mb-0.5">'+f[1]+'</label>'+
      '<div class="mb-1 dept-chip-row">'+(mirrorChips||'<span class="text-[9px] text-gray-400 italic">No lines dialed yet</span>')+'</div>'+
      '<button type="button" onclick="ifbScrollTo(\''+key+'\')" class="w-full text-left text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1.5 hover:bg-blue-100">⇄ Managed on the IFB Signal Routing platform — open ↓</button></div>';}
  // multi-value dropdown — add as many as you want (chips + "+ Add")
  var arrv=Array.isArray(cur)?cur:(cur?[cur]:[]);
  var chips2=arrv.map(function(v,vi){return '<span class="inline-flex items-center gap-1 bg-white border border-gray-200 rounded px-2 py-0.5 text-[10px] mr-1 mb-1">'+(''+v).replace(/</g,'&lt;')+' <button onclick="removeDeptValue(\''+key+'\',\''+dq+'\',\''+f[0]+'\','+vi+')" class="text-red-400 hover:text-red-600">✕</button></span>';}).join('');
  var availN=opts.filter(function(o){return arrv.indexOf(o)<0;}).length;
  return '<div class="mb-1.5"><label class="text-[8px] font-bold uppercase tracking-wider text-gray-500 block mb-0.5">'+f[1]+'</label>'+
    (chips2?'<div class="dept-chip-row mb-1">'+chips2+'</div>':'')+
    '<button type="button" onclick="openDeptPicker(\''+key+'\',\''+dq+'\',\''+f[0]+'\',this,\'multi\')" class="w-full flex items-center justify-between gap-1 text-[10px] text-gray-600 bg-white border border-gray-200 rounded px-2 py-1.5 hover:border-blue-300" style="outline:none;cursor:pointer" title="Search '+esc(f[1])+'">'+
      '<span class="truncate">'+(arrv.length?'+ Add '+esc(f[1]):'Select '+esc(f[1])+'…')+(availN?' <span class="text-gray-300">·</span> <span class="text-gray-400">'+availN+' options</span>':'')+'</span>'+
      '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'+
    '</button>'+
    '</div>';
}
var DEPT_DOT_HEX={emerald:'#1E7B34',amber:'#F7B928',red:'#E41E3F',blue:'#0866FF',gray:'#b0b3b8'};
/* Department workspaces keep original editors mounted when switching tabs. */
var deptWorkspaceState=Object.create(null);
function deptWorkspaceKey(key,dept){return JSON.stringify([key,dept]);}
function deptWorkspaceSelect(key,dept,pane){
  var host=document.getElementById('dept-'+key+'-'+dept.replace(/[^a-z0-9]/gi,''));if(!host)return;
  var tabs=host.querySelectorAll('[data-dept-pane-tab]'),found=false;
  tabs.forEach(function(b){var on=b.dataset.deptPaneTab===pane;if(on)found=true;b.setAttribute('aria-selected',String(on));});
  if(!found)return;
  deptWorkspaceState[deptWorkspaceKey(key,dept)]=pane;
  host.querySelectorAll('[data-dept-pane]').forEach(function(el){el.hidden=el.dataset.deptPane!==pane;});
  if(typeof museRichMount==='function')try{museRichMount();}catch(e){}
  if(pane==='media'&&typeof audioWaveformsMount==='function')try{audioWaveformsMount(key);}catch(e){}
  window.dispatchEvent(new Event('resize'));
}
function deptWorkspaceSections(dept){
  var original=deptSections(dept);if(dept!=='Transmission / Signal')return original;
  var groups=[['_spec','Signal specification',['format','connector']],['_primary','Primary contribution',['transport','medium','primarypath','handoff','bandwidth']],['_backup','Backup & failover',['backup','redundancy','failover','liveumodel','liveuserial']],['_henc','Encoding & return paths',['encoder','encmap','returnpath','toc']],['_hpath','Advanced engineering',['latency','bitrate','nmos']],['_hsat','Satellite parameters',['satellite','satslot','confnum','satfreq']]];
  var used=Object.create(null),flat=[];original.forEach(function(sec){flat=flat.concat(sec.fields);});
  var result=groups.map(function(g){return {hkey:g[0],label:g[1],fields:g[2].map(function(id){var f=flat.find(function(f){return f[0]===id;});if(f)used[id]=true;return f;}).filter(Boolean)};}).filter(function(g){return g.fields.length;});
  original.forEach(function(sec){var extra=sec.fields.filter(function(f){return !used[f[0]];});if(extra.length)result.push({hkey:sec.hkey,label:sec.label||'Additional configuration',fields:extra});});return result;
}
function deptWorkspaceHTML(key,dept,aid,panes){
  var labels={config:'Configuration',equipment:'Equipment',patching:'Fiber & patching',routing:'IFB & routing',media:'Audio files',operations:'Operations',checks:'Checks & approval',notes:'Notes & history'};
  var order=['config','equipment','patching','routing','media','operations','checks','notes'].filter(function(t){return panes[t];});
  var selected=deptWorkspaceState[deptWorkspaceKey(key,dept)]||'config';if(order.indexOf(selected)<0)selected=order[0];
  var args=JSON.stringify(key)+','+JSON.stringify(dept)+',';
  return '<div class="dept-workspace-tabs" role="tablist" aria-label="'+esc(dept)+' workspace">'+order.map(function(t){var id=aid+'-tab-'+t;return '<button type="button" id="'+id+'" role="tab" aria-selected="'+(t===selected)+'" aria-controls="'+aid+'-pane-'+t+'" data-dept-pane-tab="'+t+'" onclick="'+esc('deptWorkspaceSelect('+args+JSON.stringify(t)+')').replace(/"/g,'&quot;')+'" onkeydown="if(event.key===\'ArrowRight\'||event.key===\'ArrowLeft\'){event.preventDefault();var a=Array.from(this.parentNode.children),b=a[(a.indexOf(this)+(event.key===\'ArrowRight\'?1:a.length-1))%a.length];b.click();b.focus();}">'+labels[t]+'</button>';}).join('')+'</div>'+order.map(function(t){return '<div id="'+aid+'-pane-'+t+'" class="dept-workspace-pane" role="tabpanel" aria-labelledby="'+aid+'-tab-'+t+'" data-dept-pane="'+t+'"'+(t===selected?'':' hidden')+'>'+panes[t]+'</div>';}).join('');
}
function deptTileHTML(key,p,d,idx,alertCounts){
  var dept=d[0];var s=statusMap[d[1]]||statusMap.pending;var ui=deptUIGet(p);
  var open=!!deptTileOpen(key)[dept];var dq=dept.replace(/'/g,"\\'");
  var ap=(p.approvals&&p.approvals[dept])||{state:"Not Started"};
  var locked=(ap.state==='Approved'||ap.state==='Locked');
  var lockIcon=locked?'<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>':'';
  var reapBadge=ap.reapprove?'<span class="text-[8px] font-bold mono px-1.5 py-0.5 rounded bg-red-500 text-white">⚠ RE-APPROVE</span>':'';
  var tileBorder=locked?(ap.state==='Locked'?'border-blue-300':'border-emerald-300'):s.bd;
  var aid='dept-'+key+'-'+dept.replace(/[^a-z0-9]/gi,'');
  var items=deptItemCount(p,dept);var alerts=alertCounts?(alertCounts[dept]||0):deptAlertCount(p,dept);
  var dot=DEPT_DOT_HEX[s.dot]||'#b0b3b8';
  if(!open){
    return '<div id="'+aid+'" data-deptcat="'+esc(dept)+'" onclick="deptTileToggle(\''+key+'\',\''+dq+'\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();deptTileToggle(\''+key+'\',\''+dq+'\');}" role="button" tabindex="0" title="'+esc(deptLabel(dept))+' — click to expand" class="dept-t dept-t-closed '+tileBorder+' '+s.bg+'">'+
      '<div class="flex items-center justify-between gap-2"><span class="flex items-center gap-1.5 min-w-0"><span style="width:8px;height:8px;border-radius:9999px;flex-shrink:0;background:'+dot+'"></span><span class="text-[11px] font-bold text-gray-800 truncate">'+esc(deptLabel(dept))+'</span>'+lockIcon+'</span><span class="text-[8px] mono font-bold uppercase tracking-wider '+s.text+' flex-shrink-0">'+s.label+'</span></div>'+
      '<p class="text-[10px] text-gray-500 mt-1.5 leading-snug" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:26px">'+esc(d[2]&&d[2]!=='—'?d[2]:'No notes yet')+'</p>'+
      '<div class="flex items-center gap-1.5 mt-2 flex-wrap">'+
        '<span class="dept-chip mono">'+items+' item'+(items===1?'':'s')+'</span>'+
        (alerts?'<span class="dept-chip dept-chip-alert mono">⚠ '+alerts+' alert'+(alerts===1?'':'s')+'</span>':'')+
        reapBadge+
        '<span class="text-[9px] text-blue-700 font-bold" style="margin-left:auto">Open ▸</span>'+
      '</div></div>';
  }
  // ---- expanded tile: status row → equipment lines → field sub-sections → notes ----
  var stOpts=['approved','pending','missing'].map(function(st){return '<option value="'+st+'"'+(d[1]===st?' selected':'')+'>'+statusMap[st].label+'</option>';}).join('');
  var fv=(p.tbFields&&p.tbFields[dept])||{};
  var secHid=ui.secHidden[dept]||{};
  var secHTML='',hiddenSecChips='',panes={};
  deptWorkspaceSections(dept).forEach(function(sec){
    if(sec.hkey!=='_gen'&&secHid[sec.hkey]){hiddenSecChips+='<button onclick="deptSecRestore(\''+key+'\',\''+dq+'\',\''+sec.hkey+'\')" class="dept-chip">Restore '+esc(sec.label)+'</button>';return;}
    var ctrls=sec.fields.map(function(f){return deptFieldControlHTML(key,dept,f,fv);}).join('');
    var collapsible=dept==='Transmission / Signal'&&(sec.hkey==='_hsat'||sec.hkey==='_hpath');
    var heading=esc(sec.label||'General configuration');if(sec.hkey!=='_gen'&&!collapsible)heading+='<button onclick="deptSecHide(\''+key+'\',\''+dq+'\',\''+sec.hkey+'\')" class="dept-hidebtn" title="Hide section; data is kept">hide</button>';
    secHTML+=(collapsible?'<details':'<section')+' class="dept-config-group" data-layout-group="'+sec.hkey+'">'+(collapsible?'<summary>':'<div class="dept-config-heading">')+heading+(collapsible?'</summary>':'</div>')+'<div class="dept-fields-cols">'+ctrls+'</div>'+(collapsible?'</details>':'</section>');
  });
  panes.config='<div class="dept-config-grid">'+(secHTML||'<p>No configuration fields for this department.</p>')+'</div>';
  panes.equipment=equipLinesHTML(key,dept);
  var customs=(typeof deptCustomSections==='function')?deptCustomSections(key,dept):[];
  customs.forEach(function(sec){var label=sec.label||sec.title||'Department workflow';
    if(secHid[sec.hkey]){hiddenSecChips+='<button onclick="deptSecRestore(\''+key+'\',\''+dq+'\',\''+sec.hkey+'\')" class="dept-chip">Restore '+esc(label)+'</button>';return;}
    var tab=sec.hkey==='_aircheck'?'checks':['_fiber','_txvenues'].indexOf(sec.hkey)>=0?'patching':sec.hkey==='_ifbboard'?'routing':sec.hkey==='_audiofiles'?'media':'operations';
    panes[tab]=(panes[tab]||'')+'<section class="dept-custom-group"><div class="dept-config-heading">'+esc(label)+'<button onclick="deptSecHide(\''+key+'\',\''+dq+'\',\''+sec.hkey+'\')" class="dept-hidebtn" title="Hide section; data is kept">hide</button></div><div class="dept-custom-content">'+sec.html+'</div></section>';
  });
  panes.checks=(panes.checks||'')+'<section class="dept-config-group"><div class="dept-config-heading">Department approval</div><div class="dept-approval-body"><span>'+esc(ap.state)+'</span><button onclick="openApproval(\''+key+'\',\''+dq+'\')" class="dept-workspace-action">'+(locked?'Manage Lock':'Section Approval')+'</button></div></section>';
  panes.notes='<section class="dept-config-group"><div class="dept-config-heading">Production notes</div><div class="dept-note-body">'+museRichBox({id:'deptn_'+key+'_'+idx,value:(d.__customNote?d[2]:''),toolbar:'slim',height:'100px',placeholder:'Free notes…',onchange:'function(v){setDeptNote(\''+key+'\','+idx+',v)}'})+'</div></section>';
  var history=(p.activity||[]).filter(function(a){return String(a.text||'').indexOf(dept)>=0;}).slice(0,40);
  panes.notes+='<section class="dept-config-group"><div class="dept-config-heading">Recorded department history</div><div class="dept-note-body">'+(history.length?history.map(function(a){return '<div class="dept-history-row"><p>'+esc(a.text||'')+'</p><small>'+esc(a.actor||'')+' · '+esc(a.when||'')+'</small></div>';}).join(''):'<p>No department history recorded.</p>')+'</div></section>';
  return '<div id="'+aid+'" data-deptcat="'+esc(dept)+'" class="dept-t dept-t-open dept-workspace '+tileBorder+' '+s.bg+(locked?' ring-1 ring-inset '+(ap.state==='Locked'?'ring-blue-200':'ring-emerald-200'):'')+'" style="scroll-margin-top:90px">'+
    '<div class="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-3 border-b border-gray-200/70">'+
      '<span class="flex items-center gap-2 text-sm font-bold text-gray-800 cursor-pointer" onclick="deptTileToggle(\''+key+'\',\''+dq+'\')" title="Collapse">'+(locked?lockIcon:'')+esc(deptLabel(dept))+'</span>'+
      '<span class="flex items-center gap-2 flex-wrap">'+reapBadge+
        '<select onchange="setDeptStatus(\''+key+'\','+idx+',this.value)" class="text-[9px] font-bold uppercase tracking-wider rounded border px-1.5 py-1 '+s.badge+'" style="outline:none;cursor:pointer">'+stOpts+'</select>'+
        '<button onclick="openApproval(\''+key+'\',\''+dq+'\')" class="text-[10px] font-bold text-blue-700 hover:underline whitespace-nowrap">'+(locked?'Manage Lock →':'Section Approval →')+'</button>'+
        '<button onclick="deptTileHide(\''+key+'\',\''+dq+'\')" class="dept-hidebtn" title="Hide this department tile (data kept — restore from the strip below the board)">hide tile</button>'+
        '<button onclick="deptTileToggle(\''+key+'\',\''+dq+'\')" class="text-gray-400 hover:text-gray-700 font-bold" title="Collapse" style="font-size:13px;line-height:1">▴</button>'+
      '</span></div>'+
    deptWorkspaceHTML(key,dept,aid,panes)+
    (hiddenSecChips?'<div class="dept-hidden-sections"><span>Hidden sections</span>'+hiddenSecChips+'</div>':'')+
  '</div>';
}
function deptBoardHTML(key){var p=productions[key];var ui=deptUIGet(p);
  var alertCounts=Object.create(null);try{evalRules(p).forEach(function(r){alertCounts[r.dept]=(alertCounts[r.dept]||0)+1;});}catch(e){}
  var tiles='',hiddenChips='';
  p.dept.forEach(function(d,idx){
    if(ui.hidden[d[0]]){hiddenChips+='<button onclick="deptTileRestore(\''+key+'\',\''+d[0].replace(/'/g,"\\'")+'\')" class="dept-chip mono hover:border-blue-300" title="Restore tile — data was kept">↺ '+esc(deptLabel(d[0]))+'</button>';return;}
    tiles+=deptTileHTML(key,p,d,idx,alertCounts);});
  return '<div class="dept-grid">'+(tiles||'<p class="text-xs text-gray-400 italic p-2">All departments are hidden — restore below.</p>')+'</div>'+
    (hiddenChips?'<div class="flex flex-wrap items-center gap-1.5 mt-3 pt-2.5 border-t border-gray-100"><span class="text-[8px] font-bold uppercase tracking-wider text-gray-400">Hidden departments</span>'+hiddenChips+'</div>':'');}
function renderDeptBoard(key){var host=document.getElementById('deptBoard-'+key);
  if(!host){
    /* review fix: only fall back to a full render when the Overview pane should be
       showing — a background conversion finishing must never wipe the pane (and any
       in-progress typing) on an unrelated sub-tab; Overview rebuilds from state anyway */
    if((projSubTab[key]||'overview')==='overview'&&typeof renderProjectView==='function')renderProjectView(key);
    return;}
  host.innerHTML=deptBoardHTML(key);
  try{applyOverviewCat(key);}catch(e){}
  try{if(typeof audioWaveformsMount==='function')setTimeout(function(){audioWaveformsMount(key);},30);}catch(e){}}
function deptTileToggle(key,dept){var o=deptTileOpen(key);if(o[dept])delete o[dept];else o[dept]=1;renderDeptBoard(key);}
function deptTileHide(key,dept){deptUIGet(productions[key]).hidden[dept]=1;try{refreshProjPct(key);}catch(e){}saveState();renderDeptBoard(key);if(document.getElementById('view-'+key))renderProjectView(key);toast(dept+' removed from board — Requirements % recalculated');}
function deptTileRestore(key,dept){delete deptUIGet(productions[key]).hidden[dept];try{refreshProjPct(key);}catch(e){}saveState();renderDeptBoard(key);if(document.getElementById('view-'+key))renderProjectView(key);toast(dept+' restored — Requirements % recalculated');}
function deptSecHide(key,dept,hkey){var ui=deptUIGet(productions[key]);if(!ui.secHidden[dept])ui.secHidden[dept]={};ui.secHidden[dept][hkey]=1;saveState();renderDeptBoard(key);}
function deptSecRestore(key,dept,hkey){var ui=deptUIGet(productions[key]);if(ui.secHidden[dept])delete ui.secHidden[dept][hkey];saveState();renderDeptBoard(key);}

var _projTabSig={}; // v30 Module 14: per-production signature of the sub-tab bar (badges + visibility)
function renderProjectView(key){try{locDeptBind(key);}catch(e){}
  var p=productions[key];var el=document.getElementById('view-'+key);if(!el)return;var c=countStatus(p);var pct=computePct(p);
  // ---- v30 Module 0: Department Status renders as a tile board (see deptBoardHTML above) ----
  // Outstanding Items — system-driven: rules-engine gaps + non-approved statuses
  var ruleItems=evalRules(p).map(function(r){var col=r.severity==='risk'?'red':'amber';
    return '<div class="flex items-start gap-2 text-xs py-1.5 border-b border-gray-50"><span class="w-1.5 h-1.5 rounded-full bg-'+col+'-500 mt-1.5 flex-shrink-0"></span><span class="flex-1"><span class="font-semibold text-gray-800">'+deptLabel(r.dept)+'</span> <span class="text-'+col+'-700 font-bold">· '+(r.severity==='risk'?'RISK':'CHECK')+'</span><br><span class="text-gray-600">'+r.text+'</span></span></div>';});
  var statusItems=p.dept.filter(function(d){return d[1]!=='approved';}).map(function(d){var s=statusMap[d[1]];
    return '<div class="flex items-start gap-2 text-xs py-1.5 border-b border-gray-50"><span class="w-1.5 h-1.5 rounded-full bg-'+s.dot+'-500 mt-1.5 flex-shrink-0"></span><span class="flex-1"><span class="font-semibold text-gray-800">'+deptLabel(d[0])+'</span> <span class="'+s.text+' font-bold">· '+s.label+'</span><br><span class="text-gray-600">'+(d[2]==='—'?'(no notes yet)':d[2])+'</span></span></div>';});
  var warnList=ruleItems.concat(statusItems).join('')||'<p class="text-xs text-emerald-700 font-semibold py-2">All clear — every department approved and no open risks.</p>';
  var thumb=p.thumb?'<img src="'+p.thumb+'" style="width:100%;height:100%;object-fit:cover">':'<div style="width:100%;height:100%;background:'+(barGrad[p.tagColor]||barGrad.gray)+';display:flex;align-items:center;justify-content:center"><span class="text-white text-2xl font-bold">'+(p.name?p.name.charAt(0):'?')+'</span></div>';
  ensureFields(p);
  var meta=[];if(p.date)meta.push(p.date);if(p.time)meta.push(p.time);
  if(typeof hasLocs==='function'&&hasLocs(key)){var __L=activeLocation(key);if(__L){meta.push(__L.flag+' '+esc(__L.name)+' \u00B7 '+esc(__L.city||'')+' \u00B7 <span class="mono font-semibold" data-loctz="'+__L.tz+'">'+locTimeStr(__L.tz)+'</span> '+(__L.tzl||'')+' local \u00B7 '+locsOf(key).length+' sites');}}
  else if(p.venue)meta.push(p.venue);
  var delBtn=p.custom?'<button onclick="deleteProject(\''+key+'\')" class="text-[10px] text-red-600 font-bold hover:underline">Delete Production</button>':'';
  var sub=projSubTab[key]||'overview';
  /* v38: Replay moved from the tab bar into the Department Status board */
  if(sub==='replay')sub=projSubTab[key]='overview';
  if(typeof permCan==='function'&&((sub==='finance'&&!permCan('finance'))||(sub==='vendors'&&!permCan('vendors')))){sub='overview';projSubTab[key]='overview';}
  function subBtn(id,label){return '<button data-sub="'+id+'" onclick="setProjTab(\''+key+'\',\''+id+'\')" class="px-4 py-2 text-xs font-semibold rounded-lg '+(sub===id?'bg-gray-900 text-white shadow-sm':'text-gray-600 hover:bg-gray-100')+'">'+label+'</button>';}
  // ---- OVERVIEW pane ----
  // ---- PROJECT OVERVIEW: interactive Operational Matrix + selectable categories ----
  var projMatrix=projectMatrixHTML(key,p);
  var catChips=overviewCatChips(key,p);
  var goNoGoOverview='';
  try{if(typeof MuseBOps!=='undefined'&&MuseBOps.goNoGoStripHTML)goNoGoOverview=MuseBOps.goNoGoStripHTML(key,true);}catch(eG){}
  var overviewPane=
    ((typeof locGridHTML==='function')?locGridHTML(key):'')+
    goNoGoOverview+
    '<div class="grid grid-cols-3 gap-4"><div class="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center"><span class="text-3xl font-bold text-emerald-600">'+c.approved+'</span><p class="text-[10px] font-bold uppercase tracking-wider text-emerald-500 mt-1">Approved</p></div><div class="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-center"><span class="text-3xl font-bold text-amber-600">'+c.pending+'</span><p class="text-[10px] font-bold uppercase tracking-wider text-amber-500 mt-1">Pending</p></div><div class="bg-red-50 border border-red-100 rounded-2xl p-4 text-center"><span class="text-3xl font-bold text-red-600">'+c.missing+'</span><p class="text-[10px] font-bold uppercase tracking-wider text-red-500 mt-1">Missing</p></div></div>'+
    projMatrix+
    // ---- compact horizontal info strip (Status · Resource Lock · Outstanding) ----
    '<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">'+
      '<div class="bg-white rounded-2xl p-4 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)"><div class="flex items-center justify-between mb-2"><h3 class="text-[10px] font-bold uppercase tracking-wider text-gray-600">Status</h3><span class="text-[9px] mono text-gray-400">'+(p.version||'')+'</span></div><p class="text-base font-semibold text-gray-900">'+phaseFor(p).label+'</p><progress class="w-full '+progClass(pct)+' mt-2" style="height:10px" value="'+pct+'" max="100"></progress><div class="flex items-center justify-between mt-2"><span class="text-[10px] text-gray-600">Target Air</span><span class="text-[11px] font-bold mono text-gray-800">'+(p.date||'TBD')+'</span></div>'+
        '<div class="mt-2 pt-2 border-t border-gray-100"><select onchange="setCustomer(\''+key+'\',this.value)" class="w-full text-[11px] border border-gray-300 rounded-lg px-2 py-1.5 bg-white" style="outline:none">'+customerList.map(function(cc){return '<option value="'+cc+'"'+(p.customer===cc?' selected':'')+'>'+cc+'</option>';}).join('')+'</select></div></div>'+
      resourceLockCardHTML(key)+
      '<div class="bg-white rounded-2xl p-4 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)"><h3 class="text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-2">Outstanding — Pending &amp; Missing</h3><div class="-mb-1.5 max-h-32 overflow-y-auto">'+warnList+'</div><button onclick="museaiAsk(\'What is missing for '+p.name.replace(/'/g,"")+'?\')" class="w-full bg-gray-900 text-white text-[11px] font-bold rounded-lg py-2 hover:bg-gray-800 mt-2">Ask Muse</button></div>'+
    '</div>'+
    // ---- FULL-WIDTH Department Status — tile board (v30 Module 0) ----
    '<div class="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)"><div class="flex flex-wrap items-center justify-between gap-2 mb-3"><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">Department Status — Production Areas</h3><span class="flex items-center gap-2 flex-wrap"><span class="text-[9px] mono text-gray-400 hidden sm:inline">click a tile to expand · '+c.approved+' approved · '+c.pending+' pending · '+c.missing+' missing</span>'+((typeof xlsxBtns==='function')?xlsxBtns('tile_equipment',key):'')+'</span></div>'+
      '<div id="deptBoard-'+key+'">'+deptBoardHTML(key)+'</div>'+
    '</div>';
    // v30 Module 2c: the IFB Signal Routing board now lives ONLY inside the Audio tile
    // (deptCustomSections) — it no longer trails the board under every department.
  // ---- SCHEDULE pane (categorized) ----
  var schedulePane=schedulePaneHTML(key);
  // ---- CREW pane ----
  var crewPane=crewPaneHTML(key);
  // ---- VENDORS pane ----
  var vendorsPane=vendorsCardHTML(key);
  var workflowPane=workflowPaneHTML(key);
  var packlistPane=packlistPaneHTML(key);
  var omniPane='<div class="space-y-4"><div class="flex flex-wrap items-center justify-between gap-2"><div><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">Omni — '+esc(p.name)+'</h3><p class="text-[10px] text-gray-500 mt-0.5">Unified Outlook &amp; Teams for this production — every linked message in one place.</p></div><button onclick="openCompose(\'production\',\''+key+'\',\'email\')" class="text-[10px] font-bold text-white bg-blue-600 rounded-lg px-3 py-1.5 hover:bg-blue-700">+ New Message</button></div>'+commsPanelHTML('production',key)+'</div>';
  if(sub==='controls'){sub='overview';projSubTab[key]='overview';}
  var opsPane='';
  try{if(typeof MuseBOps!=='undefined'&&MuseBOps.opsPaneHTML)opsPane=MuseBOps.opsPaneHTML(key);}catch(eOps){opsPane='<p class="text-xs text-red-600">Broadcast Ops module failed to load.</p>';}
  if(sub==='streaming')opsPane=(typeof MuseStreaming!=='undefined')?MuseStreaming.paneHTML(key):'<p class="text-xs text-red-600">Streaming module failed to load.</p>';
  var pane=(sub==='ops'||sub==='streaming')?opsPane:(sub==='schedule'?schedulePane:(sub==='crew'?crewPane:(sub==='vendors'?vendorsPane:(sub==='workflow'?workflowPane:(sub==='packlist'?packlistPane:(sub==='tracking'?trackingPaneHTML(key):(sub==='travel'?travelPaneHTML(key):(sub==='survey'?surveyPaneHTML(key):(sub==='omni'?omniPane:(sub==='finance'?financeWorkspaceHTML(key):overviewPane))))))))));

  if(typeof MuseLive!=='undefined')pane+=MuseLive.paneHTML(key,sub);

  /* ---- v30 Module 14: persistent shell + swappable pane -------------------------
     The header, weather band, venue map banner, location strip and SUB-TAB BAR form
     a stable shell built once per production (rebuilt only when its inputs change).
     Tab switches and data edits swap ONLY the #projPane container below the bar —
     the bar itself keeps its DOM nodes (active state swapped by class) and the venue
     map is never re-created, so nothing above the pane flickers or reloads. ---- */
  var headerHTML=
    '<div class="flex flex-wrap items-start justify-between pb-4 border-b border-gray-300/80 gap-4"><div class="flex items-start gap-4">'+
      '<div class="rounded-xl overflow-hidden border border-gray-200 flex-shrink-0" style="width:84px;height:84px">'+thumb+'</div>'+
      '<div><div class="flex items-center space-x-2 text-xs text-blue-700 font-semibold mb-1"><span class="cursor-pointer hover:underline" onclick="switchView(\'dashboard\')">Portfolio</span><span>/</span><span class="text-gray-900">'+esc(p.name)+'</span></div>'+
      '<h1 class="text-2xl font-semibold tracking-tight text-gray-900">'+esc(p.name)+'</h1><div class="flex items-center gap-2 mt-1.5">'+custChip(p.customer)+'<p class="text-sm text-gray-600">'+meta.join(' · ')+'</p></div>'+(p.desc?'<p class="text-xs text-gray-500 mt-1 max-w-xl">'+esc(p.desc)+'</p>':'')+'</div></div>'+
      '<div class="text-right flex-shrink-0"><span id="projPct-'+key+'" class="text-4xl font-bold '+pctColor(pct)+' mono">'+pct+'%</span><p class="text-[10px] text-gray-500 uppercase tracking-wider">Requirements Cleared</p>'+
        '<div class="flex items-center justify-end gap-2 mt-2 flex-wrap"><button onclick="openOmniForProject(\''+key+'\')" class="text-[10px] font-bold text-white rounded-lg px-2.5 py-1.5 hover:opacity-90" style="background:#0866FF"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline-block;vertical-align:-2px;margin-right:5px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Omni</button><button onclick="openSchedule(\''+key+'\')" class="text-[10px] font-bold text-blue-700 border border-blue-200 bg-blue-50 rounded-lg px-2.5 py-1.5 hover:bg-blue-100"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline-block;vertical-align:-2px;margin-right:5px"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>Edit schedule</button><button onclick="downloadTechbook(\''+key+'\')" title="Always exports current live production data — not a saved snapshot" class="text-[10px] font-bold text-white bg-gray-900 rounded-lg px-2.5 py-1.5 hover:bg-gray-800"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline-block;vertical-align:-2px;margin-right:5px"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>Techbook PDF</button></div>'+(delBtn?'<div class="mt-2">'+delBtn+'</div>':'')+'</div></div>';
  var opsBadge='';
  try{if(typeof MuseBOps!=='undefined'&&MuseBOps.computeGoNoGo){var _gng=MuseBOps.computeGoNoGo(key);if(_gng.decision==='NO-GO')opsBadge=' <span class="text-red-500">●</span>';else if(_gng.decision==='CONDITIONAL')opsBadge=' <span class="text-amber-500">●</span>';else opsBadge=' <span class="text-emerald-500">●</span>';}}catch(eBg){}
  var barHTML='<div class="inline-flex items-center gap-1 bg-gray-100 rounded-xl p-1 flex-wrap justify-center">'+subBtn('overview','Overview')+subBtn('ops','Broadcast Ops'+opsBadge)+subBtn('streaming','Streaming'+streamTabBadge(key))+subBtn('survey','Site Survey')+((typeof permCan!=='function'||permCan('finance'))?subBtn('finance','Finance'+finTabBadge(key)):'')+subBtn('schedule','Schedule')+subBtn('travel','Travel'+travelTabBadge(key))+subBtn('crew','Crew')+((typeof permCan!=='function'||permCan('vendors'))?subBtn('vendors','Vendors'):'')+subBtn('tracking','Tracking'+trkTabBadge(key))+subBtn('workflow','Workflow')+subBtn('packlist','PackList')+subBtn('omni','Omni'+omniTabBadge(key))+'</div>';
  var barSig=barHTML.replace(/bg-gray-900 text-white shadow-sm|text-gray-600 hover:bg-gray-100/g,''); // bar content minus active-state
  var vf=venueFor(key);
  /* review fix: strip the live location clock from the signature — it changes every
     minute and would defeat the persistent shell for every multi-location production
     (the clock itself is updated in place by locTick via [data-loctz]) */
  var metaSig=meta.join('·').replace(/<span[^>]*data-loctz[^>]*>[^<]*<\/span>/g,'⌚');
  var shellSig=[p.name,p.date||'',p.time||'',p.venue||'',p.customer||'',p.desc||'',metaSig,delBtn?'1':'0',(vf?vf.lat+','+vf.lng:''),p.thumb?'t':''].join('~');
  if(!document.getElementById('projPane-'+key)||el.getAttribute('data-shellsig')!==shellSig){
    el.setAttribute('data-shellsig',shellSig);
    _projTabSig[key]=barSig;
    el.innerHTML='<div class="space-y-6">'+
      headerHTML+
      wxBandHTML(key)+
      '<div id="apprStrip-'+key+'">'+apprSummaryStrip(key)+'</div>'+
      // ---- VENUE MAP BANNER — part of the stable shell; never re-created on tab switches ----
      '<div class="rounded-2xl overflow-hidden border border-gray-200/70 shadow-sm relative bg-gray-50" style="min-height:300px;height:34vh;max-height:380px">'+
        liveMapHTML({id:'ovmap_'+key,lat:(vf?vf.lat:null),lng:(vf?vf.lng:null),zoom:(vf?vf.zoom:13),label:(vf?vf.name:p.venue||p.name),seed:(p.venue||p.name)})+
        '<div class="absolute left-3 bottom-3 z-[4] bg-white/95 backdrop-blur rounded-xl border border-gray-200 shadow-md px-3 py-2 max-w-[78%]">'+
          '<p class="text-[11px] font-bold text-gray-900 leading-tight flex items-center gap-1">📍 '+esc(vf?vf.name:(p.venue||'Location TBD'))+'</p>'+
          (vf?'<p class="text-[9px] text-gray-600 leading-snug mt-0.5">'+esc(vf.address)+'</p><p class="text-[9px] text-gray-400 mono mt-0.5">'+vf.lat.toFixed(4)+', '+vf.lng.toFixed(4)+'</p>':'')+
        '</div>'+
      '</div>'+
      '<div id="locStrip-'+key+'">'+((typeof locStripHTML==='function')?locStripHTML(key):'')+'</div>'+
      '<div id="projTabs-'+key+'" class="flex items-center justify-center gap-2 flex-wrap w-full">'+barHTML+'</div>'+
      '<div id="projPane-'+key+'" class="space-y-6">'+pane+'</div>'+
      '</div>';
  }else{
    var pctEl=document.getElementById('projPct-'+key);
    if(pctEl){pctEl.textContent=pct+'%';pctEl.className='text-4xl font-bold '+pctColor(pct)+' mono';}
    var apEl=document.getElementById('apprStrip-'+key);if(apEl)apEl.innerHTML=apprSummaryStrip(key);
    var lsEl=document.getElementById('locStrip-'+key);if(lsEl)lsEl.innerHTML=((typeof locStripHTML==='function')?locStripHTML(key):'');
    var tabsEl=document.getElementById('projTabs-'+key);
    if(tabsEl){
      if(_projTabSig[key]!==barSig){tabsEl.innerHTML=barHTML;_projTabSig[key]=barSig;} // badges/visibility changed
      else{var _tb=tabsEl.querySelectorAll('button[data-sub]');
        for(var _ti=0;_ti<_tb.length;_ti++){var _b=_tb[_ti];
          _b.className='px-4 py-2 text-xs font-semibold rounded-lg '+(_b.getAttribute('data-sub')===sub?'bg-gray-900 text-white shadow-sm':'text-gray-600 hover:bg-gray-100');}}
    }
    document.getElementById('projPane-'+key).innerHTML=pane;
  }
  try{applyOverviewCat(key);}catch(e){}
  try{if(sub==='streaming'&&typeof MuseStreaming!=='undefined')MuseStreaming.mount(el);}catch(e){}
  try{setTimeout(mountVisibleMaps,30);}catch(e){}
  try{if(typeof audioWaveformsMount==='function')setTimeout(function(){audioWaveformsMount(key);},50);}catch(e){}
  try{setTimeout(function(){wxEnsure(key);},40);}catch(e){}
  try{if(projSubTab[key]==='travel')setTimeout(function(){if(document.getElementById('tpWidgetMount'))mountSkyscanner();},60);}catch(e){}
}
function setProjTab(key,tab){
  /* Swap only the content pane under the tab bar — do NOT scroll the page to top */
  if(tab==='ops'&&(typeof MuseBOps==='undefined'||!MuseBOps.opsPaneHTML)){
    if(typeof MuseLazy!=='undefined'&&MuseLazy.ensureBOps){
      if(typeof toast==='function')toast('Loading Broadcast Ops…');
      MuseLazy.ensureBOps().then(function(){setProjTab(key,'ops');}).catch(function(){if(typeof toast==='function')toast('Broadcast Ops failed to load');});
      return;
    }
  }
  var y=window.scrollY||window.pageYOffset||0;
  var x=window.scrollX||window.pageXOffset||0;
  // Finance tab with overdue invoices opens on Accounts Payable — unless a tab was already chosen.
  if(tab==='finance'&&typeof finWsTab!=='undefined'&&!finWsTab[key]){try{if(typeof finOverdueList==='function'&&finOverdueList(key).length)finWsTab[key]='ap';}catch(e){}}
  projSubTab[key]=tab;
  renderProjectView(key);
  try{window.scrollTo(x,y);}catch(e){}
  /* production sub-tabs also join the history stack (Back → previous tab) */
  try{if(navRailActiveView()===key||_museHistView===key)museHistoryPush(key,tab,false);}catch(e){}
}
/* Streaming tab dot: red when the program stream is live with alerts, green when live and healthy */
function streamTabBadge(key){
  try{if(typeof MuseStreaming==='undefined')return '';var h=MuseStreaming.health(key);
    if(h.state!=='LIVE'&&h.state!=='REHEARSAL')return '';
    return ' <span class="'+(h.alerts.length?'text-red-500':'text-emerald-500')+'">●</span>';}catch(e){return '';}
}
function workflowJump(key,tab,sv){
  projSubTab[key]=tab;
  if(sv&&typeof surveyView!=='undefined')surveyView[key]=sv;
  if(tab==='survey'&&sv&&typeof surveySetView==='function')surveySetView(key,sv);
  else setProjTab(key,tab);
}
function workflowPipelineHTML(key){
  var p=productions[key];
  var cad=(typeof getCadPlans==='function')?getCadPlans(key):[];
  var sv=(typeof surveyReadiness==='function')?surveyReadiness(key):{pct:0};
  var ev=(typeof eventChecklistPct==='function')?eventChecklistPct(key):{pct:0};
  var tasks=getTasks(p);
  var taskPct=tasks.length?Math.round(tasks.filter(function(t){return t.done;}).length/tasks.length*100):0;
  function chip(ok,label,onclick){
    return '<button type="button" onclick="'+onclick+'" class="text-[10px] font-bold px-2.5 py-1.5 rounded-lg border '+(ok?'bg-emerald-50 text-emerald-800 border-emerald-200':'bg-white text-gray-700 border-gray-200 hover:bg-gray-50')+'">'+(ok?'✓ ':'○ ')+esc(label)+'</button>';
  }
  return '<div class="bg-white rounded-2xl p-4 border border-gray-200/60 mb-4" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">'+
    '<div class="flex items-center justify-between mb-2"><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">Workflow · Event Check List</h3>'+
    '<span class="text-[9px] text-gray-400">Drawings + vendor meeting, and venue schedule + site survey, both feed Tasks → LBA</span></div>'+
    '<div class="flex flex-col gap-2">'+
      '<div class="flex items-center gap-2 flex-wrap">'+chip(!!(cad&&cad.length),'Drawings','workflowJump(\''+key+'\',\'survey\',\'cad\')')+
        '<span class="text-gray-300">→</span>'+chip(!!(p.vendors&&p.vendors.length),'Vendor meeting','workflowJump(\''+key+'\',\'vendors\')')+'</div>'+
      '<div class="flex items-center gap-2 flex-wrap">'+chip(!!(p.schedule&&p.schedule.length),'Schedule with venue','workflowJump(\''+key+'\',\'schedule\')')+
        '<span class="text-gray-300">→</span>'+chip((sv.pct>=50||ev.pct>=40),'Site Survey','workflowJump(\''+key+'\',\'survey\',\'air\')')+'</div>'+
      '<div class="flex items-center gap-2 flex-wrap pl-1">'+
        '<span class="text-[9px] font-bold uppercase tracking-wider text-gray-400">then</span>'+
        chip(taskPct>=60,'Tasks ('+taskPct+'%)','workflowJump(\''+key+'\',\'workflow\')')+
        '<span class="text-gray-300">→</span>'+chip(!!(p.signoff&&p.signoff.done),'LBA — live before air','workflowJump(\''+key+'\',\'workflow\')')+
      '</div></div></div>';
}

/* ---- categorized schedule tab ---- */
/* ---- date / time / venue helpers for the schedule ---- */
function isISO(v){return /^\d{4}-\d{2}-\d{2}$/.test(v||'');}
function toISO(v){if(!v)return '';if(isISO(v))return v;if(/varies|tbd|per |day-sheet/i.test(v))return '';
  var s=(''+v).split(/[·–—]|\bto\b/i)[0].trim();var d=new Date(s);
  if(!isNaN(d)&&/\d{4}/.test(s)){return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);}return '';}
function fmtDate(v){if(isISO(v)){var d=new Date(v+'T00:00');return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}return v||'';}
function mapLink(venue){if(!venue)return '';var q=encodeURIComponent(venue);return '<a href="https://www.google.com/maps/search/?api=1&query='+q+'" target="_blank" rel="noopener" class="text-blue-700 hover:underline">'+esc(venue)+'</a>';}
function normalizeSchedules(){for(var k in productions){var p=productions[k];if(!p.schedule)continue;p.schedule.forEach(function(r){
  var i0=toISO(r[0]);if(i0)r[0]=i0;var i4=toISO(r[4]);if(i4)r[4]=i4;});}}
function schedType(r){if(r[6])return r[6];var a=(r[2]||'').toLowerCase();var bc=(r[4]||'').trim();
  if(/load.?out|strike|wrap|tear.?down|de.?rig/.test(a))return 'Strike / Load-Out';
  if(/load.?in/.test(a))return 'Load In';
  if(/lunch|meal|breakfast|dinner|cater/.test(a))return 'Lunch / Meal';
  if(/\bbreak\b|rest/.test(a))return 'Break';
  if(bc&&bc!=='—')return 'Broadcast';
  if(/live|broadcast|on air|keynote|reveal|launch|showcase|match|kickoff|show start/.test(a))return 'Broadcast';
  if(/fax|facilit|load.?in|build|rig|commission|rehears|setup|cabling|fiber|signal|cam map|survey/.test(a))return 'Facilities / FAX';
  if(/crew call|in position|wheels up|\bcall\b|arrive|depart/.test(a))return 'Crew Call';
  return 'Crew Call';}
/* ===== PACKLIST — derived from approved/locked sections ===== */
var PACK_STATES=["Approved","Pending Ship","Packed","Shipped","Delivered"];
function packItems(p){ // build shippable line items from each section's equipment, flagged by lock state
  var items=[];if(!p.packStatus)p.packStatus={};
  // union of the canonical departments AND any keys actually present in tbEquip
  // (covers gear saved under legacy/renamed/custom departments — previously silently dropped)
  var depts=DEPT_NAMES.slice();
  if(p.tbEquip)Object.keys(p.tbEquip).forEach(function(k){if(depts.indexOf(k)<0)depts.push(k);});
  depts.forEach(function(dep){
    var a=(p.approvals&&p.approvals[dep])||{};var locked=(a.state==='Approved'||a.state==='Locked');
    var eq=(p.tbEquip&&p.tbEquip[dep])||[];
    eq.forEach(function(ln,idx){
      if(!ln||typeof ln!=='object')return;
      // a line counts if ANY field carries a real value (qty defaults to 1 and scanid is
      // auto-generated on add, so neither alone makes a row packable)
      var hasData=Object.keys(ln).some(function(k){var v=ln[k];return k!=='qty'&&k!=='scanid'&&k!=='_link'&&v!==''&&v!=null&&v!=='—'&&v!=='— none —';});
      if(!hasData)return; // truly empty row — nothing to pack
      if(dep==='Talent / Production'&&ln.name)return; // talent assignments are people, not packable gear
      var name,qty=ln.qty||1,detail='';
      if(dep==='Cameras / Video'){
        name=ln.model||((ln.lens||ln.ped||ln.hood||ln.glass||ln.monitor)?'Camera Position '+(idx+1):'Camera');
        detail=[ln.lens,ln.ped,ln.hood,ln.glass,ln.monitor,ln.smptelen].filter(function(v){return v&&v!=='— none —';}).join(' · ');}
      else{
        name=ln.item||ln.model||ln.name||'';
        if(!name){ // salvage: first non-empty string field so the row is never lost
          var ks=Object.keys(ln);for(var ki=0;ki<ks.length;ki++){var v=ln[ks[ki]];
            if(typeof v==='string'&&v&&v!=='—'&&v!=='— none —'&&ks[ki]!=='notes'&&ks[ki]!=='scanid'&&ks[ki]!=='status'&&ks[ki]!=='loc'&&ks[ki]!=='serial'&&ks[ki]!=='_link'){name=v;break;}}
          if(!name)name=dep+' item '+(idx+1);}
        detail=ln.notes&&ln.notes!=='—'?ln.notes:'';}
      if(ln.scanid)detail=(detail?detail+' · ':'')+ln.scanid; // scannable ID travels onto the PackList
      var id=dep.replace(/[^a-z0-9]/gi,'')+'_'+idx;
      var owner='—';try{owner=deptProvider(dep)||'—';}catch(e){}
      items.push({id:id,dept:dep,name:name,qty:qty,detail:detail,owner:owner,locked:locked,apprState:a.state||'Not Started',apprBy:a.by||'',apprOn:a.on||'',packStatus:p.packStatus[id]||(locked?'Approved':'Draft'),src:'equip'});
    });
  });
  // ---- SYNC FIX: harvest packable gear chosen via the Overview tile DROPDOWN fields ----
  // (these live in p.tbFields[dept][key] and previously never reached the PackList)
  depts.forEach(function(dep){
    var a=(p.approvals&&p.approvals[dep])||{};var locked=(a.state==='Approved'||a.state==='Locked');
    var fv=(p.tbFields&&p.tbFields[dep])||{};
    var schema=(DEFAULT_DEPT_FIELDS[dep]||deptFields[dep]||[]);
    var owner='—';try{owner=deptProvider(dep)||'—';}catch(e){}
    schema.forEach(function(f){
      var key=f[0];if(key.charAt(0)==='_')return;            // skip headers
      if(PACK_SKIP_FIELDS.indexOf(key)>-1)return;            // skip status/IP/notes/free-text meta
      var ftype=f[3]||(typeof f[2]==='string'?f[2]:'');
      if(ftype==='ip'||ftype==='num')return;                // not a packable physical pick
      var val=fv[key];if(val==null||val==='')return;
      var arr=Array.isArray(val)?val:[val];
      arr.forEach(function(v,vi){
        if(v===''||v==null||v==='—'||v==='\u2014 none \u2014'||(''+v).indexOf('none')===0)return;
        var label=(f[1]||key);
        var pid='fld_'+dep.replace(/[^a-z0-9]/gi,'')+'_'+key+'_'+vi;
        items.push({id:pid,dept:dep,name:(''+v),qty:1,detail:label,owner:owner,locked:locked,
          apprState:a.state||'Not Started',apprBy:a.by||'',apprOn:a.on||'',
          packStatus:p.packStatus[pid]||(locked?'Approved':'Draft'),src:'field'});
      });
    });
  });
  // ---- harvest barcode-tracked INVENTORY items checked out to this production ----
  if(p.invItems&&p.invItems.length){p.invItems.forEach(function(ii,idx){
    var live=(typeof invById==='function')?invById(ii.invId):null;
    // skip if the item was checked back in elsewhere (no longer on this project)
    if(live&&live.project&&live.project!==Object.keys(productions).filter(function(k){return productions[k]===p;})[0])return;
    var pid='inv_'+(ii.invId||idx);
    items.push({id:pid,dept:ii.category||'Equipment',name:ii.name+(ii.serial?' (SN '+ii.serial+')':''),qty:1,detail:'Barcode '+ii.barcode,owner:'Meta Inventory',locked:true,
      apprState:'Approved',apprBy:'Inventory',apprOn:'',packStatus:p.packStatus[pid]||'Approved',src:'inventory'});
  });}
  return items;
}
// field keys that describe status / addressing / free meta — NOT physical packable gear
var PACK_SKIP_FIELDS=["status","version","filetype","siteplan","rights","clearances","talent","position",
  "colortemp","fixturetype", // v30 review fix: descriptive Lighting attributes, not packable gear
  "host_role","host_name","rffreq","bandwidth","satfreq","power","encmap","satslot","confnum","shed",
  "probeip","probeqty","channels","count","qty","notes","datadrops","danterf","rvonalphas","rvon",
  "vlan_rts","vlan_router","vlan_dante","vlan_light","vlan_net","wanip","mgmtvlan","xboxip","probeip",
  "ifbphone","handoff","handoffloc","mapping","dante"];
var packFilter={status:'',cat:'',q:'',sort:'cat'};
function setPackFilter(f,v){packFilter[f]=v;var key=document.querySelector('.view-pane.active');if(key){key=key.id.replace('view-','');if(productions[key])renderProjectView(key);}}
function setPackStatus(key,id,st){var p=productions[key];if(!p.packStatus)p.packStatus={};p.packStatus[id]=st;logEvent(key,'PackList: '+id+' → '+st);stampEdit(key);renderProjectView(key);}
function packStatusColor(st){return {"Draft":"bg-gray-100 text-gray-500 border-gray-200","Approved":"bg-emerald-50 text-emerald-700 border-emerald-200","Pending Ship":"bg-amber-50 text-amber-700 border-amber-200","Packed":"bg-blue-50 text-blue-700 border-blue-200","Shipped":"bg-indigo-50 text-indigo-700 border-indigo-200","Delivered":"bg-purple-50 text-purple-700 border-purple-200"}[st]||"bg-gray-100 text-gray-500 border-gray-200";}
function packlistPaneHTML(key){var p=productions[key];var all=packItems(p);
  // controls
  var cats=[];all.forEach(function(it){if(cats.indexOf(it.dept)<0)cats.push(it.dept);});
  var q=(packFilter.q||'').toLowerCase();
  var items=all.filter(function(it){
    if(packFilter.cat&&it.dept!==packFilter.cat)return false;
    if(packFilter.status&&it.packStatus!==packFilter.status)return false;
    if(q&&(it.name+' '+it.dept+' '+it.detail+' '+it.owner).toLowerCase().indexOf(q)<0)return false;
    return true;});
  if(packFilter.sort==='owner')items.sort(function(a,b){return a.owner.localeCompare(b.owner);});
  else if(packFilter.sort==='status')items.sort(function(a,b){return a.packStatus.localeCompare(b.packStatus);});
  // stats
  var totalQty=all.reduce(function(s,i){return s+(parseInt(i.qty,10)||1);},0);
  var shipReady=all.length?Math.round(all.filter(function(i){return ['Packed','Shipped','Delivered'].indexOf(i.packStatus)>-1;}).length/all.length*100):0;
  var missingInfo=all.filter(function(i){return !i.locked;}).length;
  function stat(n,l,c){return '<div class="bg-white rounded-xl border border-gray-200/60 p-3 text-center"><div class="text-xl font-bold '+c+'">'+n+'</div><div class="text-[8px] uppercase tracking-wider text-gray-400 mt-0.5">'+l+'</div></div>';}
  var statsGrid='<div class="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">'+stat(all.length,'Items','text-gray-800')+stat(totalQty,'Total Qty','text-gray-800')+stat(cats.length,'Categories','text-gray-800')+stat(shipReady+'%','Ship Ready','text-emerald-600')+stat(missingInfo,'Not Locked','text-red-600')+'</div>';
  // grouped by category — consistent column grid for clean alignment
  var groups={};items.forEach(function(it){(groups[it.dept]=groups[it.dept]||[]).push(it);});
  var COLS='grid-template-columns:minmax(0,1fr) 54px 150px 150px 200px';
  var body=Object.keys(groups).map(function(dep){var its=groups[dep];
    var groupQty=its.reduce(function(s,i){return s+(parseInt(i.qty,10)||1);},0);
    var rows=its.map(function(it){
      var actions=PACK_STATES.slice(1).map(function(st){var on=it.packStatus===st;return '<button onclick="setPackStatus(\''+key+'\',\''+it.id+'\',\''+st.replace(/'/g,"")+'\')" class="text-[8px] font-bold px-1.5 py-0.5 rounded border '+(on?packStatusColor(st):'bg-white text-gray-500 border-gray-200 hover:bg-gray-50')+'">'+(st==='Pending Ship'?'Pend':st)+'</button>';}).join('');
      var flag=it.locked?'':'<span class="text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 whitespace-nowrap">DRAFT</span>';
      return '<div class="grid items-center gap-2 px-3 py-2 border-b border-gray-50 hover:bg-gray-50/60" style="'+COLS+'">'+
        '<div class="min-w-0"><div class="text-[11px] font-semibold text-gray-800 truncate">'+esc(it.name)+'</div>'+(it.detail?'<div class="text-[9px] text-gray-400 truncate">'+esc(it.detail)+'</div>':'')+'</div>'+
        '<div class="mono text-center text-[12px] font-bold text-gray-800">'+it.qty+'</div>'+
        '<div class="text-[10px] text-gray-600 truncate">'+esc(it.owner)+'</div>'+
        '<div class="flex items-center gap-1 flex-wrap"><span class="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border '+packStatusColor(it.packStatus)+' whitespace-nowrap">'+it.packStatus+'</span>'+flag+'</div>'+
        '<div class="flex items-center gap-1 flex-wrap justify-end">'+actions+'</div></div>';
    }).join('');
    return '<div class="mb-4 rounded-xl border border-gray-200/70 overflow-hidden">'+
      '<div class="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">'+
        '<h4 class="text-[11px] font-bold text-gray-700 flex items-center gap-2"><span class="w-2 h-2 rounded-full" style="background:'+(dotBg[(productions[key].tagColor)]||'#65676b')+'"></span>'+esc(dep)+'</h4>'+
        '<span class="text-[9px] mono text-gray-500">'+its.length+' item'+(its.length>1?'s':'')+' · '+groupQty+' qty</span></div>'+
      '<div class="grid items-center gap-2 px-3 py-1.5 bg-white border-b border-gray-100 text-[8px] font-bold uppercase tracking-wider text-gray-400" style="'+COLS+'">'+
        '<span>Item</span><span class="text-center">Qty</span><span>Provided By</span><span>Pack Status</span><span class="text-right">Advance Status</span></div>'+
      rows+'</div>';
  }).join('')||'<p class="text-xs text-gray-400 py-6 text-center">No items yet. Add equipment in the Overview tiles (or push from ENG Requests) and they\'ll appear here automatically.</p>';
  // filter controls
  var catOpts='<option value="">All Categories</option>'+cats.map(function(c){return '<option value="'+c+'"'+(packFilter.cat===c?' selected':'')+'>'+c+'</option>';}).join('');
  var stOpts='<option value="">All Pack Status</option>'+["Draft","Approved","Pending Ship","Packed","Shipped","Delivered"].map(function(s){return '<option value="'+s+'"'+(packFilter.status===s?' selected':'')+'>'+s+'</option>';}).join('');
  var sortOpts=[["cat","Category"],["owner","Provided By"],["status","Status"]].map(function(s){return '<option value="'+s[0]+'"'+(packFilter.sort===s[0]?' selected':'')+'>Sort: '+s[1]+'</option>';}).join('');
  return '<div class="space-y-4">'+
    '<div class="flex flex-wrap items-center justify-between gap-2">'+
      '<p class="text-xs text-gray-500">Shippable items grouped by category, with provider and pack status. Draft items come from sections not yet locked.</p>'+
      '<button onclick="exportPackListPDF(\''+key+'\')" class="flex items-center gap-1.5 text-xs font-bold text-white bg-gray-900 rounded-lg px-4 py-2 hover:bg-gray-800"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M5 21h14"/></svg>Print / Export Pack List</button>'+
    '</div>'+
    statsGrid+
    (missingInfo>0?'<p class="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">⚠ '+missingInfo+' item'+(missingInfo>1?'s are':' is')+' from sections not yet locked — shown as DRAFT. Lock the section to finalize for shipping.</p>':'')+
    '<div class="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">'+
      '<div class="flex flex-wrap items-center gap-2 mb-3">'+
        '<input value="'+(packFilter.q||'').replace(/"/g,'&quot;')+'" oninput="packFilter.q=this.value" onchange="setPackFilter(\'q\',this.value)" placeholder="Search items…" class="text-[11px] border border-gray-300 rounded-lg px-3 py-1.5" style="outline:none;width:11rem">'+
        '<select onchange="setPackFilter(\'cat\',this.value)" class="text-[11px] border border-gray-300 rounded-lg px-2 py-1.5 bg-white" style="outline:none">'+catOpts+'</select>'+
        '<select onchange="setPackFilter(\'status\',this.value)" class="text-[11px] border border-gray-300 rounded-lg px-2 py-1.5 bg-white" style="outline:none">'+stOpts+'</select>'+
        '<select onchange="setPackFilter(\'sort\',this.value)" class="text-[11px] border border-gray-300 rounded-lg px-2 py-1.5 bg-white" style="outline:none">'+sortOpts+'</select>'+
      '</div>'+body+'</div>'+
  '</div>';
}
function exportPackListPDF(key){var p=productions[key];var all=packItems(p);
  var groups={};all.forEach(function(it){(groups[it.dept]=groups[it.dept]||[]).push(it);});
  // summary stats
  var cats=Object.keys(groups);
  var totalQty=all.reduce(function(s,i){return s+(parseInt(i.qty,10)||1);},0);
  var shipReady=all.length?Math.round(all.filter(function(i){return ['Packed','Shipped','Delivered'].indexOf(i.packStatus)>-1;}).length/all.length*100):0;
  var notLocked=all.filter(function(i){return !i.locked;}).length;
  var rowsHTML=cats.map(function(dep){
    var its=groups[dep];var gq=its.reduce(function(s,i){return s+(parseInt(i.qty,10)||1);},0);
    var lines=its.map(function(it){return '<tr><td class="it">'+esc(it.name)+(it.detail?'<div class="d">'+esc(it.detail)+'</div>':'')+'</td><td class="c">'+esc(''+it.qty)+'</td><td>'+esc(it.owner)+'</td><td><span class="st">'+esc(it.packStatus)+'</span>'+(it.locked?'':' <span class="dr">DRAFT</span>')+'</td></tr>';}).join('');
    return '<tr class="cat"><td colspan="4">'+esc(dep)+' &nbsp;·&nbsp; '+its.length+' item'+(its.length>1?'s':'')+' &nbsp;·&nbsp; '+gq+' qty</td></tr>'+lines;
  }).join('');
  var tm=(CREW_FIELD.filter(function(m){return /Tech Manager/.test(m.pos);})[0]||{}).name||'—';
  var pm=(CREW_FIELD.filter(function(m){return /Production Manager/.test(m.pos);})[0]||{}).name||'—';
  var html='<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pack List — '+esc(p.name)+'</title><style>'+
    '@page{size:A4;margin:12mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
    'html,body{margin:0;padding:0}body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#242526}'+
    '.bar{display:flex;height:5px}.bar i{flex:1}'+
    '.hd{background:#18191A;color:#ffffff;padding:14px 18px;display:flex;justify-content:space-between;align-items:flex-end}'+
    '.hd h1{font-size:19px;margin:0;letter-spacing:1px}.hd .s{font-size:11px;color:#b0b3b8;margin-top:3px}.hd .r{text-align:right;font-size:9px;color:#b0b3b8;line-height:1.5}'+
    '.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px 18px;border-bottom:1px solid #e4e6eb}'+
    '.meta .k{font-size:7px;text-transform:uppercase;color:#8A8D91;letter-spacing:1px}.meta .v{font-size:10px;font-weight:600;margin-top:2px}'+
    '.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:12px 18px;background:#f7f8fa;border-bottom:1px solid #e4e6eb}'+
    '.stat{background:#ffffff;border:1px solid #e4e6eb;border-radius:8px;padding:8px;text-align:center}'+
    '.stat .n{font-size:18px;font-weight:700;color:#18191A}.stat .n.g{color:#1E7B34}.stat .n.r{color:#e41e3f}'+
    '.stat .l{font-size:7px;text-transform:uppercase;letter-spacing:1px;color:#8A8D91;margin-top:2px}'+
    'table{width:100%;border-collapse:collapse;font-size:10px;margin-top:4px}'+
    'thead{display:table-header-group}'+
    'th{background:#f0f2f5;text-align:left;padding:5px 18px;font-size:8px;text-transform:uppercase;color:#4B4F56;border-bottom:1px solid #e4e6eb}'+
    'th.c{text-align:center}'+
    'td{padding:5px 18px;border-bottom:0.5px solid #f0f2f5;vertical-align:top}'+
    'td.c{text-align:center;font-weight:700;font-family:monospace}td.it{font-weight:600}td .d{font-size:8px;color:#8A8D91;font-weight:400;margin-top:1px}'+
    'td .st{font-size:8px;font-weight:700;text-transform:uppercase}td .dr{font-size:7px;font-weight:700;color:#b3122e;border:0.5px solid #f5a3b1;border-radius:3px;padding:0 3px}'+
    'tr.cat td{background:#18191A;color:#ffffff;font-weight:700;font-size:9px;text-transform:uppercase;padding:5px 18px}'+
    'tr{page-break-inside:avoid}'+
    '.foot{margin-top:10px;padding:8px 18px;display:flex;justify-content:space-between;font-size:8px;color:#8A8D91;border-top:0.5px solid #e4e6eb}'+
    '@media screen{body{background:#65676B;padding:18px}.page{background:#ffffff;max-width:820px;margin:0 auto;box-shadow:0 8px 30px rgba(0,0,0,.3)}}'+
    '@media print{body{background:#ffffff}.page{box-shadow:none;max-width:none}}'+
    '</style></head><body><div class="page">'+
    '<div class="bar"><i style="background:linear-gradient(90deg,#0064E0,#0082FB,#00C2FF)"></i></div>'+
    '<div class="hd"><div><h1>PACK LIST</h1><div class="s">'+esc(p.name)+' · '+esc(p.customer||'')+'</div></div><div class="r">MUSE LIVE · Broadcast Operations<br>Generated '+esc(nowStamp())+'</div></div>'+
    '<div class="meta">'+
      '<div><div class="k">Venue / Destination</div><div class="v">'+esc(p.venue||'TBD')+'</div></div>'+
      '<div><div class="k">Event Date</div><div class="v">'+esc(p.date||'TBD')+'</div></div>'+
      '<div><div class="k">Tech Manager</div><div class="v">'+esc(tm)+'</div></div>'+
      '<div><div class="k">Production Manager</div><div class="v">'+esc(pm)+'</div></div>'+
    '</div>'+
    '<div class="stats">'+
      '<div class="stat"><div class="n">'+all.length+'</div><div class="l">Items</div></div>'+
      '<div class="stat"><div class="n">'+totalQty+'</div><div class="l">Total Qty</div></div>'+
      '<div class="stat"><div class="n">'+cats.length+'</div><div class="l">Categories</div></div>'+
      '<div class="stat"><div class="n g">'+shipReady+'%</div><div class="l">Ship Ready</div></div>'+
      '<div class="stat"><div class="n r">'+notLocked+'</div><div class="l">Not Locked</div></div>'+
    '</div>'+
    '<table><thead><tr><th>Item</th><th class="c">Qty</th><th>Provided By</th><th>Pack Status</th></tr></thead><tbody>'+rowsHTML+'</tbody></table>'+
    '<div class="foot"><span>Meta Broadcast Telemetry · Confidential</span><span>'+esc(p.name)+' · Pack List · '+all.length+' items / '+totalQty+' qty</span></div>'+
    '</div></body></html>';
  var w=window.open('','_blank');if(!w){toast('Allow pop-ups to export the Pack List');return;}
  w.document.open();w.document.write(html);w.document.close();
  toast('Pack List ready — choose Save as PDF');
  setTimeout(function(){try{w.focus();w.print();}catch(e){}},650);
}

function workflowPaneHTML(key){var p=productions[key];syncAutoTasks(key);var rd=readiness(key?p:p);rd=readiness(p);
  function bar(label,val,col){return '<div class="bg-white rounded-xl border border-gray-200/60 p-3"><div class="flex items-center justify-between mb-1"><span class="text-[9px] font-bold uppercase tracking-wider text-gray-500">'+label+'</span><span class="text-[11px] font-bold mono '+(val>=80?'text-emerald-600':val>=50?'text-amber-600':'text-red-600')+'">'+val+'%</span></div><div style="height:7px;background:#f0f2f5;border-radius:4px;overflow:hidden"><div style="width:'+val+'%;height:100%;background:'+col+'"></div></div></div>';}
  var air=rd.air;var airCol=air>=80?'#1E7B34':air>=50?'#f5832a':'#e41e3f';
  var readyGrid='<div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">'+bar('Techbook',rd.techbook,'#0866ff')+bar('Department',rd.dept,'#1E7B34')+bar('Schedule',rd.schedule,'#0866ff')+bar('Vendor',rd.vendor,'#f5832a')+bar('Crew Confirmed',rd.crew,'#0a58ca')+bar('Legal / Rights',rd.legal,'#e41e3f')+'</div>';
  // tasks — clean toggle, metadata, filters, live completion %
  var tasks=getTasks(p);var doneN=tasks.filter(function(t){return t.done;}).length;var openN=tasks.length-doneN;
  var compPct=tasks.length?Math.round(doneN/tasks.length*100):0;
  var counts={all:tasks.length,open:tasks.filter(function(t){return taskState(t)==='open';}).length,completed:doneN,overdue:tasks.filter(function(t){return taskState(t)==='overdue';}).length,blocked:tasks.filter(function(t){return taskState(t)==='blocked';}).length};
  var filt=wfTaskFilter;
  function fbtn(id,label){return '<button onclick="setTaskFilter(\''+id+'\')" class="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded '+(filt===id?'bg-gray-900 text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200')+'">'+label+' '+counts[id]+'</button>';}
  var filterBar='<div class="flex items-center gap-1 flex-wrap mb-2">'+fbtn('all','All')+fbtn('open','Open')+fbtn('completed','Done')+fbtn('overdue','Overdue')+fbtn('blocked','Blocked')+'</div>';
  var stColors={completed:'bg-emerald-50 text-emerald-700 border-emerald-200',blocked:'bg-red-50 text-red-700 border-red-200',overdue:'bg-red-50 text-red-700 border-red-200',open:'bg-blue-50 text-blue-700 border-blue-200'};
  var stLabel={completed:'Done',blocked:'Blocked',overdue:'Overdue',open:'Open'};
  function taskRow(t){var st=taskState(t);
    var textCell=t.auto?'<span class="text-[11px] '+(t.done?'line-through text-gray-400':'text-gray-800')+'">'+t.text+'</span>':
      '<input value="'+(''+t.text).replace(/"/g,'&quot;')+'" onchange="setTask(\''+key+'\',\''+t.id+'\',\'text\',this.value)" class="text-[11px] '+(t.done?'line-through text-gray-400':'text-gray-800')+' bg-transparent border-0 w-full" style="outline:none">';
    var ownerCell=t.auto?(t.assignee||'—'):'<input value="'+(''+(t.assignee||'')).replace(/"/g,'&quot;')+'" onchange="setTask(\''+key+'\',\''+t.id+'\',\'assignee\',this.value)" class="bg-transparent border-0 mono text-[9px] text-gray-500" style="outline:none;width:90px" placeholder="owner">';
    var dueCell='<input type="date" value="'+(t.due||'')+'" onchange="setTask(\''+key+'\',\''+t.id+'\',\'due\',this.value);renderProjectView(\''+key+'\')" class="bg-transparent border border-gray-200 rounded text-[9px] mono px-1 py-0.5" style="outline:none">';
    return '<div class="border border-gray-100 rounded-lg p-2 mb-1.5 '+(t.done?'bg-gray-50':'bg-white')+'">'+
      '<div class="flex items-start gap-2">'+
        '<button onclick="toggleTask(\''+key+'\',\''+t.id+'\')" class="w-4 h-4 rounded border mt-0.5 '+(t.done?'bg-emerald-500 border-emerald-500 text-white':'border-gray-300')+' flex items-center justify-center text-[9px] flex-shrink-0">'+(t.done?'✓':'')+'</button>'+
        '<div class="flex-1 min-w-0">'+textCell+
          '<div class="flex items-center gap-2 flex-wrap mt-1">'+
            '<span class="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border '+stColors[st]+'">'+stLabel[st]+'</span>'+
            (t.dept?'<span class="text-[9px] text-gray-400">'+t.dept+'</span>':'')+
            '<span class="text-[9px] text-gray-400">👤 '+ownerCell+'</span>'+
            '<span class="text-[9px] text-gray-400 flex items-center gap-1">📅 '+dueCell+'</span>'+
            (t.done&&t.completedOn?'<span class="text-[8px] text-emerald-600 mono">✓ '+t.completedOn+'</span>':'')+
          '</div>'+
        '</div>'+
        '<div class="flex items-center gap-1 flex-shrink-0">'+
          (!t.done?'<button onclick="toggleTaskBlocked(\''+key+'\',\''+t.id+'\')" title="Toggle blocked" class="text-[8px] font-bold px-1.5 py-0.5 rounded '+(t.blocked?'bg-red-500 text-white':'bg-gray-100 text-gray-500')+'">BLOCK</button>':'')+
          (t.auto?'<span class="text-[8px] mono px-1 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">AUTO</span>':'<button onclick="delTask(\''+key+'\',\''+t.id+'\')" class="text-red-400 hover:text-red-600 text-xs">✕</button>')+
        '</div>'+
      '</div></div>';}
  var shown=tasks.filter(function(t){return filt==='all'?true:taskState(t)===filt;});
  var taskList=shown.map(taskRow).join('')||'<p class="text-[11px] text-gray-400 py-2">No '+(filt==='all'?'':filt+' ')+'tasks.</p>';
  var tasksHeader='<div class="flex items-center justify-between mb-1"><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">Tasks · '+openN+' open / '+tasks.length+'</h3><button onclick="addTask(\''+key+'\')" class="text-[10px] font-bold text-blue-700 hover:underline">+ Add Task</button></div>'+
    '<div class="flex items-center gap-2 mb-2"><div class="flex-1" style="height:6px;background:#f0f2f5;border-radius:3px;overflow:hidden"><div style="width:'+compPct+'%;height:100%;background:#1E7B34"></div></div><span class="text-[9px] mono font-bold text-emerald-600">'+compPct+'%</span></div>'+filterBar;
  // activity timeline
  var acts=(p.activity||[]).slice(0,40).map(function(a){return '<div class="flex gap-2 py-1.5 border-b border-gray-50"><span class="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5 flex-shrink-0"></span><div class="flex-1"><p class="text-[11px] text-gray-800">'+a.text+'</p><p class="text-[8px] text-gray-400 mono">'+a.actor+' · '+a.when+'</p></div></div>';}).join('')||'<p class="text-[11px] text-gray-400 py-2">No activity yet.</p>';
  // approval history
  var apprHist=p.dept.map(function(d){var a=p.approvals&&p.approvals[d[0]];if(!a||a.state==='Not Started')return '';
    return '<div class="flex items-center justify-between py-1.5 border-b border-gray-50"><span class="text-[11px] font-semibold text-gray-800">'+d[0]+'</span><span class="text-[10px]"><span class="mono px-1.5 py-0.5 rounded '+(a.state==='Locked'?'bg-blue-50 text-blue-700':a.state==='Approved'?'bg-emerald-50 text-emerald-700':a.state==='Changes Requested'?'bg-red-50 text-red-700':'bg-amber-50 text-amber-700')+'">'+a.state+'</span> <span class="text-gray-400 mono">'+(a.on||'')+'</span></span></div>';
  }).filter(Boolean).join('')||'<p class="text-[11px] text-gray-400 py-2">No approvals yet.</p>';
  return '<div class="space-y-5">'+workflowPipelineHTML(key)+
    '<div class="bg-white rounded-2xl p-5 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">'+
      '<div class="flex items-center justify-between mb-3"><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">Air Readiness</h3>'+
      '<div class="flex items-center gap-2"><span class="text-2xl font-bold mono" style="color:'+airCol+'">'+air+'%</span><span class="text-[9px] uppercase tracking-wider text-gray-400">Final Air<br>Readiness</span></div></div>'+
      '<div style="height:10px;background:#f0f2f5;border-radius:5px;overflow:hidden;margin-bottom:12px"><div style="width:'+air+'%;height:100%;background:'+airCol+'"></div></div>'+
      readyGrid+
      (rd.risks>0?'<p class="text-[11px] text-red-700 font-semibold mt-2">⚠ '+rd.risks+' critical risk'+(rd.risks>1?'s':'')+' remaining — see Tasks & Outstanding Items.</p>':'<p class="text-[11px] text-emerald-700 font-semibold mt-2">No critical risks flagged.</p>')+
    '</div>'+
    '<div class="grid grid-cols-1 xl:grid-cols-2 gap-5">'+
      '<div class="bg-white rounded-2xl p-5 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">'+tasksHeader+'<div class="max-h-96 overflow-y-auto">'+taskList+'</div></div>'+
      '<div class="bg-white rounded-2xl p-5 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)"><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">Approval History</h3><div class="max-h-80 overflow-y-auto">'+apprHist+'</div></div>'+
    '</div>'+
    '<div class="bg-white rounded-2xl p-5 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)"><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">Activity Timeline</h3><div class="max-h-96 overflow-y-auto">'+acts+'</div></div>'+
  '</div>';
}
function schedListPaneHTML(key){var p=productions[key];var rows=p.schedule||[];
  var buckets=[
    ["Crew Calls & Meals",["Crew Call","Lunch / Meal"],"amber"],
    ["Load In",["Load In"],"indigo"],
    ["Breaks",["Break"],"blue"],
    ["Facilities (FAX)",["Facilities / FAX"],"emerald"],
    ["Broadcast",["Broadcast"],"red"],
    ["Strike / Load-Out",["Strike / Load-Out"],"purple"]];
  var sections=buckets.map(function(bk){
    var br=rows.filter(function(r){return bk[1].indexOf(schedType(r))>-1;});
    var dot={amber:'#f5832a',blue:'#0866ff',emerald:'#1E7B34',red:'#e41e3f',purple:'#0866ff',indigo:'#0866ff'}[bk[2]];
    var body=br.length?'<div class="overflow-x-auto"><table class="w-full text-left text-xs" style="min-width:680px"><thead><tr class="text-gray-500 uppercase tracking-wider text-[9px] border-b border-gray-200"><th class="pb-2 pr-3">Date(s)</th><th class="pb-2 pr-3">Time</th><th class="pb-2 pr-3">Activity</th><th class="pb-2 pr-3">Crew Call</th><th class="pb-2 pr-3">Broadcast</th><th class="pb-2">Location / Notes</th></tr></thead><tbody class="divide-y divide-gray-100">'+
      br.map(function(r){return '<tr class="hover:bg-gray-50/60"><td class="py-2 pr-3 mono text-gray-700">'+fmtDate(r[0])+'</td><td class="py-2 pr-3 mono text-gray-600">'+(r[1]||'')+'</td><td class="py-2 pr-3 font-semibold text-gray-800">'+(r[2]||'')+'</td><td class="py-2 pr-3 mono text-amber-700">'+(r[3]||'')+'</td><td class="py-2 pr-3 mono text-red-600 font-bold">'+fmtDate(r[4])+'</td><td class="py-2 text-gray-600">'+(r[5]?mapLink(r[5]):'')+'</td></tr>';}).join('')+
      '</tbody></table></div>':'<p class="text-[11px] text-gray-500 italic py-1">No entries in this category yet.</p>';
    return '<div class="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)"><div class="flex items-center gap-2 mb-3"><span class="w-2.5 h-2.5 rounded-full" style="background:'+dot+'"></span><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">'+bk[0]+'</h3><span class="text-[9px] text-gray-500 mono">'+br.length+'</span></div>'+body+'</div>';
  }).join('');
  return '<div class="space-y-4"><div class="flex items-center justify-between"><p class="text-xs text-gray-600">Production schedule, organized by category. Set a Type on each row in the editor.</p><button onclick="openSchedule(\''+key+'\')" class="text-[10px] font-bold text-white bg-blue-600 rounded-lg px-3 py-1.5 hover:bg-blue-700"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline-block;vertical-align:-2px;margin-right:5px"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>Edit schedule</button></div>'+sections+'</div>';
}

/* ---- full crew roster tab ---- */
/* ===== CREW SCHEDULING (milestones + roster matrix, tied to the schedule) ===== */
var CREW_PHASES=["start","loadin","camblock","txcheck","rehearsal","broadcast","strike"];
var CREW_PHASE_LABELS={start:"Start / Travel",loadin:"Load-In",camblock:"Camera Blocking",txcheck:"Transmission Check",rehearsal:"Rehearsal",broadcast:"Broadcast",strike:"Strike / Load-Out"};
function crewMilestones(p){ // derive a date for each phase from the project's schedule, else TBD
  var rows=p.schedule||[];
  function firstDate(re){for(var i=0;i<rows.length;i++){if(re.test((rows[i][2]||'').toLowerCase()))return rows[i][0]||'';}return '';}
  function bcDate(){for(var i=0;i<rows.length;i++){if((rows[i][4]||'').trim()&&rows[i][4]!=='—')return rows[i][0]||rows[i][4];}return firstDate(/live|broadcast|ceremony|match|takeover|summit|show/);}
  var m={
    start:firstDate(/crew call|wheels up|arrive|travel|depart/)||(rows[0]?rows[0][0]:'TBD'),
    loadin:firstDate(/load.?in|rigging|build|setup|mount|pull/)||'TBD',
    camblock:firstDate(/camera build|cam build|cam map|camera setup|blocking|gfx build/)||'TBD',
    txcheck:firstDate(/fiber|signal|commission|toc|sat|transmission|fax/)||'TBD',
    rehearsal:firstDate(/rehears/)||'TBD',
    broadcast:bcDate()||(p.date||'TBD'),
    strike:firstDate(/strike|load.?out|wrap|tear.?down/)||'TBD'
  };
  return m;
}
function crewPhasesFor(pos){ // which phases a role attends, by position keyword
  var s=(pos||'').toLowerCase();var all=["start","loadin","camblock","txcheck","rehearsal","broadcast","strike"];
  if(/tech manager|eic|engineering manager|director of engineering|stage manager|floor/.test(s))return all;
  if(/transmission|sat|network|it |it$|client services/.test(s))return ["start","loadin","txcheck","rehearsal","broadcast","strike"];
  if(/audio|a1|a2|rf/.test(s))return ["loadin","camblock","txcheck","rehearsal","broadcast","strike"];
  if(/cam|jib|steadi|utility|lighting/.test(s))return ["loadin","camblock","rehearsal","broadcast","strike"];
  if(/director|technical director|chyron|evs|teleprompt|producer|graphics/.test(s))return ["rehearsal","broadcast"];
  if(/vp|executive|production manager|var/.test(s))return ["rehearsal","broadcast"];
  return ["loadin","broadcast","strike"];
}
function crewIsOn(p,name,pos,ph){var ov=p.crewMatrix&&p.crewMatrix[name];if(ov&&ov[ph]!==undefined)return ov[ph];return crewPhasesFor(pos).indexOf(ph)>-1;}
function toggleCrewCell(key,name,pos,ph){var p=productions[key];if(!p.crewMatrix)p.crewMatrix={};if(!p.crewMatrix[name])p.crewMatrix[name]={};p.crewMatrix[name][ph]=!crewIsOn(p,name,pos,ph);stampEdit(key);renderProjectView(key);}
var PHASE_COLOR={start:"#0866ff",loadin:"#f5832a",camblock:"#0866ff",txcheck:"#0866ff",rehearsal:"#0a58ca",broadcast:"#e41e3f",strike:"#65676b"};
/* ============================================================================
   VENUE CHECK-IN (geofence)
   Free browser Geolocation + haversine radius against the production venue GPS.
   Stored on p.siteCheckins[name] so exec/tech managers see arrivals on the
   Personnel Call Matrix at a glance. No paid geofencing API required.
   ========================================================================== */
var CHECKIN_RADIUS_M=250; /* default fence radius around venue pin */
var checkinFilter={}; /* per-prod: '' | 'on' | 'off' */
function setCheckinFilter(key,v){checkinFilter[key]=v||'';renderProjectView(key);}
function checkinHaversineM(lat1,lng1,lat2,lng2){
  var R=6371000,toR=Math.PI/180;
  var dLat=(lat2-lat1)*toR,dLng=(lng2-lng1)*toR;
  var a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*toR)*Math.cos(lat2*toR)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return 2*R*Math.asin(Math.min(1,Math.sqrt(a)));
}
function checkinMap(key){
  var p=productions[key];if(!p)return {};
  if(!p.siteCheckins||typeof p.siteCheckins!=='object')p.siteCheckins={};
  return p.siteCheckins;
}
function checkinOf(key,name){var m=checkinMap(key);return m[name]||null;}
function checkinIsOnSite(key,name){var c=checkinOf(key,name);return !!(c&&c.status==='on_site');}
function checkinVenueForPerson(key,mem){
  /* Prefer the crew slot's venue (locId), else active location, else venueFor, else survey GPS */
  var p=productions[key];if(!p)return null;
  var locId=(mem&&mem.locId)||'';
  if(locId&&p.locations){
    for(var i=0;i<p.locations.length;i++){
      var L=p.locations[i];
      if(L.id===locId&&typeof L.lat==='number'&&typeof L.lng==='number')
        return {lat:L.lat,lng:L.lng,name:L.name,id:L.id,radius:CHECKIN_RADIUS_M};
    }
  }
  if(typeof activeLocation==='function'){
    var A=activeLocation(key);
    if(A&&typeof A.lat==='number'&&typeof A.lng==='number')
      return {lat:A.lat,lng:A.lng,name:A.name,id:A.id||'active',radius:CHECKIN_RADIUS_M};
  }
  if(typeof venueFor==='function'){
    var V=venueFor(key);
    if(V&&typeof V.lat==='number'&&typeof V.lng==='number')
      return {lat:V.lat,lng:V.lng,name:V.name,id:key,radius:CHECKIN_RADIUS_M};
  }
  try{
    var s=(typeof getSurvey==='function')?getSurvey(key):null;
    if(s&&typeof s.lat==='number'&&typeof s.lng==='number')
      return {lat:s.lat,lng:s.lng,name:s.address||p.venue||p.name,id:'survey',radius:CHECKIN_RADIUS_M};
  }catch(e){}
  return null;
}
function checkinFmtTime(ts){
  if(!ts)return '';
  try{
    var d=new Date(ts);
    if(isNaN(d.getTime()))return String(ts).slice(0,16);
    return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  }catch(e){return '';}
}
function checkinSummary(key){
  var crew=getProjectCrew(key).filter(function(s){return (s.name||'').trim();});
  var on=0;crew.forEach(function(s){if(checkinIsOnSite(key,s.name))on++;});
  return {on:on,total:crew.length,off:Math.max(0,crew.length-on)};
}
function checkinWrite(key,name,rec){
  var m=checkinMap(key);
  m[name]=rec;
  try{stampEdit(key);}catch(e){}
  try{if(typeof logEvent==='function')logEvent(key,(rec.status==='on_site'?'✅ Arrived':'↩ Cleared check-in')+': '+name+(rec.venueName?' @ '+rec.venueName:'')+(rec.method==='manual'?' (manual)':''));}catch(e2){}
  try{renderProjectView(key);}catch(e3){}
}
function checkinClear(key,name){
  var prev=checkinOf(key,name);
  checkinWrite(key,name,{
    status:'away',ts:new Date().toISOString(),
    lat:prev&&prev.lat,lng:prev&&prev.lng,accuracy:prev&&prev.accuracy,
    venueId:prev&&prev.venueId,venueName:prev&&prev.venueName,
    distM:prev&&prev.distM,method:'manual',
    by:(typeof permUser==='function'?permUser():'')||'Manager'
  });
  toast&&toast(name+' marked off-site');
}
function checkinManualArrive(key,name){
  var mem=crewMember(name,key)||{name:name};
  var v=checkinVenueForPerson(key,mem);
  checkinWrite(key,name,{
    status:'on_site',ts:new Date().toISOString(),
    lat:v?v.lat:null,lng:v?v.lng:null,accuracy:null,
    venueId:v?v.id:null,venueName:v?v.name:(productions[key]&&productions[key].venue)||'',
    distM:0,method:'manual',
    by:(typeof permUser==='function'?permUser():'')||'Manager'
  });
  toast&&toast('✅ '+name+' marked on site (manual)');
}
function checkinToggleManual(key,name){
  if(checkinIsOnSite(key,name))checkinClear(key,name);
  else checkinManualArrive(key,name);
}
function checkinSelfName(key){
  var me=(typeof permUser==='function')?permUser():'';
  if(!me)return '';
  /* match against assigned crew names (persona may equal a roster name) */
  var crew=getProjectCrew(key);
  for(var i=0;i<crew.length;i++){
    if((crew[i].name||'')===me)return me;
  }
  return me; /* still allow check-in under persona even if not on roster */
}
function checkinAtVenue(key,nameOpt){
  var name=nameOpt||checkinSelfName(key);
  if(!name){toast&&toast('No identity — pick a viewing role or assign yourself to a crew slot');return;}
  var mem=crewMember(name,key)||{name:name};
  var v=checkinVenueForPerson(key,mem);
  if(!v){toast&&toast('No venue GPS set — add lat/lng on Location & Map first');return;}
  if(!navigator.geolocation){
    toast&&toast('Geolocation unavailable — use manager mark, or open via HTTPS / ./start-muse.sh');
    return;
  }
  toast&&toast('Locating you near '+v.name+'…');
  navigator.geolocation.getCurrentPosition(function(pos){
    var lat=pos.coords.latitude,lng=pos.coords.longitude;
    var acc=pos.coords.accuracy!=null?Math.round(pos.coords.accuracy):null;
    var dist=checkinHaversineM(lat,lng,v.lat,v.lng);
    var radius=v.radius||CHECKIN_RADIUS_M;
    /* allow accuracy buffer so noisy GPS near the fence still counts */
    var ok=dist<=(radius+(acc?Math.min(acc,80):0));
    if(!ok){
      toast&&toast('Outside fence — '+Math.round(dist)+' m from '+v.name+' (need ≤'+radius+' m). Stay near the pin and retry, or ask a manager to mark you.');
      return;
    }
    checkinWrite(key,name,{
      status:'on_site',ts:new Date().toISOString(),
      lat:lat,lng:lng,accuracy:acc,
      venueId:v.id,venueName:v.name,distM:Math.round(dist),
      method:'gps',by:name
    });
    toast&&toast('✅ On site — '+name+' @ '+v.name+' ('+Math.round(dist)+' m)');
  },function(err){
    var msg='Location denied or unavailable';
    if(err&&err.code===1)msg='Location permission denied — allow location for this site';
    else if(err&&err.code===2)msg='Position unavailable — try outdoors / enable GPS';
    else if(err&&err.code===3)msg='Location timed out — retry';
    if(location.protocol==='file:')msg+=' · use ./start-muse.sh (HTTPS/localhost)';
    toast&&toast(msg);
  },{enableHighAccuracy:true,timeout:15000,maximumAge:10000});
}
function checkinBadgeHTML(key,name){
  var c=checkinOf(key,name);
  if(c&&c.status==='on_site'){
    var t=checkinFmtTime(c.ts);
    var tip=esc((c.venueName||'Venue')+(c.method==='manual'?' · manual':(' · GPS '+(c.distM!=null?c.distM+' m':'')))+(c.by?' · by '+c.by:''));
    return '<button type="button" onclick="event.stopPropagation();checkinToggleManual(\''+key+'\',\''+String(name).replace(/'/g,"\\'")+'\')" title="'+tip+' — click to clear" class="muse-checkin-on">'+
      '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400" style="box-shadow:0 0 0 2px rgba(49,162,76,.25)"></span>ON SITE'+(t?' · '+t:'')+'</button>';
  }
  return '<button type="button" onclick="event.stopPropagation();checkinToggleManual(\''+key+'\',\''+String(name).replace(/'/g,"\\'")+'\')" title="Not checked in — click to mark on site (manager)" class="muse-checkin-off">—</button>';
}

function crewScheduleHTML(key){var p=productions[key];var m=crewMilestones(p);
  var allCrew=getProjectCrew(key).filter(function(s){return (s.name||'').trim();});
  var cf=checkinFilter[key]||'';
  if(cf==='on')allCrew=allCrew.filter(function(mem){return checkinIsOnSite(key,mem.name);});
  else if(cf==='off')allCrew=allCrew.filter(function(mem){return !checkinIsOnSite(key,mem.name);});
  var shortLbl={start:"Start",loadin:"Load-In",camblock:"Cam Block",txcheck:"TX Check",rehearsal:"Rehearsal",broadcast:"Broadcast",strike:"Strike"};
  var chips=CREW_PHASES.map(function(ph){return '<div class="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"><span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:'+PHASE_COLOR[ph]+'"></span><div class="leading-tight"><div class="text-[9px] font-bold uppercase tracking-wider text-gray-600">'+CREW_PHASE_LABELS[ph]+'</div><div class="text-[11px] font-semibold text-gray-800 mono">'+(m[ph]?fmtDate(m[ph]):'TBD')+'</div></div></div>';}).join('');
  var colCount={};CREW_PHASES.forEach(function(ph){colCount[ph]=allCrew.filter(function(mem){return crewIsOn(p,mem.name,mem.pos,ph);}).length;});
  var N=allCrew.length;
  var sum=checkinSummary(key);
  var me=checkinSelfName(key);
  var headCells=CREW_PHASES.map(function(ph){var allOn=N&&colCount[ph]===N;
    return '<th class="p-0 align-bottom" style="min-width:78px"><button onclick="crewToggleColumn(\''+key+'\',\''+ph+'\')" title="Call or clear everyone for '+shortLbl[ph]+'" class="w-full flex flex-col items-center gap-0.5 px-1.5 pt-1 pb-1.5 rounded-lg hover:bg-gray-100 transition-colors" style="cursor:pointer">'+
      '<span class="h-1.5 w-7 rounded-full" style="background:'+PHASE_COLOR[ph]+'"></span>'+
      '<span class="text-[9px] font-bold uppercase tracking-wide text-gray-700 leading-none mt-0.5">'+shortLbl[ph]+'</span>'+
      '<span class="text-[8px] mono text-gray-400 leading-none">'+(m[ph]?fmtDate(m[ph]).replace(/, \d{4}/,''):'TBD')+'</span>'+
      '<span class="text-[8px] font-bold mono leading-none mt-0.5 '+(allOn?'text-emerald-600':'text-gray-400')+'">'+colCount[ph]+'/'+N+'</span>'+
    '</button></th>';}).join('');
  var bodyRows=allCrew.map(function(mem){var gc=CREW_GROUP_COLOR[mem.group]||'#b0b3b8';
    var onArr=CREW_PHASES.map(function(ph){return crewIsOn(p,mem.name,mem.pos,ph);});
    var onCount=onArr.filter(Boolean).length;
    var cells=CREW_PHASES.map(function(ph,j){var on=onArr[j];var prevOn=j>0&&onArr[j-1];var nextOn=j<CREW_PHASES.length-1&&onArr[j+1];
      var rl=(!prevOn)?'8px':'0';var rr=(!nextOn)?'8px':'0';var inner;
      if(on){inner='<span class="flex items-center justify-center w-full" style="height:26px;background:'+hexA(PHASE_COLOR[ph],0.92)+';border-radius:'+rl+' '+rr+' '+rr+' '+rl+'"><svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="4" style="opacity:.9"><path d="M20 6L9 17l-5-5"/></svg></span>';}
      else{inner='<span class="flex items-center justify-center w-full text-gray-300 group-hover:text-gray-500 transition-colors" style="height:26px;background:#f0f2f5;border-radius:6px;font-size:14px;line-height:1">+</span>';}
      return '<td class="p-0"><button onclick="toggleCrewCell(\''+key+'\',\''+mem.name.replace(/'/g,"\\'")+'\',\''+mem.pos.replace(/'/g,"\\'")+'\',\''+ph+'\')" title="'+esc(mem.name)+' \u00B7 '+shortLbl[ph]+(on?' (called \u2014 click to clear)':' (off \u2014 click to call)')+'" class="group block w-full" style="cursor:pointer">'+inner+'</button></td>';}).join('');
    var arrCell='<td class="py-1 px-1.5 align-middle whitespace-nowrap">'+checkinBadgeHTML(key,mem.name)+'</td>';
    return '<tr class="hover:bg-gray-50/40"><td class="py-1 pr-3 whitespace-nowrap align-middle" style="position:sticky;left:0;background:#ffffff;z-index:1"><button onclick="openCrewCard(\''+mem.name.replace(/'/g,"\\'")+'\',\''+key+'\')" class="text-[11px] font-semibold text-gray-800 hover:text-blue-700 hover:underline block leading-tight">'+esc(mem.name)+'</button><span class="text-[9px] text-gray-500 flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full flex-shrink-0" style="background:'+gc+'" title="'+esc(mem.group||'')+'"></span>'+esc(mem.pos)+' <span class="text-gray-300">\u00B7</span> <span class="mono">'+onCount+'/7</span></span></td>'+arrCell+cells+'</tr>';
  }).join('')||'<tr><td colspan="'+(CREW_PHASES.length+2)+'" class="py-6 text-center text-[11px] text-gray-400">'+(cf?'No crew match this arrival filter. <button onclick="setCheckinFilter(\''+key+'\',\'\')" class="text-blue-700 font-bold hover:underline">Show all</button>':'No one assigned yet \u2014 assign people to positions above and they\'ll appear here.')+'</td></tr>';
  var fchip=function(val,label,n,onCls){
    var on=(cf===val);
    return '<button type="button" onclick="setCheckinFilter(\''+key+'\',\''+val+'\')" class="muse-arrive-chip'+(on?(' on '+(onCls||'')):'')+'">'+label+(n!=null?' <span class="mono">'+(n)+'</span>':'')+'</button>';
  };
  var arriveBar='<div class="muse-arrive-bar flex flex-wrap items-center gap-2 justify-between">'+
    '<div class="flex items-center gap-3 flex-wrap min-w-0">'+
      '<div class="leading-tight"><p class="muse-arrive-kicker">Venue arrival</p>'+
      '<p class="text-[12px] mono muse-arrive-count"><span>'+sum.on+'</span><span class="muse-arrive-muted"> / '+sum.total+'</span> on site</p></div>'+
      '<div class="h-8 w-px hidden sm:block" style="background:rgba(168,218,181,.22)"></div>'+
      '<div class="flex items-center gap-1.5 flex-wrap">'+
        fchip('','All',sum.total)+
        fchip('on','On site',sum.on,'on-on')+
        fchip('off','Not yet',sum.off,'on-off')+
      '</div>'+
      '<p class="muse-arrive-hint">GPS fence ~'+CHECKIN_RADIUS_M+' m around the venue pin. Green = arrived. Managers can mark anyone; crew use Check me in.</p>'+
    '</div>'+
    '<div class="flex items-center gap-1.5 flex-shrink-0">'+
      '<button type="button" onclick="checkinAtVenue(\''+key+'\')" class="muse-arrive-cta">📍 Check me in</button>'+
      (me?'<button type="button" onclick="checkinClear(\''+key+'\',\''+String(me).replace(/'/g,"\\'")+'\')" class="muse-arrive-ghost">Clear mine</button>':'')+
    '</div></div>';
  return '<div class="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">'+
    '<div class="flex flex-wrap items-center justify-between gap-2 mb-3"><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">Crew Schedule \u2014 Milestones</h3>'+
      '<div class="flex items-center gap-1.5"><button onclick="printCrewMatrix(\''+key+'\')" class="text-[10px] font-bold text-blue-700 border border-blue-200 bg-blue-50 rounded-lg px-2.5 py-1 hover:bg-blue-100">\u2b07 Matrix PDF</button><button onclick="openSchedule(\''+key+'\')" class="text-[10px] font-bold text-blue-700 hover:underline">Edit dates \u2192</button></div></div>'+
    '<div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-5">'+chips+'</div>'+
    arriveBar+
    '<div class="flex flex-wrap items-end justify-between gap-2 mb-1.5"><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">Personnel Call Matrix</h3><span class="text-[9px] text-gray-500">Arrival shows who is <b class="text-emerald-700">on site</b> \u00B7 click a milestone to call/clear \u00B7 click a cell to toggle</span></div>'+
    '<div class="overflow-x-auto"><table class="text-left" style="border-collapse:separate;border-spacing:0 4px;min-width:100%"><thead><tr>'+
      '<th class="pb-1 pr-3 text-[8px] font-bold uppercase tracking-wider text-gray-500 align-bottom" style="position:sticky;left:0;background:#ffffff;z-index:2;min-width:150px">Crew</th>'+
      '<th class="pb-1 px-1 text-[8px] font-bold uppercase tracking-wider text-emerald-700 align-bottom" style="min-width:88px" title="Venue geofence check-in">Arrival</th>'+
      headCells+'</tr></thead><tbody>'+bodyRows+'</tbody></table></div>'+
    '<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3 pt-3 border-t border-gray-100"><span class="text-[9px] font-bold uppercase tracking-wider text-gray-400">Dept</span>'+CREW_GROUPS.map(function(g){return '<span class="flex items-center gap-1.5 text-[9px] text-gray-600"><span class="w-1.5 h-1.5 rounded-full" style="background:'+CREW_GROUP_COLOR[g]+'"></span>'+g+'</span>';}).join('')+'<span class="text-[9px] text-gray-400 sm:ml-auto">Green ON SITE = inside venue fence (or manager mark). PDF still exports call cells only.</span></div>'+
  '</div>';
}
function printCrewMatrix(key){var p=productions[key];var m=crewMilestones(p);
  var crew=getProjectCrew(key).filter(function(s){return (s.name||'').trim();});
  var shortLbl={start:"Start",loadin:"Load-In",camblock:"Cam Block",txcheck:"TX Check",rehearsal:"Rehearsal",broadcast:"Broadcast",strike:"Strike"};
  if(!(window.jspdf&&window.jspdf.jsPDF)){toast&&toast('PDF engine unavailable');return;}
  try{
    var J=window.jspdf.jsPDF;var doc=new J({unit:'pt',format:'letter',orientation:'landscape'});
    var W=doc.internal.pageSize.getWidth();var H=doc.internal.pageSize.getHeight();var M=40;
    simHead(doc,W,M,'Personnel Call Matrix',(p.name||'')+(p.venue?'  \u00B7  '+p.venue:''),['DATE: '+simToday(),crew.length+' crew \u00B7 '+CREW_PHASES.length+' milestones']);
    function rgb(hex){hex=(''+hex).replace('#','');var n=parseInt(hex,16)||0;return [(n>>16)&255,(n>>8)&255,n&255];}
    var phaseRGB=CREW_PHASES.map(function(ph){return rgb(PHASE_COLOR[ph]);});
    var onMap=crew.map(function(mem){return CREW_PHASES.map(function(ph){return crewIsOn(p,mem.name,mem.pos,ph);});});
    var head=['Name','Position'].concat(CREW_PHASES.map(function(ph){return shortLbl[ph]+'\n'+(m[ph]?fmtDate(m[ph]).replace(/, \d{4}/,''):'TBD');}));
    var body=crew.map(function(mem,ri){return [mem.name,mem.pos].concat(CREW_PHASES.map(function(ph,ci){return onMap[ri][ci]?'\u2022':'';}));});
    doc.autoTable({startY:74,head:[head],body:body,theme:'grid',
      styles:{fontSize:8,cellPadding:4,halign:'center',valign:'middle',lineColor:[228,230,235],lineWidth:0.5,textColor:[36,37,38]},
      headStyles:{fillColor:[231,243,255],textColor:[5,5,5],fontSize:7,fontStyle:'bold',halign:'center'},
      columnStyles:{0:{halign:'left',fontStyle:'bold',cellWidth:130},1:{halign:'left',cellWidth:120,textColor:[101,103,107],fontSize:7.5}},
      margin:{left:M,right:M},
      didParseCell:function(d){var ci=d.column.index;if(ci<2)return;var pi=ci-2;
        if(d.section==='head'){var c=phaseRGB[pi];d.cell.styles.fillColor=c;d.cell.styles.textColor=255;}
        else if(d.section==='body'){if(onMap[d.row.index]&&onMap[d.row.index][pi]){var c2=phaseRGB[pi];d.cell.styles.fillColor=c2;d.cell.styles.textColor=255;d.cell.styles.fontStyle='bold';d.cell.styles.fontSize=11;}else{d.cell.styles.fillColor=[247,248,250];}}}
    });
    var fy=doc.lastAutoTable.finalY;
    // per-milestone totals + legend
    var ly=fy+22,lx=M;doc.setFontSize(7.5);
    CREW_PHASES.forEach(function(ph,i){var c=phaseRGB[i];doc.setFillColor(c[0],c[1],c[2]);doc.roundedRect(lx,ly-7,9,9,2,2,'F');
      doc.setFont('helvetica','bold');doc.setTextColor(62,64,66);var lab=shortLbl[ph]+' ('+onMap.filter(function(r){return r[i];}).length+')';doc.text(lab,lx+13,ly);
      lx+=13+doc.getTextWidth(lab)+16;if(lx>W-140){lx=M;ly+=16;}});
    simFoot(doc,W,M);
    var blob=doc.output('blob');var url=URL.createObjectURL(blob);var w=window.open(url,'_blank');
    if(!w){doc.save((p.name||'Call_Matrix').replace(/[^a-z0-9]+/gi,'_')+'_Call_Matrix.pdf');}toast&&toast('Call Matrix exported');
  }catch(e){toast&&toast('Could not export matrix');}
}

var crewSearchQ='';
var crewLocFilter={}; /* per-production venue filter for the Crew pane: ''=all, '__prod'=production-wide slots, else locId */
function setCrewLocFilter(key,v){crewLocFilter[key]=v||'';var act=document.querySelector('.view-pane.active');if(act){var k=act.id.replace('view-','');if(productions[k])renderProjectView(k);}}
function crewLocOptions(key,cur){
  var out='<option value=""'+(cur?'':' selected')+'>Production-wide</option>';
  if(typeof locsOf==='function')locsOf(key).forEach(function(L){out+='<option value="'+esc(L.id)+'"'+(cur===L.id?' selected':'')+'>'+(L.flag||'')+' '+esc(L.name)+'</option>';});
  return out;}
function setCrewSearch(v){crewSearchQ=(v||'').toLowerCase();var act=document.querySelector('.view-pane.active');if(act){var k=act.id.replace('view-','');if(productions[k])renderProjectView(k);}}

/* ============================================================================
   POSITIONS-FIRST CREWING  (PRD §1)
   Each production owns p.crew — an array of slot objects:
     {id, pos, group, name, email, phone, prov}
   An empty `name` = a defined-but-unassigned POSITION (Phase 1).
   "Assign" populates the slot from the personnel roster or by hand (Phase 2).
   Full CRUD on positions and people lives in the project Crew tab.
   ============================================================================ */
var CREW_GROUPS=["Field & Technical","IT / Network & Engineering","PCR / Control Room","Production & Executive"];
var CREW_GROUP_COLOR={"Field & Technical":"#0866ff","IT / Network & Engineering":"#0866ff","PCR / Control Room":"#0a58ca","Production & Executive":"#f5832a"};
// common positions offered when defining a project (positions-first picker)
;
var _crewSlotSeq=1;
function newSlotId(){return 'cs'+(Date.now().toString(36))+(_crewSlotSeq++);}
// seed a production's crew from the legacy global roster the first time (preserves existing data)
function seedProjectCrew(){
  var groups=[["Field & Technical",CREW_FIELD],["IT / Network & Engineering",CREW_IT],["PCR / Control Room",CREW_PCR],["Production & Executive",CREW_EXEC]];
  var out=[];groups.forEach(function(g){g[1].forEach(function(m){
    out.push({id:newSlotId(),pos:m.pos,group:g[0],name:m.name||'',email:m.email||'',phone:m.phone||'',prov:m.prov||'',passport:m.passport||'',homeBase:m.homeBase||''});});});
  return out;}
function getProjectCrew(key){var p=productions[key];if(!p.crew||!Array.isArray(p.crew)){p.crew=seedProjectCrew();}return p.crew;}
function crewSlotById(key,id){var c=getProjectCrew(key);for(var i=0;i<c.length;i++)if(c[i].id===id)return c[i];return null;}
function projAssignedCount(key){var c=getProjectCrew(key);return c.filter(function(s){return (s.name||'').trim();}).length;}
function projOpenCount(key){var c=getProjectCrew(key);return c.filter(function(s){return !(s.name||'').trim();}).length;}

/* ---- CRUD ops ---- */
function crewAddPosition(key,group){var c=getProjectCrew(key);
  var lf=(typeof crewLocFilter!=='undefined'&&crewLocFilter[key])||'';
  c.push({id:newSlotId(),pos:'New Position',group:group||CREW_GROUPS[0],name:'',email:'',phone:'',prov:'',passport:'',homeBase:'',locId:(lf&&lf!=='__prod')?lf:''});
  stampEdit(key);renderProjectView(key);toast('Position added — click to name & assign');}
function crewDeleteSlot(key,id){var c=getProjectCrew(key);var s=crewSlotById(key,id);if(!s)return;
  if(!confirm('Remove '+(s.name?('"'+s.name+'" ('+s.pos+')'):('the "'+s.pos+'" position'))+' from this production?'))return;
  var i=c.map(function(x){return x.id;}).indexOf(id);if(i>-1)c.splice(i,1);
  // also clear any milestone override keyed by the (now removed) person
  if(s.name&&productions[key].crewMatrix&&productions[key].crewMatrix[s.name])delete productions[key].crewMatrix[s.name];
  stampEdit(key);renderProjectView(key);toast('Removed from production');}
function crewSetField(key,id,field,val){var s=crewSlotById(key,id);if(!s)return;
  var oldName=s.name;s[field]=val;
  // keep milestone overrides attached to the renamed person
  if(field==='name'&&oldName&&oldName!==val&&productions[key].crewMatrix&&productions[key].crewMatrix[oldName]){
    productions[key].crewMatrix[val]=productions[key].crewMatrix[oldName];delete productions[key].crewMatrix[oldName];}
  stampEdit(key);saveState();
  if(field==='group'||field==='name'||field==='locId')renderProjectView(key);}
function crewUnassign(key,id){var s=crewSlotById(key,id);if(!s)return;var nm=s.name;
  s.name='';s.email='';s.phone='';
  if(nm&&productions[key].crewMatrix&&productions[key].crewMatrix[nm])delete productions[key].crewMatrix[nm];
  stampEdit(key);renderProjectView(key);toast('Position now open');}

/* ---- Assign modal: pick a person from the roster (or enter manually) ---- */
var assignCtx={key:null,id:null};
function openAssign(key,id){assignCtx={key:key,id:id};var ov=document.getElementById('assignOverlay');if(!ov)return;
  var s=crewSlotById(key,id);
  document.getElementById('assignTitle').textContent='Assign — '+(s?s.pos:'Position');
  var inp=document.getElementById('assignSearch');if(inp)inp.value='';
  renderAssignList('');
  // manual fields blank
  ['asgName','asgEmail','asgPhone','asgProv','asgPassport','asgHome'].forEach(function(fid){var el=document.getElementById(fid);if(el)el.value='';});
  ov.style.display='flex';
  setTimeout(function(){if(inp)inp.focus();},60);}
function closeAssign(){var ov=document.getElementById('assignOverlay');if(ov)ov.style.display='none';}
var _assignRoster=[];
function renderAssignList(q){q=(q||'').toLowerCase();var box=document.getElementById('assignList');if(!box)return;
  var s=crewSlotById(assignCtx.key,assignCtx.id);
  var roster=personnelRoster();
  // surface best matches: same position first, then same group, then everyone
  roster.sort(function(a,b){
    function score(m){var sc=0;if(s){if(m.pos===s.pos)sc-=2;if(m.group===s.group)sc-=1;}return sc;}
    return score(a)-score(b);});
  var list=roster.filter(function(m){if(!q)return true;return (m.name+' '+m.pos+' '+m.group+' '+m.email+' '+m.prov).toLowerCase().indexOf(q)>-1;});
  _assignRoster=list;
  if(!list.length){box.innerHTML='<p class="text-[11px] text-gray-400 text-center py-4">No matching personnel. Use the manual entry below.</p>';return;}
  box.innerHTML=list.slice(0,40).map(function(m,idx){var col=CREW_GROUP_COLOR[m.group]||'#65676b';var match=(s&&m.pos===s.pos);
    return '<button onclick="assignPick('+idx+')" class="w-full text-left flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 border '+(match?'border-blue-200 bg-blue-50/40':'border-transparent hover:border-gray-200')+'">'+
      '<div class="min-w-0"><p class="text-[12px] font-semibold text-gray-900 truncate">'+esc(m.name)+(match?' <span class="text-[8px] font-bold text-blue-700">· exact role</span>':'')+'</p>'+
        '<p class="text-[10px] text-gray-500 truncate"><span class="inline-block w-1.5 h-1.5 rounded-full align-middle mr-1" style="background:'+col+'"></span>'+esc(m.pos)+(m.prov?' · '+esc(m.prov):'')+'</p></div>'+
      '<span class="text-[9px] font-bold text-blue-700 flex-shrink-0">Assign →</span></button>';
  }).join('');}
function assignPick(idx){var m=_assignRoster[idx];if(!m)return;
  var s=crewSlotById(assignCtx.key,assignCtx.id);if(!s)return;
  s.name=m.name;s.email=m.email||'';s.phone=m.phone||'';s.prov=m.prov||s.prov||'';
  if(m.passport)s.passport=m.passport;if(m.homeBase)s.homeBase=m.homeBase;
  stampEdit(assignCtx.key);closeAssign();renderProjectView(assignCtx.key);toast(m.name+' assigned to '+s.pos);}
function assignManual(){var s=crewSlotById(assignCtx.key,assignCtx.id);if(!s)return;
  var nm=(document.getElementById('asgName')||{}).value||'';nm=nm.trim();
  if(!nm){toast('Enter a name to assign');return;}
  s.name=nm;s.email=((document.getElementById('asgEmail')||{}).value||'').trim();
  s.phone=((document.getElementById('asgPhone')||{}).value||'').trim();
  var pv=((document.getElementById('asgProv')||{}).value||'').trim();if(pv)s.prov=pv;
  var pp=((document.getElementById('asgPassport')||{}).value||'').trim();if(pp)s.passport=pp;
  var hb=((document.getElementById('asgHome')||{}).value||'').trim().toUpperCase();if(hb)s.homeBase=hb;
  stampEdit(assignCtx.key);closeAssign();renderProjectView(assignCtx.key);toast(nm+' assigned to '+s.pos);}
function assignSearchInput(v){renderAssignList(v);}

function crewPaneHTML(key){var p=productions[key];
  var crew=getProjectCrew(key);
  var q=crewSearchQ;
  /* v38 multi-venue: one flat roster (travel/labor/scheduling consumers untouched) —
     each slot may be pinned to a venue via locId (''=production-wide). */
  var multi=(typeof hasLocs==='function')&&hasLocs(key);
  var locs=multi?locsOf(key):[];
  var lf=multi?(crewLocFilter[key]||''):'';
  var assigned=projAssignedCount(key),open=projOpenCount(key),total=crew.length;
  // group the slots
  var html=CREW_GROUPS.map(function(gName){
    var slots=crew.filter(function(s){return (s.group||CREW_GROUPS[0])===gName;});
    var filtered=slots.filter(function(s){
      if(multi&&lf){if(lf==='__prod'){if((s.locId||''))return false;}else if((s.locId||'')!==lf)return false;}
      return !q||((s.name||'')+' '+s.pos+' '+(s.email||'')+' '+(s.prov||'')).toLowerCase().indexOf(q)>-1;});
    if(!filtered.length&&q)return '';
    var col=CREW_GROUP_COLOR[gName]||'#65676b';
    /* with a venue filter on, the header must describe what is actually shown */
    var counted=(multi&&lf)?filtered:slots;
    var openInGroup=counted.filter(function(s){return !(s.name||'').trim();}).length;
    var rows=filtered.map(function(s){var isOpen=!(s.name||'').trim();var hasF=!isOpen&&(typeof crewFlight==='function')&&crewFlight(s.name);
      return '<tr class="hover:bg-gray-50/60 '+(isOpen?'bg-amber-50/30':'')+'">'+
        // position (editable)
        '<td class="py-2 pr-3"><input value="'+esc(s.pos||'').replace(/"/g,'&quot;')+'" onchange="crewSetField(\''+key+'\',\''+s.id+'\',\'pos\',this.value)" class="w-full bg-transparent font-semibold text-gray-800 text-[12px] border border-transparent hover:border-gray-200 focus:border-blue-300 rounded px-1.5 py-1" style="outline:none;min-width:130px"></td>'+
        // name / assignment
        '<td class="py-2 pr-3" style="min-width:150px">'+(isOpen?
          '<button onclick="openAssign(\''+key+'\',\''+s.id+'\')" class="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded-lg px-2.5 py-1 hover:bg-amber-200"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>Open — Assign</button>':
          '<div class="flex items-center gap-1.5"><button onclick="openCrewCard(\''+s.name.replace(/'/g,"\\'")+'\',\''+key+'\')" class="text-gray-900 hover:text-blue-700 hover:underline font-medium inline-flex items-center gap-1">'+esc(s.name)+(hasF?' <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0866ff" stroke-width="2"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>':'')+'</button>'+
            '<button onclick="crewUnassign(\''+key+'\',\''+s.id+'\')" title="Unassign (keep position open)" class="text-gray-300 hover:text-amber-600 text-[10px]">⊘</button></div>')+'</td>'+
        // email
        '<td class="py-2 pr-3 mono text-[10px]" style="min-width:160px">'+(isOpen?'<span class="text-gray-300">—</span>':'<input value="'+esc(s.email||'').replace(/"/g,'&quot;')+'" onchange="crewSetField(\''+key+'\',\''+s.id+'\',\'email\',this.value)" placeholder="email" class="w-full bg-transparent text-blue-700 border border-transparent hover:border-gray-200 focus:border-blue-300 rounded px-1.5 py-1" style="outline:none">')+'</td>'+
        // phone
        '<td class="py-2 pr-3 mono text-[10px]" style="min-width:120px">'+(isOpen?'<span class="text-gray-300">—</span>':'<input value="'+esc(s.phone||'').replace(/"/g,'&quot;')+'" onchange="crewSetField(\''+key+'\',\''+s.id+'\',\'phone\',this.value)" placeholder="phone" class="w-full bg-transparent text-gray-600 border border-transparent hover:border-gray-200 focus:border-blue-300 rounded px-1.5 py-1" style="outline:none">')+'</td>'+
        // provided by
        '<td class="py-2 pr-3 text-[10px]" style="min-width:110px"><input value="'+esc(s.prov||'').replace(/"/g,'&quot;')+'" onchange="crewSetField(\''+key+'\',\''+s.id+'\',\'prov\',this.value)" placeholder="vendor / dept" class="w-full bg-transparent text-gray-500 border border-transparent hover:border-gray-200 focus:border-blue-300 rounded px-1.5 py-1" style="outline:none"></td>'+
        // passport / ID
        '<td class="py-2 pr-3 text-[10px]" style="min-width:110px">'+(isOpen?'<span class="text-gray-300">—</span>':'<input value="'+esc(s.passport||'').replace(/"/g,'&quot;')+'" onchange="crewSetField(\''+key+'\',\''+s.id+'\',\'passport\',this.value)" placeholder="passport / ID" class="w-full bg-transparent mono text-gray-600 border border-transparent hover:border-gray-200 focus:border-blue-300 rounded px-1.5 py-1" style="outline:none">')+'</td>'+
        // home base (origin airport)
        '<td class="py-2 pr-3 text-[10px]" style="min-width:70px">'+(isOpen?'<span class="text-gray-300">—</span>':'<input value="'+esc(s.homeBase||'').replace(/"/g,'&quot;')+'" onchange="crewSetField(\''+key+'\',\''+s.id+'\',\'homeBase\',this.value.toUpperCase())" placeholder="IATA" maxlength="3" class="w-full bg-transparent mono uppercase text-blue-700 font-bold border border-transparent hover:border-gray-200 focus:border-blue-300 rounded px-1.5 py-1" style="outline:none">')+'</td>'+
        // venue (multi-venue productions only)
        (multi?'<td class="py-2 pr-3 text-[10px]" style="min-width:130px"><select onchange="crewSetField(\''+key+'\',\''+s.id+'\',\'locId\',this.value)" class="w-full bg-transparent text-gray-700 text-[10px] border border-transparent hover:border-gray-200 rounded px-1 py-0.5 cursor-pointer" style="outline:none">'+crewLocOptions(key,s.locId||'')+'</select></td>':'')+
        // delete
        '<td class="py-2 text-right"><button onclick="crewDeleteSlot(\''+key+'\',\''+s.id+'\')" title="Remove position" class="text-gray-300 hover:text-red-500 text-xs">✕</button></td>'+
      '</tr>';
    }).join('');
    return '<div class="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">'+
      '<div class="flex items-center justify-between mb-3 flex-wrap gap-2"><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600 flex items-center gap-2"><span class="w-2 h-2 rounded-full" style="background:'+col+'"></span>'+gName+' <span class="text-[9px] text-gray-400">('+counted.length+(openInGroup?' · '+openInGroup+' open':'')+((multi&&lf)?' of '+slots.length:'')+')</span></h3>'+
        '<button onclick="crewAddPosition(\''+key+'\',\''+gName.replace(/'/g,"\\'")+'\')" class="text-[10px] font-bold text-blue-700 hover:underline">+ Add Position</button></div>'+
      (filtered.length?'<div class="overflow-x-auto"><table class="w-full text-left text-xs" style="min-width:920px"><thead><tr class="text-gray-500 uppercase tracking-wider text-[9px] border-b border-gray-200"><th class="pb-2 pr-3">Position</th><th class="pb-2 pr-3">Name</th><th class="pb-2 pr-3">Email</th><th class="pb-2 pr-3">Phone</th><th class="pb-2 pr-3">Provided By</th><th class="pb-2 pr-3">Passport / ID</th><th class="pb-2 pr-3">Home</th>'+(multi?'<th class="pb-2 pr-3">Venue</th>':'')+'<th class="pb-2"></th></tr></thead><tbody class="divide-y divide-gray-100">'+rows+'</tbody></table></div>':((multi&&lf)?'<p class="text-[11px] text-gray-400 py-2">No positions pinned to this venue in this group.</p>':'<p class="text-[11px] text-gray-400 py-2">No positions in this group yet.</p>'))+
    '</div>';
  }).join('');
  if(q&&!html.trim())html='<div class="bg-white rounded-2xl p-8 border border-gray-200/60 text-center text-[11px] text-gray-400">No crew match "'+esc(crewSearchQ)+'". <button onclick="setCrewSearch(\'\')" class="text-blue-700 font-bold hover:underline">Clear</button></div>';
  var searchBar='<div class="bg-white rounded-2xl px-4 py-3 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)"><div class="flex items-center justify-between gap-2 flex-wrap"><div class="relative flex-1 max-w-xs"><svg class="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg><input value="'+esc(crewSearchQ)+'" oninput="setCrewSearch(this.value)" placeholder="Search positions, names, vendors…" class="w-full text-[11px] border border-gray-300 rounded-lg pl-8 pr-3 py-1.5" style="outline:none"></div>'+
    '<div class="flex items-center gap-3 text-[10px] mono"><button onclick="openCsvImport(\'crew\',\''+key+'\')" class="text-[10px] font-bold text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50 mono-0" style="font-family:inherit">Import CSV</button><span class="text-emerald-600 font-bold">'+assigned+' assigned</span><span class="text-amber-600 font-bold">'+open+' open</span><span class="text-gray-400">'+total+' positions</span></div></div></div>';
  // positions-first banner when there are unassigned slots
  var openBanner=open?'<div class="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center justify-between gap-2"><div class="flex items-center gap-2 min-w-0"><span class="w-7 h-7 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center flex-shrink-0 text-sm">👤</span><p class="text-[11px] text-amber-800 font-semibold">'+open+' position'+(open>1?'s':'')+' defined but not yet assigned — click "Open — Assign" to populate '+(open>1?'them':'it')+'.</p></div></div>':'';
  var venueBar='';
  if(multi){
    var prodN=crew.filter(function(s){return !(s.locId||'');}).length;
    var fchip=function(val,label,n){var on=(lf===val);
      return '<button onclick="setCrewLocFilter(\''+key+'\',\''+val+'\')" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold '+(on?'bg-gray-900 text-white border-gray-900':'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')+'">'+label+(n!=null?' <span class="mono '+(on?'text-white/70':'text-gray-400')+'">'+n+'</span>':'')+'</button>';};
    var chips=fchip('','All venues',crew.length)+fchip('__prod','Production-wide',prodN)+
      locs.map(function(L){var n=crew.filter(function(s){return (s.locId||'')===L.id;}).length;return fchip(L.id,(L.flag||'\uD83D\uDCCD')+' '+esc(L.name),n);}).join('');
    venueBar='<div class="bg-white rounded-2xl px-4 py-3 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">'+
      '<div class="flex items-center gap-2 flex-wrap"><span class="text-[9px] font-bold uppercase tracking-wider text-gray-500">Crew — by venue</span>'+chips+'</div>'+
      '<p class="text-[9px] text-gray-400 mt-1.5">Multi-venue production — pin each position to a venue with its Venue column, or leave it Production-wide. Travel, labor and manifests always see the full roster.</p></div>';
  }
  return '<div class="space-y-4">'+venueBar+'<div class="flex items-center justify-between flex-wrap gap-2"><p class="text-xs text-gray-600">Positions-first crew — define roles, then assign people. All fields are editable inline.</p><span class="text-[10px] mono text-gray-500">'+p.name+'</span></div>'+
    searchBar+
    openBanner+
    crewScheduleHTML(key)+
    html+'</div>';
}

/* ---- Browser history (back / forward) ---------------------------------
   SPA views used to swap panes without history, so the back button left the site.
   Hash routes: #/dashboard · #/schedule · #/museaitour · #/museaitour/ops
   --------------------------------------------------------------------------- */
var _museHistSilent=false;
var _museHistView='dashboard';
function museRouteHash(view,sub){
  view=view||'dashboard';
  if(view==='kb'&&sub)return '#/kb/'+encodeURIComponent(sub);
  if(productions[view]&&sub&&sub!=='overview')return '#/'+encodeURIComponent(view)+'/'+encodeURIComponent(sub);
  return '#/'+encodeURIComponent(view);
}
function museParseHash(h){
  h=String(h==null?location.hash:h).replace(/^#\/?/,'').replace(/\/+$/,'');
  if(!h)return {view:'dashboard',sub:null};
  var parts=h.split('/').map(function(p){try{return decodeURIComponent(p);}catch(e){return p;}});
  var view=parts[0]||'dashboard';
  var sub=parts[1]||null;
  /* unknown production slug → still open if it may be created; else dashboard */
  if(view&&view!=='dashboard'&&!productions[view]&&!document.getElementById('view-'+view)){
    var known={schedule:1,engrequests:1,personnel:1,portal:1,comms:1,finance:1,equipment:1,vendors:1,kb:1};
    if(!known[view])return {view:'dashboard',sub:null};
  }
  return {view:view,sub:sub};
}
function museHistoryPush(view,sub,replace){
  try{
    if(productions[view])sub=sub||projSubTab[view]||'overview';
    else if(view!=='kb')sub=null;
    var hash=museRouteHash(view,sub);
    var cur=(location.hash||'#/dashboard');
    if(cur===hash||cur==='#'+hash.slice(1))return;
    var state={view:view,sub:sub,t:Date.now()};
    _museHistSilent=true;
    if(replace)history.replaceState(state,'',hash);
    else history.pushState(state,'',hash);
    _museHistSilent=false;
    _museHistView=view;
  }catch(e){_museHistSilent=false;}
}
function museHistoryApply(route,fromPop){
  route=route||museParseHash();
  var view=route.view||'dashboard';
  if(route.sub&&productions[view]){
    try{projSubTab[view]=route.sub;}catch(e){}
  }
  switchView(view,{skipHistory:true,fromPop:!!fromPop});
}
function museHistoryInit(){
  try{
    window.addEventListener('popstate',function(ev){
      if(_museHistSilent)return;
      if(ev&&ev.state&&ev.state.view)museHistoryApply(ev.state,true);
      else museHistoryApply(museParseHash(),true);
    });
    /* initial URL */
    var raw=location.hash||'';
    var route=museParseHash();
    if(raw===''||raw==='#'){
      /* seed a history entry so the first in-app Back stays on dashboard once */
      try{
        history.replaceState({view:'dashboard',sub:null,t:Date.now()},'','#/dashboard');
      }catch(e0){}
      _museHistView='dashboard';
    }else{
      /* deep link / refresh on a hash route */
      _museHistView=route.view;
      try{history.replaceState({view:route.view,sub:route.sub,t:Date.now()},'',museRouteHash(route.view,route.sub));}catch(e2){}
      /* apply after first paint so panes exist */
      setTimeout(function(){try{museHistoryApply(route,true);}catch(e3){}},0);
    }
  }catch(e){}
}

function switchView(view,opts){
  opts=opts||{};
  if(!view)view='dashboard';
  // create the project view pane on demand
  if(productions[view]&&!document.getElementById('view-'+view)){
    var pv=document.getElementById('projectViews');
    if(pv){var d=document.createElement('div');d.id='view-'+view;d.className='view-pane';pv.appendChild(d);}
  }
  var _heavy=null;
  if(productions[view])_heavy=function(){try{renderProjectView(view);}catch(eH){}};
  else if(view==='vendors')_heavy=function(){try{renderVendorsView();}catch(eH){}};
  else if(view==='equipment')_heavy=function(){try{renderEquipView();}catch(eH){}};
  else if(view==='finance')_heavy=function(){try{renderFinanceView();}catch(eH){}};
  else if(view==='streams')_heavy=function(){try{MuseStreaming.renderWall();}catch(eH){}};
  else if(view==='incidents')_heavy=function(){try{MuseIncidents.render();}catch(eH){}};
  else if(view==='dashboard')_heavy=function(){try{MuseStreaming.renderDash();}catch(eH){}};

  var panes=document.querySelectorAll('.view-pane');for(var i=0;i<panes.length;i++)panes[i].classList.remove('active');
  var t=document.getElementById('view-'+view);if(t)t.classList.add('active');
  if(view==='kb'){
    try{
      if(typeof MuseKB!=='undefined'){
        var kbSlug=(opts&&opts.kbSlug)||null;
        if(!kbSlug){
          try{
            var kbRoute=museParseHash();
            if(kbRoute&&kbRoute.view==='kb'&&kbRoute.sub)kbSlug=kbRoute.sub;
          }catch(eHash){}
        }
        if(typeof MuseKB.applyRoute==='function')MuseKB.applyRoute(kbSlug);
        else if(typeof MuseKB.render==='function')MuseKB.render();
      }
    }catch(eKb){}
  }
  // v30 review fix: display:none doesn't stop media — pause any video left playing in a hidden pane
  try{var _vds=document.querySelectorAll('.view-pane:not(.active) video');for(var _vi=0;_vi<_vds.length;_vi++){try{_vds[_vi].pause();}catch(e){}}}catch(e){}
  var btns=document.querySelectorAll('#tabNav button');for(var j=0;j<btns.length;j++){var b=btns[j];if(b.getAttribute('data-view')===view){b.className=b.className.replace('tab-inactive','tab-active');}else if(b.getAttribute('data-view')){b.className=b.className.replace('tab-active','tab-inactive');}}
  try{navRailSetActive(view);}catch(e){}
  if(_heavy)museAfterPaint(function(){_heavy();if(typeof MuseWork!=='undefined')MuseWork.mountSections();});else if(typeof MuseWork!=='undefined')MuseWork.mountSections();
  try{setTimeout(mountVisibleMaps,80);}catch(e){}
  try{if(typeof mountRichBoxes==='function')setTimeout(function(){mountRichBoxes(document);},50);}catch(e){}
  if(!opts.fromPop)window.scrollTo(0,0);
  /* record browser history unless this navigation came from Back/Forward */
  if(!opts.skipHistory){
    try{
      var sub=productions[view]?(projSubTab[view]||'overview'):null;
      museHistoryPush(view,sub,false);
      _museHistView=view;
    }catch(eH){}
  }else{
    _museHistView=view;
  }
}

function toast(msg){var box=document.getElementById('toastBox');if(!box)return;var el=document.createElement('div');el.className='toast-msg';
  el.style.cssText='background:#18191A;color:#ffffff;border:1px solid rgba(255,255,255,.08)';
  var dot=document.createElement('span');dot.className='toast-dot';
  var tx=document.createElement('span');tx.style.color='#ffffff';tx.textContent=String(msg==null?'':msg);
  el.appendChild(dot);el.appendChild(tx);box.appendChild(el);
  setTimeout(function(){el.style.transition='opacity .3s';el.style.opacity='0';setTimeout(function(){el.remove();},300);},3200);}



/* CREW: click a person's name to open a contact / role / schedule card */
function crewMember(name,key){
  // prefer the project's own crew slot (covers manually-assigned people not in the global roster)
  if(key&&productions[key]&&productions[key].crew){var c=productions[key].crew;for(var j=0;j<c.length;j++){if(c[j].name===name)return c[j];}}
  var all=CREW_FIELD.concat(CREW_IT,CREW_PCR,CREW_EXEC);for(var i=0;i<all.length;i++){if(all[i].name===name)return all[i];}return null;}
function openCrewCard(name,key){var m=crewMember(name,key);if(!m){toast(name);return;}
  var ph=crewPhasesFor(m.pos);var cm=key&&productions[key]?crewMilestones(productions[key]):null;
  var plbl={start:"Start / Travel",loadin:"Load-In",camblock:"Camera Blocking",txcheck:"Transmission Check",rehearsal:"Rehearsal",broadcast:"Broadcast",strike:"Strike / Load-Out"};
  var sched=ph.map(function(p2){return '<div class="flex items-center justify-between text-[11px] py-0.5"><span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full" style="background:'+PHASE_COLOR[p2]+'"></span>'+plbl[p2]+'</span><span class="mono text-gray-600">'+(cm&&cm[p2]?fmtDate(cm[p2]):'—')+'</span></div>';}).join('');
  var ov=document.getElementById('crewCardOverlay');var bx=document.getElementById('crewCardBox');
  var f=(typeof crewFlight==='function')?crewFlight(m.name):null;
  if(f&&typeof permScope==='function'&&permScope('travel')==='own'&&m.name!==permUser())f=null; // restricted roles never see coworkers' itineraries
  var flightBlock='';
  if(f){var al=airline(f.airlineCode);var da=airport(f.dep.code),ar=airport(f.arr.code);
    flightBlock='<div class="pt-2 mt-2 border-t border-gray-100"><div class="flex items-center justify-between mb-1.5"><p class="text-[10px] font-bold uppercase tracking-wider text-gray-500">Flight</p>'+
      '<button onclick="closeCrewCard();openTicket(\''+m.name.replace(/'/g,"\\'")+'\')" class="text-[9px] font-bold text-blue-700 hover:underline">View boarding pass →</button></div>'+
      '<div class="flex items-center gap-2 mb-2"><div style="width:24px;height:24px;flex-shrink:0">'+al.logo+'</div>'+
        '<div class="min-w-0"><p class="text-[11px] font-bold text-gray-900 leading-none">'+esc(al.name)+' · '+esc(f.flightNumber)+'</p>'+
        '<p class="text-[9px] mono text-gray-500 mt-0.5">CS '+esc(al.phone)+'</p></div></div>'+
      '<div class="flex items-center gap-2 bg-gray-50 rounded-lg p-2 border border-gray-100">'+
        '<div class="flex-1 min-w-0"><p class="text-[8px] text-gray-400 uppercase tracking-wider font-bold">Depart</p><p class="text-[12px] font-bold text-gray-900">'+fmtLocalTime(f.dep.localTime)+'</p><p class="text-[9px] text-gray-600 truncate">'+esc(da.city)+' ('+f.dep.code+') · '+esc(f.dep.terminal||'')+' '+esc(f.dep.gate?'G'+f.dep.gate:'')+'</p></div>'+
        '<svg width="20" height="10" viewBox="0 0 20 10"><line x1="1" y1="5" x2="15" y2="5" stroke="#ced0d4" stroke-width="1" stroke-dasharray="2 2"/><path d="M14 2 L18 5 L14 8" fill="none" stroke="#b0b3b8" stroke-width="1.2"/></svg>'+
        '<div class="flex-1 min-w-0 text-right"><p class="text-[8px] text-gray-400 uppercase tracking-wider font-bold">Arrive</p><p class="text-[12px] font-bold text-gray-900">'+fmtLocalTime(f.arr.localTime)+'</p><p class="text-[9px] text-gray-600 truncate">'+esc(ar.city)+' ('+f.arr.code+') · '+esc(f.arr.terminal||'')+' '+esc(f.arr.gate?'G'+f.arr.gate:'')+'</p></div>'+
      '</div><p class="text-[8px] text-gray-400 mono mt-1 text-center">Times shown in each airport\u2019s local time</p></div>';
  }
  bx.innerHTML='<div class="flex items-start justify-between mb-3"><div class="flex items-center gap-3"><div class="w-11 h-11 rounded-full bg-gradient-to-br from-purple-600 to-blue-500 text-white flex items-center justify-center text-sm font-bold">'+m.name.split(' ').map(function(x){return x[0];}).slice(0,2).join('')+'</div><div><h3 class="text-base font-bold text-gray-900 leading-tight">'+m.name+'</h3><p class="text-xs text-gray-600">'+m.pos+'</p></div></div><button onclick="closeCrewCard()" class="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button></div>'+
    '<div class="space-y-1 text-xs mb-3"><div class="flex justify-between"><span class="text-gray-500">Provided By</span><span class="font-semibold text-gray-800">'+(m.prov||'—')+'</span></div>'+
    '<div class="flex justify-between"><span class="text-gray-500">Email</span>'+(m.email?'<a href="mailto:'+m.email+'" class="mono text-blue-700 hover:underline">'+m.email+'</a>':'<span>—</span>')+'</div>'+
    '<div class="flex justify-between"><span class="text-gray-500">Phone</span><span class="mono text-gray-800">'+(m.phone||'—')+'</span></div></div>'+
    flightBlock+
    '<div class="pt-2 border-t border-gray-100 mt-2"><p class="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Scheduled Milestones</p>'+(sched||'<p class="text-[11px] text-gray-400">No scheduled days</p>')+'</div>'+
    ((typeof permIsAdmin==='function'&&permIsAdmin())?
      '<div class="pt-2 border-t border-gray-100 mt-2 flex items-center justify-between gap-2"><p class="text-[9px] text-gray-400">'+
      ((typeof accountFor==='function'&&accountFor(m.name))?'Muse Live account: <b>'+accountFor(m.name).status+'</b>':'No Muse Live account yet')+'</p>'+
      '<button onclick="closeCrewCard();genAccountFor(\''+m.name.replace(/'/g,"\\'")+'\')" class="text-[10px] font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-lg px-2.5 py-1.5">🔑 '+
      ((typeof accountFor==='function'&&accountFor(m.name))?'Manage account':'Generate account')+'</button></div>':'')+
    (key?'<div class="pt-2 border-t border-gray-100 mt-2"><p class="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Venue check-in</p>'+
      '<div class="flex items-center justify-between gap-2 flex-wrap">'+
        '<div>'+checkinBadgeHTML(key,m.name)+
          (checkinOf(key,m.name)&&checkinOf(key,m.name).venueName?'<p class="text-[9px] text-gray-500 mt-1">'+esc(checkinOf(key,m.name).venueName)+(checkinOf(key,m.name).method==='gps'?' · GPS':' · manual')+'</p>':'')+
        '</div>'+
        '<div class="flex gap-1.5">'+
          '<button type="button" onclick="closeCrewCard();checkinAtVenue(\''+key+'\',\''+m.name.replace(/'/g,"\\'")+'\')" class="text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-2.5 py-1.5">📍 GPS check-in</button>'+
          '<button type="button" onclick="closeCrewCard();checkinToggleManual(\''+key+'\',\''+m.name.replace(/'/g,"\\'")+'\')" class="text-[10px] font-bold text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50">Manager mark</button>'+
        '</div></div></div>':'');
  ov.style.display='flex';
}
function closeCrewCard(){var ov=document.getElementById('crewCardOverlay');if(ov)ov.style.display='none';}
function refreshData(){var s=document.getElementById('lastSync');if(s)s.textContent='Just Now';var a=document.getElementById('aggFeeds');if(a)a.textContent=38+Math.floor(Math.random()*10);toast('Portfolio data re-synced across all markets');}
/* ===== CENTRALIZED PERSONNEL DIRECTORY — searchable across every production ===== */
function personnelRoster(){ // build [{name,pos,group,email,phone,prov,passport,homeBase}] from all crew groups + custom personnel
  var groups=[["Field & Technical",CREW_FIELD],["IT / Network & Engineering",CREW_IT],["PCR / Control Room",CREW_PCR],["Production & Executive",CREW_EXEC]];
  var out=[],seen={};
  groups.forEach(function(g){g[1].forEach(function(m){var od=personnelInfo(m.name);seen[m.name]=1;
    out.push(perExtend({name:m.name,pos:od.pos||m.pos,group:od.group||g[0],email:od.email||m.email||'',phone:od.phone||m.phone||'',prov:m.prov||'',passport:od.passport||'',homeBase:od.homeBase||'',custom:false},od));});});
  // custom personnel added by the user
  loadCustomPersOnce();
  customPersonnel.forEach(function(c){if(seen[c.name])return;seen[c.name]=1;var od=personnelInfo(c.name);
    out.push(perExtend({name:c.name,pos:od.pos||c.pos||'',group:od.group||c.group||'Field & Technical',email:od.email||c.email||'',phone:od.phone||c.phone||'',prov:c.prov||'',passport:od.passport||c.passport||'',homeBase:od.homeBase||c.homeBase||'',custom:true},od));});
  return out;}
/* ---- persistent personnel-level data (passport/ID, home base, contact, pos, group) keyed by name ----
   Single source of truth so info entered in Personnel, Crew, or booking is available everywhere. ---- */
var personnelData={};
function loadPersonnelData(){try{var r=localStorage.getItem('muselive_personnel_v1');
  /* one-time migration from the pre-v31 "operators" store */
  if(!r){var legacy=localStorage.getItem('muselive_operators_v1');if(legacy){localStorage.setItem('muselive_personnel_v1',legacy);r=legacy;}}
  if(r){var o=JSON.parse(r);if(o&&typeof o==='object')personnelData=o;}}catch(e){}}
function savePersonnelData(){try{localStorage.setItem('muselive_personnel_v1',JSON.stringify(personnelData));}catch(e){}}
var _perDataLoaded=false;function loadPerDataOnce(){if(_perDataLoaded)return;_perDataLoaded=true;loadPersonnelData();}
function personnelInfo(name){loadPerDataOnce();return personnelData[name]||{};}
function setPersonnelInfo(name,field,val){loadPerDataOnce();if(!personnelData[name])personnelData[name]={};personnelData[name][field]=val;savePersonnelData();
  // propagate to matching crew slots across productions so booking + crew views see it
  order.forEach(function(k){var p=productions[k];if(p&&p.crew){p.crew.forEach(function(s){if(s.name===name){if(field==='passport')s.passport=val;if(field==='homeBase')s.homeBase=val;if(field==='email')s.email=val;if(field==='phone')s.phone=val;if(field==='pos')s.pos=val;}});}});
}
/* ---- custom personnel (fully user-added) ---- */
var customPersonnel=[];var _customPersLoaded=false;
function loadCustomPers(){try{var r=localStorage.getItem('muselive_custom_personnel_v1');
  /* one-time migration from the pre-v31 "operators" store */
  if(!r){var legacy=localStorage.getItem('muselive_custom_operators_v1');if(legacy){localStorage.setItem('muselive_custom_personnel_v1',legacy);r=legacy;}}
  if(r){var a=JSON.parse(r);if(Array.isArray(a))customPersonnel=a;}}catch(e){}}
function saveCustomPers(){try{localStorage.setItem('muselive_custom_personnel_v1',JSON.stringify(customPersonnel));}catch(e){}}
function loadCustomPersOnce(){if(_customPersLoaded)return;_customPersLoaded=true;loadCustomPers();}
/* ===== v31 PHASE 1: expanded Personnel schema =====
   Canonical entity: {id:'PER-1001',name,pos(role),group,category,subGroup,email,phone,prov,
   passport,homeBase,knownTravelerNumber,frequentFlyerPrograms:[{airline,number}],
   portalAccessKey(SECRET — stripped from every export by museRedact),costCenter,assignedWBS,
   travelPreferences:{seat,mealPreference,homeAirport,loyaltyHotels[]},
   exportExempt(set ONLY by an admin at account creation — see genAccountFor)}.
   Extended fields persist in the personnelData overlay keyed by name; PER- ids are stable
   attributes assigned once and never reused (name remains the join key in the prototype —
   the id becomes the key server-side, see ARCHITECTURE.md). */
var PER_CATEGORIES=['Employee','Freelancer','Vendor','Talent / On-Air'];
var _perIds=null;
function perIds(){if(_perIds)return _perIds;
  try{_perIds=JSON.parse(localStorage.getItem('muselive_perids_v1')||'null');}catch(e){_perIds=null;}
  if(!_perIds||typeof _perIds!=='object'||!_perIds.map||typeof _perIds.next!=='number')_perIds={next:1001,map:{}};
  return _perIds;}
function perIdFor(name){var ids=perIds();if(ids.map[name])return ids.map[name];
  var id='PER-'+(ids.next++);ids.map[name]=id;
  try{localStorage.setItem('muselive_perids_v1',JSON.stringify(ids));}catch(e){}
  return id;}
function perTravelPrefs(name){var od=personnelInfo(name);var tp=od.travelPreferences||{};
  return {seat:tp.seat||'',mealPreference:tp.mealPreference||'',homeAirport:tp.homeAirport||od.homeBase||'',loyaltyHotels:Array.isArray(tp.loyaltyHotels)?tp.loyaltyHotels:[]};}
/* merge the extended fields onto a base roster record (od = personnelData overlay for name) */
function perExtend(rec,od){
  rec.id=perIdFor(rec.name);
  rec.category=od.category||(rec.custom?'Freelancer':'Employee');
  rec.subGroup=od.subGroup||rec.group||'';
  rec.knownTravelerNumber=od.knownTravelerNumber||'';
  rec.frequentFlyerPrograms=Array.isArray(od.frequentFlyerPrograms)?od.frequentFlyerPrograms:[];
  rec.portalAccessKey=od.portalAccessKey||'';
  rec.costCenter=od.costCenter||'';
  rec.assignedWBS=od.assignedWBS||'';
  rec.travelPreferences=perTravelPrefs(rec.name);
  rec.exportExempt=!!od.exportExempt;
  return rec;}
function personnelById(id){var r=personnelRoster();for(var i=0;i<r.length;i++)if(r[i].id===id)return r[i];return null;}
function personnelExists(name){return personnelRoster().some(function(o){return o.name.toLowerCase()===String(name).toLowerCase();});}
function addCustomPersonnel(o){loadCustomPersOnce();customPersonnel.push(o);saveCustomPers();}
function isCustomPersonnel(name){loadCustomPersOnce();return customPersonnel.some(function(c){return c.name===name;});}
function deletePersonnel(name){
  if(!isCustomPersonnel(name)){toast('Built-in personnel can\'t be deleted — edit instead');return;}
  if(!confirm('Remove "'+name+'"? Their bookings and assignments stay but the directory entry is removed.'))return;
  loadCustomPersOnce();customPersonnel=customPersonnel.filter(function(c){return c.name!==name;});saveCustomPers();
  if(personnelData[name]){delete personnelData[name];savePersonnelData();}
  renderPersonnelDir();toast(name+' removed');
}
/* rename a person EVERYWHERE: source array, overrides, custom list, crew slots, flights */
function renamePersonnel(oldName,newName){
  oldName=String(oldName);newName=String(newName).trim();if(!newName||oldName===newName)return false;
  // mutate the built-in CREW arrays if present
  [CREW_FIELD,CREW_IT,CREW_PCR,CREW_EXEC].forEach(function(arr){arr.forEach(function(m){if(m.name===oldName)m.name=newName;});});
  // custom personnel
  loadCustomPersOnce();customPersonnel.forEach(function(c){if(c.name===oldName)c.name=newName;});saveCustomPers();
  // personnelData overlay
  loadPerDataOnce();if(personnelData[oldName]){personnelData[newName]=Object.assign(personnelData[newName]||{},personnelData[oldName]);delete personnelData[oldName];savePersonnelData();}
  // crew slots across productions
  order.forEach(function(k){var p=productions[k];if(p&&p.crew)p.crew.forEach(function(s){if(s.name===oldName)s.name=newName;});});
  // flights / hotels / manifest keyed by name
  var travTouched=false;
  if(typeof crewFlights!=='undefined'&&crewFlights[oldName]){crewFlights[newName]=crewFlights[oldName];delete crewFlights[oldName];travTouched=true;}
  if(typeof crewHotels!=='undefined'&&crewHotels[oldName]){crewHotels[newName]=crewHotels[oldName];delete crewHotels[oldName];travTouched=true;}
  if(typeof travelManifest!=='undefined'){for(var mk in travelManifest){(travelManifest[mk]||[]).forEach(function(e){if(e.person===oldName){e.person=newName;travTouched=true;}});}}
  if(travTouched&&typeof saveTravel==='function')saveTravel();
  return true;
}
function personnelOnShift(name){ // deterministic "on shift now" per person (stable demo logic)
  var h=0;for(var i=0;i<name.length;i++)h=(h*31+name.charCodeAt(i))>>>0;return (h%3)!==0;} // ~2/3 on shift
/* ---- PERSONNEL EDIT / ADD modal (full editability) ---- */
var personnelEditCtx={name:null,isNew:false};
var _fabAck=_fabAck||{};
function openPersonnelEdit(name){
  var roster=personnelRoster();var o=null;for(var i=0;i<roster.length;i++){if(roster[i].name===name){o=roster[i];break;}}
  if(!o){toast('Personnel record not found');return;}
  var od=personnelInfo(name)||{};
  o=perExtend(Object.assign({},o,od),od);
  personnelEditCtx={name:name,isNew:false,ffp:(o.frequentFlyerPrograms||[]).slice()};
  _renderPersonnelModal(o,false);
}
function openPersonnelAdd(){
  personnelEditCtx={name:null,isNew:true,ffp:[]};
  _renderPersonnelModal({name:'',pos:'',group:'Field & Technical',email:'',phone:'',passport:'',homeBase:'',custom:true,category:'Freelancer',knownTravelerNumber:'',frequentFlyerPrograms:[],costCenter:'',assignedWBS:'',travelPreferences:{seat:'',mealPreference:'',homeAirport:'',loyaltyHotels:[]},exportExempt:false},true);
}
/* ---- frequent-flyer program repeater (state lives in personnelEditCtx.ffp) ---- */
function perFfpRowsHTML(list){
  var rows=list.map(function(f,i){return '<div class="per-ffp-row flex items-center gap-2">'+
    '<input class="per-ffp-al w-14 text-[11px] mono uppercase border border-gray-300 rounded-lg px-2 py-1.5" maxlength="2" placeholder="AA" value="'+esc(f.airline||'').replace(/"/g,'&quot;')+'" style="outline:none">'+
    '<input class="per-ffp-no flex-1 text-[11px] mono border border-gray-300 rounded-lg px-2 py-1.5" placeholder="AA90123" value="'+esc(f.number||'').replace(/"/g,'&quot;')+'" style="outline:none">'+
    '<button onclick="perFfpDel('+i+')" class="text-gray-400 hover:text-red-600 text-sm leading-none" title="Remove program">✕</button></div>';}).join('');
  return rows||'<p class="text-[9px] text-gray-400">No frequent-flyer programs on file.</p>';
}
function perFfpRead(){var als=document.querySelectorAll('#perFfpRows .per-ffp-al'),nos=document.querySelectorAll('#perFfpRows .per-ffp-no'),out=[];
  for(var i=0;i<als.length;i++){var a=(als[i].value||'').trim().toUpperCase(),n=(nos[i].value||'').trim();if(a||n)out.push({airline:a,number:n});}
  return out;}
function perFfpAdd(){personnelEditCtx.ffp=perFfpRead();personnelEditCtx.ffp.push({airline:'',number:''});
  var b=document.getElementById('perFfpRows');if(b)b.innerHTML=perFfpRowsHTML(personnelEditCtx.ffp);}
function perFfpDel(i){var l=perFfpRead();l.splice(i,1);personnelEditCtx.ffp=l;
  var b=document.getElementById('perFfpRows');if(b)b.innerHTML=perFfpRowsHTML(personnelEditCtx.ffp);}
/* master-data select options — WBS / cost centers arrive with the Phase 2 module; guarded so
   the modal renders fine before that module loads */
function perMdOpts(kind,cur){
  var list=[];try{if(kind==='cc'&&typeof mdCostCenters==='function')list=mdCostCenters();if(kind==='wbs'&&typeof mdWbsElements==='function')list=mdWbsElements();}catch(e){}
  var opts='<option value="">— none —</option>';
  list.forEach(function(x){opts+='<option value="'+esc(x.id).replace(/"/g,'&quot;')+'"'+(cur===x.id?' selected':'')+'>'+esc(x.id)+' · '+esc(x.desc||'')+'</option>';});
  if(cur&&!list.some(function(x){return x.id===cur;}))opts+='<option value="'+esc(cur).replace(/"/g,'&quot;')+'" selected>'+esc(cur)+'</option>';
  return opts;}
function _renderPersonnelModal(o,isNew){
  var ov=document.getElementById('personnelEditOverlay'),bx=document.getElementById('personnelEditBox');if(!ov||!bx)return;
  var groups=["Field & Technical","IT / Network & Engineering","PCR / Control Room","Production & Executive"];
  var grpOpts=groups.map(function(g){return '<option value="'+g+'"'+(o.group===g?' selected':'')+'>'+g+'</option>';}).join('');
  var shows=(!isNew&&o.name)?order.filter(function(k){try{return (productions[k].crew||[]).some(function(s){return s.name===o.name;});}catch(eS){return false;}}).map(function(k){return productions[k].name;}):[];
  var tp=o.travelPreferences||{};
  bx.innerHTML='<div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0"><div><h3 class="text-sm font-bold text-gray-900">'+(isNew?'Add Personnel':'Edit Personnel')+'</h3><p class="text-[10px] text-gray-500">'+(isNew?'New crew member — available across all productions':'Edits apply everywhere this person appears')+'</p></div><button onclick="closePersonnelEdit()" class="text-gray-400 hover:text-gray-700 text-lg leading-none">\u2715</button></div>'+
    '<div class="p-4 space-y-3 overflow-y-auto min-h-0" style="flex:1;max-height:none">'+
      '<div class="grid grid-cols-2 gap-3">'+
        '<div class="col-span-2"><label class="text-[8px] font-bold uppercase text-gray-400 block mb-0.5">Full Name</label><input id="per_name" value="'+esc(o.name).replace(/"/g,'&quot;')+'" placeholder="First Last" class="w-full text-[12px] border border-gray-300 rounded-lg px-2.5 py-2" style="outline:none"></div>'+
        '<div><label class="text-[8px] font-bold uppercase text-gray-400 block mb-0.5">Position</label><input id="per_pos" value="'+esc(o.pos||'').replace(/"/g,'&quot;')+'" placeholder="e.g. Technical Director" class="w-full text-[12px] border border-gray-300 rounded-lg px-2.5 py-2" style="outline:none"></div>'+
        '<div><label class="text-[8px] font-bold uppercase text-gray-400 block mb-0.5">Group</label><select id="per_group" class="w-full text-[12px] border border-gray-300 rounded-lg px-2 py-2 bg-white" style="outline:none">'+grpOpts+'</select></div>'+
        '<div><label class="text-[8px] font-bold uppercase text-gray-400 block mb-0.5">Email</label><input id="per_email" value="'+esc(o.email||'').replace(/"/g,'&quot;')+'" placeholder="name@meta.com" class="w-full text-[12px] mono border border-gray-300 rounded-lg px-2.5 py-2" style="outline:none"></div>'+
        '<div><label class="text-[8px] font-bold uppercase text-gray-400 block mb-0.5">Phone</label><input id="per_phone" value="'+esc(o.phone||'').replace(/"/g,'&quot;')+'" placeholder="(212) 555-0100" class="w-full text-[12px] mono border border-gray-300 rounded-lg px-2.5 py-2" style="outline:none"></div>'+
        '<div><label class="text-[8px] font-bold uppercase text-gray-400 block mb-0.5">Passport / ID #</label><input id="per_passport" value="'+esc(o.passport||'').replace(/"/g,'&quot;')+'" placeholder="X1234567" class="w-full text-[12px] mono border border-gray-300 rounded-lg px-2.5 py-2" style="outline:none"></div>'+
        '<div><label class="text-[8px] font-bold uppercase text-gray-400 block mb-0.5">Home Base (IATA)</label><input id="per_home" value="'+esc(o.homeBase||'').replace(/"/g,'&quot;')+'" placeholder="MIA" maxlength="3" class="w-full text-[12px] mono uppercase border border-gray-300 rounded-lg px-2.5 py-2" style="outline:none"></div>'+
      '</div>'+
      /* v31: employment category + SAP cost assignment */
      '<p class="text-[9px] font-bold uppercase tracking-wider text-gray-400 pt-1">Employment & Cost Assignment'+(o.id?' <span class="mono normal-case text-gray-300">· '+esc(o.id)+'</span>':'')+'</p>'+
      '<div class="grid grid-cols-2 gap-3">'+
        '<div><label class="text-[8px] font-bold uppercase text-gray-400 block mb-0.5">Category</label><select id="per_category" class="w-full text-[12px] border border-gray-300 rounded-lg px-2 py-2 bg-white" style="outline:none">'+PER_CATEGORIES.map(function(c){return '<option value="'+c+'"'+((o.category||'Employee')===c?' selected':'')+'>'+c+'</option>';}).join('')+'</select></div>'+
        '<div><label class="text-[8px] font-bold uppercase text-gray-400 block mb-0.5">Sub-Group</label><input id="per_subgroup" value="'+esc(o.subGroup||'').replace(/"/g,'&quot;')+'" placeholder="Technical Crew" class="w-full text-[12px] border border-gray-300 rounded-lg px-2.5 py-2" style="outline:none"></div>'+
        '<div><label class="text-[8px] font-bold uppercase text-gray-400 block mb-0.5">Cost Center</label><select id="per_cc" class="w-full text-[11px] mono border border-gray-300 rounded-lg px-2 py-2 bg-white" style="outline:none">'+perMdOpts('cc',o.costCenter||'')+'</select></div>'+
        '<div><label class="text-[8px] font-bold uppercase text-gray-400 block mb-0.5">Assigned WBS</label><select id="per_wbs" class="w-full text-[11px] mono border border-gray-300 rounded-lg px-2 py-2 bg-white" style="outline:none">'+perMdOpts('wbs',o.assignedWBS||'')+'</select></div>'+
      '</div>'+
      /* v31: travel profile */
      '<p class="text-[9px] font-bold uppercase tracking-wider text-gray-400 pt-1">Travel Profile</p>'+
      '<div class="grid grid-cols-2 gap-3">'+
        '<div><label class="text-[8px] font-bold uppercase text-gray-400 block mb-0.5">Known Traveler # (KTN)</label><input id="per_ktn" value="'+esc(o.knownTravelerNumber||'').replace(/"/g,'&quot;')+'" placeholder="KTN987654321" class="w-full text-[12px] mono border border-gray-300 rounded-lg px-2.5 py-2" style="outline:none"></div>'+
        '<div><label class="text-[8px] font-bold uppercase text-gray-400 block mb-0.5">Seat Preference</label><select id="per_seat" class="w-full text-[12px] border border-gray-300 rounded-lg px-2 py-2 bg-white" style="outline:none">'+['','aisle','window','middle'].map(function(s){return '<option value="'+s+'"'+(((o.travelPreferences||{}).seat||'')===s?' selected':'')+'>'+(s||'— none —')+'</option>';}).join('')+'</select></div>'+
        '<div><label class="text-[8px] font-bold uppercase text-gray-400 block mb-0.5">Meal Preference</label><input id="per_meal" value="'+esc(tp.mealPreference||'').replace(/"/g,'&quot;')+'" placeholder="e.g. vegetarian" class="w-full text-[12px] border border-gray-300 rounded-lg px-2.5 py-2" style="outline:none"></div>'+
        '<div><label class="text-[8px] font-bold uppercase text-gray-400 block mb-0.5">Home Airport</label><input id="per_homeair" value="'+esc(tp.homeAirport||o.homeBase||'').replace(/"/g,'&quot;')+'" placeholder="MIA" maxlength="3" class="w-full text-[12px] mono uppercase border border-gray-300 rounded-lg px-2.5 py-2" style="outline:none"></div>'+
        '<div class="col-span-2"><label class="text-[8px] font-bold uppercase text-gray-400 block mb-0.5">Hotel Loyalty (comma-sep)</label><input id="per_hotels" value="'+esc((tp.loyaltyHotels||[]).join(', ')).replace(/"/g,'&quot;')+'" placeholder="Marriott Bonvoy 12345" class="w-full text-[12px] mono border border-gray-300 rounded-lg px-2.5 py-2" style="outline:none"></div>'+
      '</div>'+
      (shows.length?'<p class="text-[9px] text-gray-500">Assigned shows: '+esc(shows.join(', '))+'</p>':'')+
      '<div><div class="flex items-center justify-between mb-1"><label class="text-[8px] font-bold uppercase text-gray-400">Frequent-Flyer Programs</label><button onclick="perFfpAdd()" class="text-[9px] font-bold text-blue-700 hover:underline">+ Add program</button></div>'+
        '<div id="perFfpRows" class="space-y-1.5">'+perFfpRowsHTML(personnelEditCtx.ffp||[])+'</div></div>'+
      (o.exportExempt?'<p class="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">Excluded from techbook exports — admin-set at account creation. Everyone is included by default.</p>':'')+
      ((typeof permIsAdmin==='function'&&permIsAdmin()&&o.portalAccessKey)?'<p class="text-[9px] text-gray-500">Portal access key on file — manage it from this person\'s Muse Live account (never included in exports).</p>':'')+
      (isNew?'':'<p class="text-[9px] text-gray-400">Renaming updates this person across every production, crew roster, and booking.</p>')+
    '</div>'+
    '<div class="px-4 py-3 border-t border-gray-100 flex items-center gap-2 flex-shrink-0">'+
      '<button onclick="savePersonnelEdit()" class="flex-1 bg-blue-600 text-white text-[12px] font-bold rounded-lg py-2.5 hover:bg-blue-700">'+(isNew?'Add Personnel':'Save Changes')+'</button>'+
      (!isNew&&o.custom?'<button onclick="closePersonnelEdit();deletePersonnel(\''+o.name.replace(/'/g,"\\'")+'\')" class="text-[11px] font-bold text-red-600 border border-red-200 rounded-lg px-3 py-2 hover:bg-red-50">Delete</button>':'')+
      '<button onclick="closePersonnelEdit()" class="text-[11px] font-bold text-gray-600 px-3 py-2">Cancel</button>'+
    '</div>';
  ov.style.display='flex';ov.classList.add('is-open');
}
function closePersonnelEdit(){var ov=document.getElementById('personnelEditOverlay');if(ov){ov.style.display='none';ov.classList.remove('is-open');}}
function savePersonnelEdit(){
  function v(id){return ((document.getElementById(id)||{}).value||'').trim();}
  var newName=v('per_name');if(!newName){toast('Name is required');return;}
  var pos=v('per_pos'),group=v('per_group'),email=v('per_email'),phone=v('per_phone'),passport=v('per_passport'),home=v('per_home').toUpperCase();
  /* v31 expanded-schema fields */
  var ext={category:v('per_category')||'Employee',subGroup:v('per_subgroup'),costCenter:v('per_cc'),assignedWBS:v('per_wbs'),
    knownTravelerNumber:v('per_ktn'),frequentFlyerPrograms:perFfpRead(),
    travelPreferences:{seat:v('per_seat'),mealPreference:v('per_meal'),homeAirport:(v('per_homeair')||home).toUpperCase(),
      loyaltyHotels:v('per_hotels').split(',').map(function(s){return s.trim();}).filter(function(s){return s;})}};
  function persistAll(name){
    setPersonnelInfo(name,'pos',pos);setPersonnelInfo(name,'group',group);setPersonnelInfo(name,'email',email);setPersonnelInfo(name,'phone',phone);setPersonnelInfo(name,'passport',passport);setPersonnelInfo(name,'homeBase',home);
    for(var k in ext)setPersonnelInfo(name,k,ext[k]);
    if(typeof museBus!=='undefined')museBus.emit('personnel.updated',{name:name});
  }
  if(personnelEditCtx.isNew){
    if(personnelExists(newName)){toast('A person named "'+newName+'" already exists');return;}
    addCustomPersonnel({name:newName,pos:pos,group:group,email:email,phone:phone,passport:passport,homeBase:home,custom:true});
    // also store in personnelData overlay so it's the source of truth
    persistAll(newName);
    closePersonnelEdit();renderPersonnelDir();renderAll();toast(newName+' added to the personnel directory');
  }else{
    var oldName=personnelEditCtx.name;
    if(newName!==oldName){if(personnelExists(newName)){toast('A person named "'+newName+'" already exists');return;}renamePersonnel(oldName,newName);}
    persistAll(newName);
    closePersonnelEdit();renderPersonnelDir();renderAll();toast(newName+' updated');
  }
}
/* v31 PHASE 6 — machine-readable personnel exports.
   Both pass museRedact (secrets stripped at the serialization layer) and omit
   exportExempt people — the same policy the techbook enforces. */
function perExportRecords(){
  return personnelRoster().filter(function(m){return !m.exportExempt;}).map(function(m){return museRedact(m);});}
function perDownload(fname,mime,text){
  try{var b=new Blob([text],{type:mime});var a=document.createElement('a');
    a.href=URL.createObjectURL(b);a.download=fname;document.body.appendChild(a);a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},400);}catch(e){toast('Download failed: '+e.message);}}
function perExportJSON(){
  var recs=perExportRecords();
  perDownload('Muse_Live_Personnel.json','application/json',
    JSON.stringify({schema:'muselive.personnel.v31',exported:new Date().toISOString(),count:recs.length,personnel:recs},null,2));
  museAudit('personnel.exported',{fmt:'json',count:recs.length});
  toast('Personnel JSON exported — '+recs.length+' records, secrets stripped');}
function perExportCSV(){
  var recs=perExportRecords();
  function q(v){v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}
  var head=['id','name','pos','category','subGroup','group','email','phone','prov','passport','homeBase','knownTravelerNumber','frequentFlyerPrograms','costCenter','assignedWBS','seatPref','mealPref','loyaltyHotels'];
  var rows=recs.map(function(m){var tp=m.travelPreferences||{};
    return [m.id,m.name,m.pos,m.category,m.subGroup,m.group,m.email,m.phone,m.prov,m.passport,m.homeBase,m.knownTravelerNumber,
      (m.frequentFlyerPrograms||[]).map(function(f){return f.airline+':'+f.number;}).join('; '),
      m.costCenter,m.assignedWBS,tp.seat,tp.mealPreference,(tp.loyaltyHotels||[]).join('; ')].map(q).join(',');});
  perDownload('Muse_Live_Personnel.csv','text/csv',head.join(',')+'\n'+rows.join('\n'));
  museAudit('personnel.exported',{fmt:'csv',count:recs.length});
  toast('Personnel CSV exported — '+recs.length+' records, secrets stripped');}
function renderPersonnelDir(){
  var body=document.getElementById('personnelBody');if(!body)return;
  var q=((document.getElementById('personnelFilter')||{}).value||'').toLowerCase().trim();
  var projSel=(document.getElementById('personnelProject')||{}).value||'';
  var grpSel=(document.getElementById('personnelGroup')||{}).value||'';
  var shiftSel=(document.getElementById('personnelShift')||{}).value||'';
  var catSel=(document.getElementById('personnelCategory')||{}).value||'';
  // populate project filter once
  var psel=document.getElementById('personnelProject');
  if(psel&&psel.options.length<=1){psel.innerHTML='<option value="">All Shows</option>'+order.map(function(k){return '<option value="'+k+'">'+productions[k].name+'</option>';}).join('');if(projSel)psel.value=projSel;}
  // ONE entry per person; gather the shows each is assigned to
  var roster=personnelRoster();
  var people=roster.map(function(m){
    var shows=order.filter(function(k){return crewPhasesFor(m.pos).length>0;}).map(function(k){return {key:k,name:productions[k].name,client:productions[k].customer||''};});
    return {m:m,shows:shows,onShift:personnelOnShift(m.name)};
  });
  var filtered=people.filter(function(pp){
    var m=pp.m;
    if(grpSel&&m.group!==grpSel)return false;
    if(catSel&&m.category!==catSel)return false;
    if(shiftSel==='on'&&!pp.onShift)return false;
    if(shiftSel==='off'&&pp.onShift)return false;
    if(projSel&&!pp.shows.some(function(s){return s.key===projSel;}))return false;
    if(q){var hay=(m.name+' '+m.pos+' '+m.group+' '+(m.id||'')+' '+(m.category||'')+' '+m.email+' '+m.phone+' '+m.prov+' '+pp.shows.map(function(s){return s.name+' '+s.client;}).join(' ')).toLowerCase();if(hay.indexOf(q)<0)return false;}
    return true;
  });
  if(!filtered.length){body.innerHTML="<tr><td colspan=\"10\" class=\"py-6 text-center text-gray-400\">No personnel match your search. <button onclick=\"openPersonnelAdd()\" class=\"text-blue-700 font-bold hover:underline\">+ Add one</button></td></tr>";}
  else{
    body.innerHTML=filtered.map(function(pp){var m=pp.m;
      var grpColor={"Field & Technical":"#0866ff","IT / Network & Engineering":"#0866ff","PCR / Control Room":"#0a58ca","Production & Executive":"#f5832a"}[m.group]||"#65676b";
      var statusPill=pp.onShift?'<span class="inline-block whitespace-nowrap px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[9px] mono">\u25cf On Shift</span>':'<span class="inline-block whitespace-nowrap px-2 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-500 text-[9px] mono">Off Shift</span>';
      var od=personnelInfo(m.name);var nm=m.name.replace(/\\/g,"\\\\").replace(/'/g,"\\'");
      var catColor={"Employee":"bg-blue-50 border-blue-200 text-blue-700","Freelancer":"bg-violet-50 border-violet-200 text-violet-700","Vendor":"bg-orange-50 border-orange-200 text-orange-700","Talent / On-Air":"bg-pink-50 border-pink-200 text-pink-700"}[m.category]||"bg-gray-100 border-gray-200 text-gray-600";
      return '<tr class="personnel-row hover:bg-gray-50/60"><td class="py-2.5 pr-4 align-middle"><button onclick="openPersonnelEdit(\''+nm+'\')" class="font-semibold text-gray-900 hover:text-blue-700 hover:underline text-left">'+esc(m.name)+'</button>'+(m.custom?'<span class="ml-1 text-[8px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded px-1">added</span>':'')+'</td>'+
        '<td class="py-2.5 pr-4 whitespace-nowrap align-middle"><span class="mono text-[9px] text-gray-500">'+esc(m.id||'')+'</span> <span class="inline-block text-[8px] font-bold border rounded px-1 py-px '+catColor+'">'+esc(m.category||'')+'</span>'+(m.exportExempt?'<span class="ml-1 text-[8px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1" title="Excluded from techbook exports (admin-set at account creation)">exempt</span>':'')+'</td>'+
        '<td class="py-2.5 pr-4 text-gray-700 align-middle">'+esc(m.pos||'\u2014')+'</td>'+
        '<td class="py-2.5 pr-4 align-middle"><span class="inline-flex items-center gap-1.5 text-[10px] whitespace-nowrap"><span class="w-2 h-2 rounded-full flex-shrink-0" style="background:'+grpColor+'"></span>'+esc(m.group.replace(' / Network & Engineering',' / Eng').replace(' / Control Room',' / PCR'))+'</span></td>'+
        '<td class="py-2.5 pr-4 align-middle"><input value="'+esc(od.passport||m.passport||'').replace(/"/g,'&quot;')+'" onchange="setPersonnelInfo(\''+nm+'\',\'passport\',this.value)" placeholder="passport / ID" class="w-full bg-transparent mono text-[10px] text-gray-700 border border-transparent hover:border-gray-200 focus:border-blue-300 rounded px-1.5 py-1" style="outline:none;min-width:100px"></td>'+
        '<td class="py-2.5 pr-4 align-middle"><input value="'+esc(od.homeBase||m.homeBase||'').replace(/"/g,'&quot;')+'" onchange="setPersonnelInfo(\''+nm+'\',\'homeBase\',this.value.toUpperCase());this.value=this.value.toUpperCase()" placeholder="IATA" maxlength="3" class="w-full bg-transparent mono uppercase text-[10px] font-bold text-blue-700 border border-transparent hover:border-gray-200 focus:border-blue-300 rounded px-1.5 py-1" style="outline:none;min-width:54px"></td>'+
        '<td class="py-2.5 pr-4 text-[10px] text-gray-700 align-middle" style="max-width:200px"><div class="truncate">'+(m.email?'<a href="mailto:'+esc(m.email)+'" class="text-blue-700 hover:underline" title="'+esc(m.email)+'">'+esc(m.email)+'</a>':'<span class="text-gray-400">\u2014</span>')+'</div></td>'+
        '<td class="py-2.5 pr-4 mono text-[10px] text-gray-700 whitespace-nowrap align-middle">'+(m.phone&&m.phone!=='\u2014'?'<a href="tel:'+esc(String(m.phone).replace(/[^+\d]/g,""))+'" class="text-gray-800 hover:text-blue-700">'+esc(m.phone)+'</a>':'<span class="text-gray-400">\u2014</span>')+'</td>'+
        '<td class="py-2.5 pr-4 whitespace-nowrap align-middle">'+statusPill+'</td>'+
        '<td class="py-2.5 text-right whitespace-nowrap">'+((typeof permIsAdmin==='function'&&permIsAdmin())?'<button onclick="genAccountFor(\''+nm+'\')" title="'+((typeof accountFor==='function'&&accountFor(m.name))?'Manage Muse Live account':'Generate Muse Live account')+'" class="p-1 '+((typeof accountFor==='function'&&accountFor(m.name))?'text-purple-600 hover:text-purple-800':'text-gray-400 hover:text-purple-700')+'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg></button>':'')+'<button onclick="openPersonnelEdit(\''+nm+'\')" title="Edit personnel" class="text-gray-400 hover:text-blue-600 p-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'+(m.custom?'<button onclick="deletePersonnel(\''+nm+'\')" title="Delete personnel" class="text-gray-400 hover:text-red-600 p-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>':'')+'</td></tr>';
    }).join('');
  }
  var cnt=document.getElementById('personnelCount');if(cnt)cnt.textContent=filtered.length+' '+(filtered.length===1?'person':'people')+(shiftSel==='on'?' on shift':'');
}

/* Meta offices · local time — [office code, office, IANA zone] (index-aligned with WXC_CITIES) */
var tzZones=[["MPK","Menlo Park HQ","America/Los_Angeles","Meta HQ · 1 Hacker Way"],["NYC","New York","America/New_York","Hudson Yards"],["LON","London","Europe/London","King's Cross"],["TLV","Tel Aviv","Asia/Jerusalem","Tel Aviv office"],["SIN","Singapore","Asia/Singapore","APAC HQ · Marina One"],["TYO","Tokyo","Asia/Tokyo","Tokyo office"]];
function buildClocks(){
  var c=document.getElementById('worldClocks');if(!c)return;
  c.innerHTML=tzZones.map(function(z,i){
    return '<div onclick="openCityWx('+i+')" role="button" title="Meta '+z[1]+(z[3]?' · '+z[3]:'')+' — live conditions" class="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5 cursor-pointer hover:border-blue-300 hover:bg-blue-50/40 transition-colors">'+
      '<div class="flex flex-col leading-none min-w-0"><span class="text-[10px] font-bold uppercase tracking-wider text-gray-600">'+z[0]+'</span><span class="text-[10px] font-semibold text-gray-600 truncate">'+z[1]+'</span></div>'+
      '<div class="flex items-baseline gap-0.5 flex-shrink-0"><span id="dig'+i+'" class="mono font-semibold text-gray-900 tabular-nums leading-none" style="font-size:18px">--:--</span><span id="sec'+i+'" class="mono text-gray-500 tabular-nums leading-none" style="font-size:10px">--</span></div>'+
    '</div>';
  }).join('');
}
function tickClock(){try{locTick();}catch(e){}
  for(var i=0;i<tzZones.length;i++){
    var h,m,s;
    try{
      var parts=new Intl.DateTimeFormat('en-US',{timeZone:tzZones[i][2],hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(museNow());
      var o={};for(var p=0;p<parts.length;p++)o[parts[p].type]=parts[p].value;
      h=parseInt(o.hour,10)%24;m=parseInt(o.minute,10);s=parseInt(o.second,10);
      if(h===24)h=0;
    }catch(e){var d=new Date();h=d.getHours();m=d.getMinutes();s=d.getSeconds();}
    var dg=document.getElementById('dig'+i),sc=document.getElementById('sec'+i);
    if(dg)dg.textContent=('0'+h).slice(-2)+':'+('0'+m).slice(-2);
    if(sc)sc.textContent=':'+('0'+s).slice(-2);
  }
}
var airSecs=4*60+12;function tickAir(){var el=document.getElementById('airTimer');if(!el)return;airSecs--;if(airSecs<0)airSecs=4*60+30;var m=('0'+Math.floor(airSecs/60)).slice(-2),s=('0'+(airSecs%60)).slice(-2);el.textContent=m+':'+s;}
function tickLat(){var el=document.getElementById('latVal');if(el)el.textContent=(0.38+Math.random()*0.1).toFixed(2)+'s';}

/* ===== CREATE / DELETE PROJECT ===== */
/* v30 Module 5: Prompter is no longer a standalone department — it lives inside
   Cameras / Video (prompter hardware rides the camera in the field). 13 tiles total. */
function deptLabel(n){return n==='Graphics (GFX)'?'QC':n;} /* display name only; data key unchanged */
var DEPT_NAMES=["Audio","Cameras / Video","Transmission / Signal","Engineering","Replay / EVS","Lighting","Power / Electrical","CAD","Monitors","Graphics (GFX)","Talent / Production","Networking / IT","Miscellaneous / Consumables","Legal / Rights"];
// ensure every production carries a tile for every canonical department (new depts added as pending)
function ensureAllDepts(p){if(!p||!Array.isArray(p.dept))return;
  var have={};p.dept.forEach(function(d){if(Array.isArray(d))have[d[0]]=true;});
  DEPT_NAMES.forEach(function(dep){if(!have[dep])p.dept.push([dep,p.completeShowcase?"approved":"pending",p.completeShowcase?"Showcase · locked":"\u2014"]);});}
var npThumb=null, npColor="blue";
function stylizedMap(seed){
  // deterministic stylized "map" thumbnail from a string seed (offline, no API)
  var h=0;for(var i=0;i<(seed||'').length;i++){h=(h*31+seed.charCodeAt(i))>>>0;}
  var rnd=function(){h=(h*1103515245+12345)>>>0;return (h&0xffff)/0xffff;};
  var roadsH=[],roadsV=[];for(var r=0;r<3;r++)roadsH.push(12+rnd()*46);for(var v=0;v<4;v++)roadsV.push(20+rnd()*200);
  var px=40+rnd()*160, py=18+rnd()*34;
  var hroad=roadsH.map(function(y){return '<path d="M0 '+y.toFixed(0)+' H240" stroke="#ffffff" stroke-width="3"/>';}).join('');
  var vroad=roadsV.map(function(x){return '<path d="M'+x.toFixed(0)+' 0 V70" stroke="#ffffff" stroke-width="3"/>';}).join('');
  var water=rnd()>0.5?'<path d="M0 '+(50+rnd()*10).toFixed(0)+' Q120 '+(40+rnd()*20).toFixed(0)+' 240 '+(48+rnd()*12).toFixed(0)+' V70 H0 Z" fill="#b9d7ff"/>':'';
  return '<rect width="240" height="70" fill="#E4E6EB"/>'+water+'<g>'+hroad+vroad+'</g>'+
    '<g transform="translate('+px.toFixed(0)+','+py.toFixed(0)+')"><path d="M0 -11 C7 -11 9 -5 4 1 L0 7 L-4 1 C-9 -5 -7 -11 0 -11 Z" fill="#E41E3F" stroke="#ffffff" stroke-width="0.8"/><circle cx="0" cy="-6" r="2.4" fill="#ffffff"/></g>';
}
function updateMapPreview(){var loc=document.getElementById('np_location');var map=document.getElementById('np_map');if(map)map.innerHTML=stylizedMap(loc?loc.value:'');}
/* taller, more detailed stylized map for the project header (240x150) */
/* ============================================================================
   LIVE MAPS — OpenFreeMap (free, no key) via MapLibre GL, lazy-loaded from CDN.
   Every map renders the SVG placeholder instantly, then upgrades to an
   interactive map. Bright ↔ 3D toggle. If the CDN is unreachable the SVG
   stays, so the UI never breaks (uptime preserved).
   ============================================================================ */
var MAPLIBRE_JS='https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js';
var MAPLIBRE_CSS='https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css';
var OFM_STYLE_BRIGHT='https://tiles.openfreemap.org/styles/bright';
var OFM_STYLE_3D='https://tiles.openfreemap.org/styles/liberty';
var _mlPromise=null;
function loadMapLibre(){
  if(typeof window!=='undefined'&&window.maplibregl)return Promise.resolve(window.maplibregl);
  if(_mlPromise)return _mlPromise;
  _mlPromise=new Promise(function(resolve,reject){
    try{
      if(!document.getElementById('maplibre-css')){var l=document.createElement('link');l.id='maplibre-css';l.rel='stylesheet';l.href=MAPLIBRE_CSS;document.head.appendChild(l);}
      var s=document.createElement('script');s.src=MAPLIBRE_JS;s.async=true;
      s.onload=function(){window.maplibregl?resolve(window.maplibregl):reject(new Error('maplibre missing'));};
      s.onerror=function(){reject(new Error('maplibre CDN unreachable'));};
      document.head.appendChild(s);
      setTimeout(function(){if(!window.maplibregl)reject(new Error('maplibre load timeout'));},9000);
    }catch(e){reject(e);}
  });
  return _mlPromise;}

/* ============================================================================
   v34 — RELIABLE BASEMAP (inline raster styles) + KEYLESS GEOCODING
   The old maps depended on OpenFreeMap's VECTOR style-JSON endpoint
   (tiles.openfreemap.org/styles/…), which is unreachable on some networks —
   when the style fetch fails, MapLibre paints nothing. These inline RASTER
   styles have NO external style-JSON dependency: they reference well-known,
   keyless, CORS-open raster tile servers directly, so the basemap paints as
   long as ordinary image requests get through (far more universally reachable
   and CDN-cached than a style document).
     · MAP  → CARTO Voyager (light) / CARTO Dark Matter (dark) — OSM data
     · SAT  → Esri World Imagery + Esri boundaries/places label overlay
   All three verified reachable + CORS-open from the browser. Attribution is
   carried on every source so MapLibre's attribution control stays compliant.
   ============================================================================ */
var TILE_CARTO_LIGHT='https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
var TILE_CARTO_DARK='https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
var TILE_ESRI_SAT='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
var TILE_ESRI_PLACES='https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
function museMapIsDark(){try{return document.documentElement.classList.contains('dark');}catch(e){return false;}}
/* normalize legacy modes: 'bright'→streets, '3d'→satellite; anything explicit wins */
function museMapMode(mode){return (mode==='satellite'||mode==='sat'||mode==='3d')?'satellite':'streets';}
function museRasterStyle(mode,forceLight){
  if(museMapMode(mode)==='satellite'){
    return {version:8,sources:{
        esrisat:{type:'raster',tiles:[TILE_ESRI_SAT],tileSize:256,maxzoom:19,attribution:'Imagery © Esri, Maxar, Earthstar Geographics'},
        esriref:{type:'raster',tiles:[TILE_ESRI_PLACES],tileSize:256,maxzoom:19,attribution:''}},
      layers:[{id:'esrisat',type:'raster',source:'esrisat'},{id:'esriref',type:'raster',source:'esriref'}]};
  }
  var dark=forceLight?false:museMapIsDark();
  var url=dark?TILE_CARTO_DARK:TILE_CARTO_LIGHT;
  return {version:8,sources:{carto:{type:'raster',tiles:[url],tileSize:256,maxzoom:20,attribution:'© OpenStreetMap contributors © CARTO'}},
    layers:[{id:'carto-bg',type:'background',paint:{'background-color':dark?'#18191a':'#e4e6eb'}},{id:'carto',type:'raster',source:'carto'}]};
}

/* ============================================================================
   v35 — OPENFREEMAP VECTOR BASEMAP (restored)
   Streets maps use OpenFreeMap's "liberty" vector style (attribution
   "OpenFreeMap © OpenMapTiles Data from OpenStreetMap"). It also carries real
   building footprints+heights, which the ShadeMap panel reads directly from the
   vector tiles (no slow Overpass round-trips). OpenFreeMap ships no dark style,
   so darkenOFMStyle() recolors the liberty layers for the app's dark theme. The
   inline raster style stays as an instant first paint + a graceful fallback if
   OpenFreeMap is unreachable, so maps never go blank.
   ============================================================================ */
var OFM_LIBERTY='https://tiles.openfreemap.org/styles/liberty';
var OFM_ATTR='OpenFreeMap © OpenMapTiles Data from OpenStreetMap';
var _ofm={raw:null,light:null,dark:null,pending:null,failed:false};
function _ofmAttr(style){try{var s=style.sources||{};for(var k in s){if(s[k]&&(s[k].type==='vector'))s[k].attribution=OFM_ATTR;}}catch(e){}return style;}
/* recolor the liberty style for dark mode (heuristic by layer type + id) */
function darkenOFMStyle(style){
  try{var s=style;(s.layers||[]).forEach(function(L){var p=L.paint=L.paint||{};var id=(L.id||'').toLowerCase();
    if(L.type==='background'){p['background-color']='#18191a';}
    else if(L.type==='fill'){
      if(/water|ocean|sea|river|lake|bay|pond|reservoir/.test(id))p['fill-color']='#1c1e21';
      else if(/building/.test(id))p['fill-color']='#242526';
      else if(/wood|forest|grass|park|garden|golf|pitch|scrub|meadow|farmland|vegetation|nature/.test(id))p['fill-color']='#18191A';
      else if(/sand|beach|desert/.test(id))p['fill-color']='#18191a';
      else if(/residential|landuse|industrial|commercial|earth|land|background/.test(id))p['fill-color']='#18191A';
      else p['fill-color']='#18191A';
      if('fill-outline-color' in p)p['fill-outline-color']='#242526';}
    else if(L.type==='fill-extrusion'){p['fill-extrusion-color']='#3a3b3c';}
    else if(L.type==='line'){
      if(/water|river|canal/.test(id))p['line-color']='#242526';
      else if(/motorway|trunk/.test(id))p['line-color']='#4b4f56';
      else if(/primary|secondary|tertiary|main/.test(id))p['line-color']='#3e4042';
      else if(/rail|transit|subway|tram/.test(id))p['line-color']='#3A3B3C';
      else if(/boundary|admin|border/.test(id))p['line-color']='#3a3b3c';
      else p['line-color']='#242526';}
    else if(L.type==='symbol'){p['text-color']=/water|river|ocean|sea|marine/.test(id)?'#0866ff':'#b0b3b8';p['text-halo-color']='#18191a';p['text-halo-width']=1.2;}
  });}catch(e){}
  return s;
}
function _ofmClone(o){return JSON.parse(JSON.stringify(o));}
/* fetch the liberty style once, cache a light + dark variant, hand back a fresh
   clone for the requested theme (MapLibre mutates the style object it is given) */
function museOFMStyle(dark,cb){
  if(_ofm.failed){cb(null);return;}
  var key=dark?'dark':'light';
  if(_ofm[key]){cb(_ofmClone(_ofm[key]));return;}
  if(_ofm.pending){_ofm.pending.push({key:key,cb:cb});return;}
  _ofm.pending=[{key:key,cb:cb}];
  var done=function(ok){var q=_ofm.pending||[];_ofm.pending=null;q.forEach(function(x){x.cb(ok?_ofmClone(_ofm[x.key]):null);});};
  fetch(OFM_LIBERTY,{cache:'force-cache'}).then(function(r){if(!r.ok)throw new Error('ofm '+r.status);return r.json();})
    .then(function(j){_ofm.raw=j;_ofm.light=_ofmAttr(_ofmClone(j));_ofm.dark=_ofmAttr(darkenOFMStyle(_ofmClone(j)));done(true);})
    .catch(function(){_ofm.failed=true;done(false);});
}
/* upgrade a just-created streets MapLibre map from the raster first-paint to the
   OpenFreeMap vector style for the current theme (no-op on satellite / on failure) */
function museUpgradeToOFM(map,dark){
  try{museOFMStyle(!!dark,function(st){if(!st)return;try{map.setStyle(st);}catch(e){}});}catch(e){}
}
/* re-apply the theme-appropriate style to every mounted map when light/dark flips.
   Streets/multi maps just restyle (DOM markers survive); shade panels are remounted
   so ShadeMap + its building layer re-attach cleanly on the new style. */
function museRethemeMaps(){
  var dark=museMapIsDark();
  try{for(var id in _liveMaps){(function(e){if(!e||!e.map||e.mode==='satellite')return;
    try{e.map.setStyle(museRasterStyle('streets'));museUpgradeToOFM(e.map,dark);}catch(_){}})(_liveMaps[id]);}}catch(e){}
  try{for(var id2 in _mmaps){(function(M,mid){if(!M||!M.map)return;
    try{M.map.setStyle(museRasterStyle('streets'));museUpgradeToOFM(M.map,dark);
      M.map.once('styledata',function(){try{multiSyncMarkers(mid);}catch(_){}});}catch(_){}})(_mmaps[id2],id2);}}catch(e){}
  try{for(var id3 in _shadeMaps){(function(S,sid){if(!S)return;var el=document.getElementById(sid);
    try{if(S.timer)clearInterval(S.timer);}catch(_){}try{if(S.shade&&S.shade.remove)S.shade.remove();}catch(_){}try{if(S.map)S.map.remove();}catch(_){}
    delete _shadeMaps[sid];
    if(el){el.setAttribute('data-mounted','');if(el.offsetParent!==null)mountShadeBox(el);}})(_shadeMaps[id3],id3);}}catch(e){}
}

/* ---- KEYLESS GEOCODING (venue-grade search) --------------------------------
   Primary : Photon (photon.komoot.io) — CORS-open, no key, great on venue
             names ("SoFi Stadium", "Madison Square Garden"); returns city/region/
             country + osm class so we can label results richly.
   Fallback: Nominatim (nominatim.openstreetmap.org) — used only when Photon
             returns nothing, kept light + debounced per its usage policy.
   Timezone: neither returns an IANA zone, so museTzLookup enriches a picked
             point via Open-Meteo (timezone=auto) with a coarse offline guess as
             a backstop — GPS stays optional throughout (a courtesy, never a gate).
   ---------------------------------------------------------------------------- */
var PHOTON_URL='https://photon.komoot.io/api/';
var NOMINATIM_URL='https://nominatim.openstreetmap.org/search';
function museGeoNormPhoton(feat){
  if(!feat||!feat.geometry||!feat.geometry.coordinates)return null;
  var pr=feat.properties||{};var c=feat.geometry.coordinates;
  var cityBits=[pr.city||pr.name,pr.state,pr.country].filter(Boolean);
  var region=[pr.city&&pr.name!==pr.city?pr.city:'',pr.state,pr.country].filter(Boolean).join(', ');
  var kind=(pr.osm_value||pr.osm_key||pr.type||'').replace(/_/g,' ');
  return {name:pr.name||pr.street||pr.city||('~'+(+c[1]).toFixed(3)+','+(+c[0]).toFixed(3)),
    label:region||cityBits.join(', '),city:pr.city||pr.state||'',region:pr.state||'',
    country:pr.country||'',cc:(pr.countrycode||'').toUpperCase(),lat:+c[1],lng:+c[0],kind:kind,src:'photon'};
}
function museGeoNormNominatim(r){
  if(!r||r.lat==null)return null;var a=r.address||{};
  var city=a.city||a.town||a.village||a.hamlet||a.municipality||a.county||'';
  var region=[city,a.state,a.country].filter(Boolean).join(', ');
  return {name:(r.display_name||'').split(',')[0]||r.name||'Location',label:region||r.display_name||'',
    city:city,region:a.state||'',country:a.country||'',cc:(a.country_code||'').toUpperCase(),
    lat:+r.lat,lng:+r.lon,kind:(r.type||r.category||'').replace(/_/g,' '),src:'nominatim'};
}
/* Photon ranks a bus stop above "SoFi Stadium"; re-rank so venue-grade feature
   classes (stadium/arena/theatre/attraction/named place) beat street furniture. */
var PHOTON_KEY_RANK={leisure:6,tourism:5,building:5,amenity:4,historic:4,aeroway:4,place:3,boundary:2,highway:0,information:-2};
function museGeoScore(res,feat){
  var pr=(feat&&feat.properties)||{};var k=pr.osm_key||'';var v=pr.osm_value||'';
  var s=(PHOTON_KEY_RANK[k]!=null?PHOTON_KEY_RANK[k]:1);
  if(['bus_stop','bus_station','board','stop_position','platform','street_lamp'].indexOf(v)>-1)s-=4;
  if(['stadium','arena','sports_centre','theatre','convention_centre','exhibition_centre','attraction','stadium;arena'].indexOf(v)>-1)s+=3;
  if(pr.name)s+=1;return s;
}
var _nominatimLast=0;
/* allowNominatim: only the submit/Enter path may fall through to Nominatim, and even
   then never faster than its 1 req/s usage policy — the 320ms autocomplete path uses
   Photon only (Nominatim explicitly prohibits client-side autocomplete). */
function museGeocode(query,cb,allowNominatim){
  query=(query||'').trim();if(query.length<3){cb([]);return;}
  var done=false;function finish(list){if(done)return;done=true;cb(list||[]);}
  fetch(PHOTON_URL+'?q='+encodeURIComponent(query)+'&limit=8&lang=en')
    .then(function(r){if(!r.ok)throw new Error('photon '+r.status);return r.json();})
    .then(function(j){
      var feats=((j&&j.features)||[]).slice();
      /* stable re-rank: higher venue score first, original order breaks ties */
      var scored=feats.map(function(f,i){return {f:f,s:museGeoScore(null,f),i:i};});
      scored.sort(function(a,b){return (b.s-a.s)||(a.i-b.i);});
      var out=scored.map(function(x){return museGeoNormPhoton(x.f);}).filter(Boolean).slice(0,6);
      if(out.length){finish(out);return;}
      throw new Error('photon empty');})
    .catch(function(){
      /* fallback: Nominatim — submit-only + throttled to respect its 1 req/s policy */
      var okTime=(now36()-_nominatimLast)>=1100;
      if(!allowNominatim||!okTime){finish([]);return;}
      _nominatimLast=now36();
      fetch(NOMINATIM_URL+'?q='+encodeURIComponent(query)+'&format=jsonv2&addressdetails=1&limit=6')
        .then(function(r){if(!r.ok)throw new Error('nominatim '+r.status);return r.json();})
        .then(function(a){finish((a||[]).map(museGeoNormNominatim).filter(Boolean));})
        .catch(function(){finish([]);});
    });
}
function now36(){try{return (typeof performance!=='undefined'&&performance.now)?performance.now():+new Date();}catch(e){return 0;}}
/* coarse offline IANA-zone guess (backstop only) — real zone comes from Open-Meteo */
function museTzGuess(lat,lng){
  if(lat==null||lng==null)return 'America/New_York';
  if(lng<-115)return lat>50?'America/Anchorage':'America/Los_Angeles';
  if(lng<-100)return 'America/Denver';
  if(lng<-85)return 'America/Chicago';
  if(lng<-30)return 'America/New_York';
  if(lng<25)return lat>35?'Europe/Paris':'Africa/Lagos';
  if(lng<70)return 'Asia/Dubai';
  if(lng<100)return 'Asia/Kolkata';
  if(lng<130)return 'Asia/Shanghai';
  return lat<0?'Australia/Sydney':'Asia/Tokyo';
}
function museTzLookup(lat,lng,cb){
  if(lat==null||lng==null){cb('America/New_York','');return;}
  var guess=museTzGuess(lat,lng);
  try{
    fetch((typeof wxClient!=='undefined'?wxClient.base():'https://api.open-meteo.com/v1/forecast')+
      '?latitude='+lat+'&longitude='+lng+'&timezone=auto&forecast_days=1&current=temperature_2m')
      .then(function(r){return r.json();})
      .then(function(j){cb((j&&j.timezone)||guess,(j&&j.timezone_abbreviation)||'');})
      .catch(function(){cb(guess,'');});
  }catch(e){cb(guess,'');}
}

/* ---- STATIC MAP COMPOSITOR (v34) -----------------------------------------
   Builds a real map IMAGE by fetching the map tiles around a point and
   compositing them onto a canvas with a marker pin — no MapLibre / render loop
   needed, so it works headless AND embeds cleanly into PDFs. Tiles are CORS-open
   (crossOrigin:anonymous keeps the canvas untainted so toDataURL succeeds). */
function museTileXY(lat,lng,z){var n=Math.pow(2,z);
  var x=(lng+180)/360*n;var r=lat*Math.PI/180;
  var y=(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n;return {x:x,y:y,n:n};}
function museStaticMap(lat,lng,opts,cb){
  opts=opts||{};var z=opts.zoom||14,W=opts.w||520,H=opts.h||300;
  /* 2× canvas + CARTO @2x tiles so PDF maps print ~150–200 dpi instead of grainy 72 dpi */
  var scale=opts.scale;if(!(scale>0))scale=2;scale=Math.max(1,Math.min(3,scale));
  var sat=(museMapMode(opts.mode)==='satellite');
  /* forceLight: always Voyager (for print/PDF). Else follow app theme. */
  var dark=opts.forceLight?false:(opts.forceDark?true:museMapIsDark());
  try{
    var tileDraw=256*scale;
    var cvW=Math.round(W*scale),cvH=Math.round(H*scale);
    var t=museTileXY(lat,lng,z);var cx=t.x*tileDraw,cy=t.y*tileDraw;
    var originX=cx-cvW/2,originY=cy-cvH/2;
    var x0=Math.floor(originX/tileDraw),x1=Math.floor((originX+cvW)/tileDraw);
    var y0=Math.floor(originY/tileDraw),y1=Math.floor((originY+cvH)/tileDraw);
    var cv=document.createElement('canvas');cv.width=cvW;cv.height=cvH;var ctx=cv.getContext('2d');
    ctx.imageSmoothingEnabled=true;if(ctx.imageSmoothingQuality)ctx.imageSmoothingQuality='high';
    ctx.fillStyle=dark?'#18191a':'#e4e6eb';ctx.fillRect(0,0,cvW,cvH);
    var retina=!sat&&scale>=2;
    var tiles=[];
    for(var tx=x0;tx<=x1;tx++){for(var ty=y0;ty<=y1;ty++){
      if(ty<0||ty>=t.n)continue;var wrapX=((tx%t.n)+t.n)%t.n;
      var url=sat?('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/'+z+'/'+ty+'/'+wrapX)
                 :(dark
                   ?('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/'+z+'/'+ty+'/'+wrapX)
                   :('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/'+z+'/'+ty+'/'+wrapX));
      tiles.push({url:url,px:Math.round(tx*tileDraw-originX),py:Math.round(ty*tileDraw-originY)});
    }}
    if(!tiles.length){cb(null);return;}
    var left=tiles.length,done=false,okTiles=0;
    var finish=function(){if(done)return;done=true;
      /* Project-style red teardrop pin (matches live map marker) */
      var px=Math.round(cvW/2),py=Math.round(cvH/2),s=scale;
      ctx.save();
      ctx.translate(px,py);
      ctx.rotate(-Math.PI/4);
      ctx.fillStyle='#e41e3f';ctx.strokeStyle='#ffffff';ctx.lineWidth=2.5*s;
      ctx.beginPath();
      ctx.moveTo(0,0);ctx.bezierCurveTo(-11*s,-16*s,-14*s,-30*s,0,-30*s);ctx.bezierCurveTo(14*s,-30*s,11*s,-16*s,0,0);ctx.closePath();
      ctx.fill();ctx.stroke();
      ctx.rotate(Math.PI/4);
      ctx.beginPath();ctx.arc(0,-18*s,4.2*s,0,Math.PI*2);ctx.fillStyle='#ffffff';ctx.fill();
      ctx.restore();
      if(okTiles<1){cb(null);return;} /* no tiles painted → reject (was black/empty) */
      try{cb(cv.toDataURL('image/jpeg',0.92));}catch(e){cb(null);}};
    var to=setTimeout(finish,12000);
    tiles.forEach(function(tl){var img=new Image();img.crossOrigin='anonymous';
      img.onload=function(){try{ctx.drawImage(img,tl.px,tl.py,tileDraw,tileDraw);okTiles++;}catch(e){}left--;if(left<=0){clearTimeout(to);finish();}};
      img.onerror=function(){
        if(retina&&tl.url.indexOf('@2x.png')>0){
          /* retina miss → 1× tile, still drawn at 2× destination */
          var img2=new Image();img2.crossOrigin='anonymous';
          img2.onload=function(){try{ctx.drawImage(img2,tl.px,tl.py,tileDraw,tileDraw);okTiles++;}catch(e){}left--;if(left<=0){clearTimeout(to);finish();}};
          img2.onerror=function(){left--;if(left<=0){clearTimeout(to);finish();}};
          img2.src=tl.url.replace('@2x.png','.png');
          return;
        }
        left--;if(left<=0){clearTimeout(to);finish();}};
      img.src=tl.url;});
  }catch(e){cb(null);}}
/* one-shot current-conditions + short outlook for a point (keyless Open-Meteo) */
function museWxSnapshot(lat,lng,cb){
  try{fetch(wxClient.forecastUrl('latitude='+lat+'&longitude='+lng+
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,surface_pressure,cloud_cover'+
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max'+
    '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=4'))
    .then(function(r){return r.json();}).then(function(j){cb(j&&j.current?j:null);}).catch(function(){cb(null);});
  }catch(e){cb(null);}}

/* ============================================================================
   v35 — ATOMIC NETWORK-TIME SYNC
   Every clock/timestamp in the app runs off museNow() instead of the device
   clock, so a drifting laptop can't skew air-times, weather windows or shadow
   projections. Browsers can't speak raw NTP (UDP/123), so we sync
   round-trip-compensated against public HTTP clocks. Whichever source answers
   becomes _pClock.source.
   ============================================================================ */
var _pClock={offset:0,synced:false,source:'',rtt:null,at:0,syncing:false};
function museNowMs(){return Date.now()+(_pClock.offset||0);}
function museNow(){return new Date(museNowMs());}
/* apply a measured sample: serverMs is the source's UTC ms at ~response time,
   t0/t1 bracket the request → estimate the true offset with half the round-trip */
function _pClockApply(serverMs,t0,t1,source){
  if(!(serverMs>0))return false;
  var rtt=Math.max(0,t1-t0);var est=serverMs+rtt/2;var off=est-t1;
  /* once synced, ignore a source whose offset disagrees with the established sync by
     >30 min (a garbage/misconfigured source) — the first sync accepts any value */
  if(_pClock.synced&&Math.abs(off-_pClock.offset)>18e5)return false;
  _pClock.offset=off;_pClock.synced=true;_pClock.source=source;_pClock.rtt=Math.round(rtt);_pClock.at=Date.now();
  try{museClockBadge();}catch(e){}
  return true;
}
/* best-effort Date header, then any CORS-open JSON clock */
function _pClockTryDate(cb){
  try{var t0=Date.now();
    var urls=[];
    var i=0;
    function next(){
      if(i>=urls.length){cb(false);return;}
      var u=urls[i++];var tA=Date.now();
      fetch(u,{method:'GET',cache:'no-store',mode:'cors'})
        .then(function(r){var t1=Date.now();var d=r.headers&&r.headers.get&&r.headers.get('date');
          if(d){var ms=Date.parse(d);if(ms>0){_pClockApply(ms,tA,t1,'http-date');cb(true);return;}}
          next();})
        .catch(function(){next();});
    }
    next();
  }catch(e){cb(false);}
}
/* CORS-open sources: prefer ones that expose Date headers
   plus JSON body clocks. worldtimeapi.org is often firewalled — kept last. */
var _pClockSrc=[
  {name:'open-meteo.com',url:'https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&current=temperature_2m',
    pick:function(j,r){var d=r&&r.headers&&r.headers.get('date');return d?Date.parse(d):0;}},
  {name:'jsdelivr.net',url:'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/package.json',
    pick:function(j,r){var d=r&&r.headers&&r.headers.get('date');return d?Date.parse(d):0;}},
  {name:'timeapi.io',url:'https://timeapi.io/api/Time/current/zone?timeZone=UTC',
    pick:function(j,r){
      /* Prefer HTTP Date — timeapi JSON body has been seen lagging the Date header */
      var d=r&&r.headers&&r.headers.get('date');if(d){var ms0=Date.parse(d);if(ms0>0)return ms0;}
      if(!j)return 0;
      if(j.dateTime){var ms=Date.parse(String(j.dateTime).indexOf('Z')>=0?j.dateTime:j.dateTime+'Z');if(ms>0)return ms;}
      if(j.year)return Date.UTC(j.year,j.month-1,j.day,j.hour||0,j.minute||0,j.seconds||0,j.milliSeconds||0);
      return 0;}},
  {name:'worldtimeapi.org',url:'https://worldtimeapi.org/api/timezone/Etc/UTC',
    pick:function(j){return j&&(j.utc_datetime?Date.parse(j.utc_datetime):(j.unixtime?j.unixtime*1000:0));}}
];
function _pClockTrySrc(i){
  if(i>=_pClockSrc.length){_pClock.syncing=false;if(!_pClock.synced){try{museClockBadge();}catch(e){}}return;}
  var s=_pClockSrc[i];var t0=Date.now();
  var ctrl=typeof AbortController!=='undefined'?new AbortController():null;
  var to=setTimeout(function(){try{if(ctrl)ctrl.abort();}catch(e){}},6000);
  fetch(s.url,{cache:'no-store',signal:ctrl?ctrl.signal:undefined})
    .then(function(r){
      if(!r.ok)throw new Error('http '+r.status);
      var ct=(r.headers.get('content-type')||'');
      /* Date-header sources may not need body parse as JSON */
      if(s.name==='open-meteo.com'||s.name==='jsdelivr.net'){
        return r.text().then(function(text){return {r:r,j:null,text:text};});
      }
      return r.json().then(function(j){return {r:r,j:j,text:null};})
        .catch(function(){return r.text().then(function(text){return {r:r,j:null,text:text};});});
    })
    .then(function(pack){
      clearTimeout(to);
      var t1=Date.now();
      var ms=0;
      try{ms=s.pick(pack.j,pack.r,pack.text)||0;}catch(e){ms=0;}
      /* always also try Date header as fallback for any source */
      if(!(ms>0)&&pack.r&&pack.r.headers){
        var dh=pack.r.headers.get('date');if(dh)ms=Date.parse(dh)||0;
      }
      if(ms>0&&_pClockApply(ms,t0,t1,s.name)){_pClock.syncing=false;}
      else{_pClockTrySrc(i+1);}
    })
    .catch(function(){clearTimeout(to);_pClockTrySrc(i+1);});
}
function museClockSync(){
  if(_pClock.syncing)return;_pClock.syncing=true;
  try{museClockBadge();}catch(e){}
  _pClockTryDate(function(ok){if(ok){_pClock.syncing=false;try{museClockBadge();}catch(e){}}else{_pClockTrySrc(0);}});
}
/* the "SBB Sync" chip on the dashboard clock tile → live atomic-sync status */
function museClockBadge(){var el=document.getElementById('museClockBadge');if(!el)return;
  if(_pClock.synced){var drift=(_pClock.offset>=0?'+':'')+(_pClock.offset/1000).toFixed(2)+'s';
    el.innerHTML='<span class="w-1.5 h-1.5 rounded-full bg-emerald-400" style="display:inline-block"></span> ATOMIC · NTP';
    el.title='Network time synced — device clock offset '+drift+(_pClock.rtt!=null?' · round-trip '+_pClock.rtt+'ms':'');
    el.className='text-[9px] mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded inline-flex items-center justify-center gap-1 flex-shrink-0';
  }else{el.textContent=_pClock.syncing?'NTP · syncing…':'NTP · device clock';
    el.className='text-[9px] mono font-bold bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 rounded inline-flex items-center justify-center flex-shrink-0';}}
/* IANA-zone offset (ms) and wall-time→absolute helpers for shadow projection */
function museTzOffset(tz,at){try{var dtf=new Intl.DateTimeFormat('en-US',{timeZone:tz,hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  var o={};dtf.formatToParts(at).forEach(function(p){o[p.type]=p.value;});var h=(+o.hour===24)?0:+o.hour;
  var asUTC=Date.UTC(+o.year,+o.month-1,+o.day,h,+o.minute,+o.second);return asUTC-at.getTime();}catch(e){return 0;}}
/* absolute Date for a wall-clock time (y,mo1-12,d,h,mi) in an IANA zone */
function museZonedToDate(tz,y,mo,d,h,mi){try{var guess=Date.UTC(y,mo-1,d,h,mi,0);
  var off=museTzOffset(tz,new Date(guess));return new Date(guess-off);}catch(e){return new Date(Date.UTC(y,mo-1,d,h,mi,0));}}
/* the venue-local wall-clock parts of an absolute instant, in an IANA zone */
function museZonedParts(tz,at){try{var dtf=new Intl.DateTimeFormat('en-US',{timeZone:tz,hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  var o={};dtf.formatToParts(at).forEach(function(p){o[p.type]=p.value;});return {y:+o.year,mo:+o.month,d:+o.day,h:(+o.hour===24?0:+o.hour),mi:+o.minute};}catch(e){return null;}}

/* ---- REUSABLE LOCATION-SEARCH WIDGET -------------------------------------
   One search control, wired into New Project, ENG requests and Site Survey.
   Renders an input + a results dropdown; picking a result fires a per-widget
   handler. Uses inline onclick dispatch (survives the app's frequent
   innerHTML re-renders) + a per-widget debounce so Photon isn't hammered.
   Markup contract: an <input id="<wid>_q"> and a <div id="<wid>_res"> exist. */
var museGeoHandlers={}; /* wid -> function(result) */
var museGeoState={};    /* wid -> {results, timer, busy} */
function museGeoBox(wid,placeholder,compact){
  var pad=compact?'px-2.5 py-1.5 text-[11px]':'px-3 py-2 text-xs';
  return '<div class="relative" style="z-index:20">'+
    '<div class="flex items-center gap-1.5">'+
      '<span class="text-gray-400 flex-shrink-0" title="Search venues & cities">🔍</span>'+
      '<input id="'+wid+'_q" autocomplete="off" oninput="museGeoOnInput(\''+wid+'\')" onkeydown="if(event.key===\'Enter\'){event.preventDefault();museGeoOnInput(\''+wid+'\',true);}" placeholder="'+esc(placeholder||'Search venue or address…')+'" class="flex-1 min-w-0 border-2 border-gray-200 rounded-lg '+pad+' focus:border-gray-900 outline-none">'+
      '<button type="button" onclick="museGeoOnInput(\''+wid+'\',true)" class="flex-shrink-0 text-[10px] font-bold text-white bg-gray-900 rounded-lg px-2.5 py-2 hover:bg-gray-800">Search</button>'+
    '</div>'+
    '<div id="'+wid+'_res" class="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden" style="display:none;max-height:240px;overflow-y:auto"></div>'+
  '</div>';
}
function museGeoOnInput(wid,force){
  var inp=document.getElementById(wid+'_q');if(!inp)return;var q=inp.value;
  var st=museGeoState[wid]=museGeoState[wid]||{};
  if(st.timer){clearTimeout(st.timer);st.timer=null;}
  if((q||'').trim().length<3){museGeoRender(wid,[],'');return;}
  var run=function(){museGeoRender(wid,null,'searching');museGeocode(q,function(list){st.results=list;museGeoRender(wid,list,q);},!!force);};
  if(force)run();else st.timer=setTimeout(run,320);
}
function museGeoRender(wid,list,q){
  var box=document.getElementById(wid+'_res');if(!box)return;
  if(list===null||q==='searching'){box.style.display='block';box.innerHTML='<div class="px-3 py-2 text-[11px] text-gray-400">Searching…</div>';return;}
  if(!list||!list.length){
    if(!q){box.style.display='none';box.innerHTML='';return;}
    box.style.display='block';box.innerHTML='<div class="px-3 py-2 text-[11px] text-gray-400">No matches — try a fuller name or add the city.</div>';return;}
  box.style.display='block';
  box.innerHTML=list.map(function(r,i){
    return '<button type="button" onclick="museGeoPick(\''+wid+'\','+i+')" class="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-0">'+
      '<p class="text-[11px] font-bold text-gray-900 leading-tight truncate">📍 '+esc(r.name)+(r.kind?' <span class="text-[8px] font-semibold uppercase tracking-wider text-gray-400">'+esc(r.kind)+'</span>':'')+'</p>'+
      '<p class="text-[10px] text-gray-500 leading-tight truncate">'+esc(r.label||'')+' <span class="mono text-gray-400">'+r.lat.toFixed(3)+', '+r.lng.toFixed(3)+'</span></p>'+
    '</button>';
  }).join('');
}
function museGeoPick(wid,i){
  var st=museGeoState[wid];if(!st||!st.results||!st.results[i])return;
  var r=st.results[i];var box=document.getElementById(wid+'_res');if(box){box.style.display='none';box.innerHTML='';}
  var inp=document.getElementById(wid+'_q');if(inp)inp.value='';
  var h=museGeoHandlers[wid];if(typeof h==='function'){h(r);return;}
  /* survey geobox dispatch (wid 'survgeo:<projkey>') — no per-render handler registration needed */
  var ms=/^survgeo:(.+)$/.exec(wid);if(ms&&typeof survGeoPick==='function'){survGeoPick(ms[1],r);return;}
}

var _liveMaps={};       // id -> {map, mode, lat, lng}
var _liveMapSeq=1;
/* returns the HTML for a map container that auto-upgrades to a live map.
   opts: {lat,lng,zoom,label,height,mode}  (mode 'bright'|'3d') */
function liveMapHTML(opts){
  opts=opts||{};var id=opts.id||('lmap'+(_liveMapSeq++));
  var lat=(opts.lat!=null?opts.lat:40.7128),lng=(opts.lng!=null?opts.lng:-74.0060);
  var zoom=opts.zoom||14,mode=museMapMode(opts.mode||'streets'),h=opts.height||'100%';
  var fallback=opts.fallbackSVG||projectMapSVG((opts.seed||'')+lat+lng);
  var sat=(mode==='satellite');
  // data-* drive the lazy mount; SVG shows until MapLibre upgrades it
  return '<div class="livemap-wrap" style="position:relative;width:100%;height:'+h+'">'+
    '<div id="'+id+'" class="livemap" data-lat="'+lat+'" data-lng="'+lng+'" data-zoom="'+zoom+'" data-mode="'+mode+'" data-label="'+esc(opts.label||'').replace(/"/g,'&quot;')+'" style="position:absolute;inset:0;width:100%;height:100%">'+fallback+'</div>'+
    '<div class="livemap-toggle" style="position:absolute;top:8px;right:8px;z-index:5;display:flex;gap:0;background:#ffffff;border:1px solid #e4e6eb;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.12)">'+
      '<button type="button" onclick="setMapMode(\''+id+'\',\'streets\')" data-mode-btn="streets" style="font-size:9px;font-weight:800;letter-spacing:.04em;padding:5px 9px;border:0;cursor:pointer;background:'+(sat?'#ffffff':'#1C1E21')+';color:'+(sat?'#65676B':'#ffffff')+'">MAP</button>'+
      '<button type="button" onclick="setMapMode(\''+id+'\',\'satellite\')" data-mode-btn="satellite" style="font-size:9px;font-weight:800;letter-spacing:.04em;padding:5px 9px;border:0;cursor:pointer;background:'+(sat?'#1C1E21':'#ffffff')+';color:'+(sat?'#ffffff':'#65676B')+'">SATELLITE</button>'+
    '</div></div>';
}
function add3DBuildings(map){try{
  if(map.getLayer('muse-3d-buildings'))return;
  var layers=map.getStyle().layers||[];var labelLayer;
  for(var i=0;i<layers.length;i++){if(layers[i].type==='symbol'&&layers[i].layout&&layers[i].layout['text-field']){labelLayer=layers[i].id;break;}}
  map.addLayer({id:'muse-3d-buildings',source:'openmaptiles','source-layer':'building',type:'fill-extrusion',minzoom:13,
    paint:{'fill-extrusion-color':['interpolate',['linear'],['get','render_height'],0,'#e4e6eb',60,'#ced0d4',200,'#b0b3b8'],
      'fill-extrusion-height':['interpolate',['linear'],['zoom'],13,0,15.5,['coalesce',['get','render_height'],10]],
      'fill-extrusion-base':['coalesce',['get','render_min_height'],0],
      'fill-extrusion-opacity':0.88}},labelLayer);
}catch(e){}}
function addVenueMarker(maplib,map,lat,lng,label){try{
  var elm=document.createElement('div');
  elm.style.cssText='width:18px;height:18px;border-radius:50% 50% 50% 0;background:#e41e3f;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,.4);transform:rotate(-45deg)';
  var dot=document.createElement('div');dot.style.cssText='width:6px;height:6px;background:#ffffff;border-radius:50%;position:absolute;top:4px;left:4px';elm.appendChild(dot);
  var m=new maplib.Marker({element:elm,anchor:'bottom'}).setLngLat([lng,lat]);
  if(label)m.setPopup(new maplib.Popup({offset:18,closeButton:false}).setHTML('<div style="font:600 11px/1.3 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18191A">'+esc(label)+'</div>'));
  m.addTo(map);
  return m; // v28 (WI6): callers keep the marker so it can follow location changes
}catch(e){}}
/* mount (or re-style) a live map into a prepared container */
function mountLiveMap(el){
  if(!el||el.getAttribute('data-mounted')==='1')return;
  var lat=parseFloat(el.getAttribute('data-lat')),lng=parseFloat(el.getAttribute('data-lng'));
  var zoom=parseFloat(el.getAttribute('data-zoom'))||14,mode=el.getAttribute('data-mode')||'bright',label=el.getAttribute('data-label')||'';
  if(isNaN(lat)||isNaN(lng))return;
  // ---- REUSE: if a live map for this id already exists, move its rendered node here ----
  var cached=_liveMaps[el.id];
  if(cached&&cached.map&&cached.node){
    try{
      el.setAttribute('data-mounted','1');el.innerHTML='';
      el.appendChild(cached.node); // re-attach the existing MapLibre canvas (no reload)
      /* v28 (WI6) bug fix: if the container was re-rendered with NEW coordinates
         (location tile clicked), the reused map must FOLLOW — recentering on the
         cached coords froze the map on the old site. */
      var moved=(Math.abs((cached.lat)-lat)>1e-6||Math.abs((cached.lng)-lng)>1e-6);
      setTimeout(function(){try{cached.map.resize();
        if(moved){
          cached.map.flyTo({center:[lng,lat],zoom:cached.zoom||zoom,essential:true});
          try{if(cached.marker){cached.marker.setLngLat([lng,lat]);
            var pp=cached.marker.getPopup&&cached.marker.getPopup();
            if(pp&&label)pp.setHTML('<div style="font:600 11px/1.3 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18191A">'+esc(label)+'</div>');}}catch(e3){}
          cached.lat=lat;cached.lng=lng;cached.label=label;
        }else cached.map.setCenter([cached.lng,cached.lat]);}catch(e){}},30);
      return;
    }catch(e){/* fall through to fresh mount */ try{cached.map.remove();}catch(e2){} delete _liveMaps[el.id];}
  }
  el.setAttribute('data-mounted','1');
  mode=museMapMode(mode);
  loadMapLibre().then(function(maplib){
    try{
      el.innerHTML='';
      // inner node that actually holds the map (so we can move it intact on re-render)
      var node=document.createElement('div');node.style.cssText='position:absolute;inset:0;width:100%;height:100%';el.appendChild(node);
      var map=new maplib.Map({container:node,style:museRasterStyle(mode),
        center:[lng,lat],zoom:zoom,attributionControl:{compact:true},cooperativeGestures:true});
      map.addControl(new maplib.NavigationControl({visualizePitch:false}),'bottom-right');
      if(mode!=='satellite')museUpgradeToOFM(map,museMapIsDark()); /* restore OpenFreeMap vector basemap */
      map.on('load',function(){
        var mk=addVenueMarker(maplib,map,lat,lng,label);
        if(_liveMaps[el.id])_liveMaps[el.id].marker=mk;
        try{map.resize();map.setCenter([lng,lat]);}catch(e){}});
      // MapLibre often initializes before the container has its final size → force resizes
      [120,350,700].forEach(function(ms){setTimeout(function(){try{map.resize();map.setCenter([lng,lat]);}catch(e){}},ms);});
      _liveMaps[el.id]={map:map,node:node,mode:mode,lat:lat,lng:lng,zoom:zoom,label:label};
    }catch(e){el.setAttribute('data-mounted','');engStaticFallback(el,lat,lng,zoom,mode);}
  }).catch(function(){el.setAttribute('data-mounted','');/* MapLibre CDN/style blocked — drop in a REAL static map so the user still sees the location */engStaticFallback(el,lat,lng,zoom,mode);});
}
/* v34: when interactive MapLibre can't load (CDN/style blocked on the user's network),
   composite a REAL static tile map into the container instead of leaving a stylized SVG */
function engStaticFallback(el,lat,lng,zoom,mode){
  if(!el||isNaN(lat)||isNaN(lng))return;
  try{var w=el.offsetWidth||520,h=el.offsetHeight||300;
    museStaticMap(lat,lng,{zoom:zoom||14,w:Math.min(900,Math.max(240,w)),h:Math.max(160,h),mode:mode},function(img){
      if(!img)return;var cur=document.getElementById(el.id);if(!cur)return;
      cur.innerHTML='<img src="'+img+'" style="width:100%;height:100%;object-fit:cover;display:block" alt="location map">';
      cur.setAttribute('data-static','1');
    });}catch(e){}}
/* Mount MapLibre / multi / shade maps that are currently visible.
   Immediate mount (not IntersectionObserver): Safari/Edge muse-density-match
   uses CSS zoom which breaks IO intersection math and left maps blank. */
function mountVisibleMaps(){try{var root=document;try{if(museIsPhone()){root=document.querySelector('.view-pane.active')||document;}}catch(eR){}
  var els=root.querySelectorAll('.livemap');for(var i=0;i<els.length;i++){var e=els[i];
  if(e.getAttribute('data-mounted')==='1')continue;if(e.offsetParent===null)continue; // only visible
  if(museIsPhone()&&i>0)break;
  mountLiveMap(e);}}catch(e){}
  try{var els2=document.querySelectorAll('.livemulti');for(var j=0;j<els2.length;j++){var e2=els2[j];
  if(e2.getAttribute('data-mounted')==='1')continue;if(e2.offsetParent===null)continue;
  if(typeof mountMultiMap==='function')mountMultiMap(e2);}}catch(e){}
  try{var els3=document.querySelectorAll('.shadebox');for(var k=0;k<els3.length;k++){var e3=els3[k];
  if(e3.getAttribute('data-mounted')==='1')continue;if(e3.offsetParent===null)continue;
  if(typeof mountShadeBox==='function')mountShadeBox(e3);}}catch(e){}
  /* v37: upgrade every rich-text placeholder in the freshly rendered pane */
  try{if(typeof mountRichBoxes==='function')mountRichBoxes(document);}catch(e){}}
function setMapMode(id,mode){
  mode=museMapMode(mode);
  var entry=_liveMaps[id];var el=document.getElementById(id);
  // update toggle buttons
  if(el){var wrap=el.parentNode;if(wrap){var btns=wrap.querySelectorAll('[data-mode-btn]');for(var i=0;i<btns.length;i++){var on=btns[i].getAttribute('data-mode-btn')===mode;btns[i].style.background=on?'#1C1E21':'#ffffff';btns[i].style.color=on?'#ffffff':'#65676B';}}
    el.setAttribute('data-mode',mode);}
  if(!entry||!entry.map){if(el){el.setAttribute('data-mounted','');mountLiveMap(el);}return;}
  var map=entry.map;entry.mode=mode;
  try{
    /* restyle — the DOM marker persists across setStyle (it's an overlay, not part
       of the style). Streets → OpenFreeMap vector; Satellite → Esri raster. */
    map.setStyle(museRasterStyle(mode));
    if(mode!=='satellite')museUpgradeToOFM(map,museMapIsDark());
    map.once('styledata',function(){try{map.resize();}catch(e){}});
  }catch(e){}
}

/* ============================================================================
   v35 — SHADEMAP · 3D BUILDING + TERRAIN SUN-SHADOW SIMULATION
   Real-time shadow casting from the sun's position for a location + instant,
   using shademap.app's simulator over a pitched 3D MapLibre view. Buildings are
   pulled keyless from OpenStreetMap (Overpass) as footprints+heights — the app's
   raster basemaps carry no vector building data, so Overpass supplies both the
   ShadeMap shadow features AND the visible fill-extrusion massing. Terrain shadows
   use AWS Terrarium DEM tiles (keyless, CORS-open). The sun instant is driven by
   the atomic clock (museNow) resolved into the venue's IANA timezone, with a
   time-of-day scrubber so crews can preview shadows across the whole shoot day.
   If the ShadeMap/MapLibre CDN is blocked the panel degrades to a note, never
   breaking the surrounding UI.  API key: user's shademap.app account key.
   ============================================================================ */
var SHADEMAP_JS='https://unpkg.com/mapbox-gl-shadow-simulator@0.68.2/dist/mapbox-gl-shadow-simulator.umd.min.js';
var SHADEMAP_KEY='';
var _smPromise=null;
/* The simulator throws without an API key, so the key (fetched once from env via
   /api/shademap-key) gates the loader: construction sites keep reading SHADEMAP_KEY.
   Empty results are not cached, so a later mount retries after an outage. */
var _smKeyPromise=null;
function shadeApiKey(){
  if(!_smKeyPromise){_smKeyPromise=fetch('/api/shademap-key',{cache:'no-store',credentials:'same-origin'}).then(function(r){return r.ok?r.json():null;}).then(function(j){var k=(j&&j.key)||'';if(!k)_smKeyPromise=null;return k;}).catch(function(){_smKeyPromise=null;return '';});}
  return _smKeyPromise;
}
function loadShadeMap(){
  if(typeof window!=='undefined'&&window.ShadeMap&&SHADEMAP_KEY)return Promise.resolve(window.ShadeMap);
  if(!_smPromise){_smPromise=loadMapLibre().then(function(){return new Promise(function(resolve,reject){
    try{
      var s=document.createElement('script');s.src=SHADEMAP_JS;s.async=true;
      s.onload=function(){window.ShadeMap?resolve(window.ShadeMap):reject(new Error('ShadeMap missing'));};
      s.onerror=function(){reject(new Error('ShadeMap CDN unreachable'));};
      document.head.appendChild(s);
      setTimeout(function(){if(!window.ShadeMap)reject(new Error('ShadeMap load timeout'));},12000);
    }catch(e){reject(e);}
  });});}
  return _smPromise.then(function(SM){return shadeApiKey().then(function(k){if(!k)throw new Error('ShadeMap API key missing');SHADEMAP_KEY=k;return SM;});});
}
function _shadeTerrain(){return {tileSize:256,maxZoom:15,
  getSourceUrl:function(o){return 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/'+o.z+'/'+o.x+'/'+o.y+'.png';},
  getElevation:function(c){return (c.r*256+c.g+c.b/256)-32768;}};}

/* ---- keyless building footprints + heights (OpenStreetMap via Overpass) ---- */
var _bldgCache={};   /* bboxKey -> features[] */
var _bldgInflight={};/* bboxKey -> Promise */
var OVERPASS_HOSTS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
function _museBldgHeight(t){t=t||{};
  var h=parseFloat(t.height||t['building:height']);
  if(!isNaN(h)&&h>0)return Math.min(500,Math.max(3,h));
  var lv=parseFloat(t['building:levels']||t['levels']);
  if(!isNaN(lv)&&lv>0){var rl=parseFloat(t['roof:levels']);return Math.min(500,Math.max(3,lv*3.2+(isNaN(rl)?0:rl*2)));}
  return 8; /* sensible default so low-rise still casts a shadow */
}
function _bboxKey(s,w,n,e){return [s.toFixed(3),w.toFixed(3),n.toFixed(3),e.toFixed(3)].join(',');}
/* fetch building polygons within a MapLibre bounds; resolves [] when zoomed too far
   out (a national bbox would overwhelm Overpass) or on any failure — never rejects */
function museBuildingsForBounds(bounds,zoom){
  try{
    if(zoom!=null&&zoom<13.5)return Promise.resolve([]);
    var sw=bounds.getSouthWest(),ne=bounds.getNorthEast();
    var s=sw.lat,w=sw.lng,n=ne.lat,e=ne.lng;
    /* clamp an over-wide viewport to a ~0.06° window around center so the query stays small */
    var cx=(s+n)/2,cy=(w+e)/2;
    if(n-s>0.09){s=cx-0.045;n=cx+0.045;}
    if(e-w>0.09){w=cy-0.045;e=cy+0.045;}
    var key=_bboxKey(s,w,n,e);
    if(_bldgCache[key])return Promise.resolve(_bldgCache[key]);
    if(_bldgInflight[key])return _bldgInflight[key];
    var q='[out:json][timeout:18];(way["building"]('+s+','+w+','+n+','+e+'););out geom;';
    var pr=_overpassTry(0,q).then(function(feats){_bldgCache[key]=feats||[];delete _bldgInflight[key];return _bldgCache[key];})
      .catch(function(){delete _bldgInflight[key];return [];});
    _bldgInflight[key]=pr;return pr;
  }catch(e){return Promise.resolve([]);}
}
function _overpassTry(hi,q){
  if(hi>=OVERPASS_HOSTS.length)return Promise.resolve([]);
  return fetch(OVERPASS_HOSTS[hi]+'?data='+encodeURIComponent(q),{cache:'no-store'})
    .then(function(r){if(!r.ok)throw new Error('overpass '+r.status);return r.json();})
    .then(function(j){
      var out=[];var els=(j&&j.elements)||[];
      for(var i=0;i<els.length&&out.length<4000;i++){var el=els[i];
        if(el.type!=='way'||!el.geometry||el.geometry.length<3)continue;
        var ring=el.geometry.map(function(p){return [p.lon,p.lat];});
        var f=ring[0],l=ring[ring.length-1];if(f[0]!==l[0]||f[1]!==l[1])ring.push([f[0],f[1]]);
        out.push({type:'Feature',properties:{height:_museBldgHeight(el.tags)},geometry:{type:'Polygon',coordinates:[ring]}});
      }
      if(!out.length)throw new Error('overpass empty');
      return out;
    })
    .catch(function(){return _overpassTry(hi+1,q);});
}
/* visible 3D massing — same features ShadeMap shadows, drawn as extrusions */
function _shadeSyncExtrusion(map,feats){try{
  var data={type:'FeatureCollection',features:feats||[]};
  if(map.getSource('muse-bldgs')){map.getSource('muse-bldgs').setData(data);return;}
  map.addSource('muse-bldgs',{type:'geojson',data:data});
  map.addLayer({id:'muse-bldgs-3d',type:'fill-extrusion',source:'muse-bldgs',minzoom:13,paint:{
    'fill-extrusion-color':['interpolate',['linear'],['get','height'],0,'#ced0d4',40,'#b0b3b8',120,'#b0b3b8'],
    'fill-extrusion-height':['get','height'],'fill-extrusion-base':0,'fill-extrusion-opacity':0.92}});
}catch(e){}}

/* ---- reusable Sun & Shadow panel (mounts like .livemap on innerHTML re-render) ---- */
var _shadeMaps={};   /* id -> {map,node,shade,tz,mode,baseDate,minutes,lat,lng,timer,ready} */
var _shadeSeq=1;
function museShadeBox(opts){
  opts=opts||{};var id=opts.id||('shade'+(_shadeSeq++));
  var lat=(opts.lat!=null?opts.lat:40.7128),lng=(opts.lng!=null?opts.lng:-74.0060);
  var zoom=opts.zoom||16,h=opts.height||'300px',tz=opts.tz||museTzGuess(lat,lng);
  var note='3D buildings · sun-cast shadows · shademap.app';
  return '<div class="muse-shade" style="position:relative">'+
    '<div class="flex items-center justify-between flex-wrap gap-1 mb-1.5">'+
      '<p class="text-[10px] font-bold uppercase tracking-wider text-gray-600">☀ Sun &amp; Shadow — 3D <span class="text-gray-400 font-normal normal-case">'+esc(note)+'</span></p>'+
      '<span id="'+id+'_time" class="text-[10px] mono font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">—</span>'+
    '</div>'+
    '<div class="rounded-xl overflow-hidden border border-gray-200 bg-gray-900 relative" style="height:'+h+'">'+
      '<div id="'+id+'" class="shadebox" data-lat="'+lat+'" data-lng="'+lng+'" data-zoom="'+zoom+'" data-tz="'+esc(tz).replace(/"/g,'&quot;')+'" data-label="'+esc(opts.label||'').replace(/"/g,'&quot;')+'"'+(opts.date?' data-date="'+esc(opts.date)+'"':'')+' style="position:absolute;inset:0;width:100%;height:100%">'+
        '<div class="w-full h-full flex items-center justify-center text-center px-4" style="background:linear-gradient(135deg,#18191A,#1c1e21)"><p class="text-[10px] text-gray-400 mono">Loading 3D sun &amp; shadow view…<br><span class="text-gray-500">buildings + terrain + solar position</span></p></div>'+
      '</div>'+
    '</div>'+
    '<div class="flex items-center gap-2 mt-1.5">'+
      '<button type="button" onclick="shadeNow(\''+id+'\')" class="text-[9px] font-bold text-white bg-gray-900 rounded-lg px-2.5 py-1.5 hover:bg-gray-800 flex-shrink-0">◉ Now</button>'+
      '<input id="'+id+'_scrub" type="range" min="0" max="1439" step="5" value="720" oninput="shadeScrub(\''+id+'\',this.value)" class="flex-1" style="accent-color:#f5832a" title="Scrub time of day">'+
      '<span class="text-[8px] font-bold uppercase tracking-wider text-gray-400 flex-shrink-0" style="min-width:88px;text-align:right">time of day</span>'+
    '</div>'+
  '</div>';
}
function _shadeAbsDate(S){
  if(S.mode==='now')return museNow();
  var b=S.baseParts||museZonedParts(S.tz,museNow());
  var m=(S.minutes==null?720:S.minutes);
  return museZonedToDate(S.tz,b.y,b.mo,b.d,Math.floor(m/60),m%60);
}
function _shadeLabel(id){var S=_shadeMaps[id];if(!S)return;var el=document.getElementById(id+'_time');if(!el)return;
  var d=_shadeAbsDate(S);
  try{var t=new Intl.DateTimeFormat('en-US',{timeZone:S.tz,hour:'numeric',minute:'2-digit',hour12:true}).format(d);
    var zab=new Intl.DateTimeFormat('en-US',{timeZone:S.tz,timeZoneName:'short'}).formatToParts(d).filter(function(p){return p.type==='timeZoneName';})[0];
    el.textContent=(S.mode==='now'?'◉ NOW · ':'')+t+(zab?' '+zab.value:'');
  }catch(e){el.textContent='—';}}
/* v37: move a MapLibre camera in a way that ALWAYS lands.
   flyTo/fitBounds ease the camera from inside the render loop — and that loop never advances
   while the style is still pending (tile CDN blocked/slow), so an animated move silently does
   nothing and the UI looks broken. Animate when the style is up, jump when it is not. */
function museMapGoto(map,lng,lat,zoom,opts){
  if(!map)return;
  var live=false;try{live=!!(map.isStyleLoaded&&map.isStyleLoaded());}catch(e){live=false;}
  var o=opts||{};
  try{
    if(live)map.flyTo({center:[lng,lat],zoom:zoom,essential:true,duration:(o.duration!=null?o.duration:900)});
    else map.jumpTo({center:[lng,lat],zoom:zoom});
  }catch(e){try{map.jumpTo({center:[lng,lat],zoom:zoom});}catch(e2){}}}
function mountShadeBox(el){
  if(!el||el.getAttribute('data-mounted')==='1')return;
  var id=el.id;var lat=parseFloat(el.getAttribute('data-lat')),lng=parseFloat(el.getAttribute('data-lng'));
  var zoom=parseFloat(el.getAttribute('data-zoom'))||16;
  if(isNaN(lat)||isNaN(lng)||lat==null||lng==null){
    el.setAttribute('data-mounted','1');
    el.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#8a8d91;font:600 11px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:12px;text-align:center">No GPS for this site — set lat/lng on Location &amp; Map to enable sun shadows</div>';
    return;
  }
  var tz=el.getAttribute('data-tz')||museTzGuess(lat,lng);
  var dateAttr=el.getAttribute('data-date')||'';
  if(isNaN(lat)||isNaN(lng))return;
  var cached=_shadeMaps[id];
  if(cached&&cached.map&&cached.node){
    try{
      el.setAttribute('data-mounted','1');el.innerHTML='';el.appendChild(cached.node);
      var moved=(Math.abs(cached.lat-lat)>1e-6||Math.abs(cached.lng-lng)>1e-6);
      cached.tz=tz;
      /* v37: the panel's own coordinates are state, not a side-effect of a successful resize —
         record them up front so a throw inside the deferred work cannot desync lat/lng from
         the attributes the pane rendered with. */
      if(moved){cached.lat=lat;cached.lng=lng;cached.zoom=zoom;cached.baseParts=museZonedParts(tz,museNow());}
      setTimeout(function(){try{cached.map.resize();}catch(e){}
        if(moved){museMapGoto(cached.map,lng,lat,zoom);
          setTimeout(function(){try{_shadeRefresh(id);}catch(e){}},700);}
        try{_shadeLabel(id);}catch(e){}},40);
      return;
    }catch(e){try{cached.map.remove();}catch(e2){}delete _shadeMaps[id];}
  }
  el.setAttribute('data-mounted','1');
  var S=_shadeMaps[id]={map:null,node:null,shade:null,tz:tz,mode:'now',minutes:720,lat:lat,lng:lng,zoom:zoom,timer:null,ready:false,
    baseParts:museZonedParts(tz,museNow())};
  /* a fixed date attribute pins the panel to a scheduled instant instead of live 'now' */
  if(dateAttr){var dd=new Date(dateAttr);if(!isNaN(dd.getTime())){S.mode='fixed';S.fixedDate=dd;}}
  loadShadeMap().then(function(SM){loadMapLibre().then(function(maplib){
    /* v35: build on the OpenFreeMap vector style (real building heights → fast, no
       Overpass) and matched to the app theme; raster+Overpass is the fallback */
    museOFMStyle(museMapIsDark(),function(ofmStyle){
    try{
      el.innerHTML='';var node=document.createElement('div');node.style.cssText='position:absolute;inset:0;width:100%;height:100%';el.appendChild(node);
      var useVector=!!ofmStyle;
      var map=new maplib.Map({container:node,style:ofmStyle||museRasterStyle('streets'),center:[lng,lat],zoom:zoom,
        pitch:44,bearing:-18,attributionControl:{compact:true},cooperativeGestures:true,antialias:true}); /* pitch <=44: the shadow SDK never draws above ~45 (see museShadeStatic) */
      map.addControl(new maplib.NavigationControl({visualizePitch:true}),'bottom-right');
      S.map=map;S.node=node;S.useVector=useVector;
      map.on('load',function(){
        try{
          if(useVector)_shadeAddVectorBuildings(map);
          var date=(S.mode==='fixed'&&S.fixedDate)?S.fixedDate:_shadeAbsDate(S);
          var shade=new SM({apiKey:SHADEMAP_KEY,date:date,color:'#18191A',opacity:0.58,
            terrainSource:_shadeTerrain(),
            getFeatures:useVector
              ?function(){return _shadeVectorFeatures(map);}
              :function(){return museBuildingsForBounds(map.getBounds(),map.getZoom()).then(function(feats){try{_shadeSyncExtrusion(map,feats);}catch(e){}return feats;});},
            debug:function(){} });
          shade.addTo(map);S.shade=shade;S.ready=true;
          try{map.resize();}catch(e){}
          /* sync the scrubber thumb to the current venue-local time on first paint */
          if(S.mode==='now'&&S.baseParts){var sc0=document.getElementById(id+'_scrub');if(sc0)sc0.value=S.baseParts.h*60+S.baseParts.mi;}
          _shadeLabel(id);
          /* live 'now' mode: nudge the sun forward every 60s so shadows track real time */
          if(!S.timer&&S.mode==='now'){S.timer=setInterval(function(){var SS=_shadeMaps[id];if(!SS||!SS.shade)return;
            if(SS.mode==='now'){try{SS.shade.setDate(museNow());}catch(e){}_shadeLabel(id);}},60000);}
          /* vector buildings are local (no network) → ShadeMap's own move handling is
             enough; only the raster/Overpass fallback needs a manual refresh nudge */
          if(!useVector)map.on('moveend',function(){try{_shadeRefresh(id);}catch(e){}});
        }catch(e){}
      });
      [140,420,900].forEach(function(ms){setTimeout(function(){try{map.resize();}catch(e){}},ms);});
    }catch(e){el.setAttribute('data-mounted','');_shadeFail(el);}
    });
  }).catch(function(){el.setAttribute('data-mounted','');_shadeFail(el);});
  }).catch(function(){el.setAttribute('data-mounted','');_shadeFail(el);});
}
/* building footprints for ShadeMap, read straight from the OpenFreeMap vector
   tiles already on screen (instant, keyless) — height from render_height/levels */
function _shadeVectorFeatures(map){
  try{var feats=map.querySourceFeatures('openmaptiles',{sourceLayer:'building'});var out=[];
    for(var i=0;i<feats.length&&out.length<6000;i++){var f=feats[i];var pr=f.properties||{};
      if(pr.hide_3d)continue;
      var h=(pr.render_height!=null)?pr.render_height:(pr.height!=null?pr.height:null);
      if(h==null){var lv=pr['building:levels']||pr.levels;h=lv?(+lv*3):6;}
      out.push({type:'Feature',properties:{height:(+h||6)},geometry:f.geometry});}
    return Promise.resolve(out);
  }catch(e){return Promise.resolve([]);}
}
/* visible 3D massing drawn from the same vector building source */
function _shadeAddVectorBuildings(map,forceLight){try{
  if(map.getLayer('muse-bldgs-3d')||!map.getSource('openmaptiles'))return;
  var dark=forceLight?false:museMapIsDark();
  map.addLayer({id:'muse-bldgs-3d',type:'fill-extrusion',source:'openmaptiles','source-layer':'building',minzoom:13,
    paint:{'fill-extrusion-color':dark?'#3a3b3c':'#ced0d4',
      'fill-extrusion-height':['coalesce',['get','render_height'],['get','height'],6],
      'fill-extrusion-base':['coalesce',['get','render_min_height'],0],
      'fill-extrusion-opacity':0.92}});
}catch(e){}}
function _shadeFail(el){if(!el)return;try{el.innerHTML='<div class="w-full h-full flex items-center justify-center text-center px-4" style="background:linear-gradient(135deg,#18191A,#1c1e21)">'+
  '<p class="text-[10px] text-gray-400 mono">Sun &amp; Shadow view unavailable — check the ShadeMap key or map configuration, or reload to retry.<br><span class="text-gray-500">The location map &amp; weather above are unaffected.</span></p></div>';}catch(e){}}
/* force the shadow layer to re-pull features for the current view */
function _shadeRefresh(id){var S=_shadeMaps[id];if(!S||!S.shade)return;try{S.shade.setDate(_shadeAbsDate(S));}catch(e){}}
function shadeNow(id){var S=_shadeMaps[id];if(!S)return;S.mode='now';S.baseParts=museZonedParts(S.tz,museNow());
  var sc=document.getElementById(id+'_scrub');if(sc){var p=S.baseParts;sc.value=p?(p.h*60+p.mi):720;}
  if(S.shade){try{S.shade.setDate(museNow());}catch(e){}}
  if(!S.timer)S.timer=setInterval(function(){var SS=_shadeMaps[id];if(SS&&SS.shade&&SS.mode==='now'){try{SS.shade.setDate(museNow());}catch(e){}_shadeLabel(id);}},60000);
  _shadeLabel(id);}
function shadeScrub(id,val){var S=_shadeMaps[id];if(!S)return;S.mode='scrub';S.minutes=parseInt(val,10)||0;
  if(!S.baseParts)S.baseParts=museZonedParts(S.tz,museNow());
  if(S.shade){try{S.shade.setDate(_shadeAbsDate(S));}catch(e){}}
  _shadeLabel(id);}
/* move an existing shade panel to a new location (used when a venue is searched) */
function shadeGoto(id,lat,lng,tz,label){var el=document.getElementById(id);if(!el)return;
  el.setAttribute('data-lat',lat);el.setAttribute('data-lng',lng);if(tz)el.setAttribute('data-tz',tz);if(label!=null)el.setAttribute('data-label',label);
  if(el.getAttribute('data-mounted')==='1'){el.setAttribute('data-mounted','');}
  mountShadeBox(el);}

/* jsPDF addImage format must match the data URL (JPEG vs PNG) or it paints black */
function musePdfImgFmt(data){
  if(!data||typeof data!=='string')return 'JPEG';
  if(/^data:image\/png/i.test(data))return 'PNG';
  if(/^data:image\/jpe?g/i.test(data)||data.indexOf('/9j/')>=0)return 'JPEG';
  return 'JPEG';
}
/* Sample via 2d drawImage — gl.readPixels on MapLibre's default FB is often empty. */
function museGlCanvasHasPaint(cv){
  if(!cv)return false;
  try{
    var w=32,h=32,c=document.createElement('canvas');c.width=w;c.height=h;
    var x=c.getContext('2d');if(!x)return true;
    x.drawImage(cv,0,0,w,h);
    var d=x.getImageData(0,0,w,h).data,lit=0;
    for(var i=0;i<d.length;i+=4){if(d[i]>22||d[i+1]>22||d[i+2]>22)lit++;}
    return lit>12;
  }catch(e){return true;}
}

/* ---- in-viewport shadow capture for PDF (real GL render → PNG/JPEG) --------
   Browsers skip WebGL for canvases at left:-10000px (black PDF box). ShadeMap
   also hits a Mapbox-only `_sourceCaches["other:composite"]` path when pitch
   is >45° and clears the drawing buffer. Keep the host in the viewport, cap
   pitch at 45, snapshot 3D buildings, then overlay shadows. If ShadeMap
   blanks the canvas, keep the 3D snapshot so the sheet is never a black box. */
function museShadeStatic(lat,lng,opts,cb){
  opts=opts||{};var W=opts.w||560,H=opts.h||360,zoom=opts.zoom||16;
  var pitch=(opts.pitch!=null?opts.pitch:45);if(pitch>45)pitch=45;
  var bearing=(opts.bearing!=null?opts.bearing:-18);
  var date=opts.date||museNow();var TMO=opts.timeout||14000;
  var done=false,host=null,map=null,shade=null,guard=null,baseImg=null;
  function cleanup(){try{if(shade)shade.remove();}catch(e){}try{if(map)map.remove();}catch(e){}try{if(host&&host.parentNode)host.parentNode.removeChild(host);}catch(e){}}
  function finish(img){if(done)return;done=true;if(guard)clearTimeout(guard);cleanup();cb(img||baseImg||null);}
  function grab(){
    try{
      if(!map)return null;
      try{map.triggerRepaint();}catch(e0){}
      var cv=map.getCanvas();if(!cv)return null;
      var url=null;
      try{url=cv.toDataURL('image/png');}catch(e1){url=null;}
      if(!url){try{url=cv.toDataURL('image/jpeg',0.92);}catch(e2){url=null;}}
      if(!url||url.length<80)return null;
      if(museGlCanvasHasPaint(cv))return url;
      /* real street tiles encode far larger than a cleared buffer */
      if(url.length>40000)return url;
      return null;
    }catch(e){return null;}
  }
  try{
    loadShadeMap().then(function(SM){loadMapLibre().then(function(maplib){
      museOFMStyle(false,function(ofmStyle){
      try{
        var useVector=!!ofmStyle;
        host=document.createElement('div');
        host.setAttribute('aria-hidden','true');
        host.style.cssText='position:fixed;left:0;top:0;width:'+W+'px;height:'+H+'px;opacity:0.15;z-index:1;pointer-events:none;overflow:hidden;transform:translateZ(0);-webkit-transform:translateZ(0)';
        document.body.appendChild(host);
        map=new maplib.Map({container:host,style:ofmStyle||museRasterStyle('streets',true),center:[lng,lat],zoom:zoom,pitch:pitch,bearing:bearing,
          attributionControl:false,preserveDrawingBuffer:true,interactive:false,fadeDuration:0,pixelRatio:2,antialias:true,failIfMajorPerformanceCaveat:false});
        map.on('load',function(){try{
          try{map.resize();}catch(eR){}
          if(useVector)_shadeAddVectorBuildings(map,true);
          else museBuildingsForBounds(map.getBounds(),map.getZoom()).then(function(feats){try{_shadeSyncExtrusion(map,feats);}catch(e){}});
          var poll=function(left,then){
            if(done)return;
            var img=grab();
            if(img){then(img);return;}
            if(left<=0){then(null);return;}
            setTimeout(function(){poll(left-1,then);},400);
          };
          poll(12,function(first){
            if(done)return;
            if(first)baseImg=first;
            try{
              shade=new SM({apiKey:SHADEMAP_KEY,date:date,color:'#18191A',opacity:0.62,terrainSource:_shadeTerrain(),
                getFeatures:useVector
                  ?function(){return _shadeVectorFeatures(map);}
                  :function(){return museBuildingsForBounds(map.getBounds(),map.getZoom()).then(function(feats){try{_shadeSyncExtrusion(map,feats);}catch(e){}return feats;});},
                debug:function(){} });
              shade.addTo(map);
            }catch(eAdd){finish(baseImg);return;}
            setTimeout(function(){
              poll(10,function(shaded){finish(shaded||baseImg);});
            },600);
          });
        }catch(e){finish(null);}});
        guard=setTimeout(function(){finish(grab()||baseImg);},TMO);
      }catch(e){finish(null);}
      });
    }).catch(function(){finish(null);});}).catch(function(){finish(null);});
  }catch(e){finish(null);}
}

/* ============================================================================
   v35 — COMPACT DATE / DATE-RANGE POPOVER
   A small month calendar that composes a single free-text field (e.g. the ENG
   "Hit Date / Window"). Click a day for a single date, a second day for a range;
   optional time + timezone. Writes a formatted string back into the target input
   and fires an optional callback. Uses the atomic clock (museNow) for "today".
   ============================================================================ */
var DP_MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var _dp={targetId:null,y:0,mo:0,start:null,end:null,tz:'ET',cb:null};
function _dpMid(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function museOpenDatePop(targetId,anchor,opts){
  opts=opts||{};var now=museNow();
  _dp.targetId=targetId;_dp.start=null;_dp.end=null;_dp.tz=opts.tz||'ET';_dp.cb=opts.cb||null;
  _dp.noTime=!!opts.noTime;_dp.rangeHint=opts.rangeHint!==false;
  _dp.y=now.getFullYear();_dp.mo=now.getMonth();
  var pop=document.getElementById('museDatePop');
  if(!pop){pop=document.createElement('div');pop.id='museDatePop';pop.style.cssText='position:fixed;z-index:130;display:none';document.documentElement.appendChild(pop); // unzoomed host: rect-measured px stay 1:1
    document.addEventListener('mousedown',function(ev){var p=document.getElementById('museDatePop');
      if(p&&p.style.display!=='none'&&!p.contains(ev.target)&&!(ev.target.getAttribute&&ev.target.getAttribute('data-dp-anchor')))p.style.display='none';});}
  _dpRender();pop.style.display='block';
  try{var r=anchor.getBoundingClientRect();var pw=282,ph=340;
    var left=Math.min(window.innerWidth-pw-8,Math.max(8,r.left));
    var top=(r.bottom+ph+8>window.innerHeight)?Math.max(8,r.top-ph-6):r.bottom+6;
    pop.style.left=left+'px';pop.style.top=top+'px';}catch(e){}
}
function museCloseDatePop(){var p=document.getElementById('museDatePop');if(p)p.style.display='none';}
function _dpNav(dir){_dp.mo+=dir;if(_dp.mo<0){_dp.mo=11;_dp.y--;}else if(_dp.mo>11){_dp.mo=0;_dp.y++;}_dpRender();}
function _dpIsSel(d){var t=_dpMid(d).getTime();return (_dp.start&&t===_dp.start.getTime())||(_dp.end&&t===_dp.end.getTime());}
function _dpInRange(d){if(!_dp.start||!_dp.end)return false;var t=_dpMid(d).getTime();return t>_dp.start.getTime()&&t<_dp.end.getTime();}
function _dpPick(dn){var d=_dpMid(new Date(_dp.y,_dp.mo,dn));
  if(!_dp.start||(_dp.start&&_dp.end)){_dp.start=d;_dp.end=null;}
  else{if(d.getTime()>=_dp.start.getTime())_dp.end=d;else{_dp.end=_dp.start;_dp.start=d;}}
  _dpRender();}
function _dpClear(){_dp.start=null;_dp.end=null;_dpRender();}
function _dpTimeVal(){var el=document.getElementById('_dpTime');return el?el.value:'';}
function _dpFmt(d){return DP_MON[d.getMonth()]+' '+d.getDate();}
function _dpSummary(){if(!_dp.start)return 'Pick a date or range';
  if(_dp.end&&_dp.end.getTime()!==_dp.start.getTime()){var sm=_dp.start.getMonth()===_dp.end.getMonth();return _dpFmt(_dp.start)+'–'+(sm?_dp.end.getDate():_dpFmt(_dp.end));}
  return _dpFmt(_dp.start);}
function _dpApply(){if(!_dp.start){museCloseDatePop();return;}
  var t=_dp.noTime?'':_dpTimeVal();var tzEl=document.getElementById('_dpTz');var tz=(_dp.noTime||!tzEl)?'':((''+tzEl.value).trim().toUpperCase());
  var base=_dpSummary();var out=base+(t?' · '+t+(tz?' '+tz:''):'');
  var el=document.getElementById(_dp.targetId);if(el){el.value=out;try{el.dispatchEvent(new Event('change'));}catch(e){}}
  if(typeof _dp.cb==='function')try{_dp.cb(out,_dp.start,_dp.end,t,tz);}catch(e){}
  museCloseDatePop();}
function _dpRender(){var pop=document.getElementById('museDatePop');if(!pop)return;
  var y=_dp.y,mo=_dp.mo;var first=new Date(y,mo,1);var startDow=first.getDay();var days=new Date(y,mo+1,0).getDate();
  var dow=['S','M','T','W','T','F','S'];
  var cells=dow.map(function(d){return '<div style="text-align:center;font-size:8px;font-weight:700;color:#b0b3b8;padding:2px 0">'+d+'</div>';}).join('');
  for(var i=0;i<startDow;i++)cells+='<div></div>';
  for(var dn=1;dn<=days;dn++){var d=new Date(y,mo,dn);var sel=_dpIsSel(d),inr=_dpInRange(d);
    cells+='<button type="button" onclick="_dpPick('+dn+')" style="text-align:center;font-size:11px;padding:5px 0;border:0;cursor:pointer;border-radius:6px;'+
      (sel?'background:#1C1E21;color:#ffffff;font-weight:700':(inr?'background:#e7f3ff;color:#0a58ca':'background:transparent;color:#3E4042'))+'">'+dn+'</button>';}
  pop.innerHTML='<div style="background:#ffffff;border:1px solid #e4e6eb;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.18);padding:10px;width:282px">'+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">'+
      '<button type="button" onclick="_dpNav(-1)" style="border:0;background:#f0f2f5;border-radius:8px;width:26px;height:26px;cursor:pointer;font-weight:700">‹</button>'+
      '<span style="font-size:12px;font-weight:800;color:#1C1E21">'+DP_MON[mo]+' '+y+'</span>'+
      '<button type="button" onclick="_dpNav(1)" style="border:0;background:#f0f2f5;border-radius:8px;width:26px;height:26px;cursor:pointer;font-weight:700">›</button>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">'+cells+'</div>'+
    (_dp.noTime?'':'<div style="display:flex;align-items:center;gap:6px;margin-top:8px">'+
      '<input id="_dpTime" type="time" style="flex:1;font-size:11px;border:1px solid #e4e6eb;border-radius:8px;padding:4px 6px">'+
      '<input id="_dpTz" value="'+esc(_dp.tz)+'" maxlength="5" placeholder="TZ" style="width:54px;font-size:11px;border:1px solid #e4e6eb;border-radius:8px;padding:4px 6px;text-transform:uppercase">'+
    '</div>')+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;gap:6px">'+
      '<span style="font-size:9px;color:#65676B;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(_dpSummary())+'</span>'+
      '<span style="display:flex;gap:6px;flex-shrink:0"><button type="button" onclick="_dpClear()" style="font-size:10px;border:1px solid #e4e6eb;background:#ffffff;border-radius:8px;padding:4px 8px;cursor:pointer">Clear</button>'+
      '<button type="button" onclick="_dpApply()" style="font-size:10px;font-weight:700;border:0;background:#1C1E21;color:#ffffff;border-radius:8px;padding:4px 10px;cursor:pointer">Apply</button></span>'+
    '</div>'+
    '<p style="font-size:8px;color:#b0b3b8;margin-top:5px">Click start date, then end date in this calendar'+(_dp.noTime?'':' · time &amp; TZ optional')+'.</p>'+
  '</div>';}

/* ============================================================================
   v29 MULTI-PIN SURVEY MAP (Site Survey Module 2)
   One live map, N locations — every site rendered as its own labeled pin at
   once (active site red, others blue), with popups that switch the active
   site. Offline fallback is a REAL projected pin map (equirectangular over
   the sites' bounding box), so multiple labeled pins are visible even when
   map tiles cannot load. Pin data flows through _mmapPins[mapId].
   ============================================================================ */
var _mmapPins={};  // mapId -> visible pins [{id,name,city,lat,lng,active,key}]
var _mmaps={};     // mapId -> {map,node,maplib,markers:{pinId:Marker}}
var _mmapFocus={}; // v37: mapId -> pinId the map is following ('' = fit all). Pure camera state —
                   // deliberately NOT the "active location", which also re-binds departments/galleries/logs.
function multiMapSVG(pins,focusId){var W=860,H=430;
  if(!pins.length)return '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:100%;display:block"><rect width="'+W+'" height="'+H+'" fill="#E4E6EB"/><text x="'+(W/2)+'" y="'+(H/2)+'" text-anchor="middle" font-family="Inter,Arial" font-size="13" fill="#b0b3b8">No mappable locations yet</text></svg>';
  var minLa=90,maxLa=-90,minLo=180,maxLo=-180;
  var foc=null;if(focusId){for(var fi=0;fi<pins.length;fi++)if(pins[fi].id===focusId)foc=pins[fi];}
  if(foc){/* offline fallback still "follows" the dropdown — frame a tight window on the chosen venue */
    minLa=maxLa=foc.lat;minLo=maxLo=foc.lng;}
  else pins.forEach(function(p){if(p.lat<minLa)minLa=p.lat;if(p.lat>maxLa)maxLa=p.lat;if(p.lng<minLo)minLo=p.lng;if(p.lng>maxLo)maxLo=p.lng;});
  var padLa=foc?0.45:Math.max(1.4,(maxLa-minLa)*0.2),padLo=foc?0.9:Math.max(1.4,(maxLo-minLo)*0.2);
  minLa-=padLa;maxLa+=padLa;minLo-=padLo;maxLo+=padLo;
  var X=function(lng){return (lng-minLo)/(maxLo-minLo)*(W-90)+45;};
  var Y=function(lat){return (H-46)-((lat-minLa)/(maxLa-minLa)*(H-92));};
  var grid='';var gi;
  for(gi=1;gi<6;gi++){grid+='<line x1="'+(gi*W/6).toFixed(0)+'" y1="0" x2="'+(gi*W/6).toFixed(0)+'" y2="'+H+'" stroke="#ffffff" stroke-width="1.5"/>';}
  for(gi=1;gi<4;gi++){grid+='<line x1="0" y1="'+(gi*H/4).toFixed(0)+'" x2="'+W+'" y2="'+(gi*H/4).toFixed(0)+'" stroke="#ffffff" stroke-width="1.5"/>';}
  var pinsSorted=pins.slice().sort(function(a,b){return b.lat-a.lat;});
  var g=pinsSorted.map(function(p){var x=X(p.lng).toFixed(1),y=Y(p.lat).toFixed(1);var col=p.color||(p.active?'#e41e3f':'#0866ff');
    var isFoc=!!(foc&&p.id===foc.id);
    return '<g transform="translate('+x+','+y+')">'+(isFoc?'<circle cx="0" cy="-8.5" r="17" fill="none" stroke="#f5832a" stroke-width="3"/>':'')+
      '<path d="M0 -16 C10 -16 13 -7.5 5.5 2 L0 10 L-5.5 2 C-13 -7.5 -10 -16 0 -16 Z" fill="'+col+'" stroke="#ffffff" stroke-width="1.6"/><circle cx="0" cy="-8.5" r="3.6" fill="#ffffff"/>'+
      '<text x="0" y="23" text-anchor="middle" font-family="Inter,Arial" font-size="11" font-weight="700" fill="#1C1E21" stroke="#ffffff" stroke-width="3" paint-order="stroke">'+esc(p.name)+'</text></g>';}).join('');
  return '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:100%;display:block" preserveAspectRatio="xMidYMid slice"><rect width="'+W+'" height="'+H+'" fill="#E4E6EB"/>'+grid+g+
    '<text x="10" y="'+(H-10)+'" font-size="9" fill="#b0b3b8" font-family="monospace">PIN MAP (offline) — live tiles load when the network allows</text></svg>';}
function multiMapHTML(opts){var id=opts.id;_mmapPins[id]=(opts.pins||[]).filter(function(p){return !p.hidden;});
  if('focus' in opts)_mmapFocus[id]=opts.focus||'';
  var foc=_mmapFocus[id]||'';
  return '<div class="livemap-wrap" style="position:relative;width:100%;height:'+(opts.height||'100%')+'">'+
    '<div id="'+id+'" class="livemulti" style="position:absolute;inset:0;width:100%;height:100%">'+multiMapSVG(_mmapPins[id],foc)+'</div>'+
    '<button type="button" onclick="multiFitAll(\''+id+'\',1)" style="position:absolute;top:8px;right:8px;z-index:5;font-size:9px;font-weight:800;letter-spacing:.04em;padding:5px 9px;border:1px solid #e4e6eb;border-radius:8px;cursor:pointer;background:#ffffff;color:#3E4042;box-shadow:0 2px 8px rgba(0,0,0,.12)">FIT ALL</button></div>';}
function multiPinElm(p){var col=(p&&p.color)||((p&&p.active)?'#e41e3f':'#0866ff');
  var elm=document.createElement('div');
  elm.style.cssText='width:18px;height:18px;border-radius:50% 50% 50% 0;background:'+col+';border:2px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,.4);transform:rotate(-45deg);cursor:pointer';
  var dot=document.createElement('div');dot.style.cssText='width:6px;height:6px;background:#ffffff;border-radius:50%;position:absolute;top:4px;left:4px';elm.appendChild(dot);return elm;}
function multiSyncMarkers(id){var M=_mmaps[id];if(!M||!M.map||!M.maplib)return;var pins=_mmapPins[id]||[];
  /* v30 Module 13: only rebuild markers when pin DATA actually changed — unrelated
     pane re-renders (or resizes) no longer tear down and recreate every marker */
  var sig=JSON.stringify(pins.map(function(p){return [p.id,p.lat,p.lng,p.name,p.city,p.active,p.color||''];}));
  if(M.sig===sig&&Object.keys(M.markers).length===pins.length)return;
  M.sig=sig;
  /* review fix: when the anchor pin genuinely moved (e.g. active location switched),
     re-frame the cached camera — markers at the new city with the camera on the old one
     is worse than a one-time flyTo */
  var fitKey=pins.length?(pins[0].lat.toFixed(3)+','+pins[0].lng.toFixed(3)):'';
  var moved=(M.fitKey!=null&&M.fitKey!==fitKey);
  M.fitKey=fitKey;
  for(var mid in M.markers){try{M.markers[mid].remove();}catch(e){}}
  M.markers={};
  if(moved)setTimeout(function(){try{if(_mmapFocus[id])multiFocusPin(id,_mmapFocus[id]);else multiFitAll(id);}catch(e){}},60);
  pins.forEach(function(p){try{
    var mk=new M.maplib.Marker({element:multiPinElm(p),anchor:'bottom'}).setLngLat([p.lng,p.lat]);
    var pop='<div style="font:600 11px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18191A">'+esc(p.name)+(p.city?'<div style="font:500 9px/1.3 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#65676B">'+esc(p.city)+'</div>':'')+
      (p.active?'<div style="font:700 9px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e41e3f;margin-top:3px">● ACTIVE SITE</div>'
        :(p.key?'<button onclick="setActiveLoc(\''+p.key+'\',\''+p.id+'\')" style="margin-top:4px;font:700 9px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0866ff;background:#e7f3ff;border:1px solid #b9d7ff;border-radius:6px;padding:3px 8px;cursor:pointer">Make active →</button>':''))+'</div>';
    mk.setPopup(new M.maplib.Popup({offset:18,closeButton:false}).setHTML(pop));
    mk.addTo(M.map);M.markers[p.id]=mk;
  }catch(e){}});}
function multiFitAll(id,clearFocus){
  if(clearFocus){_mmapFocus[id]='';
    var cb=_mmapFocusCb[id];if(typeof cb==='function'){try{cb('');}catch(e){}}
    var host=document.getElementById(id);
    if(host&&host.getAttribute('data-mounted')!=='1'){try{host.innerHTML=multiMapSVG(_mmapPins[id]||[],'');}catch(e){}}}
  var M=_mmaps[id];var pins=_mmapPins[id]||[];if(!M||!M.map||!pins.length)return;
  try{var minLa=90,maxLa=-90,minLo=180,maxLo=-180;
    pins.forEach(function(p){if(p.lat<minLa)minLa=p.lat;if(p.lat>maxLa)maxLa=p.lat;if(p.lng<minLo)minLo=p.lng;if(p.lng>maxLo)maxLo=p.lng;});
    if(pins.length===1){museMapGoto(M.map,minLo,minLa,13,{duration:600});return;}
    var styled=false;try{styled=!!(M.map.isStyleLoaded&&M.map.isStyleLoaded());}catch(e){}
    if(styled)M.map.fitBounds([[minLo,minLa],[maxLo,maxLa]],{padding:70,maxZoom:12,duration:600});
    else{/* no style yet → fitBounds would never ease; centre + estimate the zoom instead */
      var spanLo=Math.max(1e-6,maxLo-minLo),spanLa=Math.max(1e-6,maxLa-minLa);
      var z=Math.log(360/Math.max(spanLo,spanLa*1.6))/Math.LN2;
      museMapGoto(M.map,(minLo+maxLo)/2,(minLa+maxLa)/2,Math.max(1,Math.min(12,z-0.4)));}
  }catch(e){}}
/* v37: fly the map to ONE pin and pop its label — the dropdown's camera driver.
   Works whether the live basemap mounted or the offline projected-pin SVG is showing. */
var _mmapFocusCb={}; // mapId -> callback(pinId) so the owning pane can resync its <select>
function multiFocusPin(id,pinId,zoom){
  _mmapFocus[id]=pinId||'';
  if(!pinId){multiFitAll(id);return;}
  var pins=_mmapPins[id]||[];var p=null;
  for(var i=0;i<pins.length;i++)if(pins[i].id===pinId)p=pins[i];
  var host=document.getElementById(id);
  if(!p){/* pin is hidden (◌) or has no GPS — say so rather than silently doing nothing */
    if(typeof toast==='function')toast('That site has no map pin — add GPS, or un-hide it with ◉');return;}
  var M=_mmaps[id];
  if(M&&M.map){museMapGoto(M.map,p.lng,p.lat,(zoom||15));
    try{var mk=M.markers&&M.markers[pinId];
      if(mk&&mk.getPopup&&mk.getPopup()){setTimeout(function(){try{
        for(var k in M.markers){var o=M.markers[k];if(o!==mk&&o.getPopup&&o.getPopup()&&o.getPopup().isOpen())o.togglePopup();}
        if(!mk.getPopup().isOpen())mk.togglePopup();}catch(e){}},950);}
    }catch(e){}
  }else if(host&&host.getAttribute('data-mounted')!=='1'){
    try{host.innerHTML=multiMapSVG(pins,pinId);}catch(e){}}
}
function mountMultiMap(el){
  if(!el||el.getAttribute('data-mounted')==='1')return;
  var id=el.id;
  var cached=_mmaps[id];
  if(cached&&cached.map&&cached.node){
    try{el.setAttribute('data-mounted','1');el.innerHTML='';el.appendChild(cached.node);
      setTimeout(function(){try{cached.map.resize();multiSyncMarkers(id);
        if(_mmapFocus[id])multiFocusPin(id,_mmapFocus[id]); /* v37: re-renders keep following the chosen venue */
      }catch(e){}},30);
      return;
    }catch(e){try{cached.map.remove();}catch(e2){}delete _mmaps[id];}
  }
  el.setAttribute('data-mounted','1');
  loadMapLibre().then(function(maplib){
    try{
      var pins=_mmapPins[id]||[];
      el.innerHTML='';
      var node=document.createElement('div');node.style.cssText='position:absolute;inset:0;width:100%;height:100%';el.appendChild(node);
      var map=new maplib.Map({container:node,style:museRasterStyle('streets'),
        center:[(pins.length?pins[0].lng:-98.5),(pins.length?pins[0].lat:39.8)],zoom:(pins.length>1?3:12),
        attributionControl:{compact:true},cooperativeGestures:true});
      map.addControl(new maplib.NavigationControl(),'bottom-right');
      museUpgradeToOFM(map,museMapIsDark()); /* restore OpenFreeMap vector basemap */
      _mmaps[id]={map:map,node:node,maplib:maplib,markers:{}};
      map.on('load',function(){multiSyncMarkers(id);
        if(_mmapFocus[id])multiFocusPin(id,_mmapFocus[id]);else multiFitAll(id);
        try{map.resize();}catch(e){}});
      /* markers are DOM overlays — place them even if the style/tiles never load */
      [120,350,700].forEach(function(ms){setTimeout(function(){try{map.resize();}catch(e){}},ms);});
      [450,1400].forEach(function(ms){setTimeout(function(){var M=_mmaps[id];
        if(M&&M.map&&!Object.keys(M.markers).length){multiSyncMarkers(id);
          if(_mmapFocus[id])multiFocusPin(id,_mmapFocus[id]);else multiFitAll(id);}},ms);});
    }catch(e){el.setAttribute('data-mounted','');}
  }).catch(function(){el.setAttribute('data-mounted','');/* keep projected-pin SVG fallback */});
}
function projectMapSVG(seed){
  var h=0;for(var i=0;i<(seed||'').length;i++){h=(h*31+seed.charCodeAt(i))>>>0;}
  var rnd=function(){h=(h*1103515245+12345)>>>0;return (h&0xffff)/0xffff;};
  var W=240,H=150;
  var hroad='',vroad='';
  for(var r=0;r<5;r++){var y=(14+rnd()*128).toFixed(0);hroad+='<path d="M0 '+y+' H'+W+'" stroke="#ffffff" stroke-width="'+(rnd()>0.6?4:2.5)+'"/>';}
  for(var v=0;v<6;v++){var x=(16+rnd()*210).toFixed(0);vroad+='<path d="M'+x+' 0 V'+H+'" stroke="#ffffff" stroke-width="'+(rnd()>0.6?4:2.5)+'"/>';}
  // a couple of green blocks (parks) and a water body sometimes
  var parks='';for(var b=0;b<3;b++){var bx=(rnd()*200).toFixed(0),by=(rnd()*120).toFixed(0),bw=(18+rnd()*36).toFixed(0),bh=(14+rnd()*30).toFixed(0);parks+='<rect x="'+bx+'" y="'+by+'" width="'+bw+'" height="'+bh+'" rx="3" fill="#a8dab5"/>';}
  var water=rnd()>0.45?'<path d="M0 '+(95+rnd()*30).toFixed(0)+' Q120 '+(80+rnd()*30).toFixed(0)+' '+W+' '+(92+rnd()*28).toFixed(0)+' V'+H+' H0 Z" fill="#b9d7ff"/>':'';
  var px=(50+rnd()*140).toFixed(0),py=(40+rnd()*70).toFixed(0);
  return '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:100%;display:block"><rect width="'+W+'" height="'+H+'" fill="#E4E6EB"/>'+water+'<g>'+parks+'</g><g>'+hroad+vroad+'</g>'+
    '<g transform="translate('+px+','+py+')"><path d="M0 -15 C9 -15 12 -7 5 2 L0 9 L-5 2 C-12 -7 -9 -15 0 -15 Z" fill="#E41E3F" stroke="#ffffff" stroke-width="1"/><circle cx="0" cy="-8" r="3.4" fill="#ffffff"/></g></svg>';
}
function previewThumb(e){var f=e.target.files&&e.target.files[0];if(!f)return;var r=new FileReader();r.onload=function(){npThumb=r.result;var w=document.getElementById('np_thumbwrap');if(w)w.innerHTML='<img src="'+npThumb+'" style="width:100%;height:100%;object-fit:cover">';};r.readAsDataURL(f);}
function buildColorSwatches(){var box=document.getElementById('np_colors');if(!box)return;box.innerHTML=tagColorList.map(function(col){return '<button onclick="pickColor(\''+col+'\',this)" title="'+col+'" style="width:22px;height:22px;border-radius:6px;background:'+dotBg[col]+';border:2px solid '+(col===npColor?'#18191A':'transparent')+'"></button>';}).join('');}
function pickColor(col,btn){npColor=col;buildColorSwatches();}
/* Production Manager picker — managers / directors / technical managers / VPs / execs only */
function isProdManagerRole(pos){
  pos=(''+ (pos||'')).toLowerCase();
  if(!pos)return false;
  /* hard exclude field / craft roles */
  if(/\b(utility|cam op|operator|shader|\ba1\b|\ba2\b|grip|gaffer|electric|architect|networking engineer|client services|teleprompter|chyron|evs|jib|steadicam|hard cam|floor\b|stage manager|audio \/|comms guarantee|transmission engineer|it networking)\b/i.test(pos))return false;
  return /\b(manager|director|vp\b|v\.p\.|vice president|exec|executive|president|chief|head of)\b/i.test(pos);
}
function prodManagerOptions(){
  var seen={},out=[];
  function add(m){
    if(!m||!(m.name||'').trim())return;
    if(!isProdManagerRole(m.pos)&&!m.forcePm)return;
    var k=m.name.trim().toLowerCase();
    if(seen[k])return;seen[k]=1;
    out.push({name:m.name.trim(),pos:m.pos||'Production Manager'});
  }
  try{[CREW_FIELD,CREW_IT,CREW_PCR,CREW_EXEC].forEach(function(arr){(arr||[]).forEach(add);});}catch(e){}
  try{if(typeof personnelRoster==='function')personnelRoster().forEach(add);}catch(e2){}
  /* Always available on Create Project */
  add({name:'Hector Navarro',pos:'Production Manager',forcePm:true});
  out.sort(function(a,b){return a.name.localeCompare(b.name);});
  return out;
}
function fillProdManagerSelect(selId,selected){
  var sel=document.getElementById(selId||'np_pm');if(!sel)return;
  var opts=prodManagerOptions();
  /* no leading em-dash — was rendering as a huge dash in the closed select */
  var html='<option value="">Select manager / director / VP…</option>';
  opts.forEach(function(o){
    html+='<option value="'+esc(o.name).replace(/"/g,'&quot;')+'"'+(selected&&selected===o.name?' selected':'')+'>'+
      esc(o.name)+(o.pos?' · '+esc(o.pos):'')+'</option>';
  });
  sel.innerHTML=html;
  if(selected)sel.value=selected;
  else sel.selectedIndex=0;
}
function openCreateModal(){var m=document.getElementById('createModal');npThumb=null;npColor="blue";
  ['np_title','np_date','np_dateEnd','np_dateRange','np_time'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  try{fillProdManagerSelect('np_pm','');}catch(e0){var pm0=document.getElementById('np_pm');if(pm0)pm0.value='';}
  museRichFill('np_desc','','note','80px','Short production summary\u2026');
  var bs=document.getElementById('np_buildsched');if(bs)bs.checked=true;
  var st=document.getElementById('np_status');if(st)st.value='Pre-Production';
  npLocs=[];
  /* mount the reusable location-search widget + register its pick handler */
  var gb=document.getElementById('np_geobox');if(gb)gb.innerHTML=museGeoBox('np','Search a venue or city — e.g. SoFi Stadium');
  museGeoHandlers['np']=function(r){npLocAddFromGeo(r);};
  try{npRenderLocs();npMapRefresh();npDatesChanged();}catch(e){}
  var cs=document.getElementById('np_customer');if(cs){cs.innerHTML=customerList.map(function(c){return '<option value="'+c+'">'+c+'</option>';}).join('');cs.value="External Productions";}
  var tw=document.getElementById('np_thumbwrap');if(tw)tw.innerHTML='<span class="text-[9px] text-gray-500 px-1 text-center">Colored tile</span>';
  buildColorSwatches();
  try{if(window.MuseTemplates){MuseTemplates.resetCreate();MuseTemplates.renderCreatePicker();}}catch(eT){}
  m.style.display='flex';m.classList.remove('hidden');}
function closeCreateModal(){var m=document.getElementById('createModal');m.style.display='none';m.classList.add('hidden');}
/* ---- multi-day date label + starter-schedule preview ---- */
function npFmtRange(start,end){
  if(!start)return 'TBD';
  var ds;try{ds=new Date(start+'T00:00');}catch(e){return start;}
  if(!end||end===start){return ds.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
  var de;try{de=new Date(end+'T00:00');}catch(e){de=null;}
  if(!de||de<ds){return ds.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
  var sameMonth=(ds.getMonth()===de.getMonth()&&ds.getFullYear()===de.getFullYear());
  if(sameMonth)return ds.toLocaleDateString('en-US',{month:'short',day:'numeric'})+'–'+de.getDate()+', '+de.getFullYear();
  var sameYear=(ds.getFullYear()===de.getFullYear());
  return ds.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' – '+de.toLocaleDateString('en-US',sameYear?{month:'short',day:'numeric',year:'numeric'}:{month:'short',day:'numeric',year:'numeric'});
}
function npDatesChanged(){var s=(document.getElementById('np_date')||{}).value;var e=(document.getElementById('np_dateEnd')||{}).value;
  var span=document.getElementById('np_dateSpan');if(!span)return;
  if(!s){span.textContent='';return;}
  var days=npDaySpan(s,e);span.textContent=(days>1)?(days+'-day shoot'):'Single day';
  var disp=document.getElementById('np_dateRange');
  if(disp&&!disp.value&&s){disp.value=npFmtRange(s,e||s);}
}
function npOpenShootCal(anchor){
  museOpenDatePop('np_dateRange',anchor,{noTime:true,rangeHint:true,cb:function(out,start,end){
    function pad2(x){return (x<10?'0':'')+x;}
    function iso(d){if(!d)return '';return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());}
    var s=iso(start);var e=iso(end||start);
    var a=document.getElementById('np_date');if(a)a.value=s;
    var b=document.getElementById('np_dateEnd');if(b)b.value=e;
    var d=document.getElementById('np_dateRange');if(d)d.value=out||npFmtRange(s,e);
    npDatesChanged();
  }});
}
function npDaySpan(start,end){if(!start)return 0;if(!end||end===start)return 1;
  try{var a=new Date(start+'T00:00'),b=new Date(end+'T00:00');if(b<a)return 1;
    return Math.round((b-a)/86400000)+1;}catch(e){return 1;}}
function slugify(s){return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'').slice(0,24)||'proj';}
function createProject(){
  var title=(document.getElementById('np_title').value||'').trim();
  if(!title){toast('Please enter a project title');return;}
  var date=document.getElementById('np_date').value;var dateEnd=(document.getElementById('np_dateEnd')||{}).value||'';
  var time=document.getElementById('np_time').value;
  var desc=(museRichGet('np_desc')||'').trim();
  var cust=(document.getElementById('np_customer')||{}).value||'External Productions';
  var status=(document.getElementById('np_status')||{}).value||'Pre-Production';
  var pm=((document.getElementById('np_pm')||{}).value||'').trim();
  var buildSched=!!(document.getElementById('np_buildsched')||{}).checked;
  var dateLabel=npFmtRange(date,dateEnd);
  var __locs=(typeof npCollectLocs==='function')?npCollectLocs():[];
  var primary=__locs.length?__locs[0]:null;
  var venue=primary?((primary.venue||primary.name)+(primary.city?' \u00B7 '+primary.city:'')):'Location TBD';
  var geo=(primary&&primary.lat!=null&&primary.lng!=null)?[primary.lat,primary.lng]:null;
  var tag=primary?(primary.name+(__locs.length>1?' +'+(__locs.length-1):'')):(title.length>20?title.slice(0,19)+'\u2026':title);
  var sched=buildSched?npStarterSchedule(date,dateEnd,time,venue):[];
  var key=createProjectFromData({name:title,customer:cust,venue:venue,date:dateLabel,dateStart:date||'',dateEnd:dateEnd||'',
    time:time||'',desc:desc,tagColor:npColor,thumb:npThumb,locations:__locs,geo:geo,tag:tag,status:status,
    editedBy:pm||'',schedule:sched});
  try{if(window.MuseTemplates&&key)MuseTemplates.applyToNew(key);}catch(eT){}
  closeCreateModal();
  toast('“'+title+'” created'+(__locs.length>1?(' \u00B7 '+__locs.length+' venues'):'')+(sched.length?(' \u00B7 '+sched.length+'-row schedule'):'')+' — departments set to Missing');
  openProject(key);
}
/* build a load-in → show-day(s) → strike starter schedule spanning the shoot window
   (7-col schedule rows: [dateISO, startTime, activity, crewCall, bcDate, location, type]) */
function npStarterSchedule(start,end,time,venue){
  if(!start)return [];
  var rows=[];var call=time||'07:00';var loc=venue||'';
  var days=npDaySpan(start,end);
  /* format from LOCAL parts — toISOString() would roll to the previous UTC day for
     any viewer east of UTC (Milano/Tokyo), putting Show Day 1 before Load-In */
  function pad2(x){return (x<10?'0':'')+x;}
  function addDays(iso,n){try{var d=new Date(iso+'T00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());}catch(e){return iso;}}
  rows.push([start,call,'Load-In & Rig',call,'',loc,'Load In']);
  if(days<=1){
    rows.push([start,time||'','Broadcast / Live',call,start,loc,'Broadcast']);
    rows.push([start,'','Strike / Load-Out','','',loc,'Strike / Load-Out']);
  }else{
    for(var i=0;i<days;i++){var dd=addDays(start,i);
      rows.push([dd,time||'','Show Day '+(i+1)+' — Broadcast',call,dd,loc,'Broadcast']);}
    rows.push([end||addDays(start,days-1),'','Strike / Load-Out','','',loc,'Strike / Load-Out']);
  }
  return rows;
}
/* reusable project-creation core — used by the modal AND the National Press Club intake */
function createProjectFromData(d){
  var title=museCleanName(d.name);var key=slugify(title);var base=key,n=2;while(productions[key]){key=base+n;n++;}
  productions[key]={name:title,customer:d.customer||'External Productions',tab:(title.length>16?title.slice(0,15)+'…':title),
    venue:d.venue||'Location TBD',date:d.date||'TBD',dateStart:d.dateStart||'',dateEnd:d.dateEnd||'',time:d.time||'',desc:d.desc||'',
    tag:d.tag||(title.length>20?title.slice(0,19)+'…':title),status:d.status||'Pre-Production',
    tagColor:d.tagColor||'blue',custom:true,thumb:d.thumb||null,foot:d.foot||'New production',
    version:'Rev 1.0 · Draft',editedBy:d.editedBy||'Lila Hart',lastEdited:nowStamp(),
    bottleneck:{label:'Setup',text:'All departments pending intake'},
    schedule:d.schedule||[],
    dept:DEPT_NAMES.map(function(nm){return [nm,"missing","—"];})};
  if(d.geo&&d.geo.length===2)productions[key].geo=d.geo;
  if(d.npcSource)productions[key].npcSource=d.npcSource;
  /* attach locations SYNCHRONOUSLY — the old setTimeout deferred them past the first
     render, so the venue map + live weather first painted empty on a brand-new project */
  if(d.locations&&d.locations.length){productions[key].locations=d.locations;projLoc[key]=d.locations[0].id;}
  order.push(key);
  try{if(typeof ensureFields==='function')ensureFields(productions[key]);}catch(e){}
  try{if(typeof ensureTB==='function')ensureTB(productions[key],key);}catch(e){}
  try{saveState();}catch(e){}
  try{if(typeof MuseKB!=='undefined'&&typeof MuseKB.seedShow==='function')MuseKB.seedShow(key,title||d.name,d.template);}catch(eKb){}
  renderAll();
  return key;
}
function deleteProject(key){if(!productions[key]||!productions[key].custom)return;
  if(!confirm('Delete “'+productions[key].name+'”? This cannot be undone.'))return;
  var nm=productions[key].name;
  /* v30 review fix: release everything the production held outside its DOM pane —
     detached audio players (they'd keep playing with no reachable controls), blob URLs,
     cached MapLibre instances (WebGL contexts are a finite resource), and shell sigs. */
  try{(productions[key].audioAssets||[]).forEach(function(a){audioStop(a.id);
    var rb=_audioBlobs[a.id];if(rb&&rb.url){try{URL.revokeObjectURL(rb.url);}catch(e){}}delete _audioBlobs[a.id];});}catch(e){}
  try{(productions[key].gfxAssets||[]).forEach(function(a){var rb=_gfxBlobs[a.id];
    if(rb){if(rb.url){try{URL.revokeObjectURL(rb.url);}catch(e){}}if(rb.srcUrl){try{URL.revokeObjectURL(rb.srcUrl);}catch(e){}}}
    delete _gfxBlobs[a.id];delete _gfxUi[a.id];});}catch(e){}
  try{if(typeof _liveMaps!=='undefined'){for(var mid in _liveMaps){if(mid.indexOf(key)>-1){try{_liveMaps[mid].map.remove();}catch(e){}delete _liveMaps[mid];}}}}catch(e){}
  try{if(typeof _mmaps!=='undefined'){for(var mid2 in _mmaps){if(mid2.indexOf(key)>-1){try{_mmaps[mid2].map.remove();}catch(e){}delete _mmaps[mid2];delete _mmapPins[mid2];}}}}catch(e){}
  try{if(typeof _shadeMaps!=='undefined'){for(var mid3 in _shadeMaps){if(mid3.indexOf(key)>-1){var SM3=_shadeMaps[mid3];try{if(SM3.timer)clearInterval(SM3.timer);}catch(e){}try{if(SM3.shade&&SM3.shade.remove)SM3.shade.remove();}catch(e){}try{if(SM3.map)SM3.map.remove();}catch(e){}delete _shadeMaps[mid3];}}}}catch(e){}
  try{if(typeof _projTabSig!=='undefined')delete _projTabSig[key];}catch(e){}
  delete productions[key];var i=order.indexOf(key);if(i>-1)order.splice(i,1);
  var pane=document.getElementById('view-'+key);if(pane)pane.parentNode.removeChild(pane);
  renderAll();switchView('dashboard');toast('“'+nm+'” deleted');
}

/* ===== PRODUCTION SCHEDULE EDITOR ===== */
var schedKey=null, schedDraft=[];
function openSchedule(key){schedKey=key;var p=ensureFields(productions[key]);
  schedDraft=p.schedule.map(function(r){return r.slice();});
  document.getElementById('schedTitle').textContent='Production Schedule — '+p.name;
  document.getElementById('sched_version').value=p.version||'';
  document.getElementById('sched_by').value=p.editedBy||'';
  document.getElementById('sched_edited').value=p.lastEdited||nowStamp();
  renderSchedRows();
  var m=document.getElementById('schedModal');m.style.display='flex';m.classList.remove('hidden');}
function closeSchedModal(){var m=document.getElementById('schedModal');m.style.display='none';m.classList.add('hidden');}
function setSched(ri,fi,v){if(schedDraft[ri])schedDraft[ri][fi]=v;}
function renderSchedRows(){var tb=document.getElementById('schedRows');
  if(!schedDraft.length){tb.innerHTML='<tr><td colspan="8" class="py-4 text-center text-gray-500 text-xs">No schedule rows yet — click “Add Row” to begin.</td></tr>';return;}
  var types=["Crew Call","Load In","Lunch / Meal","Break","Facilities / FAX","Broadcast","Strike / Load-Out"];
  function dateCell(ri,fi){var v=schedDraft[ri][fi]||'';var iso=toISO(v);
    if(iso||!v){return '<input type="date" value="'+iso+'" onchange="setSched('+ri+','+fi+',this.value)" class="w-full text-xs border border-gray-200 rounded px-1.5 py-1.5" style="outline:none">';}
    return '<input value="'+v.replace(/"/g,'&quot;')+'" oninput="setSched('+ri+','+fi+',this.value)" placeholder="date / range" class="w-full text-xs border border-gray-200 rounded px-2 py-1.5" style="outline:none">';}
  function timeCell(ri,fi){var v=schedDraft[ri][fi]||'';var tv=/^\d{1,2}:\d{2}$/.test(v)?(v.length===4?'0'+v:v):'';
    return '<input type="time" value="'+tv+'" onchange="setSched('+ri+','+fi+',this.value)" class="w-full text-xs border border-gray-200 rounded px-1.5 py-1.5" style="outline:none">';}
  tb.innerHTML=schedDraft.map(function(r,ri){
    var cur=r[6]||schedType(r);
    var typeSel='<td class="py-1 pr-2"><select onchange="setSched('+ri+',6,this.value)" class="w-full text-xs border border-gray-200 rounded px-1.5 py-1.5 bg-white" style="outline:none">'+types.map(function(t){return '<option value="'+t+'"'+(cur===t?' selected':'')+'>'+t+'</option>';}).join('')+'</select></td>';
    return '<tr>'+typeSel+
      '<td class="py-1 pr-2">'+dateCell(ri,0)+'</td>'+
      '<td class="py-1 pr-2">'+timeCell(ri,1)+'</td>'+
      '<td class="py-1 pr-2"><input value="'+(r[2]||'').replace(/"/g,'&quot;')+'" oninput="setSched('+ri+',2,this.value)" placeholder="Activity / milestone" class="w-full text-xs border border-gray-200 rounded px-2 py-1.5" style="outline:none"></td>'+
      '<td class="py-1 pr-2">'+timeCell(ri,3)+'</td>'+
      '<td class="py-1 pr-2">'+dateCell(ri,4)+'</td>'+
      '<td class="py-1 pr-2"><input value="'+(r[5]||'').replace(/"/g,'&quot;')+'" oninput="setSched('+ri+',5,this.value)" placeholder="Venue / location" class="w-full text-xs border border-gray-200 rounded px-2 py-1.5" style="outline:none"></td>'+
      '<td class="py-1 text-center"><button onclick="delSchedRow('+ri+')" class="text-red-500 hover:text-red-700 text-sm">✕</button></td></tr>';
  }).join('');
}
function addSchedRow(){schedDraft.push(["","","","","","","Crew Call"]);renderSchedRows();}
function delSchedRow(i){schedDraft.splice(i,1);renderSchedRows();}
function saveSchedule(){if(!schedKey)return;var p=productions[schedKey];
  p.schedule=schedDraft.filter(function(r){return r.some(function(c){return (c||'').trim();});}).map(function(r){return r.slice();});
  p.version=document.getElementById('sched_version').value||p.version;
  p.editedBy=document.getElementById('sched_by').value||p.editedBy;
  stampEdit(schedKey);
  closeSchedModal();renderAll();if(document.getElementById('view-'+schedKey))renderProjectView(schedKey);
  toast('Schedule saved for '+p.name);
}

/* ===== TECHBOOK PDF ===== */
/* standard 12-strand fiber color code → swatch colors for the Fiber Schedule */
var FIBER_HEX={
 "Blue":{bg:[37,99,235],tx:[255,255,255],css:"#0866ff",ctx:"#ffffff"},
 "Orange":{bg:[234,88,12],tx:[255,255,255],css:"#f5832a",ctx:"#ffffff"},
 "Green":{bg:[21,128,61],tx:[255,255,255],css:"#1e7b34",ctx:"#ffffff"},
 "Brown":{bg:[120,53,15],tx:[255,255,255],css:"#b24a00",ctx:"#ffffff"},
 "Slate":{bg:[71,85,105],tx:[255,255,255],css:"#4B4F56",ctx:"#ffffff"},
 "White":{bg:[241,245,249],tx:[31,41,55],css:"#f0f2f5",ctx:"#242526"},
 "Red":{bg:[220,38,38],tx:[255,255,255],css:"#e41e3f",ctx:"#ffffff"},
 "Black":{bg:[17,17,17],tx:[255,255,255],css:"#18191A",ctx:"#ffffff"},
 "Yellow":{bg:[250,204,21],tx:[60,40,0],css:"#f7b928",ctx:"#3a2c08"},
 "Violet":{bg:[124,58,237],tx:[255,255,255],css:"#0866ff",ctx:"#ffffff"},
 "Rose":{bg:[225,29,72],tx:[255,255,255],css:"#e41e3f",ctx:"#ffffff"},
 "Aqua":{bg:[6,182,212],tx:[255,255,255],css:"#0866ff",ctx:"#ffffff"}
};
var MUSE_SPECTRUM_SRC='assets/brand/meta-mark.svg';
/* Official spectrum viewBox 215.84 × 124.97 → aspect ~1.727 — never force square */
var MUSE_SPECTRUM_AR=290/191;
function spectrumPNG(cb){
  /* Rasterize assets/brand spectrum SVG → PNG for jsPDF.
     Fetch SVG text, force pixel width/height from viewBox (mm units / Image() natural size
     are unreliable and previously produced a blank/missing logo on the techbook cover). */
  function finishNull(){try{cb(null);}catch(e){}}
  function rasterSvgText(svgText){
    try{
      var vb=String(svgText).match(/viewBox\s*=\s*["']([^"']+)["']/i);
      var parts=vb?vb[1].trim().split(/[\s,]+/).map(parseFloat):[0,0,215.84,124.97];
      var vw=(parts[2]>0?parts[2]:215.84), vh=(parts[3]>0?parts[3]:124.97);
      MUSE_SPECTRUM_AR=vw/vh;
      var scale=4; /* crisp for PDF */
      var w=Math.max(2,Math.round(vw*scale)), h=Math.max(2,Math.round(vh*scale));
      var svg=String(svgText)
        .replace(/\swidth\s*=\s*["'][^"']*["']/i,'')
        .replace(/\sheight\s*=\s*["'][^"']*["']/i,'')
        .replace(/<svg\b/i,'<svg width="'+w+'" height="'+h+'" ');
      if(svg.indexOf('xmlns=')<0)svg=svg.replace(/<svg\b/i,'<svg xmlns="http://www.w3.org/2000/svg"');
      var url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
      var img=new Image();
      img.onload=function(){
        try{
          var cv=document.createElement('canvas');cv.width=w;cv.height=h;
          var ctx=cv.getContext('2d');
          ctx.clearRect(0,0,w,h);
          ctx.drawImage(img,0,0,w,h);
          cb(cv.toDataURL('image/png'),w,h);
        }catch(e){finishNull();}
      };
      img.onerror=function(){finishNull();};
      img.src=url;
    }catch(e){finishNull();}
  }
  var src=MUSE_SPECTRUM_SRC+(MUSE_SPECTRUM_SRC.indexOf('?')>=0?'&':'?')+'v=spectrum2';
  if(typeof fetch==='function'&&location.protocol.indexOf('http')===0){
    fetch(src,{cache:'force-cache'}).then(function(r){if(!r.ok)throw new Error('fetch');return r.text();})
      .then(rasterSvgText).catch(function(){
        /* last resort: Image element (may fail for mm-sized SVG) */
        var img=new Image();
        img.onload=function(){
          var nw=img.naturalWidth||img.width||216, nh=img.naturalHeight||img.height||125;
          if(!(nw>1&&nh>1)){nw=216;nh=125;}
          MUSE_SPECTRUM_AR=nw/nh;
          var sc=Math.min(480/nw,300/nh);
          var dw=Math.max(2,Math.round(nw*sc)), dh=Math.max(2,Math.round(nh*sc));
          try{
            var cv=document.createElement('canvas');cv.width=dw;cv.height=dh;
            cv.getContext('2d').drawImage(img,0,0,dw,dh);
            cb(cv.toDataURL('image/png'),dw,dh);
          }catch(e){finishNull();}
        };
        img.onerror=finishNull;img.src=src;
      });
  }else{
    /* file:// — try fetch relative then data-url path */
    try{
      var xhr=new XMLHttpRequest();
      xhr.open('GET',src,true);
      xhr.onload=function(){if(xhr.status===0||xhr.status===200)rasterSvgText(xhr.responseText);else finishNull();};
      xhr.onerror=finishNull;xhr.send();
    }catch(e){finishNull();}
  }
}
function mapPNG(seed,cb){
  var inner=projectMapSVG(seed); // returns a full <svg ...>...</svg>
  // wrap with explicit xmlns + size for rasterization
  var svg=inner.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" ');
  var img=new Image();
  try{var url='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));}catch(e){cb(null);return;}
  img.onload=function(){var cv=document.createElement('canvas');cv.width=1200;cv.height=750;var ctx=cv.getContext('2d');if(ctx.imageSmoothingQuality)ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,1200,750);try{cb(cv.toDataURL('image/png'));}catch(e){cb(null);}};
  img.onerror=function(){cb(null);};img.src=url;
}
/* ---- Techbook venue map ----
   WebGL canvas grabs often export as a solid black box (no preserveDrawingBuffer /
   offscreen MapLibre). Techbook always uses CARTO Voyager tile composite (same
   light basemap as project MAP mode) + red pin — reliable for PDF. */
function realMapPNG(lat,lng,zoom,w,h,cb){
  if(lat==null||lng==null||isNaN(lat)||isNaN(lng)){cb(null);return;}
  museStaticMap(lat,lng,{zoom:zoom||13,w:w||1200,h:h||675,scale:2,mode:'streets',forceLight:true},function(img){
    if(img)cb(img);else cb(null);
  });
}
/* resolve techbook venue map — always light Voyager (print-safe, never black box) */
function tbVenueMap(p,pkey,cb){
  var geo=(typeof projGeo==='function')?projGeo(p,pkey):null;
  var v=(typeof venueFor==='function')?venueFor(pkey):null;
  var lat=geo&&geo[0]!=null?geo[0]:(v&&v.lat);
  var lng=geo&&geo[1]!=null?geo[1]:(v&&v.lng);
  var z=(v&&v.zoom)?Math.max(12,Math.min(15,v.zoom)):13;
  if(lat==null||lng==null||isNaN(lat)||isNaN(lng)){mapPNG(p.venue||p.name,cb);return;}
  museStaticMap(lat,lng,{zoom:z,w:1200,h:675,scale:2,mode:'streets',forceLight:true},function(st){
    if(st)cb(st);else mapPNG(p.venue||p.name,cb);
  });
}
/* fetch live weather for the Techbook (uses cache if fresh; short timeout so export never hangs) */
function tbWeather(p,pkey,cb){
  try{var c=WX_CACHE[pkey];if(c&&c.data&&c.data.current&&(Date.now()-c.ts)<3600000){cb(c.data);return;}}catch(e){}
  var v=(typeof venueFor==='function')?venueFor(pkey):null;
  if(!v||v.lat==null||v.lng==null){cb(null);return;}
  var url=wxClient.forecastUrl('latitude='+v.lat+'&longitude='+v.lng+
    '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m'+
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max'+
    '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=6');
  var done=false;var t=setTimeout(function(){if(!done){done=true;cb(null);}},6000);
  fetch(url).then(function(r){return r.json();}).then(function(j){if(done)return;done=true;clearTimeout(t);
    try{WX_CACHE[pkey]={ts:Date.now(),data:j,error:null};}catch(e){}cb(j&&j.current?j:null);
  }).catch(function(){if(done)return;done=true;clearTimeout(t);cb(null);});
}
/* build a Techbook "Weather & Site Conditions" section object from Open-Meteo data */
function tbWeatherSection(p,wx){
  if(!wx||!wx.current)return null;
  var cur=wx.current,d=wx.daily;var ci=(typeof wxCodeInfo==='function')?wxCodeInfo(cur.weather_code):['—'];
  var curRows=[
    ["Conditions",ci[0]],
    ["Temperature",Math.round(cur.temperature_2m)+" F  (feels "+Math.round(cur.apparent_temperature)+" F)"],
    ["Wind",Math.round(cur.wind_speed_10m)+" mph"],
    ["Humidity",cur.relative_humidity_2m+" %"],
    ["Captured",(typeof nowStamp==='function'?nowStamp():'')]
  ];
  var fRows=[],sev=[];
  if(d&&d.time){for(var i=0;i<d.time.length&&i<6;i++){
    var di=(typeof wxCodeInfo==='function')?wxCodeInfo(d.weather_code[i]):['—'];
    var dt=new Date(d.time[i]+'T00:00');
    var lbl=dt.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
    fRows.push([lbl,di[0],Math.round(d.temperature_2m_max[i])+" F",Math.round(d.temperature_2m_min[i])+" F",(d.precipitation_probability_max[i]||0)+" %",Math.round(d.wind_speed_10m_max[i])+" mph"]);
    if((typeof wxSevere==='function')&&wxSevere(d.weather_code[i],d.wind_speed_10m_max[i],d.precipitation_probability_max[i])){
      sev.push([lbl,di[0]+" - winds to "+Math.round(d.wind_speed_10m_max[i])+" mph, "+(d.precipitation_probability_max[i]||0)+"% precip"]);
    }
  }}
  var blocks=[
    {sub:"Current Conditions at Venue",head:["Field","Detail"],rows:curRows},
    {sub:"6-Day Forecast",head:["Date","Conditions","High","Low","Precip","Max Wind"],rows:fRows}
  ];
  if(sev.length)blocks.push({sub:"Severe Weather Advisory - may impact outdoor production",head:["Date","Risk"],rows:sev});
  return {title:"Weather & Site Conditions",blocks:blocks};
}
/* shared: Master Schedule content (facility bookings + production milestone overview) */
function masterScheduleBlocks(){
  var fac=[
    ["PCR 1","Muse AI World Tour Tech Rehearsal","Mon–Tue","Compound"],
    ["PCR 1","Ray-Ban Meta Gen 3 Launch Setup","Fri–Sat","Compound"],
    ["PCR 4","Ray-Ban Meta Gen 3 Launch Remote Test","Mon–Wed","MPK"],
    ["PCR 4","Creator Week Cam Map","Sat–Sun","Route"],
    ["PCR 6","Muse AI Launchth GFX Build","Wed–Thu","Studio M1"],
    ["Studio M1","Muse AI Launchth Rehearsal","Thu–Sat","Meta NYC"],
    ["ACR 2","Calrec Artemis","Mon–Tue","Audio"],
    ["ACR 2","Mix Check","Fri","Audio"],
    ["REMI Bay","WhatsApp Summit Survey Calls","Tue–Fri","Multi-Market"]];
  var prod=order.map(function(k){var p=productions[k];var m=crewMilestones(p);
    return [p.name,p.customer||"—",m.loadin?fmtDate(m.loadin):"TBD",m.broadcast?fmtDate(m.broadcast):"TBD",m.strike?fmtDate(m.strike):"TBD"];});
  return [
    {sub:"Production Milestone Overview (cycle)",head:["Production","Client","Load-In","Broadcast","Strike"],rows:prod},
    {sub:"Facility & Control-Room Bookings · Week of Jun 2–8",head:["Room","Activity","Days","Location"],rows:fac}];
}
/* ============================================================================
   v31 PHASE 6 — EXPORT POLICY (serialization layer, not UI)
   Default: EVERY person appears in a full techbook export regardless of position.
   The only exemption is exportExempt, set by an admin at account creation.
   Independent of that, museRedactText strips anything that looks like a key or
   token from every exported cell — no UI toggle can turn that off.
   ==========================================================================*/
function tbExportExemptNames(){var ex={};try{personnelRoster().forEach(function(m){if(m.exportExempt)ex[m.name]=1;});}catch(e){}return ex;}
function tbApplyExportPolicy(secs){
  try{
    var ex=tbExportExemptNames();
    secs.forEach(function(sec){(sec.blocks||[]).forEach(function(b){
      if(!Array.isArray(b.rows))return;
      b.rows=b.rows.filter(function(row){
        if(!Array.isArray(row))return true;
        return !row.some(function(cell){return typeof cell==='string'&&ex[cell];});
      }).map(function(row){
        return Array.isArray(row)?row.map(function(cell){return typeof cell==='string'?museRedactText(cell):cell;}):row;
      });
    });});
  }catch(e){}
  return secs;}
function techbookSections(p){
  var pkey=Object.keys(productions).filter(function(k){return productions[k]===p;})[0];
  ensureFields(p);ensureTB(p,pkey);
  var s=p.tb;var c=countStatus(p);var pct=computePct(p);
  // field-getter: editable per-department dropdown value, falling back to a default
  function F(dept,fk,fb){var v=(p.tbFields&&p.tbFields[dept]&&p.tbFields[dept][fk]);if(Array.isArray(v))return v.length?v.join(' · '):fb;return (v&&(''+v).trim())?v:fb;}
  var ncam=Math.max(1,parseInt(F("Cameras / Video","count",s.cams),10)||4);
  var camShow=Math.min(ncam,16);
  var sections=[];
  function S(title,blocks){sections.push({title:title,blocks:blocks});}
  function B(sub,head,rows,kind){return {sub:sub,head:head,rows:rows,kind:kind};}

  // 1) LOCATIONS (page 2) — venue map, GPS, map links
  var geo=projGeo(p,pkey);var urls=mapUrls(p.venue||p.name,geo);
  sections.push({title:"Locations",venueMap:true,venue:p.venue||p.name,venueAddr:s.venueAddr,geo:geo,urls:urls,
    blocks:[
      B("Show Information",["Field","Detail"],[["Show",p.name],["Client / Division",p.customer||"—"],["Venue",p.venue||"—"],["Venue Address",s.venueAddr],["GPS Coordinates",geo?(geo[0].toFixed(4)+", "+geo[1].toFixed(4)):"Set in project"],["Target Air",p.date||"TBD"]]),
      B("Position Parking & Placement",["Position","Park Location"],[
        ["Broadcast Truck","Compound · Base"],["Equipment Truck","Compound · Base"],["Main Set","On-Set Position"],
        ["Tech World","On-Set Position"],["Production Office","Compound · Base"],["Talent Trailer","Compound · Base"],["Generator","Compound · Base"]])]});

  // 1b) SITE SURVEY — readiness, findings, power distribution, cable runs & security (from the Site Survey module)
  try{
    var sv=(typeof getSurvey==='function')?getSurvey(pkey):null;
    if(sv){
      var rd=(typeof surveyReadiness==='function')?surveyReadiness(pkey):null;
      var pw=(typeof ensurePower==='function')?ensurePower(sv):{distros:[],runs:[]};
      var scc=(typeof ensureSecurity==='function')?ensureSecurity(sv):{};
      var fnd=(typeof ensureFindings==='function')?ensureFindings(pkey):[];
      var svBlocks=[];
      svBlocks.push(B("Survey Readiness",["Field","Detail"],[
        ["Readiness",(rd?(rd.pct+"%  ("+rd.done+" / "+rd.total+" captured)"):"—")],
        ["Open Blockers",(rd?(''+rd.openBlockers):"—")],
        ["Open Hazards",(rd?(''+rd.openHazards):"—")],
        ["Address / Venue",(sv.address||p.venue||"—")],
        ["GPS",((sv.lat!=null&&sv.lng!=null)?(sv.lat.toFixed(5)+", "+sv.lng.toFixed(5)):"Not set")]
      ]));
      var fR=(fnd||[]).slice().sort(function(a,b){var o=(typeof SURV_SEV_ORDER!=='undefined')?SURV_SEV_ORDER:{danger:0,action:1,warning:2,caution:3,note:4,info:5};var ac=(a.status==='closed'||a.status==='resolved'),bc=(b.status==='closed'||b.status==='resolved');if(ac!==bc)return ac?1:-1;return (o[a.severity]!=null?o[a.severity]:9)-(o[b.severity]!=null?o[b.severity]:9);}).map(function(x){var sl=(typeof SURV_SEV!=='undefined'&&SURV_SEV[x.severity])?SURV_SEV[x.severity].l:(x.severity||'Note');var stl=(typeof SURV_STATUS!=='undefined'&&SURV_STATUS[x.status])?SURV_STATUS[x.status].l:((x.status==='resolved'||x.status==='closed')?'Closed':'Open');return [sl,(x.tags&&x.tags.length?x.tags.join(', '):'—'),x.text||'',(x.owner||x.by||'—'),stl];});
      if(fR.length)svBlocks.push(B("Survey Log & Findings",["Severity","Tags","Entry","Owner / By","Status"],fR));
      var dR=(pw.distros||[]).map(function(dd){return [dd.name||dd.id||'',(dd.src||'')+(dd.tieIn?' · '+dd.tieIn:''),(dd.svc||((dd.amps||'')+'A '+(dd.phase||'')+'φ')),String(dd.amps||dd.rating||''),(dd.redun||'—')+(dd.redunDetail?' — '+dd.redunDetail:''),dd.location||dd.loc||''];});
      if(dR.length)svBlocks.push(B("Power Distribution",["Source","Tie-in","Service","Amps","Redundancy","Location"],dR));
      var rR=(pw.runs||[]).map(function(rn){return [rn.label||rn.name||rn.id||'',rn.from||'',rn.to||'',rn.len||rn.length||'',rn.type||rn.cable||''];});
      if(rR.length)svBlocks.push(B("Cable Runs",["Run","From","To","Length","Type"],rR));
      var cR=((scc&&scc.contacts)||[]).map(function(cc){return [cc.name||'',cc.role||cc.title||'',cc.phone||''];});
      if(cR.length)svBlocks.push(B("Security — "+((scc&&scc.level)||'Standard'),["Contact","Role","Phone"],cR));
      /* v29 (Module 7): field crews see WHERE to enter and WHAT not to bring, straight from the Security tab */
      var ckR=((scc&&scc.checkpoints)||[]).map(function(ck){return [ck.name||'',ck.kind||'',(typeof ck.lat==='number'&&typeof ck.lng==='number')?(ck.lat.toFixed(5)+', '+ck.lng.toFixed(5)):'GPS TBD',ck.hours||'—',ck.notes||''];});
      if(ckR.length)svBlocks.push(B("Security Checkpoints & Entrances",["Checkpoint","Type","GPS","Hours","Notes"],ckR));
      if(scc&&scc.prohibited&&scc.prohibited.length)
        svBlocks.push(B("Prohibited Items — do not bring on site",["Items"],[[scc.prohibited.map(function(pi){return '🚫 '+(pi.label||'');}).join('    ')]]));
      var faR=[];
      if(scc&&scc.access)faR.push(["Access / Load-in",scc.access]);
      if(scc&&scc.badging)faR.push(["Credentialing",scc.badging]);
      if(scc&&scc.escort)faR.push(["Escort Requirements",scc.escort]);
      if(faR.length)svBlocks.push(B("Security — Field Access",["Field","Detail"],faR));
      
      /* v39: 360 broadcast planner markers → techbook */
      try{
        var pan=(typeof ensurePano==='function')?ensurePano(sv):sv.pano;
        if(pan&&pan.hotspots&&pan.hotspots.length){
          var pr=pan.hotspots.map(function(h,i){
            return [''+(i+1),h.kind||h.type||'pin',h.label||h.name||'—',h.note||h.notes||'—',
              (h.yaw!=null?('yaw '+Number(h.yaw).toFixed(1)+'°'):'—')];
          });
          svBlocks.push(B("360° Survey Markers ("+pan.hotspots.length+")",["#","Type","Label","Notes","Bearing"],pr));
        }
      }catch(e360){}
      if(svBlocks.length)S("Site Survey",svBlocks);
    }
  }catch(e){}

  // VENDORS — third-party rental contacts for quick reach (only if assigned)
  var pv=(p.vendors||[]);
  if(pv.length){
    var vrows=pv.map(function(e){var v=vendorById(e.id);if(!v)return null;
      var docs=(e.docs&&e.docs.length)?e.docs.map(function(d){return d.name;}).join(", "):"—";
      var coi=e.coiExpiry||'—';var cd=(typeof vendorCoiDays==='function')?vendorCoiDays(e.coiExpiry):null;
      if(cd!=null){if(cd<0)coi+=' EXPIRED';else if(cd<=30)coi+=' ('+cd+'d left)';}
      return [v.name+(v.category?"\n("+v.category+")":""),(v.contact||"")+(v.contactTitle?" · "+v.contactTitle:""),v.phone||"—",v.email||"—",v.afterHours||"—",coi,docs];
    }).filter(Boolean);
    var addrRows=pv.map(function(e){var v=vendorById(e.id);if(!v)return null;return [v.name,v.address||"—",v.pobox||"—",v.sales||"—"];}).filter(Boolean);
    sections.push({title:"Vendors — Third-Party Rentals",blocks:[
      B("Emergency / Quick Contact",["Vendor","Point of Contact","Phone","Email","After-Hours","COI expiry","Documents"],vrows),
      B("Addresses & Sales",["Vendor","Street Address","P.O. Box","Sales"],addrRows)]});
  }

  // SHOW BIBLE — Muse appendix: risk register, stream health, run of show (live data at export time)
  try{
    var bible=[];
    try{
      var bb=(typeof MuseShowCaller!=='undefined'&&MuseShowCaller.brief)?MuseShowCaller.brief(pkey):null;
      if(bb&&bb.risks&&bb.risks.length)bible.push(B("Risk Register — Muse Show Caller",["Level","Area","Risk","Sources"],
        bb.risks.slice(0,12).map(function(r){return [r.level.toUpperCase(),r.area,r.text,(r.sources||[]).join(' · ')];})));
      else bible.push(B("Risk Register — Muse Show Caller",["Level","Area","Risk","Sources"],[["—","—","No open risks at export time.","Show Caller"]]));
    }catch(eB1){}
    try{
      var hl=(typeof MuseStreaming!=='undefined'&&MuseStreaming.health)?MuseStreaming.health(pkey):null;
      if(hl)bible.push(B("Stream Health — Muse Streaming",["Field","At export"],
        [["Overall",hl.health||'-'],["Show state",hl.state||'-'],["Concurrent viewers",String(hl.viewers||0)],["Alerts",(hl.alerts&&hl.alerts.length)?hl.alerts.join('; '):"None"]]));
    }catch(eB2){}
    try{
      var bk=(typeof MuseSchedule!=='undefined'&&MuseSchedule.bookings)?MuseSchedule.bookings({prod:pkey}):[];
      if(bk&&bk.length)bible.push(B("Run of Show — Muse Schedule",["Start","End","Booking","Resource"],
        bk.slice(0,16).map(function(x){return [String(x.start||'').slice(0,16).replace('T',' '),String(x.end||'').slice(0,16).replace('T',' '),x.title||'',x.res||''];})));
    }catch(eB3){}
    bible.push(B("Comms Plan — Omni (Gmail & Slack)",["Channel","Home","Rule"],[
      ["Slack","#showcaller-demo","Approvals, executions and failures post here first (bot)."],
      ["Gmail","Show thread (Omni)","Vendor mail files into the same thread; re-sends keep the subject."],
      ["Intercom / Feed","Ops room","Live floor traffic; Muse watches for caption-borne calls."],
      ["Glasses","Muse on Ray-Ban Display","Heads-up tally mirrors the approved fix count."]
    ]));
    if(bible.length)sections.push({title:"Show Bible — Muse",blocks:bible});
  }catch(eBible){}

  // DEPARTMENT STATUS (status overview)
  S("Department Status — Production Areas",[B(null,["Department","Status","Notes / Detail"],
    p.dept.map(function(d){return [d[0],statusMap[d[1]].label,d[2]==='—'?'':d[2]];}))]);

  // DEPARTMENT CONFIGURATION — auto-generated from EVERY department & field (future-proof)
  var cfgBlocks=[];
  DEPT_NAMES.forEach(function(dep){
    var dfields=deptFields[dep]||[];var fvv=(p.tbFields&&p.tbFields[dep])||{};var crows=[];
    dfields.forEach(function(f){var ft=f[3]||(typeof f[2]==='string'?f[2]:'');if(ft==='header')return;
      var v=fvv[f[0]];
      if(f[0]==='rvon'||ft==='rvon'){v=(typeof rvonLabel==='function')?rvonLabel(p):'';if(v==='RVON — no channels')v='';} // v30: rvon entries are objects — summarized here, full table in its own section
      else if(Array.isArray(v))v=v.join(' · ');
      if(v&&(''+v).trim())crows.push([f[1],''+v]);});
    var eq=(p.tbEquip&&p.tbEquip[dep])||[];
    eq.forEach(function(ln){
      // v30 Module 10: scan IDs, serials, status and assignment travel into the Tech Book
      var idbits=[ln.scanid,(ln.serial?'SN '+ln.serial:''),ln.status,ln.loc].filter(Boolean).join(' · ');
      if(dep==='Cameras / Video'){if(ln.model||ln.lens||ln.ped||ln.notes){var det=[ln.lens,ln.ped,(ln.hood&&ln.hood.indexOf('none')<0?ln.hood:''),(ln.glass&&ln.glass.indexOf('none')<0?ln.glass:''),(ln.monitor&&ln.monitor.indexOf('none')<0?ln.monitor:''),(ln.smptelen?'SMPTE '+ln.smptelen:''),(ln.qty?'×'+ln.qty:''),(ln.notes&&ln.notes!=='—'?ln.notes:''),idbits].filter(Boolean).join(' · ');crows.push([(ln.model||'Camera'),det||'—']);}}
      else if(dep==='Lighting'&&(ln.ftype||ln.model||ln.watts)){crows.push([(ln.ftype||ln.model||'Fixture')+(ln.qty?' ×'+ln.qty:''),[
        (ln.ftype&&ln.model?ln.model:''),(ln.pos?'@ '+ln.pos:''),(ln.watts?ln.watts+' W each':''),(ln.gel&&ln.gel.indexOf('none')<0?ln.gel:''),(ln.dmx?'DMX '+ln.dmx:''),idbits].filter(Boolean).join(' · ')]);}
      else if(dep==='Talent / Production'&&ln.name){crows.push([ln.name+(ln.role?' — '+ln.role:''),[
        ln.micpack,(ln.calltime?'call '+ln.calltime:''),ln.position,ln.contact,ln.status].filter(Boolean).join(' · ')||'—']);}
      else{if(ln.item)crows.push([ln.item+(ln.qty?' ×'+ln.qty:''),[(ln.notes&&ln.notes!=='—'?ln.notes:''),idbits].filter(Boolean).join(' · ')]);}
    });
    if(crows.length)cfgBlocks.push(B(dep,["Field","Selection / Detail"],crows));
  });
  if(!cfgBlocks.length)cfgBlocks.push(B(null,["Field","Detail"],[["—","No department configuration entered yet"]]));
  S("Department Configuration — All Areas",cfgBlocks);

  // v30 Module 10: REPLAY — live from the Replay / EVS department tile
  try{var rp=(typeof replayGet==='function')?replayGet(p):null;
    if(rp&&(rp.channels.length||rp.clips.length)){
      var rblocks=[];
      if(rp.channels.length)rblocks.push(B("Channels / Servers",["Server","Ch","Mode","Camera / Source","Status"],rp.channels.map(function(c){return [c.server,c.ch,c.mode,c.camera||'—',c.status];})));
      if(rp.clips.length)rblocks.push(B("Clip Bin / Playlist",["#","Clip","Source","TC In","TC Out"],rp.clips.map(function(c,i){return [''+(i+1),c.name,c.src||'—',c.tin||'—',c.tout||'—'];})));
      rblocks.push(B("Multiviewer / Network / Storage",["Field","Detail"],[
        ["Multiviewer feeds",rp.mv.feeds.join(' · ')||'—'],
        ["Transport",rp.net.transport||'—'],["NMOS",rp.net.nmos||'—'],["PTP",(rp.net.ptp||'—')+(rp.net.gm?' · GM '+rp.net.gm:'')],
        ["Shared storage",rp.store.status+(rp.store.capTb?' · '+(rp.store.usedTb||'?')+' / '+rp.store.capTb+' TB':'')],
        ["Archive",rp.store.archive||'—']]));
      S("Replay",rblocks);}
  }catch(e){}
  // v30 Module 10: media QC — Muse-processed audio + GFX ingest / fill-matte tally
  try{if(p.audioAssets&&p.audioAssets.length)S("Audio Files — Muse-processed",[B(null,["File","Format","Duration","Size"],
    p.audioAssets.map(function(a){return [a.name,'PCM WAV · '+Math.round(a.sr/1000)+' kHz · '+(a.ch===1?'mono':a.ch===2?'stereo':a.ch+'ch'),audioFmtTime(a.dur),audioFmtBytes(a.bytes)];}))]);}catch(e){}
  try{if(p.gfxAssets&&p.gfxAssets.length&&typeof gfxTally==='function')S("Graphics QC",[B(null,["Asset","Resolution","Codec (declared)","Ingest","Alpha / key"],
    p.gfxAssets.map(function(a){var t=gfxTally(a);function lb(v){return v==='pass'?'GREEN':v==='fail'?'RED':'INCOMPLETE';}
      return [a.name,(a.w?a.w+'×'+a.h:'—'),(a.declared&&a.declared.codec)||'—',lb(t.pair?t.fillVerdict:t.ingestVerdict),lb(t.pair?t.matteVerdict:t.alphaVerdict)];}))]);}catch(e){}

  // TECHNICAL CREW SCHEDULE — Production Milestones first, then the schedule
  var cm=crewMilestones(p);
  var phaseLbls={start:"Start / Travel",loadin:"Load-In",camblock:"Camera Blocking",txcheck:"Transmission Check",rehearsal:"Rehearsal",broadcast:"Broadcast",strike:"Strike / Load-Out"};
  var msRows=["start","loadin","camblock","txcheck","rehearsal","broadcast","strike"].map(function(ph){return [phaseLbls[ph],cm[ph]?fmtDate(cm[ph]):"TBD"];});
  var srows=(p.schedule&&p.schedule.length)?p.schedule.map(function(r){return [schedType(r),fmtDate(r[0]),r[1]||'',r[2]||'',r[3]||'',fmtDate(r[4]),r[5]||''];}):[['—','TBD','—','Schedule not yet entered','—','—','—']];
  S("Technical Crew Schedule",[
    B("Production Milestones",["Milestone","Date"],msRows),
    B("Detailed Schedule",["Type","Date(s)","Time","Activity / Milestone","Crew Call","Broadcast","Location / Notes"],srows)]);

  // CREW SCHEDULE — per-role call matrix (bubbles, dated headers)
  var allCrewTB=CREW_FIELD.concat(CREW_IT,CREW_PCR,CREW_EXEC);
  function dlbl(ph){return cm[ph]?fmtDate(cm[ph]).replace(/, \d{4}/,''):'TBD';}
  var matHead=["Name","Position","Start\n"+dlbl('start'),"Load-In\n"+dlbl('loadin'),"Cam Block\n"+dlbl('camblock'),"TX Chk\n"+dlbl('txcheck'),"Rehrsl\n"+dlbl('rehearsal'),"B'cast\n"+dlbl('broadcast'),"Strike\n"+dlbl('strike')];
  var matRows=allCrewTB.map(function(mem){function mk(p2){return crewIsOn(p,mem.name,mem.pos,p2)?"1":"";}
    return [mem.name,mem.pos,mk("start"),mk("loadin"),mk("camblock"),mk("txcheck"),mk("rehearsal"),mk("broadcast"),mk("strike")];});
  S("Crew Schedule",[B("Personnel Call Matrix · click-built in app",matHead,matRows,"crewmatrix")]);

  // 5) CREW LIST
  S("Crew List",[
    B("Field & Technical Crew",["Position","Name","Provided By","Contact","On-Site"],[
      ["Tech Manager / EIC","Riley Stanton","Meta Field Ops","(212) 555-0101","Yes"],
      ["Production Manager","Alex Marlowe","Meta Live Events","(212) 561-0103","Yes"],
      ["EIC / Video Shader","Quinn Adler","Scripted","(212) 555-0104","Yes"],
      ["Transmission","Sam Okada","Meta Field Ops","(212) 557-0129","Yes"],
      ["Sat Operator / Driver","Chris Vega","Meta Field Ops","(212) 555-0131","Yes"],
      ["Audio Engineer","Noah Barrett","Meta Field Ops","(212) 556-0107","Yes"],
      ["A1","Drew Hale","Meta Live Production","—","Yes"],
      ["RF Tech / A2","Jordan Reyes","Meta Field Ops","(212) 556-0108","Yes"],
      ["Lighting Director","Harper Sloan","Meta Live Production","(212) 555-0109","Yes"],
      ["Lead Utility","Reese Callahan","Meta Field Ops","(212) 556-0110","Yes"],
      ["Utility","Eden Walsh","Scripted","(212) 555-0111","Yes"],
      ["Floor / Stage Manager","Jamie Calder","Mediapro","(212) 561-0112","Yes"],
      ["Hard Cam Op","Avery Nolan","Mediapro","(212) 561-0113","Yes"],
      ["Hard Cam Op","Jordan Lane","Mediapro","(212) 561-0114","Yes"],
      ["Hard Cam Op","Logan Pierce","Mediapro","(212) 561-0115","Yes"],
      ["Steadicam Op","Drew Lang","Mediapro","(212) 561-0116","Yes"],
      ["Jib Op","Skyler Boone","Mediapro","(212) 561-0117","Yes"]]),
    B("IT / Network & Engineering",["Position","Name","Provided By","Contact"],[
      ["Network Architect","Casey Whitaker","Muse Live","(212) 555-0120"],
      ["IT Networking Engineer","Parker Amestte","Muse Live","(212) 562-0121"],
      ["IT Client Services","Chris Dalton","Muse Live","(212) 563-0122"],
      ["Director of Engineering","Micah Trent","Mediapro","—"],
      ["Engineering Manager","Morgan Pryce","Mediapro","(212) 561-0123"]]),
    B("PCR / Control Room Crew",["Position","Name","Provided By","Contact"],[
      ["Show Director","Taylor Grayson","Meta Live Production","(212) 556-0124"],
      ["Technical Director","Sam Ellison","Meta Live Production","ext. 4401"],
      ["PCR Tech Manager","Rowan Blake","Meta Live Production","(212) 555-0125"],
      ["Graphics Operator","Sasha Keene","Meta Live Production","(212) 555-0126"],
      ["Replay Operator","Shay Donovan","Meta Live Production","ext. 4414"],
      ["Teleprompter Operator","Remy Colton","Meta Live Production","(212) 556-0127"]]),
    B("Production & Executive",["Position","Name","Provided By","Contact"],[
      ["VP, Technical Production","Lila Hart","Muse Live","—"],
      ["VP Live Production & Partnerships","Finley Brooks","Mediapro","—"],
      ["Dir. Live Production & XR","Lee Ashford","Mediapro","(954) 555-0128"]])]);

  // 5) PACK LIST — comprehensive & categorized, driven by editable gear fields
  var camM=F("Cameras / Video","model",s.camModel),lensM=F("Cameras / Video","lens",s.lens),cfgM=F("Cameras / Video","config","Studio · Vinten Vector 750"),
      consoleM=F("Audio","console",s.console),micM=F("Audio","mics",s.micModel),micModelSel=F("Audio","micmodel",s.micModel||"DPA 4066"),ifbM=F("Audio","ifb",s.ifb),rvonM=rvonLabel(p),
      intercomM=F("Comms & IFB","intercom",s.intercom),beltM=F("Comms & IFB","beltpacks","Riedel Bolero"),comsBkM=F("Comms & IFB","backup","RTS ADAM"),
      rfMicM=F("RF / Wireless Mics","mics",s.rfMic),transportM=F("Transmission / Signal","transport",s.transport),fmtM=F("Transmission / Signal","format","SMPTE 2110");
  var peds=Math.max(1,Math.ceil(ncam/2)),jibs=(/jib/i.test(cfgM)?1:Math.max(1,Math.floor(ncam/4))),hosts=4,bp=Math.max(8,Math.ceil(ncam*0.9));
  var fiberReels=Math.max(3,Math.ceil(ncam/4));
  // aggregate any line-item equipment the manager entered across all departments
  var entered=[];
  if(p.tbEquip){Object.keys(p.tbEquip).forEach(function(dep){(p.tbEquip[dep]||[]).forEach(function(ln){
    if(dep==='Cameras / Video'){if(ln.model||ln.lens||ln.ped)entered.push([ln.qty||1,ln.model||"Camera",[ln.lens,ln.ped].filter(Boolean).join(' · ')||"—",dep]);}
    else{if(ln.item)entered.push([ln.qty||1,ln.item,ln.notes||"—",dep]);}
  });});}
  var enteredBlock=entered.length?[B("Production-Specific Equipment (entered)",["Qty","Item","Detail","Category"],entered)]:[];
  S("Pack List",enteredBlock.concat([
    B("Camera Package",["Qty","Manufacturer","Description","Provided By"],[
      [ncam,camM.split(' ')[0],camM+" camera channel","Scripted"],
      [ncam,"Canon",lensM+" lens","Scripted"],
      [ncam,"Panasonic","Vinten Vector 750","Field Ops"],
      [ncam,"Panasonic","Sony HDVF-EL30","Field Ops"],
      [peds,"Vinten Vector 750","Vinten Vector 750","Field Ops"],
      [jibs,"Jib","Jimmy Jib Triangle","Field Ops"],
      [ncam,"Autoscript","Autoscript LED 17","Field Ops"],
      [ncam,"AJA","Evertz 7707 fiber Tx","Field Ops"],
      [Math.ceil(ncam*1.5),"AJA","Evertz 7707 fiber Tx/Rx","Field Ops"]]),
    B("Audio Package",["Qty","Manufacturer","Description","Provided By"],[
      [1,"Console",consoleM,"Tech Prod"],
      [2,"Custom","Calrec Hydra2","Field Ops"],
      [1,"Sennheiser",rfMicM+" wireless mic kit","Field Ops"],
      [Math.max(6,Math.ceil(ncam)),micModelSel.split(' ')[0],micModelSel+" — lav / handheld capsule","Field Ops"],
      [1,"RODE",micM+" hardwire mic kit","Field Ops"],
      [1,"Sennheiser",ifbM+" wireless IFB kit","Field Ops"],
      [hosts+1,"Sennheiser","RTS IFB-325 + RM-325","Field Ops"],
      [1,"Glensound","Live-Link / RVON kit ("+rvonM+")","Field Ops"],
      [2,"QSC","d&b audiotechnik M4","Field Ops"]]),
    B("Comms Package",["Qty","Manufacturer","Description","Provided By"],[
      [1,"Intercom",intercomM,"Field Ops"],
      [bp,"RTS ADAM",beltM+" belt pack","Field Ops"],
      [1,"RTS ADAM",comsBkM+" (backup intercom)","Field Ops"],
      ["TBD","Custom","Shure UA874","Field Ops"],
      [1,"Custom","Neutrik NYS-SPP-L1 patchbay","Field Ops"],
      [6,"Riedel","Clear-Com FreeSpeak II","Field Ops"]]),
    B("Transmission & Signal",["Qty","Manufacturer","Description","Provided By"],[
      [fiberReels,"Cable","Camplex TAC-12 reel","Field Ops"],
      [2,"Cable","Camplex TAC-12 reel","Field Ops"],
      [ncam+2,"Cable","SMPTE 311M hybrid fiber","Field Ops"],
      [2,"Encoder",fmtM+" encoder ("+transportM+")","Field Ops"],
      [1,"LiveU LU800 / Sat","LiveU LU800","Field Ops"],
      [2,"Cisco","Cisco Catalyst 9300 + Cisco 9130AX","Field Ops"]]),
    B("Monitors & Racks",["Qty","Manufacturer","Description","Provided By"],[
      [2,"Sony PVM-X2400","Sony PVM-X2400","Field Ops"],
      [2,"TVLogic LUM-310R","TVLogic LUM-310R","Field Ops"],
      [2,"Gator","SKB 6U shock rack","Field Ops"],
      [1,"Custom","TVLogic LUM-310R quad","Field Ops"]]),
    B("Power & Support",["Qty","Manufacturer","Description","Provided By"],[
      [2,"APC","Smart-UPS SRT 8kVA","Field Ops"],
      [1,"Custom","Motion Laboratories 400A distro","Field Ops"],
      ["ALL","Custom","Yellow Jacket cable ramp","Field Ops"],
      [2,"Eurmax","Losberger 10x10 canopy","Field Ops"],
      [3,"RocknRoller","Magliner senior cart","Field Ops"],
      [1,"Custom","Pelican 1650","Field Ops"],
      [1,"Custom","Furman P-8 PRO C","Field Ops"],
      [1,"Custom","Pelican 1510","Field Ops"],
      [1,"Custom","Petrol rain cover","Field Ops"]])]));

  // 6) POWER DISTRIBUTION
  var pwrSrc=F("Power / Electrical","source","House Power + Generator"),pwrDistro=F("Power / Electrical","distro","Motion Laboratories 400A distro"),pwrUps=F("Power / Electrical","ups","APC Smart-UPS SRT 8kVA");
  S("Power Distribution",[
    B("Power Source",["Field","Detail"],[["Primary",pwrSrc],["Distribution",pwrDistro],["UPS",pwrUps]]),
    B("Distribution",["User","Location","Power Required","Source","Distro","Notes"],[
      ["Broadcast Truck","Compound",pwrDistro,pwrSrc,"Cam-Lock","Primary"],
      ["Main Set (Lighting & Tech)","Set","125V 2-Phase 100A","House","Cam-Lock → Lunch Box",pwrUps],
      ["RF / Comms World","Set","120V 20A","House","Edison","UPS protected"]])]);

  // 7) CABLING — fiber runs, SMPTE, and a full copper cable summary
  var cn=camShow;
  S("Cabling",[
    B("Fiber Cable Runs (TAC-12)",["Cable #","Description","Type","Length","Start","End"],[
      ["Fiber 100","Video Main","TAC-12",s.fiberLen,"Salon / MDF","Tech World Position"],
      ["Fiber 101","Video Back-Up","TAC-12",s.fiberLen,"Salon / MDF","Tech World Position"],
      ["Fiber 102","Evertz 7707 fiber Rx","TAC-12",s.fiberLen,"Fiber 100/101","Evertz 7707 fiber Rx"],
      ["Fiber 103","SAT TX / IT","TAC-12",s.fiberLen,"Salon / MDF","Tech World Position"],
      ["Fiber 104","Audio Main","TAC-12",s.fiberLen,"Salon / MDF","Tech World Position"],
      ["Fiber 105","Audio Back-Up","TAC-12",s.fiberLen,"Salon / MDF","Tech World Position"],
      ["Fiber 106","Utility / PTZ","TAC-12",s.fiberLen,"Tech World","PTZ Cam Position"]]),
    B("SMPTE Cable Runs",["Cable #","Description","Type","Length","Start","End"],
      Array.from({length:cn},function(_,i){return ["CAM "+(i+1),"Camera "+(i+1),"SMPTE","150 ft","Set Shed #"+(i+1),"CCU "+(i+1)];})),
    B("Copper Cable Summary — Monitors & Returns",["Cable #","Description","Type","Length","Start","End"],[
      ["MON-01","VCO Monitor","Coax","50 ft","Evertz EQX 32×32 DEST 106","VCO MON"],
      ["MON-02","EIC Monitor","Coax","50 ft","Evertz EQX 32×32 DEST 104","EIC MON"],
      ["MON-03","Audio Engineer Monitor","Coax","50 ft","Evertz EQX 32×32 DEST 108","A-ENG MON"],
      ["MON-04","TM Monitor 1/2","Coax","50 ft","Evertz EQX 32×32 DEST 105/111","TM MON"],
      ["MON-05","Set Monitor 1–4","Coax","100 ft","Evertz 7707 fiber Tx–4","SET MON"],
      ["MON-06","Talent Area Monitor 1/2","Coax","100 ft","Evertz 7707 fiber Tx–6","TALENT MON"],
      ["MON-07","Tech Area Monitor 1/2","Coax","50 ft","Evertz 7707 fiber Tx–8","TECH MON"],
      ["MON-08","LD Monitor","Coax","50 ft","Evertz 7707 fiber Tx","LD MON"]]),
    B("Copper Cable Summary — CCU, Encoders & Data",["Cable #","Description","Type","Length","Start","End"],[
      ["CCU 1–"+cn,"CCU returns","Coax","50 ft","Evertz EQX 32×32 SRC 1–"+cn,"CCU 1–"+cn],
      ["ENC 1–8","Harmonic XOS feeds","Coax","15 ft","Evertz EQX 32×32 DEST 1–8","Harmonic XOS"],
      ["DEC 1–6","Harmonic XOS returns","Coax","15 ft","Evertz EQX 32×32 SRC 17–22","Harmonic XOS"],
      ["BF IN 1–10","Evertz 7707 fiber Rx","Coax","15 ft","Evertz EQX 32×32 DEST 31–40","Evertz 7707 fiber Rx"],
      ["BF OUT 1–10","Evertz 7707 fiber Tx","Coax","15 ft","Evertz EQX 32×32 SRC 31–40","Evertz 7707 fiber Tx"],
      ["DATA 1–4","Data drops","Cat 5E","50 ft","Telmex / MCM Rack","Flypack SW 1/2"]])]);

  // 8) FIBER SCHEDULE — live TIA-598-C strands from Transmission tile (p.fiber / fiberLoc)
  try{
    var fiberBlocks=[];
    function fiberRowsFrom(f){
      if(!f||!f.strands||!f.strands.length)return [];
      return f.strands.slice().sort(function(a,b){
        var ta=(a.trunk||''),tb=(b.trunk||'');if(ta!==tb)return ta<tb?-1:1;
        return (parseInt(a.pos,10)||0)-(parseInt(b.pos,10)||0);
      }).map(function(x){
        var col=(typeof fiberTia==='function')?fiberTia(x.pos)[0]:('#'+(x.pos||''));
        var tlab='';
        if(f.trunks){for(var ti=0;ti<f.trunks.length;ti++)if(f.trunks[ti].id===x.trunk){tlab=f.trunks[ti].label||f.trunks[ti].cable||'';break;}}
        return [tlab||'—',String(x.pos||''),col,x.path||'—',x.from||'—',x.to||'—',x.conn||'—',
          (x.signal&&String(x.signal).indexOf('unassigned')<0?x.signal:'—'),x.len||'—',x.status||'—',x.loss||'—',x.cadRef||'—'];
      });
    }
    var headF=["Trunk","#","TIA colour","A/B","From","To","Connector","Signal","Len","Status","Loss dB","CAD link"];
    if(typeof hasLocs==='function'&&hasLocs(pkey)&&p.fiberLoc){
      locsOf(pkey).forEach(function(L){
        var rows=fiberRowsFrom(p.fiberLoc[L.id]);
        if(rows.length)fiberBlocks.push(B((L.flag||'📍')+' '+(L.name||L.id)+' — Fiber plant',headF,rows));
      });
    }else{
      var fLive=(typeof fiberGet==='function')?fiberGet(p):p.fiber;
      var rows1=fiberRowsFrom(fLive);
      if(rows1.length)fiberBlocks.push(B('Operational fiber schedule (TIA-598-C)',headF,rows1));
    }
    if(!fiberBlocks.length){
      var COLORS=["Blue","Orange","Green","Brown","Slate","White","Red","Black","Yellow","Violet","Rose","Aqua"];
      function fiberRun(map){return COLORS.map(function(col,i){var m=map[i]||["",""];return [col,i+1,m[1]||"",m[0]||"—","Meta Fiber"];});}
      var mainMap=[];for(var fi=0;fi<cn&&fi<6;fi++){mainMap[fi*2]=["CCU "+(fi+1)+"A","TX"];mainMap[fi*2+1]=["CCU "+(fi+1)+"B","RX"];}
      mainMap[8]=mainMap[8]||["Evertz 7707 fiber Rx","TX"];mainMap[9]=mainMap[9]||["Evertz 7707 fiber Rx","RX"];
      fiberBlocks.push(B("Schematic placeholder — author live strands under Transmission → Fiber Schedule",
        ["Color","Strand","Direction","Description","Patch"],fiberRun(mainMap)));
    }
    S("Fiber Schedule",fiberBlocks);
  }catch(eFib){S("Fiber Schedule",[B("Fiber",["Note"],[["Build the live schedule under Transmission / Signal → Fiber Schedule"]])]);}

  // 9) TERMINAL EQUIPMENT — detailed routing (Ross Evertz EQX 32×32 / RTS ADAM / Calrec Hydra2)
  S("Terminal Equipment",[
    B("Set · Audio Stage Rack / Node A ("+F("Audio","console",s.console)+")",["Connection","Description","Patch"],[
      ["OUT CH 1–4","Set Monitor 1–4 (routable)","Calrec Hydra2 OUT 1–4"],
      ["OUT CH 5–6","Tech Area Monitor 1–2","Calrec Hydra2 OUT 5–6"],
      ["OUT CH 7–8","Talent Area Monitor 1–2","Calrec Hydra2 OUT 7–8"],
      ["OUT CH 9","LD Monitor (RTR panel)","Calrec Hydra2 OUT 9"],
      ["IN CH 1–10","RF Mic RX 1–10","Calrec Hydra2 IN 1–10"],
      ["IN CH 11–16","Hardwire Mic 1–6","Calrec Hydra2 IN 11–16"],
      ["OUT 1–8","IFB 1–8","Calrec Hydra2 OUT 1–8"],
      ["NETWORK 1","PTZ control","Truck Network"],
      ["NETWORK 2","LD RTR panel","Truck Network"]]),
    B("Routing & Encode (Evertz EQX 32×32 / Appear)",["Connection","Description","Patch"],[
      ["SAT ENC 1–4","Camera 1–4 → encoder","Harmonic XOS"],
      ["IRD 1","Decoder / return","Harmonic XOS"],
      ["Sync / Ref","Clock & sync","Leader LT4610"],
      ["Tally","Tally interface","TSL · "+F("Engineering / CAD","sync","Leader LT4610")]])]);

  // 10) CAMERA BREAKDOWN — per-camera mount, config & lens variety
  var camModelF=F("Cameras / Video","model",s.camModel),lensF=F("Cameras / Video","lens",s.lens),cfgF=F("Cameras / Video","config","Studio pedestal · Vinten Vector 750");
  function camMount(i,n){ // sensible rig variety across the complement
    if(i===n-1&&n>=6)return["Grass Valley LDX 86N","PTZ rig","Fujinon UA107x8.4","—"];
    if(i===n-2&&n>=7)return["Sony HDC-P31","Spy / POV rig","Wide-angle (POV)","—"];
    if(i===3&&n>=5)return[camModelF,"Steadicam","Canon CJ45ex9.7B","Steadi"];
    if(i===4&&n>=5)return[camModelF,"Jib 9 ft","Canon CJ45ex9.7B","Jib"];
    return[camModelF,(i%2?"Studio tripod":"Studio pedestal"),lensF,"Ped"];
  }
  var camRows=[];var camLines=(p.tbEquip&&p.tbEquip["Cameras / Video"])||[];camLines=camLines.filter(function(l){return l.model||l.lens||l.ped;});
  var camTitle;
  if(camLines.length){ // build from the manager's entered cameras (each line × qty)
    var n=1;camLines.forEach(function(l){var q=Math.max(1,parseInt(l.qty,10)||1);for(var j=0;j<q;j++){
      var isPTZ=/ptz|fr-?7|robo|spy/i.test((l.model||'')+(l.ped||''));
      camRows.push([n,l.model||"Camera",l.ped||"Studio",l.ped||"—",l.lens||"—",isPTZ?"No":"Yes","Shed "+n,"CCU "+n,"PGM 01"]);n++;}});
    camTitle=(n-1)+" Camera Channels · Remote Production Tally (entered)";
    S("Camera Breakdown",[B(camTitle,["Cam","Type","Configuration","Mount","Lens","Prompter","Shed","CCU #","Return"],camRows)]);
  } else {
    for(var ci=0;ci<camShow;ci++){var m=camMount(ci,camShow);
      camRows.push([ci+1,m[0],m[1],m[3],m[2],(m[1].indexOf('PTZ')<0&&m[1].indexOf('Spy')<0)?"Yes":"No","Shed "+(ci+1),"CCU "+(ci+1),"PGM 01"]);}
    var camNote=ncam>camShow?[B(null,["Note"],[[ "+ "+(ncam-camShow)+" additional camera channels in full deployment ("+ncam+" total)"]])]:[];
    S("Camera Breakdown",[B(ncam+" Camera Channels · Remote Production Tally",["Cam","Type","Configuration","Mount","Lens","Prompter","Shed","CCU #","Return"],camRows)].concat(camNote));
  }

  // 11) MONITORS
  S("Monitors",[B("Host Position Monitors",["Location","Size","Mount","Feed"],[
    ["Tech World",'17"',"Stand","Lighting RTR"],["Tech World",'17"',"Stand","Audio"],
    ["Production World",'40"',"Floor Stand","Return / PGM"],["Main Set",'40"',"Floor Stand","Vanity Return"]])]);

  // 12) RF FREQUENCY REQUEST
  var rfMicF=F("RF / Wireless Mics","mics",s.rfMic),rfBand=F("RF / Wireless Mics","band","470–616 MHz"),ifbF=F("Audio","ifb",s.ifb);
  var rfMicQty=Math.min(Math.max(8,Math.ceil(ncam*0.8)),16);
  S("RF Frequency Request",[
    B("Audio RF · Coordination: "+F("RF / Wireless Mics","coord","In progress"),["Description","Equipment","Qty","Frequency Band"],[
      ["RF Microphones",rfMicF,rfMicQty,rfBand],
      ["RF IFB",ifbF,8,"940–960 MHz"],
      ["RF Intercom","Riedel Bolero",10,"1.9 GHz"],
      ["RF Intercom","Riedel Bolero",10,"2.4 GHz"]]),
    B("Data RF",["Description","Equipment","Qty","Frequency Band"],[
      ["Wi-Fi","Cisco Catalyst 9130AX",2,"2.4 / 5 GHz"]])]);

  // 13) AUDIO DEPLOYMENT
  var micF=F("Audio","mics",s.micModel);var adRows=[];var nHost=4,nGuest=4;
  for(var hi=1;hi<=nHost;hi++)adRows.push(["Host "+hi,"RF-"+hi,micF,"RIO IN-"+hi,"Wireless"]);
  for(var gi=1;gi<=nGuest;gi++)adRows.push(["Guest "+gi,"RF-"+(nHost+gi),micF,"RIO IN-"+(nHost+gi),"Wireless"]);
  adRows.push(["HW B/U Host Mic 1","HW-1","Sennheiser MD 46","RIO IN-9","Hardwire backup"]);
  adRows.push(["HW B/U Host Mic 2","HW-2","Sennheiser MD 46","RIO IN-10","Hardwire backup"]);
  S("Audio Deployment",[B("Host Position · Console: "+F("Audio","console",s.console),["Position","Mic #","Mic Type","Patch","Notes"],adRows)]);

  // 14) AUDIO MAPPING
  var mapF=F("Audio","mapping","FS1 / FS2 / FS3 standard");
  S("Audio Mapping",[B(mapF,["Audio Ch","FS 1 (Cam 1)","FS 2 (Cam 2)","FS 3 (Cam 3)"],[
    ["1","Host 1","Host 1","Host 1"],["2","Host 2","Host 2","Host 2"],["3","Host 3","Host 3","Host 3"],
    ["4","Host 4","Host 4","Host 4"],["5","Guest 1","Guest 1","Guest 1"],["6","Guest 2","Guest 2","Guest 2"],
    ["7","Guest 3","Crash Mix L","Guest 3"],["8","Guest 4","Crash Mix R","Guest 4"]])]);

  // 15) COMS DEPLOYMENT
  var intercomF=F("Comms & IFB","intercom",s.intercom),beltF=F("Comms & IFB","beltpacks","Riedel Bolero"),comsBackup=F("Comms & IFB","backup","RTS ADAM");
  var ifbHW=F("Audio","ifb",s.ifb);
  S("Coms Deployment",[
    B("Intercom Schedule · System: "+intercomF,["Description","Location","Channels","Equipment","Notes"],[
      ["Truck TM","Compound","All","Clear-Com FreeSpeak II","Hardwire"],["Truck EIC","Compound","All","Clear-Com FreeSpeak II","Hardwire"],
      ["Truck VCO","Compound","Cameras / Tech PL","Clear-Com FreeSpeak II","Hardwire"],["Truck Producer","Compound","All","Clear-Com FreeSpeak II","Hardwire"],
      ["RF Tech","Tech World","Audio-Tech-Cam-Prod",beltF+" #1","Wireless"],
      ["A2","Main Set","Audio-Tech-Cam-Prod",beltF+" #2","Wireless"],
      ["Producer #1","Main Set","Prod-Cam",beltF+" #3","Wireless"],
      ["Stage Manager","Main Set","Prod-Cam",beltF+" #5","Wireless"],
      ["Lighting Director","Tech World","Tech-Cam-Prod",beltF+" #6","Wireless"],
      ["Backup","Set","All",comsBackup,"Redundant"]]),
    B("Onsite IFB Hardware · "+ifbHW,["Description","Location","Mix","Equipment","Notes"],[
      ["Host 1 IFB","Main Set","Local Mics + RVON",ifbHW+" #1","Dual RTS IFB-325"],
      ["Host 2 IFB","Main Set","Local Mics + RVON",ifbHW+" #2","Dual RTS IFB-325"],
      ["Host 3 IFB","Main Set","Local Mics + RVON",ifbHW+" #3","Dual RTS IFB-325"],
      ["Program","Main Set","PGM","QSC","Monitor"],
      ["Host B/U","Main Set","Local Mics + RVON","RTS RM-325","Dual RTS IFB-325"]])]);

  // 16) INTERCOM & ALPHAS (RVON) — v30: entries carry required IFB/PL type + assigned person
  S("Intercom & Alphas (RVON)",[
    (function(){var aa=rvonArr(p).filter(function(e){return e.a;});
      var rows=aa.length?aa.map(function(e,i){return ["Ch "+(i+1),e.a,e.t||'—',e.p||'—',rvonAlphaRole(e.a)];})
        :[["Ch 1","HST1","IFB","—","Host 1 IFB"],["Ch 2","HST2","IFB","—","Host 2 IFB"],["Ch 3","CAM1","PL","—","Camera PL"],["Ch 4","PROD","PL","—","Producer PL"],["Ch 5","TECH","PL","—","Tech PL"]];
      return B("RVON · "+rvonLabel(p),["RVON Ch","Alpha","IFB / PL","Assigned To","Feed / Assignment"],rows);})(),
    B("Backup Telco Comms",["Feed Description","Type","Dial-in"],[
      ["Host All-Call IFB","Analog IFB 1","(786) 585-9801"],["Spare","Analog IFB 2","(786) 585-9802"],
      ["Cam PL","TIF-1","(786) 585-9841"],["Prod PL","TIF-2","(786) 585-9842"]])]);

  // 17) NETWORKING & IT
  S("Networking & IT",[B(null,["Requirement","Bandwidth","Hand-off","Location","Provided By"],[
    ["Public DHCP","500 Mbps","RJ45","Truck BSP LAN 1",p.venue||"Venue"],
    ["Public DHCP","500 Mbps","RJ45","Truck BSP LAN 2",p.venue||"Venue"],
    ["Meta Corp","Varies","Wi-Fi","Compound Loop","Meta Truck WAP"],
    ["Meta Corp","Varies","Wi-Fi","Set / Cabanas","Meta Truck"]])]);

  // 18) TRANSMISSION
  var bcDates=(p.schedule||[]).filter(function(r){return (r[4]||'').trim()&&r[4]!=='—';});
  var txWindows=bcDates.length?bcDates.map(function(r){return [r[0]||'TBD',r[4]];}):[[p.date||"TBD","Broadcast window TBD"]];
  S("Transmission",[
    B("TX Windows",["Date","TX Window (Local)"],txWindows),
    B("Feeds · "+F("Transmission / Signal","transport",s.transport)+"  ·  "+F("Transmission / Signal","format","SMPTE 2110"),["Feed","Description","Remote Location","Via","TC Path","RS"],
      Array.from({length:Math.min(camShow,4)},function(_,i){return ["Harmonic XOS "+(i+1),"Camera "+(i+1),"Truck "+(i+1),"IP Harmonic XOS","TC"+(i+1),"RS 0"+(i+2)];})
      .concat([["Backup Path",F("Transmission / Signal","backup","Satellite (SES-1)"),"Truck Enc 1","Sat / LiveU LU800","RX 19","RS 06"]])),
    B("Satellite Parameters & Bookings",["Booking ID","Satellite","UL Freq","DL Freq","FEC","Symbol Rate"],[
      ["413920","SES-1 @ 101W","14,117.000 / V","11,817.000 / H","3/4","4.6"],
      ["413921","SES-1 @ 101W","14,117.000 / V","11,817.000 / H","3/4","4.6"]])]);

  /* Wave C: Broadcast Ops plan-of-record (signal path · power · RF · sat · go/no-go · REMI) */
  try{
    if(typeof MuseBOps!=='undefined'&&MuseBOps.techbookSections){
      var _boSecs=MuseBOps.techbookSections(p,pkey);
      if(_boSecs&&_boSecs.length)_boSecs.forEach(function(sec){sections.push(sec);});
    }
  }catch(eBo){}

  if(typeof MuseLive!=='undefined')MuseLive.techbookSections(p,pkey).forEach(function(s){sections.push(s);});
  return tbApplyExportPolicy(sections);
}

/* ===== SCHEDULE BOOK (master + crew schedule, styled like the techbook) ===== */
function scheduleSections(p){
  function B(sub,head,rows,kind){return {sub:sub,head:head,rows:rows,kind:kind};}
  var out=[];
  out.push({title:"Master Schedule",blocks:masterScheduleBlocks()});
  var srows=(p.schedule&&p.schedule.length)?p.schedule.map(function(r){return [schedType(r),fmtDate(r[0]),r[1]||'',r[2]||'',r[3]||'',fmtDate(r[4]),r[5]||''];}):[['—','TBD','—','No schedule entered','—','—','—']];
  out.push({title:"Technical Crew Schedule",blocks:[B(null,["Type","Date(s)","Time","Activity / Milestone","Crew Call","Broadcast","Location / Notes"],srows)]});
  var cm=crewMilestones(p);var lbl={start:"Start / Travel",loadin:"Load-In",camblock:"Camera Blocking",txcheck:"Transmission Check",rehearsal:"Rehearsal",broadcast:"Broadcast",strike:"Strike / Load-Out"};
  var msRows=["start","loadin","camblock","txcheck","rehearsal","broadcast","strike"].map(function(ph){return [lbl[ph],cm[ph]?fmtDate(cm[ph]):"TBD"];});
  var allCrew=CREW_FIELD.concat(CREW_IT,CREW_PCR,CREW_EXEC);
  function dl(ph){return cm[ph]?fmtDate(cm[ph]).replace(/, \d{4}/,''):'TBD';}
  var mHead=["Name","Position","Start\n"+dl('start'),"Load-In\n"+dl('loadin'),"Cam Block\n"+dl('camblock'),"TX Chk\n"+dl('txcheck'),"Rehrsl\n"+dl('rehearsal'),"B'cast\n"+dl('broadcast'),"Strike\n"+dl('strike')];
  var matRows=allCrew.map(function(mem){function mk(x){return crewIsOn(p,mem.name,mem.pos,x)?"1":"";}
    return [mem.name,mem.pos,mk("start"),mk("loadin"),mk("camblock"),mk("txcheck"),mk("rehearsal"),mk("broadcast"),mk("strike")];});
  out.push({title:"Crew Schedule",blocks:[
    B("Production Milestones",["Milestone","Date"],msRows),
    B("Personnel Call Matrix",mHead,matRows,"crewmatrix")]});
  var grp=[["Field & Technical Crew",CREW_FIELD],["IT / Network & Engineering",CREW_IT],["PCR / Control Room Crew",CREW_PCR],["Production & Executive",CREW_EXEC]];
  out.push({title:"Crew List & Contacts",blocks:grp.map(function(g){return B(g[0],["Position","Name","Email","Phone"],g[1].map(function(m){return [m.pos,m.name,m.email||"—",m.phone||"—"];}));})});
  return tbApplyExportPolicy(out);
}
function downloadScheduleBook(key){key=key||schedKey;var p=productions[key];if(!p){toast('Open a production first');return;}
  var secs=scheduleSections(p);
  try{ if(typeof planScheduleSections==='function') secs=secs.concat(planScheduleSections(key)); }catch(e){}
  downloadTechbook(key,{titleLabel:'CREW & MASTER SCHEDULE',fileTag:'Schedule_Book',toastLabel:'Schedule Book',sections:secs});}

/* Inter TTF for jsPDF — same family as the UI (variable Inter on screen, static TTF in PDF). */
var _museInterVfs=null;
function museBufToB64(buf){
  var u=new Uint8Array(buf),s='',i,CHUNK=0x8000;
  for(i=0;i<u.length;i+=CHUNK)s+=String.fromCharCode.apply(null,u.subarray(i,i+CHUNK));
  return btoa(s);
}
function museLoadInterVfs(){
  if(_museInterVfs)return Promise.resolve(_museInterVfs);
  var base='assets/fonts/';
  return Promise.all([
    fetch(base+'Inter-Regular.ttf').then(function(r){if(!r.ok)throw new Error('Inter regular');return r.arrayBuffer();}),
    fetch(base+'Inter-Bold.ttf').then(function(r){if(!r.ok)throw new Error('Inter bold');return r.arrayBuffer();})
  ]).then(function(bufs){
    _museInterVfs={regular:museBufToB64(bufs[0]),bold:museBufToB64(bufs[1])};
    try{museInstallJsPdfInter();}catch(eI){}
    return _museInterVfs;
  });
}
function musePdfBindInter(doc){
  if(!doc||doc._museInterBound||!_museInterVfs)return;
  try{
    doc.addFileToVFS('Inter-Regular.ttf',_museInterVfs.regular);
    doc.addFileToVFS('Inter-Bold.ttf',_museInterVfs.bold);
    doc.addFont('Inter-Regular.ttf','Inter','normal');
    doc.addFont('Inter-Bold.ttf','Inter','bold');
    doc._museInterBound=true;
    var orig=doc.setFont.bind(doc);
    doc.setFont=function(family,style){
      var st=(style==='bold'||style==='bolditalic')?'bold':'normal';
      return orig('Inter',st);
    };
    if(doc.autoTable){
      var _at=doc.autoTable.bind(doc);
      doc.autoTable=function(opt){
        opt=opt||{};
        opt.styles=opt.styles||{};opt.styles.font='Inter';
        opt.headStyles=opt.headStyles||{};opt.headStyles.font=opt.headStyles.font||'Inter';
        return _at(opt);
      };
    }
    doc.setFont('Inter','normal');
  }catch(e){}
}
function museInstallJsPdfInter(){
  if(!window.jspdf||!window.jspdf.jsPDF||window.jspdf.jsPDF.__museInterWrap)return;
  var Orig=window.jspdf.jsPDF;
  function Wrapped(a,b,c){
    var doc=new Orig(a,b,c);
    try{musePdfBindInter(doc);}catch(e){}
    return doc;
  }
  Wrapped.__museInterWrap=true;
  Wrapped.API=Orig.API;
  window.jspdf.jsPDF=Wrapped;
}
try{window.museLoadInterVfs=museLoadInterVfs;window.musePdfBindInter=musePdfBindInter;}catch(eW){}

function downloadTechbook(key,opts){
  /* Broadcast Ops contributes techbook sections — make sure it has loaded (it is lazy) */
  if(typeof MuseBOps==='undefined'&&typeof MuseLazy!=='undefined'&&MuseLazy.ensureBOps&&!(opts&&opts._bopsTried)){
    var _o=Object.assign({},opts||{},{_bopsTried:true});
    MuseLazy.ensureBOps().then(function(){downloadTechbook(key,_o);},function(){downloadTechbook(key,_o);});return;}
  key=key||schedKey;var p=productions[key];if(!p){toast('Open a production first');return;}
  opts=opts||{};if(opts.productionSnapshot)p=Object.assign({},p,opts.productionSnapshot);var TBLABEL=opts.titleLabel||'PRODUCTION TECHBOOK · LIVE DATA';var TBTAG=opts.fileTag||'Techbook';
  ensureFields(p);ensureTB(p,key);
  /* Wave C: surface techbook diff count before export */
  try{if(typeof MuseBOps!=='undefined'&&MuseBOps.techbookDiff){var _td=MuseBOps.techbookDiff(key);if(_td.hasSnap&&_td.count)toast(_td.count+' field change(s) since last export — capturing new baseline…');}}catch(eTd){}
  function _tbSnap(){if(opts.frozen)return;try{if(typeof MuseBOps!=='undefined'&&MuseBOps.recordTechbookExport)MuseBOps.recordTechbookExport(key);}catch(eSnap){}}
  function _tbExportBody(){
  if(!(window.jspdf&&window.jspdf.jsPDF)){printTechbook(p,opts);return;}
  toast('Building '+(opts.toastLabel||'Techbook')+' from live data for '+p.name+'…');
  /* Record the baseline only once PDF generation succeeds. */
  spectrumPNG(function(logo){
    tbVenueMap(p,key,function(venueMapImg){
    tbWeather(p,key,function(wx){
    try{
      var jsPDF=window.jspdf.jsPDF;var doc=new jsPDF({unit:'pt',format:'a4'});
      try{musePdfBindInter(doc);}catch(eFi){}
      // ---- plain text for the PDF core fonts (arrows, dashes, etc. otherwise mangle) ----
      function pdfSafe(s){if(s==null)return s;if(typeof s!=='string')s=''+s;
        return s
          .replace(/[\u2192\u279C\u27A1\u2794]/g,'>')   // → ➜ ➡ ➔  →  >
          .replace(/[\u2190]/g,'<')                        // ←
          .replace(/[\u2197\u2191]/g,'^')                  // ↗ ↑  (link arrow)
          .replace(/[\u2198\u2193]/g,'v')                  // ↘ ↓
          .replace(/[\u2194\u2195]/g,'-')                  // ↔ ↕
          .replace(/[\u00D7]/g,'x')                        // ×  ->  x
          .replace(/[\u2013\u2014\u2012\u2212]/g,'-')      // – — ‒ −  ->  -
          .replace(/[\u2022\u2027]/g,'\u00B7')             // • ‧  -> · (middle dot, Latin-1 OK)
          .replace(/[\u2018\u2019\u201B]/g,"'")            // ‘ ’ ‛
          .replace(/[\u201C\u201D]/g,'"')                  // “ ”
          .replace(/[\u2026]/g,'...')                       // …
          .replace(/[\u2122]/g,'(TM)').replace(/[\u00AE]/g,'(R)').replace(/[\u00A9]/g,'(C)')
          .replace(/[\u2009\u200A\u202F\u00A0]/g,' ')      // thin/nbsp spaces
          .replace(/[\u2032]/g,"'").replace(/[\u2033]/g,'"') // prime marks
          .replace(/↺/g,'(reset)')
          .replace(/[\u2030-\uFFFF]/g,'');                  // strip any other exotic glyphs
      }
      // wrap text APIs so everything written is plain text
      var _text=doc.text.bind(doc);doc.text=function(t,x,y,o){if(Array.isArray(t))t=t.map(pdfSafe);else t=pdfSafe(t);return _text(t,x,y,o);};
      if(doc.textWithLink){var _twl=doc.textWithLink.bind(doc);doc.textWithLink=function(t,x,y,o){return _twl(pdfSafe(t),x,y,o);};}
      var _at=doc.autoTable.bind(doc);doc.autoTable=function(opt){
        if(opt){if(opt.head)opt.head=opt.head.map(function(r){return r.map(pdfSafe);});
          if(opt.body)opt.body=opt.body.map(function(r){return r.map(pdfSafe);});}
        return _at(opt);};
      var W=doc.internal.pageSize.getWidth();var H=doc.internal.pageSize.getHeight();var c=countStatus(p);var pct=computePct(p);
      var SEG=[[0,100,224],[0,102,226],[0,104,227],[0,106,229],[0,108,231],[0,110,233],[0,112,234],[0,114,236],[0,115,238],[0,117,240],[0,119,241],[0,121,243],[0,123,245],[0,125,247],[0,127,248],[0,129,250],[0,132,251],[0,136,251],[0,140,252],[0,144,252],[0,149,252],[0,153,252],[0,157,253],[0,161,253],[0,165,253],[0,169,253],[0,173,254],[0,177,254],[0,182,254],[0,186,254],[0,190,255],[0,194,255]];

      // ---- PAGE 1: light title block (no full-page cover); the first section follows on the same page ----
      var ar=(typeof MUSE_SPECTRUM_AR==='number'&&MUSE_SPECTRUM_AR>0.8)?MUSE_SPECTRUM_AR:(290/191);
      doc.setFillColor(255,255,255);doc.rect(0,0,W,H,'F');
      var sw=W/SEG.length;for(var i=0;i<SEG.length;i++){doc.setFillColor(SEG[i][0],SEG[i][1],SEG[i][2]);doc.rect(i*sw,0,sw,4,'F');}
      var ty=44,lx=40;
      if(logo){try{var lw=46,lh=Math.round(46/ar);doc.addImage(logo,'PNG',lx,ty,lw,lh);lx+=lw+12;}catch(eLogo){logo=null;}}
      doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(101,103,107);
      doc.text(pdfSafe('Muse Live  ·  Technical book  ·  '+TBLABEL),lx,ty+12);
      doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(138,141,145);
      doc.text(pdfSafe('Generated '+nowStamp()),lx,ty+24);
      ty+=70;
      doc.setFont('helvetica','bold');doc.setFontSize(24);doc.setTextColor(5,5,5);
      var nameLines=doc.splitTextToSize(pdfSafe(p.name||'Production'),W-80);doc.text(nameLines,40,ty);ty+=nameLines.length*27;
      if(p.venue){doc.setFont('helvetica','normal');doc.setFontSize(11);doc.setTextColor(75,79,86);
        var vLines=doc.splitTextToSize(pdfSafe(p.venue),W-80);doc.text(vLines,40,ty);ty+=vLines.length*14+6;}
      var metas=[['Client',p.customer||'Unassigned'],['Event date',p.date||'TBD'],['Version',p.version||'Rev 1.0'],['Last edited',(p.lastEdited||nowStamp())+' · '+(p.editedBy||'—')]];
      var colW=(W-80)/metas.length;ty+=10;
      metas.forEach(function(m,mi){var x=40+mi*colW;
        doc.setFont('helvetica','bold');doc.setFontSize(7.5);doc.setTextColor(101,103,107);doc.text(pdfSafe(m[0]),x,ty);
        doc.setFont('helvetica','normal');doc.setFontSize(9.5);doc.setTextColor(5,5,5);doc.text(doc.splitTextToSize(pdfSafe(m[1]),colW-10),x,ty+13);});
      ty+=40;
      var pcol=pct>=90?[30,123,52]:pct>=40?[178,107,0]:[179,18,46];
      doc.setFillColor(240,242,245);doc.roundedRect(40,ty-13,W-80,24,6,6,'F');
      doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(pcol[0],pcol[1],pcol[2]);
      doc.text(pdfSafe(pct+'% complete'),52,ty+3);
      doc.setFont('helvetica','normal');doc.setTextColor(75,79,86);
      doc.text(pdfSafe(c.approved+' approved  ·  '+c.pending+' pending  ·  '+c.missing+' missing'),140,ty+3);
      ty+=34;
      var firstSectionY=ty;

      // ---- SECTIONS ----
      var secs=(opts.sections)?opts.sections:techbookSections(p);
      if(!opts.sections){try{var wsec=tbWeatherSection(p,wx);if(wsec)secs.splice(Math.min(1,secs.length),0,wsec);}catch(e){}}
      for(var si=0;si<secs.length;si++){
        var sec=secs[si];var y=92;
        if(si===0){ /* first section shares page 1 with the title block */
          doc.setDrawColor(228,230,235);doc.setLineWidth(0.6);doc.line(40,firstSectionY-12,W-40,firstSectionY-12);
          doc.setFont('helvetica','bold');doc.setFontSize(13);doc.setTextColor(5,5,5);doc.text(pdfSafe(sec.title),40,firstSectionY+8);
          doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(138,141,145);doc.text('Section 1 / '+secs.length,W-40,firstSectionY+8,{align:'right'});
          y=firstSectionY+28;
        }else{doc.addPage();sectionHeader(doc,W,sec.title,p,si+1,secs.length);}
        if(sec.venueMap){
          // venue name
          doc.setFont('helvetica','bold');doc.setFontSize(16);doc.setTextColor(24,25,26);
          var vnLines=doc.splitTextToSize(sec.venue||'Venue',W-80);doc.text(vnLines,40,y+4);y+=vnLines.length*18+2;
          doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(101,103,107);
          doc.text(sec.venueAddr||'',40,y);y+=14;
          // map image (full width) — 16:9 matches MapLibre snapshot / project page crop
          var mw=W-80, mh=Math.round(mw*9/16);
          if(venueMapImg){
            try{
              /* JPEG data URLs from museStaticMap; format string must match or jsPDF paints black */
              var fmt=(/^data:image\/jpe?g/i.test(venueMapImg)||venueMapImg.indexOf('/9j/')>0)?'JPEG':'PNG';
              doc.addImage(venueMapImg,fmt,40,y,mw,mh,undefined,'NONE');
            }catch(eImg){
              try{doc.addImage(venueMapImg,'JPEG',40,y,mw,mh);}catch(e2){
                try{doc.addImage(venueMapImg,'PNG',40,y,mw,mh);}catch(e3){}}
            }
            doc.setDrawColor(206,208,212);doc.setLineWidth(0.6);doc.rect(40,y,mw,mh);
          }else{doc.setFillColor(228,230,235);doc.rect(40,y,mw,mh,'F');}
          y+=mh+16;
          // GPS + links row
          doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(138,141,145);doc.text('GPS COORDINATES',40,y,{charSpace:1.2});
          doc.setFont('helvetica','normal');doc.setFontSize(11);doc.setTextColor(28,30,33);
          doc.text(sec.geo?(sec.geo[0].toFixed(5)+', '+sec.geo[1].toFixed(5)):'Set in project',40,y+15);
          doc.setFontSize(10);doc.setTextColor(8,102,255);
          doc.textWithLink('Open in Maps  >',W-220,y,{url:sec.urls.google});
          doc.setTextColor(24,25,26);
          doc.textWithLink('Open in Apple Maps  >',W-220,y+16,{url:sec.urls.apple});
          y+=34;
        }
        for(var bi=0;bi<sec.blocks.length;bi++){
          var blk=sec.blocks[bi];
          if(blk.sub){doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(62,64,66);doc.text(blk.sub,40,y+4);y+=12;}
          var isKV=(blk.head.length===2&&blk.head[0]==='Field');var isStatus=(sec.title.indexOf('Department Status')===0);var isFiber=(blk.head[0]==='Color');var isMatrix=(blk.kind==='crewmatrix');
          var MPC=[[8,102,255],[247,185,40],[10,88,202],[245,131,42],[49,162,76],[228,30,63],[101,103,107]]; // phase RGB bubbles
          var mCols={0:{cellWidth:78,fontStyle:'bold'},1:{cellWidth:74,textColor:[101,103,107]},2:{cellWidth:44,halign:'center'},3:{cellWidth:44,halign:'center'},4:{cellWidth:48,halign:'center'},5:{cellWidth:44,halign:'center'},6:{cellWidth:46,halign:'center'},7:{cellWidth:46,halign:'center'},8:{cellWidth:44,halign:'center'}};
          doc.autoTable({startY:y,head:[blk.head],body:blk.rows,theme:'grid',
            headStyles:{fillColor:[231,243,255],textColor:[5,5,5],fontSize:isMatrix?6.5:7.5,halign:isMatrix?'center':'left',cellPadding:isMatrix?2:4},
            bodyStyles:{fontSize:isMatrix?6.5:7.5,textColor:[36,37,38],valign:'middle',cellPadding:isMatrix?2:4},
            alternateRowStyles:{fillColor:[247,248,250]},
            styles:{lineColor:[228,230,235],lineWidth:0.5,overflow:'linebreak'},
            margin:{left:40,right:40},
            columnStyles:isKV?{0:{cellWidth:130,fontStyle:'bold',fillColor:[240,242,245]}}:(isFiber?{0:{cellWidth:64,fontStyle:'bold'},1:{cellWidth:36,halign:'center'},2:{cellWidth:54}}:(isMatrix?mCols:{})),
            didParseCell:function(data){
              if(isStatus&&data.section==='body'&&data.column.index===1){var v=(data.cell.raw||'').toString().toLowerCase();
                if(v==='approved'){data.cell.styles.fillColor=[230,244,234];data.cell.styles.textColor=[30,123,52];}
                else if(v==='pending'){data.cell.styles.fillColor=[254,246,224];data.cell.styles.textColor=[178,74,0];}
                else if(v==='missing'){data.cell.styles.fillColor=[253,231,234];data.cell.styles.textColor=[179,18,46];}
                data.cell.styles.fontStyle='bold';}
              if(isFiber&&data.section==='body'&&data.column.index===0){var fh=FIBER_HEX[(data.cell.raw||'').toString()];
                if(fh){data.cell.styles.fillColor=fh.bg;data.cell.styles.textColor=fh.tx;data.cell.styles.fontStyle='bold';}}
              if(isMatrix&&data.section==='body'&&data.column.index>=2){var col=MPC[data.column.index-2];
                if((data.cell.raw||'')==='1'&&col){data.cell.styles.fillColor=col;}
                data.cell.text=[''];}}
          });
          y=doc.lastAutoTable.finalY+16;
        }
      }

      // footers
      var pages=doc.internal.getNumberOfPages();
      for(var pg=2;pg<=pages;pg++){doc.setPage(pg);doc.setFontSize(7);doc.setTextColor(138,141,145);
        doc.text('Muse Live · LIVE DATA EXPORT · Confidential · '+(p.version||''),40,H-18);
        doc.text(p.name+'  ·  Page '+pg+' of '+pages,W-40,H-18,{align:'right'});}

      var _tbName='Muse_Live_'+TBTAG+'_'+(p.name||'Production').replace(/[^a-z0-9]+/gi,'_')+'.pdf';
      if(opts.onPdf)opts.onPdf(doc,_tbName,pages);else doc.save(_tbName);
      _tbSnap();
      toast('Live techbook PDF ('+pages+' pages) for '+p.name+' — reflects current production data');
    }catch(e){toast('Using print export instead…');printTechbook(p,opts);}
    });
    });
  });
  } /* end _tbExportBody */
  function _tbGo(){museLoadInterVfs().then(_tbExportBody).catch(_tbExportBody);}
  if(window.jspdf&&window.jspdf.jsPDF){_tbGo();return;}
  if(typeof MuseLazy!=='undefined'&&MuseLazy.ensurePdf){
    toast('Loading PDF engine…');
    MuseLazy.ensurePdf().then(_tbGo).catch(function(){printTechbook(p,opts);});
    return;
  }
  _tbGo();
}

/* ===== PRINT-BASED TECHBOOK (no CDN — always works; Save as PDF) ===== */
function txt(s){return s==null?'':''+s;}
/* Show names reach many templates (some unescaped) and other browsers via MuseSync: markup characters never belong in one. */
function museCleanName(s){return String(s==null?'':s).replace(/[<>`]/g,'').replace(/'/g,'\u2019').replace(/"/g,'\u201D').trim();}
function spectrumSVGmarkup(sz,bodyFill){
  /* Official Muse Live Spectrum from assets/brand — natural aspect (~1.727:1) */
  var ar=(typeof MUSE_SPECTRUM_AR==='number'&&MUSE_SPECTRUM_AR>0.8)?MUSE_SPECTRUM_AR:(290/191);
  var w=sz||150,h=Math.round(w/ar);
  return '<img src="assets/brand/meta-mark.svg" alt="Meta" width="'+w+'" height="'+h+'" style="width:'+w+'px;height:'+h+'px;object-fit:contain;object-position:center;display:block;margin:0 auto" />';
}
function techbookHTML(p,opts){opts=opts||{};
  var c=countStatus(p);var pct=computePct(p);var secs=opts.sections||techbookSections(p);
  var TBLABEL=opts.titleLabel||'PRODUCTION TECHBOOK · LIVE DATA';
  var pcol=pct>=90?'#1E7B34':pct>=40?'#f5832a':'#e41e3f';
  var bar='<div class="pkbar"><i style="background:linear-gradient(90deg,#0064E0,#0082FB,#00C2FF)"></i></div>';
  var sections=secs.map(function(sec,si){
    var blocks=sec.blocks.map(function(blk){
      var isStatus=sec.title.indexOf('Department Status')===0;
      var isKV=(blk.head.length===2&&blk.head[0]==='Field');var isFiber=(blk.head[0]==='Color');var isMatrix=(blk.kind==='crewmatrix');
      var MPCcss=['#0866ff','#f5832a','#0866ff','#0866ff','#0a58ca','#e41e3f','#65676b'];
      var thead='<tr>'+blk.head.map(function(h){return '<th'+(isMatrix?' style="text-align:center;white-space:pre-line"':'')+'>'+esc(h)+'</th>';}).join('')+'</tr>';
      var tbody=blk.rows.map(function(r){
        return '<tr>'+r.map(function(cell,ci){
          var cls='',sty='';
          if(isKV&&ci===0)cls=' class="kv"';
          if(isStatus&&ci===1){var v=(''+cell).toLowerCase();cls=' class="st-'+(v==='approved'?'a':v==='pending'?'p':v==='missing'?'m':'x')+'"';}
          if(isFiber&&ci===0){var fh=FIBER_HEX[(''+cell)];if(fh)sty=' style="background:'+fh.css+';color:'+fh.ctx+';font-weight:700"';}
          if(isMatrix&&ci>=2){var col=MPCcss[ci-2];var on=(''+cell)==='1';return '<td style="text-align:center">'+(on?'<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:'+col+'"></span>':'')+'</td>';}
          return '<td'+cls+sty+'>'+esc(cell)+'</td>';
        }).join('')+'</tr>';
      }).join('');
      return (blk.sub?'<div class="subt">'+esc(blk.sub)+'</div>':'')+'<table'+(isMatrix?' style="font-size:7.5px"':'')+'>'+thead+tbody+'</table>';
    }).join('');
    var mapBlock='';
    if(sec.venueMap){
      mapBlock='<div style="margin:0 40px 4px"><div style="font-size:18px;font-weight:800;color:#18191A">'+esc(sec.venue)+'</div><div style="font-size:9px;color:#65676B;margin-top:2px">'+esc(sec.venueAddr||'')+'</div></div>'+
        '<div style="margin:8px 40px 0;border-radius:8px;overflow:hidden;border:1px solid #e4e6eb;height:230px">'+projectMapSVG(sec.venue||p.name)+'</div>'+
        '<div style="margin:8px 40px 0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">'+
          '<div><div style="font-size:8px;font-weight:700;letter-spacing:1px;color:#b0b3b8">GPS COORDINATES</div><div style="font-size:11px;color:#1c1e21;font-family:monospace">'+(sec.geo?(sec.geo[0].toFixed(5)+', '+sec.geo[1].toFixed(5)):'Set in project')+'</div></div>'+
          '<div style="text-align:right;font-size:10px">'+
            '<a href="'+sec.urls.google+'" target="_blank" style="color:#0866ff;text-decoration:none;font-weight:600;display:block">Open in Maps ↗</a>'+
            '<a href="'+sec.urls.apple+'" target="_blank" style="color:#18191A;text-decoration:none;font-weight:600;display:block;margin-top:3px">Open in Apple Maps ↗</a>'+
          '</div></div>';
    }
    return '<section class="pg"><div class="sechead">'+bar+'<div class="sh-row"><h2>'+esc(sec.title)+'</h2><span class="sh-idx">SECTION '+(si+1)+' / '+secs.length+'</span></div><p>'+esc(p.name)+'  ·  '+esc(p.customer||'')+'  ·  LIVE DATA</p></div>'+mapBlock+blocks+'<div class="foot">Muse Live · LIVE DATA EXPORT · Confidential · '+esc(p.version||'')+'<span>'+esc(p.name)+'</span></div></section>';
  }).join('');
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Muse Live Techbook (live) — '+esc(p.name)+'</title><style>'+
    '@page{size:A4;margin:0;}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'+
    'body{margin:0;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#242526;}'+
    '.pkbar{display:flex;height:7px;width:100%;}.pkbar i{flex:1;display:block;}'+
    '.title{background:#18191A;color:#ffffff;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;page-break-after:always;position:relative;padding:48px 56px 56px;}'+
    '.title .pkbar{position:absolute;left:0;right:0;}.title .top{top:0;}.title .bot{bottom:0;}'+
    '.title .pk-logo{display:flex;justify-content:center;align-items:center;width:100%;margin:0 0 20px;}'+
    '.title .pk-logo img{display:block;width:150px;height:auto;max-width:42%;object-fit:contain;margin:0 auto;}'+
    '.title .nm{font-size:28px;font-weight:800;margin:14px 0 6px;line-height:1.2;max-width:520px;text-align:center;}'+
    '.title .vn{font-size:13px;color:#ced0d4;margin-bottom:6px;max-width:480px;text-align:center;}'+
    '.title .brand{font-size:14px;font-weight:700;letter-spacing:0.22em;margin-top:0;text-align:center;width:100%;}'+
    '.title .sub{font-size:9px;color:#8A8D91;letter-spacing:0.08em;margin-top:8px;text-align:center;width:100%;}'+
    '.title hr{width:180px;border:none;border-top:1px solid #3e4042;margin:16px auto;}'+
    '.title .ml{font-size:8px;color:#8A8D91;letter-spacing:0.14em;margin-top:18px;font-weight:700;}'+
    '.title .mv{font-size:12px;color:#f0f2f5;margin-top:5px;line-height:1.35;max-width:460px;}'+
    'section.pg{page-break-before:always;padding:0 0 40px;position:relative;min-height:100vh;}'+
    '.sechead{background:#18191A;color:#ffffff;padding:14px 40px 10px;position:relative;}'+
    '.sechead .pkbar{position:absolute;left:0;right:0;bottom:0;height:3px;}'+
    '.sh-row{display:flex;justify-content:space-between;align-items:baseline;}'+
    '.sechead h2{font-size:15px;margin:0;font-weight:800;}'+
    '.sh-idx{font-size:8px;color:#8a8d91;letter-spacing:1px;}'+
    '.sechead p{font-size:8px;color:#b0b3b8;margin:4px 0 0;}'+
    '.subt{font-weight:700;font-size:10px;color:#3e4042;margin:16px 40px 6px;}'+
    'table{border-collapse:collapse;width:calc(100% - 80px);margin:8px 40px 0;font-size:8.5px;}'+
    'th{background:#18191A;color:#ffffff;text-align:left;padding:5px 6px;font-size:8px;font-weight:700;}'+
    'td{border:0.5px solid #e4e6eb;padding:5px 6px;vertical-align:top;color:#242526;}'+
    'tr:nth-child(even) td{background:#f7f8fa;}'+
    'td.kv{font-weight:700;background:#f0f2f5;width:34%;}'+
    'td.st-a{background:#e6f4ea;color:#1E7B34;font-weight:700;}td.st-p{background:#fef6e0;color:#b24a00;font-weight:700;}td.st-m{background:#fde7ea;color:#b3122e;font-weight:700;}'+
    '.foot{position:absolute;bottom:14px;left:40px;right:40px;display:flex;justify-content:space-between;font-size:7px;color:#8a8d91;}'+
    '@media screen{body{background:#8A8D91;}.title,section.pg{width:794px;margin:16px auto;box-shadow:0 6px 30px rgba(0,0,0,.4);min-height:1123px;}}'+
    '</style></head><body>'+
    '<div class="title"><div class="pkbar top"><i style="background:linear-gradient(90deg,#0064E0,#0082FB,#00C2FF)"></i></div>'+
    '<div class="pkbar bot"><i style="background:linear-gradient(90deg,#0064E0,#0082FB,#00C2FF)"></i></div>'+
    '<div class="pk-logo">'+spectrumSVGmarkup(150)+'</div>'+
    '<div class="brand">MUSE LIVE</div><div class="sub">BROADCAST OPS CRM · '+esc(TBLABEL)+'</div><hr>'+
    '<div class="nm">'+esc(p.name)+'</div><div class="vn">'+esc(p.venue||'')+'</div>'+
    '<div class="ml">CLIENT</div><div class="mv">'+esc(p.customer||'Unassigned')+'</div>'+
    '<div class="ml">EVENT DATE</div><div class="mv">'+esc(p.date||'TBD')+'</div>'+
    '<div class="ml">VERSION TYPE</div><div class="mv">'+esc(p.version||'Rev 1.0')+'</div>'+
    '<div class="ml">LAST EDITED</div><div class="mv">'+esc((p.lastEdited||nowStamp())+'  ·  '+(p.editedBy||'—'))+'</div>'+
    '<div class="ml">COMPLETION</div><div class="mv" style="color:'+pcol+'">'+pct+'% · '+c.approved+' Approved · '+c.pending+' Pending · '+c.missing+' Missing</div>'+
    '</div>'+sections+'</body></html>';
}
function printTechbook(p,opts){
  try{
    var w=window.open('','_blank');
    if(!w){toast('Please allow pop-ups to export the PDF');return;}
    w.document.open();w.document.write(techbookHTML(p,opts||{}));w.document.close();
    toast('Ready — choose “Save as PDF” in the print dialog');
    setTimeout(function(){try{w.focus();w.print();}catch(e){}},600);
  }catch(e){toast('Export error: '+e.message);}
}
function sectionHeader(doc,W,title,p,idx,total){
  /* light Meta header: white band, blue gradient rule, dark type */
  doc.setFillColor(255,255,255);doc.rect(0,0,W,58,'F');
  var seg=[[0,100,224],[0,102,226],[0,104,227],[0,106,229],[0,108,231],[0,110,233],[0,112,234],[0,114,236],[0,115,238],[0,117,240],[0,119,241],[0,121,243],[0,123,245],[0,125,247],[0,127,248],[0,129,250],[0,132,251],[0,136,251],[0,140,252],[0,144,252],[0,149,252],[0,153,252],[0,157,253],[0,161,253],[0,165,253],[0,169,253],[0,173,254],[0,177,254],[0,182,254],[0,186,254],[0,190,255],[0,194,255]];var sw=W/seg.length;
  for(var i=0;i<seg.length;i++){doc.setFillColor(seg[i][0],seg[i][1],seg[i][2]);doc.rect(i*sw,58,sw,3,'F');}
  doc.setTextColor(5,5,5);doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text(title,40,30);
  doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(101,103,107);
  doc.text((p.name||'')+'   ·   '+(p.customer||''),40,46);
  if(idx){doc.setFontSize(7.5);doc.setTextColor(138,141,145);doc.text('Section '+idx+' / '+total,W-40,30,{align:'right'});}
}

/* ===== SPELL / TYPO TOLERANCE (Muse + global search) =====
   People misspell show names, depts, and ops terms. We correct tokens before
   matching so "superbow", "personel", "transmision" still work. */
function museEditDist(a,b){
  a=String(a||'');b=String(b||'');
  if(a===b)return 0;
  var m=a.length,n=b.length;if(!m)return n;if(!n)return m;
  if(Math.abs(m-n)>3)return 99;
  var prev=new Array(n+1),cur=new Array(n+1),i,j;
  for(j=0;j<=n;j++)prev[j]=j;
  for(i=1;i<=m;i++){
    cur[0]=i;
    for(j=1;j<=n;j++){
      var cost=a.charAt(i-1)===b.charAt(j-1)?0:1;
      cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+cost);
    }
    var tmp=prev;prev=cur;cur=tmp;
  }
  return prev[n];
}
function museFuzzyOk(token,cand){
  token=String(token||'').toLowerCase();cand=String(cand||'').toLowerCase();
  if(!token||!cand)return false;
  if(token===cand)return true;
  if(cand.indexOf(token)===0&&token.length>=3)return true; // prefix
  if(token.indexOf(cand)===0&&cand.length>=3)return true;
  var maxD=token.length<=4?1:(token.length<=7?2:3);
  if(Math.abs(token.length-cand.length)>maxD)return false;
  return museEditDist(token,cand)<=maxD;
}
/* Common Muse-domain misspellings → canonical form */
var MUSE_TYPO_MAP={
  orien:'orion',oriun:'orion',orrion:'orion',raiban:'rayban',raybans:'rayban',rayban:'rayban',
  worldtoor:'tour',wordtour:'tour',worldtour:'tour',
  whatsap:'whatsapp',watsapp:'whatsapp',whatsupp:'whatsapp',instagam:'instagram',instgram:'instagram',
  creater:'creator',creators:'creator',sumit:'summit',summitt:'summit',
  charms:'charm',wearabel:'wearable',wearables:'wearable',keynot:'keynote',
  personel:'personnel',personell:'personnel',personnal:'personnel',perssonel:'personnel',
  equpiment:'equipment',equipement:'equipment',equpment:'equipment',inventry:'inventory',inventary:'inventory',
  transmision:'transmission',transmition:'transmission',transmisson:'transmission',transmisionn:'transmission',
  finace:'finance',finanse:'finance',finacial:'financial',invoise:'invoice',invoce:'invoice',
  packlst:'packlist',packlist:'packlist',techbok:'techbook',techbook:'techbook',
  schedual:'schedule',shedule:'schedule',schedue:'schedule',
  venu:'venue',veneu:'venue',loction:'location',locaton:'location',
  camra:'camera',camara:'camera',cameras:'camera',vedio:'video',
  powr:'power',eletrical:'electrical',generater:'generator',
  satelite:'satellite',satalite:'satellite',satelitte:'satellite',
  crewe:'crew',roaster:'roster',assigne:'assign',
  brodcast:'broadcast',braodcast:'broadcast',boradcast:'broadcast',
  missingg:'missing',pendng:'pending',aproved:'approved',approvd:'approved',
  readdy:'ready',readyness:'readiness',statys:'status',
  intercom:'intercom',intercomm:'intercom',ifb:'ifb',
  travle:'travel',travell:'travel',fligt:'flight',fliht:'flight',
  vendr:'vendor',vendors:'vendor',omni:'omni',
  enginering:'engineering',engineerin:'engineering',
  grafics:'graphics',graphics:'graphics',replay:'replay',
  personnell:'personnel',missng:'missing',
  audioo:'audio',audoi:'audio'
};
/* Removed hows/whats/looking from typo map — those are normal English, not misspellings of Muse Live terms */
function museLexicon(){
  var lex={},k,i,j;
  Object.keys(MUSE_TYPO_MAP).forEach(function(t){lex[MUSE_TYPO_MAP[t]]=1;});
  Object.keys(prodSyn||{}).forEach(function(pk){
    lex[pk]=1;(prodSyn[pk]||[]).forEach(function(s){String(s).toLowerCase().split(/[^a-z0-9]+/).forEach(function(w){if(w.length>2)lex[w]=1;});});
  });
  (deptSyn||[]).forEach(function(row){
    (row[1]||[]).forEach(function(s){String(s).toLowerCase().split(/[^a-z0-9]+/).forEach(function(w){if(w.length>2)lex[w]=1;});});
    String(row[0]||'').toLowerCase().split(/[^a-z0-9]+/).forEach(function(w){if(w.length>2)lex[w]=1;});
  });
  ['audio','camera','cameras','video','power','crew','travel','finance','equipment','inventory','vendor',
   'personnel','schedule','packlist','techbook','broadcast','transmission','satellite','fiber','missing',
   'pending','approved','ready','status','overview','dashboard','production','show','venue','location',
   'museai','muse','ops','signal','truck','rf','ifb','omni','portal','workflow','tracking','survey',
   'orion','museaitour','olympics','igcreators','whatsapp','sail','bowl','cup'].forEach(function(w){lex[w]=1;});
  try{if(typeof order!=='undefined')order.forEach(function(pk){
    var p=productions[pk];if(!p)return;
    String(p.name||'').toLowerCase().split(/[^a-z0-9]+/).forEach(function(w){if(w.length>2)lex[w]=1;});
  });}catch(e){}
  return Object.keys(lex);
}
/* Never rewrite ordinary English — only domain typos */
var MUSE_STOPWORDS={
  a:1,an:1,the:1,and:1,or:1,but:1,if:1,of:1,to:1,for:1,in:1,on:1,at:1,by:1,as:1,is:1,are:1,was:1,were:1,
  be:1,been:1,being:1,have:1,has:1,had:1,do:1,does:1,did:1,will:1,would:1,could:1,should:1,can:1,may:1,
  how:1,what:1,whats:1,when:1,where:1,who:1,why:1,which:1,this:1,that:1,these:1,those:1,it:1,its:1,
  me:1,my:1,we:1,our:1,you:1,your:1,they:1,them:1,their:1,i:1,im:1,ive:1,ill:1,
  looking:1,lookin:1,look:1,looks:1,seem:1,seems:1,going:1,goin:1,get:1,got:1,need:1,needs:1,
  anything:1,something:1,everything:1,nothing:1,any:1,all:1,also:1,just:1,still:1,really:1,about:1,
  with:1,from:1,into:1,over:1,under:1,up:1,down:1,out:1,off:1,not:1,no:1,yes:1,yet:1,now:1,
  tell:1,give:1,show:1,list:1,please:1,thanks:1,thank:1,hey:1,hi:1,hello:1,ok:1,okay:1,
  missing:1,pending:1,ready:1,status:1,good:1,bad:1,fine:1,well:1,there:1,here:1,more:1,less:1
};
function museBestLexMatch(token,lex){
  token=String(token||'').toLowerCase();
  if(!token||token.length<4)return null; /* never fuzzy-fix 1–3 letter words */
  if(MUSE_STOPWORDS[token])return null;
  if(lex.indexOf(token)>=0)return token;
  var best=null,bestD=99,i,c,d;
  for(i=0;i<lex.length;i++){
    c=lex[i];
    if(MUSE_STOPWORDS[c])continue;
    if(c.length<4)continue;
    if(Math.abs(c.length-token.length)>2)continue;
    if(!museFuzzyOk(token,c))continue;
    d=museEditDist(token,c);
    if(d<bestD){bestD=d;best=c;}
  }
  /* require real similarity — avoid how→show */
  if(bestD>2)return null;
  if(bestD===2&&token.length<6)return null;
  return best;
}
/** Returns {q, corrections:[{from,to}], changed:bool} */
function museCorrectQuery(raw){
  var original=String(raw||'');
  var q=original.toLowerCase();
  var corrections=[];
  /* phrase-level domain fixes only */
  var phrases=[
    [/ray[\s-]*bans?\b/g,'rayban'],[/what'?s\s*app\b/g,'whatsapp'],[/insta\s*gram\b/g,'instagram'],
    [/world\s*toure?\b/g,'world tour'],[/worl\s*tour\b/g,'world tour'],
    [/person+el+\b/g,'personnel'],[/equip+ment\b/g,'equipment'],
    [/transmi+s+i+on\b/g,'transmission'],[/tech\s*bok\b/g,'techbook'],
    [/pack\s*lst\b/g,'packlist'],[/sched+ual?e?\b/g,'schedule']
  ];
  phrases.forEach(function(pr){
    var before=q;
    q=q.replace(pr[0],function(m){
      corrections.push({from:m,to:pr[1],kind:'phrase'});
      return pr[1];
    });
  });
  var lex=museLexicon();
  var parts=q.split(/(\s+|[^a-z0-9']+)/i);
  var out=[];
  parts.forEach(function(tok){
    if(!/^[a-z']{3,}$/i.test(tok)){out.push(tok);return;}
    var low=tok.toLowerCase().replace(/'/g,'');
    /* keep informal English intact */
    if(MUSE_STOPWORDS[low]||MUSE_STOPWORDS[tok.toLowerCase()]){out.push(tok.toLowerCase());return;}
    if(/^(lookin|goin|doin|havin|tryin|gettin|makin)$/.test(low)){
      out.push(low.replace(/in$/,'ing')); /* lookin→looking only for -in slang, not via fuzzy */
      return;
    }
    if(MUSE_TYPO_MAP[low]){
      var fix=MUSE_TYPO_MAP[low];
      if(fix!==low&&!MUSE_STOPWORDS[fix]){corrections.push({from:low,to:fix});out.push(fix);return;}
    }
    if(lex.indexOf(low)>=0){out.push(low);return;}
    var best=museBestLexMatch(low,lex);
    if(best&&best!==low&&!MUSE_STOPWORDS[best]){corrections.push({from:low,to:best});out.push(best);}
    else out.push(low);
  });
  var corrected=out.join('');
  var seen={};corrections=corrections.filter(function(c){
    if(!c.from||!c.to||c.from===c.to)return false;
    if(MUSE_STOPWORDS[c.from])return false;
    var k=c.from+'>'+c.to;if(seen[k])return false;seen[k]=1;return true;
  });
  return {q:corrected,original:original,corrections:corrections,changed:corrections.length>0};
}
function museCorrectHint(corr){
  if(!corr||!corr.corrections||!corr.corrections.length)return '';
  /* Only mention meaningful domain fixes — never dump the whole sentence */
  var bits=corr.corrections.filter(function(c){
    return c.from.length>=4&&!MUSE_STOPWORDS[c.from]&&c.from!==c.to;
  }).slice(0,3).map(function(c){return c.from+' → '+c.to;});
  if(!bits.length)return '';
  return '(Took “'+bits.join('”, “')+'” as a spelling fix.)';
}

/* ===== MUSEAI — data-driven assistant over all production data ===== */
var prodSyn={museaitour:["world tour","muse ai world tour","museaitour","tour","hacker square","finale","mawt","mawt26"],raybangen3:["ray-ban","rayban","ray ban","gen 3","glasses","smart glasses","menlo park","mpk","meta hq","classroom stage"],orion:["orion","ar glasses","levis","levi's","santa clara","reveal"],museailaunch:["muse ai","muse ai launch","launch keynote","keynote","studio m1","hudson yards"],whatsapp:["whatsapp","whats app","business summit","summit","q&a desk","channels"],igcreators:["instagram","creator week","creators","creator","reels","herald"],charm:["charm","meta charm","wearable","wearables","milan","design week","fiera"]};
var deptSyn=[
 ["Audio",["audio","audoi","audioo","sound","a1","a2"," mix","dante","madi","calrec","console"]],
 ["Cameras / Video",["camera","camra","camara","cam ","cams","video","vedio","lens","ldx","hdc"]],
 ["Transmission / Signal",["transmission","transmision","transmition","signal","fiber","encode","liveu","ltn","tvu","smpte","feed","bond","2110"]],
 ["Power / Electrical",["power","powr","electrical","eletrical","distro","generator","generater","gen ","amp","400a","200a","shore","watt"]],
 /* v30 review-sweep fix: these rows pointed at LEGACY department names that are not in
    the canonical p.dept arrays, so deptByName() returned null and museaiAnswer crashed
    on any comms/RF/CAD-flavored question — remapped onto the canonical departments. */
 ["Engineering",["engineering","enginering","serial","node"]],
 ["Replay / EVS",["replay","evs","clip","playout","slo-mo","slomo"]],
 ["CAD",["cad","site plan","schematic","drawing"]],
 ["Graphics (GFX)",["graphic","grafics","gfx","vizrt","lower third","font","title"]],
 ["Audio",["comms","comm ","intercom","intercomm","ifb","rts","rvon","clearcom","talkback","return monitor","return"]],
 ["Audio",["rf","wireless","mic","microphone","lav","lavalier","sennheiser","shure","dpa","frequency","freq"]],
 ["Cameras / Video",["prompter","teleprompter","autoscript"]],
 ["Talent / Production",["talent","sportscaster","anchor","host","booth","rundown","producer"]],
 ["Legal / Rights",["legal","rights","clearance","clearances","license","licensing","permit","permits","music","archive","insurance"]]
];
function hasKw(q,kw){
  if(/\s/.test(kw))return q.indexOf(kw)>-1; // multi-word phrase: substring is safe
  // single token: require word boundaries so e.g. "rts" doesn't match inside "sports"
  try{return new RegExp('(^|[^a-z0-9])'+kw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^a-z0-9]|$)').test(q);}catch(e){return q.indexOf(kw)>-1;}
}
function hasKwFuzzy(q,kw){
  if(hasKw(q,kw))return true;
  kw=String(kw||'').toLowerCase().trim();if(kw.length<3)return false;
  var tokens=String(q||'').toLowerCase().split(/[^a-z0-9]+/).filter(function(t){return t.length>=3;});
  for(var i=0;i<tokens.length;i++){if(museFuzzyOk(tokens[i],kw))return true;}
  /* multi-word kw: fuzzy each word */
  var parts=kw.split(/\s+/).filter(Boolean);
  if(parts.length>1){
    var hit=0;parts.forEach(function(p){for(var j=0;j<tokens.length;j++){if(museFuzzyOk(tokens[j],p)||tokens[j]===p){hit++;break;}}});
    if(hit===parts.length)return true;
  }
  return false;
}
function findProd(q){
  q=String(q||'').toLowerCase();
  try{var c=museCorrectQuery(q);if(c&&c.q)q=c.q;}catch(e){}
  for(var k in prodSyn){for(var i=0;i<prodSyn[k].length;i++){if(hasKwFuzzy(q,prodSyn[k][i]))return k;}}
  for(var j=0;j<order.length;j++){var key=order[j];if(prodSyn[key])continue;var p=productions[key];
    if(hasKwFuzzy(q,key.toLowerCase()))return key;
    var words=(p.name||'').toLowerCase().split(/[^a-z0-9]+/).filter(function(w){return w.length>2;});
    for(var w=0;w<words.length;w++){if(hasKwFuzzy(q,words[w]))return key;}
  }
  return null;
}
function findDept(q){
  q=String(q||'').toLowerCase();
  try{var c=museCorrectQuery(q);if(c&&c.q)q=c.q;}catch(e){}
  for(var i=0;i<deptSyn.length;i++){for(var j=0;j<deptSyn[i][1].length;j++){if(hasKwFuzzy(q,deptSyn[i][1][j].trim()))return deptSyn[i][0];}}
  return null;
}
function deptByName(p,name){for(var i=0;i<p.dept.length;i++){if(p.dept[i][0]===name)return p.dept[i];}return null;}
function listByStatus(p,st){return p.dept.filter(function(d){return d[1]===st;}).map(function(d){return d[0];});}
function museaiWikiHits(q, limit){
  try{
    if(typeof MuseKB==='undefined')return [];
    if(MuseKB.chunksForMuseAi)return MuseKB.chunksForMuseAi(q, limit||6)||[];
    if(typeof MuseKB.search!=='function')return [];
    var n=limit||6;
    var raw=String(q||'').toLowerCase();
    var hits=MuseKB.search(raw)||[];
    if(hits.length)return hits.slice(0,n);
    var keys=['fiber bulkhead','rf clash','rf 200','200 khz','gng weather','hdc-5500','hdc 5500','liveu','calrec','axient','nexus','no picture','voltage sag'];
    var i,k,h;
    for(i=0;i<keys.length;i++){
      k=keys[i];
      if(raw.indexOf(k)<0)continue;
      h=MuseKB.search(k)||[];
      if(h.length)return h.slice(0,n);
    }
    if(/hdc-?5500/.test(raw)){
      h=MuseKB.search('hdc-5500')||[];
      if(h.length)return h.slice(0,n);
    }
    return [];
  }catch(e){return [];}
}
function museaiWikiAnswer(qRaw){
  var q=String(qRaw||'').toLowerCase();
  if(!q)return '';
  var askWiki=/(wiki|knowledge base|procedure|how do i|how to|spec for|troubleshooting|decision tree|incident log|teach me|what is the (sop|procedure))/.test(q)
    ||/(fiber bulkhead|rf (clash|200)|gng weather|hdc-?5500|liveu|calrec|axient|nexus|no picture|voltage sag)/.test(q);
  if(!askWiki)return '';
  var hits=museaiWikiHits(q,6);
  if(!hits.length)return '';
  var h=hits[0];
  var more=hits.slice(1,4).map(function(x){return x.title;}).filter(Boolean);
  var body=(h.body||'').replace(/\s+/g,' ').trim();
  if(body.length>520)body=body.slice(0,520)+'…';
  var cite=' Open Wiki → '+h.title+'.';
  var extra=more.length?(' Related: '+more.join('; ')+'.'):'';
  return (h.title+': '+body+cite+extra).replace(/\s+/g,' ').trim();
}
/* Muse intents for the briefing chips — computed from live production data */
function museaiIntents(q){
  try{
    var keys=(typeof order!=='undefined'&&order)||[];
    var P=function(k){return productions[k]||{};};
    var nm=function(k){return P(k).name||k;};
    var pct=function(k){try{return computePct(P(k));}catch(e){return P(k).pct||0;}};
    var atRisk=keys.filter(function(k){return P(k).risk||pct(k)<40;});
    var txc=null;try{if(typeof txConflicts==='function')txc=txConflicts();}catch(e){}
    var txn=txc&&txc.notes?txc.notes.length:0;
    if(/\b(at risk|risks?|red flags?|blockers?|in trouble)\b/.test(q)){
      if(!atRisk.length)return 'Nothing is at risk right now — all '+keys.length+' productions are at 40% readiness or better.';
      return atRisk.length+' of '+keys.length+' productions need attention:\n'+atRisk.map(function(k){var p=P(k);
        return '• '+nm(k)+' — '+pct(k)+'% ready'+(p.bottleneck&&p.bottleneck.text?' · '+p.bottleneck.text:'')+(p.date?' · '+p.date:'');}).join('\n');
    }
    if(/\b(morning |daily )?brief(ing)?\b|\bwhat'?s (happening|going on)\b/.test(q)){
      var active=keys.filter(function(k){return /active|production/i.test(P(k).status||'');});
      var eng=(typeof engRequests!=='undefined'&&engRequests)?engRequests.length:0;
      var att=0;try{att=attentionCount();}catch(e){}
      var lines=['Here is your Muse Live briefing.',
        'Portfolio: '+keys.length+' productions · '+active.length+' in production · '+atRisk.length+' at risk.'];
      keys.slice().sort(function(a,b){return pct(a)-pct(b);}).forEach(function(k){lines.push('• '+nm(k)+' — '+pct(k)+'% · '+(P(k).status||'')+(P(k).date?' · '+P(k).date:''));});
      lines.push('Transmission: '+(txn?txn+' booking conflict'+(txn===1?'':'s')+' to resolve.':'no booking conflicts.'));
      if(eng)lines.push('ENG: '+eng+' camera request'+(eng===1?'':'s')+' on the board.');
      if(att)lines.push(att+' item'+(att===1?'':'s')+' flagged for your attention.');
      return lines.join('\n');
    }
    if(/\bcrew\b/.test(q)&&/\b(open|unfilled|vacan\w*|available|unassigned|gaps?)\b/.test(q)){
      var rows=keys.map(function(k){var o=0,a=0;try{o=projOpenCount(k);a=projAssignedCount(k);}catch(e){}return {k:k,o:o,a:a};});
      var total=rows.reduce(function(n,r){return n+r.o;},0);
      if(!total)return 'Every crew position is filled across all '+keys.length+' productions.';
      return total+' crew position'+(total===1?' is':'s are')+' still open:\n'+rows.filter(function(r){return r.o;}).sort(function(a,b){return b.o-a.o;})
        .map(function(r){return '• '+nm(r.k)+' — '+r.o+' open · '+r.a+' assigned';}).join('\n')+'\nOpen a production → Crew to assign people.';
    }
    if(/\bconflicts?\b/.test(q)&&/\b(tx|transmission|bookings?|circuits?|bandwidth)\b/.test(q)){
      if(!txn)return 'No transmission conflicts — every TX booking fits its path capacity.';
      return txn+' transmission conflict'+(txn===1?'':'s')+':\n'+txc.notes.slice(0,8).map(function(n){return '• '+(n.text||n.res||'');}).join('\n')+
        (txn>8?'\n…and '+(txn-8)+' more.':'')+'\nOpen Schedule → Facilities & Productions to rebalance.';
    }
  }catch(e){}
  return null;
}
function museaiAnswer(qRaw){
  var _corr=null;try{_corr=museCorrectQuery(qRaw);}catch(e){_corr=null;}
  var q=(_corr&&_corr.q?_corr.q:String(qRaw||'')).toLowerCase().trim();
  if(!q)return "Ask me anything about Muse Live (any module or show) or any real-world question — e.g. \"Is audio ready for Orion Reveal?\" or \"What causes RF interference?\"";
  var _intent=museaiIntents(q);if(_intent)return _intent;
  if(/^(hi|hey|hello|yo|sup|good (morning|afternoon|evening))/.test(q))return "Hi — I'm Muse. I answer every Muse Live question (all modules + live data across all productions) and general real-world questions too. Try \"What is Muse Live?\", \"How does PackList work?\", or \"When is the next Dolphins preseason game?\"";
  try{
    var wikiA=museaiWikiAnswer(qRaw||q);
    if(wikiA)return wikiA;
  }catch(eW){}
  // product overview / how Muse Live works
  if(/(what is (muse live )?muse|what does muse do|explain (muse live )?muse|how does (muse live )?muse work|product overview|whole (app|product)|know muse live)/.test(q)){
    var overview="Muse Live is the Meta Broadcast Operations — the plan-of-record hub for multi-venue live shows (not a switcher or NLE). One browser app covers Department Status, Broadcast Ops (signal path · truck power · RF clash · satellite · go/no-go), techbook fields + live PDF + change diff, packlist, fiber plant, crew + Call Matrix with venue check-in, Site Survey (Event Check List air-readiness nested there — drawings + vendor meeting and venue schedule + site walk feed Tasks then LBA), Graphics Playback (16:9 player, tap the picture to play/pause, frame step; fill+matte uploads get a Fill and Matte Tally; each show has Open/Bumper/Wipe environment sims with the clip's own soundtrack), read-only CAD viewer with note dots, Broadcast 360 Shot Designer, TX bookings, finance (PO/WO/AP), CPM/EVM project controls, travel + manifest, ENG requests, barcode inventory, Omni comms, Live Streams, Incident Reports, and Muse Schedule (facilities, circuits, kit and crew bookings with conflict detection). I'm Muse — ask how any module works or dig into a show.";
    try{if(typeof MuseKB!=='undefined')overview+=' The Wiki holds procedures, specs, schematics, troubleshooting, and incidents — tagged by department for Muse and the truck.';}catch(eKb){}
    return overview;
  }
  if(/(what.?s new|whats new|new in muse|recent (change|update)|learn what.?s new)/.test(q))
    return "What's new: (1) Site Survey → Air-readiness holds the Event Check List (not GFX). Workflow is Drawings + vendor meeting, and schedule-with-venue + site survey, both feeding Tasks then LBA. (2) Graphics Playback is 16:9 — tap the video to play/pause, use ‹ Frame / Frame › to step, no color-background chips, no MIRA label. Upload fill+matte (filenames with fill and matte/key) for a Fill and Matte Tally. Each production has Open / Bumper / Wipe environment sims; soundtrack is the clip's own music/SFX (no extra sine or noise beds). (3) Left rail: native scroll with hidden scrollbar; Search/+ fades with no rounded card; Projects scroll above Search.";
  if(/(graphics playback|gfx player|fill and matte|mira tally|show open|gfx (sim|wipe|bumper)|tap.*video|click.*video.*pause)/.test(q))
    return "Graphics Playback lives on Department Status → QC. Player is always 16:9. Tap or click the picture to play/pause. ‹ Frame / Frame › steps one frame. Cue / Loop still work. There is no MIRA tally and no black/white/green/checker chips. Upload one file, or a fill + matte pair (names containing fill and matte or key) to open a Fill and Matte Tally. Environment sims (Open, Bumper, Wipe) are injected per show — Muse AI World Tour, Winter Games, Orion Reveal, Ray-Ban Meta Gen 3 Launch, Muse AI Launch, WhatsApp Summit, Creator Week — and play the video's own soundtrack. Probe/preview convert uses FFmpeg (libavcodec / libavformat).";
  if(/(air.?readiness|event check list|lba|live before air)/.test(q))
    return "Air-readiness is the Event Check List nested under Site Survey → Air-readiness (not under GFX). It covers truck, fiber/ingest, switcher, cameras, audio, lighting, power, grip, schedule, data/TX, venue, labor/EHS. The mind-tree workflow is Drawings → Vendor meeting, and Schedule with venue → Site Survey; both feed Tasks → LBA (live before air). Workflow tab chips jump to those gates. Auto-tasks fire when drawings, vendor meeting, venue schedule, or the checklist are thin.";
  // Broadcast Ops / signal path / go-no-go / RF / sat / power
  if(/(broadcast ops|signal path|go.?no.?go|go\/no|power (load|bus)|rf (clash|coord)|satellite (booking|card|window)|truck (profile|plant)|techbook (diff|change))/.test(q)){
    var bk=findProd(q)||museaiFocusKey();
    var brief=null;try{if(bk&&typeof MuseBOps!=='undefined'&&MuseBOps.museaiBrief)brief=MuseBOps.museaiBrief(bk);}catch(eB){}
    var liveB=brief?(' '+(productions[bk]?productions[bk].name:bk)+': '+brief.decision+' ('+brief.score+'%) — '+brief.summary+'; signal hops '+brief.signal_hops+(brief.signal_red?' ('+brief.signal_red+' red)':'')+'; power '+brief.power_pct+'% ('+brief.power_level+'); RF '+brief.rf_services+' service(s)'+(brief.rf_clashes?', '+brief.rf_clashes+' clash(es)':'')+'; sat '+brief.sat_bookings+'.'):'';
    return "Broadcast Ops (Wave C) is the remote truck engineer's book of record: (1) Signal Path Integrity — visual hop chain + table (source→embed→contrib fiber/sat/LiveU LU800/SRT→RX→plant→encoder→TOC) with green/amber/red + last-known-good; (2) Truck/Plant — matrix, fiber/coax bulkhead, bay map, HVAC, weight; (3) Power bus rollup vs shore/gen (≥80% amber, ≥100% red); (4) REMI delay budget (contrib+return ms vs budget); (5) RF coordination + 200 kHz clash detector; (6) Satellite cards (bird/TP/pol/FEC/symbol rate/uplink truck/UTC window/contingency); (7) Day-of Go/No-Go including weather hold + crew check-in; (8) Techbook live PDF sections + change-diff vs last export. Open production → Broadcast Ops tab; portfolio risk board shows GNG per show."+liveB;
  }
  // CAD viewer
  if(/(cad( ?viewer| ?3d)?|read.?only cad|dwg|dxf|site plan|how.*(draw|edit).*(cad|drawing)|note dots?|libredwg)/.test(q))
    return "CAD in Muse Live is a READ-ONLY 2D/3D viewer (js/cad-viewer-engine.js v1.0) — geometry cannot be edited. Supported: DXF, DWG (via LibreDWG WASM), OBJ, STL, images/PDF sheets. Not in-browser: DWF/DWFX, STEP, Parasolid (.x_t), Vectorworks (.vwx) — export those to DXF/OBJ/STL first. Collaboration is colored note dots only (author + message; Save notes to the production). Open plans from Site Survey. Requires HTTP (./start-muse.sh or hosted) — bare file:// breaks WASM/DWG.";
  // 360 planner
  if(/(360|pano|panorama|shot designer|equirect|map mode|uv.?lock|steadicam|jib tool)/.test(q)&&/(how|what|work|planner|tool|can|does|explain|open)/.test(q))
    return "Broadcast 360 Planner (js/pano-engine.js v4.0) is the Shot Designer: default MAP MODE shows the equirect as a 2:1 map you pan L/R (markers & cable paths are UV-locked so they never slide). Optional LOOK sphere mode. Place cameras/jib/steadicam/cables/fiber/power/IFB/etc.; packages pull from Department Status Cameras/Video. Flip V/H, freehand draw, shot list. Prefer equirectangular JPEG/PNG/WebP 2:1; giant images auto-downscale to ≤4096 for WebGL. Lives under Site Survey → 360.";
  // maps / location layout
  if(/(duplicate map|two maps|map layout|location (tab|map)|single venue|multi.?venue|sun and shadow|shadows only)/.test(q))
    return "Map layout: Overview always shows the primary venue map. Single-venue shows: Location tab is sun & shadows only — no second identical map. Multi-venue (2+ sites) unlocks the multi-pin Location map + venue picker + shadows. Techbook PDF maps use a static light CARTO Voyager image (museStaticMap) so covers never go black. Tracking tab has its own fleet telemetry basemap that follows light/dark theme.";
  // venue check-in / geofence / arrival
  if(/(check.?in|geofence|on site|on-site|arriv(ed|al)|call matrix|who.*(here|arrived|on site)|fence radius)/.test(q)){
    var ck=findProd(q)||museaiFocusKey();
    var pck=ck&&productions[ck]?productions[ck]:null;
    var sumC=null;try{if(ck&&typeof checkinSummary==='function')sumC=checkinSummary(ck);}catch(eC){}
    var liveC='';
    if(pck&&sumC){
      var onNames=[];try{
        var cr=typeof getProjectCrew==='function'?getProjectCrew(ck):[];
        cr.forEach(function(s){if((s.name||'').trim()&&typeof checkinIsOnSite==='function'&&checkinIsOnSite(ck,s.name))onNames.push(s.name);});
      }catch(eN){}
      liveC=' '+pck.name+': '+sumC.on+'/'+sumC.total+' on site'+(onNames.length?(' — '+onNames.slice(0,12).join(', ')+(onNames.length>12?'…':'')):'')+'.';
    }
    return "Venue check-in lives on the Personnel Call Matrix Arrival column. Free browser Geolocation + ~"+(typeof CHECKIN_RADIUS_M!=='undefined'?CHECKIN_RADIUS_M:250)+" m haversine fence around the venue GPS (no paid geofence API). Crew use Check me in; managers click the Arrival badge to mark or clear. Filters: on site / not yet. Stored on the production as siteCheckins."+liveC+" Use HTTPS or ./start-muse.sh so Geolocation works.";
  }
  // packlist how-to
  if(/(how does (the )?pack.?list|packlist work|what is (the )?pack.?list)/.test(q))
    return "PackList merges equipment lines (tbEquip) with techbook dropdown fields into shippable rows: department, name, qty, detail, pack status, owner, lock/approval. Open a production → PackList tab. Gear also flows in from ENG requests. I can list pack lines for the focus show from live data — ask \"packlist for Muse AI World Tour\" or open that production and ask \"summarize packlist\".";
  // fiber how-to
  if(/(how does fiber|fiber (plant|schedule|editor)|tia.?598|tac.?12)/.test(q)&&/(how|what|work|explain)/.test(q))
    return "Fiber plant is per-venue (fiberLoc): TAC-style trunks plus a TIA strand schedule (position, signal, from/to, status, path, connectors, optional CAD ref). Edit under Transmission / Signal on the production. Techbook PDF exports the fiber section. Ask for a specific trunk or \"Muse AI Launch strands\" on Muse AI World Tour for live strand data.";
  // roles & permissions (Work Item 1)
  if(/(role|permission|access|restricted|who am i|viewing as|what can i see|locked)/.test(q)&&typeof permRoleDef==='function'){
    var _rd=permRoleDef();var hid=[];
    if(!permCan('finance'))hid.push('Finance');if(!permCan('scheduling'))hid.push('Bookings');if(!permCan('vendors'))hid.push('Vendors');
    var scoped=[];if(permScope('equipment')==='own')scoped.push('Equipment (own gear only)');if(permScope('travel')==='own')scoped.push('Travel (own itinerary only)');if(permScope('comms')==='team')scoped.push('Omni-Channel (team groups only — exec threads hidden)');
    return "You're viewing Muse Live as "+_rd.label+" ("+_rd.persona+")"+(_rd.admin?" — an administrator with unrestricted access to every module, chat group, and email thread.":". Hidden modules: "+(hid.length?hid.join(', '):'none')+". Scoped: "+(scoped.length?scoped.join('; '):'none')+". Flip roles from the \"Viewing as\" switcher in the header.")+(permIsAdmin()?" You can provision accounts from any personnel card (🔑 Generate account).":"");}
  // equipment / inventory
  if(/(equipment|inventory|gear|camera|lens|asset|barcode|serial|checked.?out|check.?in|available gear|kit)/.test(q)&&typeof inventory!=='undefined'){
    loadInvOnce();
    var _cinv=(typeof permInventory==='function')?permInventory():inventory;
    var _out=_cinv.filter(function(it){return it.status==='checked-out';});
    var _avail=_cinv.filter(function(it){return it.status==='available';});
    var _maint=_cinv.filter(function(it){return it.status==='maintenance';});
    if(/maintenance|repair|broken|down/.test(q))return _maint.length?(_maint.length+" item(s) in maintenance: "+_maint.map(function(it){return it.name+" ("+it.barcode+")";}).join("; ")):"Nothing is flagged for maintenance — all gear is serviceable.";
    if(/available|free|spare|in stock/.test(q))return _avail.length+" item(s) available: "+_avail.slice(0,12).map(function(it){return it.name+" ["+it.category+"]";}).join("; ")+(_avail.length>12?" …":"");
    if(/checked.?out|deployed|on (the )?(road|show|production)|in use/.test(q))return _out.length+" item(s) checked out: "+_out.map(function(it){return it.name+" \u2192 "+(it.project&&productions[it.project]?productions[it.project].name:"\u2014")+(it.assignedTo?" ("+it.assignedTo+")":"");}).join("; ");
    return _cinv.length+" assets tracked \u2014 "+_avail.length+" available, "+_out.length+" checked out, "+_maint.length+" in maintenance. Total value $"+(_cinv.reduce(function(a,it){return a+(it.value||0);},0)/1000000).toFixed(2)+"M. Ask about a category, a barcode, or what's available.";
  }
  // control rooms ← Muse Schedule
  if(/(pcr|acr\b|crk|control room|routing board|what.?s (on|live) (in|from)|which (room|show))/.test(q)&&typeof roomState==='function'){
    var liveRooms=[],prepRooms=[];
    Object.keys(SCHED_ROOMS).forEach(function(g){SCHED_ROOMS[g].forEach(function(rm){var st=roomState(rm);
      if(st.s==='onair'||st.s==='active')liveRooms.push(rm+' — '+st.b[2]+(st.b[5]?' ('+st.b[5]+')':''));
      else if(st.s==='setup')prepRooms.push(rm+' — '+st.b[2]);});});
    return (liveRooms.length?'Active control rooms today ('+NPC_DAYS[schedTodayCol()]+'): '+liveRooms.join(' · ')+'. ':'No rooms active today. ')+
      (prepRooms.length?'In setup/prep: '+prepRooms.join(' · ')+'. ':'')+
      'The board is driven by Muse Schedule — hover any chip on the dashboard for its show and window, or click it to open that room in Muse Schedule.';}
  // unified IFB signal routing (Work Item 2)
  if(/(ifb|rem\b|tiff|mix.?minus|phone line|dialed line)/.test(q)&&typeof ifbGet==='function'){
    var ifbHits=[];order.forEach(function(k){var r=productions[k].ifbRoute;if(!r||!r.lines||!r.lines.length)return;
      var sn={};(r.signals||[]).forEach(function(s){sn[s.id]=s.label;});
      ifbHits.push(prodName(k)+': '+r.lines.filter(function(l){return l.ref;}).map(function(l){return l.ref.split(' · ')[0]+' ('+l.kind+(l.person?' → '+l.person:'')+(l.signalId&&sn[l.signalId]?' via '+sn[l.signalId]:'')+')';}).join(', '));});
    return ifbHits.length?("IFB Signal Routing (unified REM/TIFF platform): "+ifbHits.join(' · ')+". REMs carry host mix-minus, TIFFs carry camera-op/producer comms — manage both on the routing board in each production's Overview."):
      "No IFB lines are routed yet. Open a production's Overview and use the unified IFB Signal Routing board — one platform maps REMs and TIFFs to LiveU LU800, Fiber or Satellite paths with talent and camera-op assignments.";}
  // Excel-first workflows (Work Item 8)
  if(/(template|\.xlsx|excel (import|export|template)|import (equipment|vendors|operators|personnel|talent|locations|gear)|round.?trip|bulk (import|upload))/.test(q))
    return "Excel is a first-class citizen in Muse Live: Equipment, Vendors, Personnel, Talent, production Locations, the ENG gear catalog, and all three Finance sections have Download Template / Import / Export controls in their headers. Templates ship with exact column headers plus an example row; imports are validated with a plain-language preview (row number + what's wrong) and nothing lands until every remaining row is clean. Exports use the same layout, so files round-trip: export → edit in Excel → re-import. Role permissions apply — restricted roles can't touch modules they can't see.";
  // finance workspace (Work Item 7)
  if(/(cost report|finance workspace|ap ledger|aging|variance|efc\b|per diem|labor (cost|estimate|budget)|import.*(excel|xlsx)|excel.*(finance|import)|spreadsheet)/.test(q)&&typeof permCan==='function'){
    if(!permCan('finance'))return "Finance isn't available for your current role — flip the header switcher to Executive to open it.";
    var fk=order[0];var act2=document.querySelector('.view-pane.active');if(act2){var ak=act2.id.replace('view-','');if(productions[ak])fk=ak;}
    var FT=finReportTotals(fk);var LT=laborTotals(fk);
    var openInv=finInvoices.filter(function(v){return v.prod===fk&&v.status!=='Paid';});
    return prodName(fk)+" finance workspace: budget "+$fmt(FT.budget)+", EFC "+$fmt(FT.efc)+" ("+(FT.variance<0?$fmt(Math.abs(FT.variance))+" projected over":$fmt(FT.variance)+" under")+"). Labor estimate "+$fmt(LT.total)+" incl. "+$fmt(LT.ot)+" OT, "+$fmt(LT.kit)+" kit, "+$fmt(LT.pd||0)+" per diems. AP: "+openInv.length+" open invoice(s), "+$fmt(openInv.reduce(function(s,v){return s+v.amount;},0))+" outstanding. Open the production's Finance tab for the sortable Cost Report / Labor / AP Ledger workspace — Excel templates, validated .xlsx import, and .xlsx/PDF export live in the toolbar.";}
  // project controls — CPM / EVM / critical path / resources / gates / what-if (v36)
  if(/(critical path|\bfloat\b|\bslack\b|schedule (variance|health|risk|performance)|behind schedule|ahead of schedule|on schedule|\bspi\b|\bcpi\b|earned value|\bevm\b|\beac\b|\bvac\b|forecast finish|finish date|\bgantt\b|resource (level|allocation|conflict|overallocat|demand|leveling)|stage.?gate|\bgate\b|what.?if|scenario|monte.?carlo|primavera|when (does|will).*(air|finish|wrap|complete))/.test(q)&&typeof planMuseAiSummary==='function'){
    var pkc=order[0];var actvc=document.querySelector('.view-pane.active');if(actvc){var akkc=actvc.id.replace('view-','');if(productions[akkc])pkc=akkc;}
    var pc=null;try{pc=planMuseAiSummary(pkc);}catch(e){}
    if(!pc)return "Open a production to see its project controls — the Schedule tab has the CPM Gantt, resource histogram, EVM S-curve, stage-gates and what-if scenarios.";
    var critc=pc.criticalPath.slice(0,6).join(' → ');
    var healthc=pc.SPI>=0.98?'on or ahead of schedule':(pc.SPI>=0.9?'slightly behind schedule':'behind schedule');
    var costc=pc.CPI>=0.98?'on or under budget':(pc.CPI>=0.9?'trending slightly over budget':'over budget');
    return prodName(pkc)+" project controls (CPM): forecast finish "+pc.finish+", "+pc.pctComplete+"% complete. Critical path — "+critc+". SPI "+pc.SPI+" ("+healthc+"), CPI "+pc.CPI+" ("+costc+"), EAC "+$fmt(pc.EAC)+", VAC "+$fmt(pc.VAC)+". "+(pc.negFloatActivities?pc.negFloatActivities+" activit"+(pc.negFloatActivities===1?"y is":"ies are")+" on negative float (deadline at risk). ":"")+(pc.resourceOverallocations.length?"Resource over-allocation on "+pc.resourceOverallocations.join(', ')+" — run \"Level within float\" on the Resources view. ":"")+(pc.gates.length?"Open stage-gates: "+pc.gates.slice(0,3).join('; ')+". ":"All stage-gates passed. ")+"Open the Schedule tab for the CPM Gantt, resource leveling, EVM S-curve, gates and what-if scenarios — or Portfolio Controls in the Master Schedule for the cross-production rollup.";
  }
  // city conditions panel (Work Item 3)
  if(/(air quality|aqi|conditions|city weather|windy|humidity|barometric|pressure|wind gust)/.test(q))
    return "Click any Network Clock tile on the dashboard (ET New York, CT Chicago, MT Denver, PT Los Angeles, AST San Juan, MEX Mexico City) to open a live conditions panel — temperature, precipitation, wind & gusts, humidity, pressure and air quality. Primary data is Windy's GFS point forecast with Open-Meteo air quality; if Windy is unreachable the panel falls back entirely to Open-Meteo and labels the source honestly. Per-venue forecasts still live on each production's weather band.";
  // crew positions / open roles
  if(/(open\s+(crew\s+)?positions?|open\s+roles?|unfilled|unassigned position|need.*(crew|operator|hire)|who.?s open|staffing|positions?\s+open|crew gap|short.?staff)/.test(q)){
    var _lines=order.map(function(k){var c=(typeof getProjectCrew==='function')?getProjectCrew(k):[];var open=c.filter(function(s){return !(s.name||'').trim();});return open.length?productions[k].name+": "+open.length+" open ("+open.slice(0,6).map(function(s){return s.pos;}).join(", ")+")":null;}).filter(Boolean);
    return _lines.length?("Open crew positions:\n"+_lines.join("\n")):"Every defined crew position is filled across all productions.";
  }
  // communications / email / teams
  if(/(email|message|inbox|outlook|teams|unread|who (emailed|messaged)|correspond|comms)/.test(q)&&typeof comms!=='undefined'){
    var un=commsUnread();
    if(/unread|new/.test(q))return un?un+" unread message"+(un>1?"s":"")+": "+((typeof permComms==='function')?permComms():comms).filter(function(m){return !m.read&&m.dir==='in';}).map(function(m){return (m.channel==='teams'?'Teams':'Email')+" from "+m.from+" re "+commsLinkLabel(m.linkType,m.linkId)+(m.subject?" — "+m.subject:"");}).join("; ")+"."  :"No unread messages — inbox is clear.";
    return comms.length+" message"+(comms.length>1?"s":"")+" on file ("+un+" unread). Recent: "+comms.slice(0,4).map(function(m){return (m.channel==='teams'?'Teams':'Email')+" "+(m.dir==='out'?'to '+m.to:'from '+m.from)+" re "+commsLinkLabel(m.linkType,m.linkId);}).join("; ")+".";
  }
  // National Press Club conflicts
  if(/(national press|press club|npc|presidential|potus|conflict.*(press|calendar|external)|external event)/.test(q)){
    if(typeof npcEvents!=='undefined'){var conf=npcAllConflicts();
      if(/conflict/.test(q)||conf.length){if(!conf.length)return "No National Press Club events currently conflict with booked Muse Live operations.";
        return conf.length+" National Press Club conflict"+(conf.length>1?"s":"")+": "+conf.map(function(c){return c.ev.title+" ("+c.ev.resource+", "+(NPC_DAYS[c.ev.col]||'')+") collides with "+c.conflicts.map(function(x){return x.label;}).join(', ')+(c.ev.crewed?" — CREWED":(c.ev.participate===false?" — not participating":""));}).join("; ")+".";}
      return "National Press Club calendar has "+npcEvents.length+" planned event"+(npcEvents.length>1?"s":"")+": "+npcEvents.map(function(e){return e.title+" ("+(NPC_DAYS[e.col]||'')+" "+e.time+")";}).join("; ")+".";}
  }
  // v33: broadcast manifest ≡ the booked list — a confirmed booking manifests instantly
  if(/(manifest|who.?s (booked|not booked)|travel.?complete|booked (crew|and)|still (pending|unbooked))/.test(q)&&typeof manifestList==='function'){
    loadTravelOnce();var manOut=[];
    var mOwn=(typeof permScope==='function'&&permScope('travel')==='own');var mMe=(typeof permUser==='function')?permUser():'';
    order.forEach(function(k){var crew=getProjectCrew(k).filter(function(s){return (s.name||'').trim();});if(!crew.length)return;
      var man=manifestList(k);
      if(mOwn){man=man.filter(function(e){return e.person===mMe;});crew=crew.filter(function(s){return s.name===mMe;});if(!crew.length&&!man.length)return;}
      var pend=crew.filter(function(s){return !crewFlight(s.name);});
      manOut.push(prodName(k)+' — '+man.length+'/'+crew.length+' booked & on the manifest'+
        (man.length?': '+man.slice(0,8).map(function(e){return e.person+' ('+(e.flight?e.flight.flightNumber:'')+(e.hotel?' + '+e.hotel.hotel:'')+')';}).join(', ')+(man.length>8?' +'+(man.length-8)+' more':''):'')+
        (pend.length?'; no flight yet: '+pend.slice(0,6).map(function(s){return s.name;}).join(', ')+(pend.length>6?' +'+(pend.length-6)+' more':''):''));});
    return manOut.length?'Broadcast manifest status (a confirmed booking lands a traveler straight on the manifest):\n'+manOut.join('\n'):'No crew assigned to travel yet — add personnel in a production\'s Travel tab or the Travel Portal.';
  }
  // v31: SAP travel requests / WBS / cost centers / expense lifecycle
  if(/(travel request|expense report|\bwbs\b|cost cent(er|re)|allocation|split.?cost|concur|expense polic|per.?diem rate|lifecycle)/.test(q)&&typeof trList==='function'){
    var trAll=[];var trOwn=(typeof permScope==='function'&&permScope('travel')==='own');var trMe=(typeof permUser==='function')?permUser():'';
    order.forEach(function(k){(productions[k].travelReqs||[]).forEach(function(r){if(!trOwn||r.person===trMe)trAll.push({k:k,r:r});});});
    if(/\bwbs\b|cost cent(er|re)/.test(q)&&typeof mdWbsElements==='function'){
      var w=mdWbsElements(),cc=mdCostCenters();
      return "Cost master data: "+w.length+" active WBS elements ("+w.map(function(x){return x.id;}).join(', ')+") and "+cc.length+" cost centers ("+cc.map(function(x){return x.id;}).join(', ')+"). Every travel/expense line allocates to one or more of these — by percentage or fixed amount, validated to sum to 100% / the line total. Manage them via 🏛 WBS / Cost Centers in any Finance view."+(trAll.length?" Current request rollup: "+trAll.map(function(x){return x.r.id+' → '+trWbsRollup(x.r).map(function(a){return a.target+' '+trFmt(a.amount);}).join(' + ');}).join('; ')+".":"");}
    if(!trAll.length)return "No travel requests yet. Create one in a production's Travel tab (+ New Request): it binds to the broadcast event dates and city, inherits the event's WBS element, auto-generates city × category M&IE per diems (75% on travel days), and walks Draft → Submitted → Approved → Booked → In-Trip → Expensed → Closed with every transition timestamped.";
    var byStatus={};trAll.forEach(function(x){byStatus[x.r.status]=(byStatus[x.r.status]||0)+1;});
    return trAll.length+" travel request"+(trAll.length===1?'':'s')+" ("+Object.keys(byStatus).map(function(st){return byStatus[st]+' '+trFlowMeta(st).label;}).join(', ')+"): "+
      trAll.slice(0,8).map(function(x){return x.r.id+' '+x.r.person+' ('+x.r.category+') · '+prodName(x.k)+' '+x.r.event.startDate+'→'+x.r.event.endDate+' · '+trFlowMeta(x.r.status).label+' · '+trFmt(trTotal(x.r));}).join('; ')+
      (trAll.length>8?' — +'+(trAll.length-8)+' more.':'.')+" Expense policy is per employment category (e.g. Vendors get no per diems; Talent books business class).";
  }
  // crew travel
  // book / search a flight via Travelpayouts (Muse auto-fill)
  if(/(book|search|find|need|get).{0,20}(flight|ticket|airfare|fare)|fly (someone|crew|him|her|them)|travelpayouts/.test(q)){
    return "Open a production's Travel tab — under \"Book Crew Flights\" pick a crew member from the ✦ Muse dropdown and I'll auto-fill their home-base origin, the show's destination airport, and stage their passport/email into the Travelpayouts search. From there you confirm the fare and it moves into Booked.";
  }
  if(/(flight|travel|flying|airport|boarding|departs?|arrives?|airline)/.test(q)&&typeof crewFlights!=='undefined'){
    var names=Object.keys(crewFlights);
    if(typeof permScope==='function'&&permScope('travel')==='own')names=names.filter(function(nm){return nm===permUser();});
    if(!names.length)return "No crew flights are booked yet.";
    return names.length+" crew booked: "+names.map(function(nm){var f=crewFlights[nm];return nm+" on "+airline(f.airlineCode).name+" "+f.flightNumber+" ("+f.dep.code+" "+fmtLocalTime(f.dep.localTime)+" → "+f.arr.code+" "+fmtLocalTime(f.arr.localTime)+")";}).join("; ")+".";
  }
  // ENG requests
  if(/(eng request|camera hit|live hit|liveu|eng op)/.test(q)&&typeof engRequests!=='undefined'){
    if(!engRequests.length)return "No ENG requests on file.";
    var openE=engRequests.filter(function(e){return e.status!=='Complete';});
    return engRequests.length+" ENG request"+(engRequests.length>1?"s":"")+" ("+openE.length+" active): "+engRequests.slice(0,6).map(function(e){return e.id+" "+e.name+" — "+(e.camera||'camera TBD')+", "+e.status;}).join("; ")+".";
  }
  var wantMissing=/(missing|outstanding|not ready|not done|blocked|incomplete|left|remaining|need)/.test(q);
  var wantPending=/(pending|waiting|in progress|in review|underway|tbd)/.test(q);
  var wantApproved=/(approved|ready|done|complete|good to go|cleared|set|confirmed|locked|finished)/.test(q);
  var wantOverview=/(overview|summary|status|how (is|are)|where (is|are)|risk|behind|on track|progress)/.test(q);
  var pk=findProd(q),dn=findDept(q);
  // crew directory lookup — search across Field/IT/PCR/Production & Executive
  var allCrewQ=CREW_FIELD.concat(CREW_IT,CREW_PCR,CREW_EXEC);
  var crewHit=null;for(var ci=0;ci<allCrewQ.length;ci++){var nm=allCrewQ[ci].name.toLowerCase();var parts=nm.split(' ');
    if(q.indexOf(nm)>-1||parts.some(function(pp){return pp.length>2&&q.indexOf(pp)>-1;})){crewHit=allCrewQ[ci];break;}}
  if(crewHit&&/(who|contact|email|phone|number|role|reach|call)/.test(q)){
    return crewHit.name+" — "+crewHit.pos+(crewHit.prov?" ("+crewHit.prov+")":"")+". Email: "+(crewHit.email||"n/a")+(crewHit.phone&&crewHit.phone!=='—'?" · Phone: "+crewHit.phone:"")+".";}
  // role lookup (e.g. "who is the audio engineer", "tech manager contact")
  if(/(who is|who's|contact for|reach the|find the).*(engineer|director|manager|operator|tech|a1|audio|camera|lighting|transmission|chyron|evs|producer)/.test(q)){
    var roleHits=allCrewQ.filter(function(m){return q.split(/[^a-z]+/).some(function(w){return w.length>3&&m.pos.toLowerCase().indexOf(w)>-1;});});
    if(roleHits.length)return roleHits.slice(0,4).map(function(m){return m.pos+": "+m.name+(m.phone&&m.phone!=='—'?" ("+m.phone+")":"")+" · "+(m.email||'');}).join("  |  ");}
  // customer / division query (e.g. "which sports productions", "show me news shows")
  var custMatch=null;var custSyn={"News":["news"],"Entertainment":["entertainment"],"Sports":["sports","sport"],"Muse Live":["muse live network","muse live division"],"Meta Horizon":["muse live plus"],"Digital":["digital"],"External Productions":["external"]};
  if(!pk){for(var ck in custSyn){for(var ci=0;ci<custSyn[ck].length;ci++){if(hasKw(q,custSyn[ck][ci])){custMatch=ck;break;}}if(custMatch)break;}}
  if(custMatch&&!dn){var inCust=order.filter(function(k){return productions[k].customer===custMatch;});
    if(!inCust.length)return "No productions are currently assigned to "+custMatch+".";
    return custMatch+" has "+inCust.length+" production"+(inCust.length>1?"s":"")+": "+inCust.map(function(k){var p=productions[k];var c=countStatus(p);return p.name+" ("+computePct(p)+"%, "+c.missing+" missing)";}).join("; ")+".";
  }
  // production + department (natural language)
  if(pk&&dn){
    var p=productions[pk];var d=deptByName(p,dn);
    if(!d)return "I don't see "+dn+" listed as a department on "+p.name+". Open that show's Overview and check the Department Status board.";
    var detail=(d[2]&&d[2]!=='—')?d[2]:'';
    var alsoMissing=wantMissing||/what.?s missing|anything missing|what is missing/i.test(q);
    var parts=[];
    if(d[1]==='approved'){
      parts.push(dn+" on "+p.name+" looks good — it's approved"+(detail?'. Note on file: '+detail:'')+".");
    }else if(d[1]==='pending'){
      parts.push(dn+" on "+p.name+" isn't missing, but it isn't locked yet either — status is still pending"+(detail?' ('+detail+')':'')+". Someone still needs to finish and approve it.");
    }else{
      parts.push(dn+" on "+p.name+" is missing"+(detail?' — '+detail:'')+". That should be treated as a follow-up before air.");
    }
    if(alsoMissing){
      var ms=listByStatus(p,'missing');var ps=listByStatus(p,'pending');
      if(ms.length)parts.push("Across the whole show, still missing: "+ms.join(', ')+".");
      else parts.push("Across the whole show, nothing is fully missing right now.");
      if(ps.length)parts.push("Still pending approval: "+ps.join(', ')+".");
    }
    if(wantOverview||/how (is|are)|lookin/i.test(q)){
      var c0=countStatus(p);
      parts.push("Overall "+p.name+" is about "+computePct(p)+"% clear ("+p.status+") — "+c0.approved+" approved, "+c0.pending+" pending, "+c0.missing+" missing."+(p.bottleneck&&p.bottleneck.text?" Biggest flag: "+p.bottleneck.text+".":""));
    }
    return parts.join(' ');
  }
  // production only — conversational rollup
  if(pk&&!dn){var p=productions[pk];var c=countStatus(p);
    var wantSchedule=/(schedule|broadcast|air date|when (is|does)|crew call|load.?in|rehears|date|timeline)/.test(q);
    if(wantSchedule&&p.schedule&&p.schedule.length){
      if(/broadcast|air date|on air|airs/.test(q)){var bc=p.schedule.filter(function(r){return (r[4]||'').trim()&&r[4]!=='—';});
        return bc.length?("For "+p.name+", broadcast is set for "+bc.map(function(r){return r[2]+" → "+r[4];}).join("; ")+"."):("I don't see a firm broadcast date on "+p.name+" yet — open Edit Schedule to add one.");}
      if(/crew call/.test(q)){var cc=p.schedule.filter(function(r){return (r[3]||'').trim()&&r[3]!=='—';});
        return cc.length?("Crew calls on "+p.name+": "+cc.map(function(r){return r[2]+" — "+r[3]+(r[0]?" ("+r[0]+")":"");}).join("; ")+"."):("No crew calls are listed on "+p.name+" yet.");}
      return p.name+" schedule has "+p.schedule.length+" line"+(p.schedule.length>1?"s":"")+": "+p.schedule.map(function(r){return r[2]+" — "+(r[0]||'')+(r[1]?" "+r[1]:"")+(r[4]&&r[4]!=='—'?" · broadcast "+r[4]:"");}).join("; ")+".";
    }
    if(wantSchedule)return p.name+" doesn't have a production schedule entered yet. Open it and click Edit Schedule to add one.";
    var ms=listByStatus(p,'missing');var ps=listByStatus(p,'pending');var as=listByStatus(p,'approved');
    var bits=[];
    bits.push(p.name+" is sitting at about "+computePct(p)+"% requirements cleared — status "+p.status+".");
    if(wantMissing||wantOverview||/how (is|are)|lookin|what.?s missing|anything missing/i.test(q)){
      if(ms.length)bits.push("Still missing: "+ms.join(', ')+".");
      else bits.push("Nothing is fully missing right now.");
      if(ps.length)bits.push("Waiting on approval: "+ps.join(', ')+".");
      if(as.length)bits.push("Already approved: "+as.join(', ')+".");
    }else if(wantPending){
      bits.push(ps.length?("Pending departments: "+ps.join(', ')+"."):"No departments are pending.");
    }else if(wantApproved){
      bits.push(as.length?("Approved so far: "+as.join(', ')+" ("+as.length+" departments)."):"Nothing approved yet.");
    }else{
      bits.push(c.approved+" approved, "+c.pending+" pending, "+c.missing+" missing.");
    }
    if(p.bottleneck&&p.bottleneck.text)bits.push("Biggest watch-item: "+p.bottleneck.text+".");
    bits.push("Open the show's Overview for the full department board.");
    return bits.join(' ');
  }
  // department only — across all productions
  if(dn&&!pk){var out=[];order.forEach(function(k){var d=deptByName(productions[k],dn);
    out.push(productions[k].name+" — "+(d&&statusMap[d[1]]?statusMap[d[1]].label:"not tracked"));});return dn+" across all productions: "+out.join("; ")+".";}
  // global status intents
  if(wantMissing||wantOverview||wantApproved||wantPending){
    var lines=order.map(function(k){var p=productions[k];var c=countStatus(p);return p.name+": "+p.pct+"% ("+p.status+") — "+c.approved+"✓ "+c.pending+"⋯ "+c.missing+"✕";});
    return "Portfolio status:\n"+lines.join("\n");
  }
  return "I can help with every Muse Live surface (dashboard, Broadcast Ops, techbook, packlist, crew, CAD, 360, finance, TX, travel, Omni, inventory, Wiki…) and live data across all productions — and any other question you ask. Try \"What is Muse Live?\", \"Is power ready for Orion Reveal?\", or \"Weather in Miami\".";
}
var museaiOpen=false;
function toggleMuseAi(){museaiOpen=!museaiOpen;var d=document.getElementById('museaiDrawer');var l=document.getElementById('museaiLauncher');
  /* Muse must sit above Omni (drawer z-index 66) — raise stack + close Omni when opening */
  if(museaiOpen){
    try{if(typeof closeOmniDrawer==='function')closeOmniDrawer();}catch(eO){}
    try{d.style.zIndex='70';}catch(eZ){}
  }else{
    try{d.style.zIndex='70';}catch(eZ2){}
  }
  d.style.transform=museaiOpen?'translateX(0)':'translateX(calc(100% + 60px))';
  try{if(typeof museSyncEdgeTabs==='function')museSyncEdgeTabs();
  else l.style.display=museaiOpen?'none':'flex';}catch(eTab){l.style.display=museaiOpen?'none':'flex';}
  if(museaiOpen){
    try{if(typeof badgeAckWrite==='function')badgeAckWrite('museai',typeof attentionCount==='function'?attentionCount():0);}catch(eA){}
    try{if(typeof omniFabBadge==='function')omniFabBadge();}catch(eB){}
  }
  if(museaiOpen&&!document.getElementById('museaiMessages').childElementCount){
    museaiPush("Hi, I'm Muse. Ask me anything about Muse Live — every screen, workflow, and live show — or any other question.","bot");
  }
  /* Do not auto-start a heavy local model on open — user loads from Settings if wanted */
}
function museaiPush(text,who){var m=document.getElementById('museaiMessages');var el=document.createElement('div');
  var safe=String(text==null?'':text).replace(/</g,'&lt;').replace(/>/g,'&gt;');
  if(who==='user'){el.className='flex justify-end min-w-0 w-full';el.innerHTML='<div class="museai-bubble-user text-xs rounded-2xl rounded-br-sm px-3 py-2">'+safe+'</div>';}
  else{el.className='flex justify-start min-w-0 w-full';el.innerHTML='<div class="museai-bubble-bot text-xs rounded-2xl rounded-bl-sm px-3 py-2">'+safe+'</div>';}
  m.appendChild(el);m.scrollTop=m.scrollHeight;}
function museaiPushHtml(html){
  var m=document.getElementById('museaiMessages');if(!m)return;
  var el=document.createElement('div');
  el.className='flex justify-start min-w-0 w-full';
  el.innerHTML='<div class="museai-bubble-bot text-xs rounded-2xl rounded-bl-sm px-3 py-2">'+html+'</div>';
  m.appendChild(el);m.scrollTop=m.scrollHeight;
}
/* File a Muse answer back into the wiki, so the next question can be solved
   from it: Muse reads the wiki (search_knowledge / museaiWikiAnswer) and now
   writes solutions there too. */
var _museaiLastQA=null;var _museaiSavedTitle=null;
function museaiOfferWikiSave(){
  museaiPushHtml('<span class="text-gray-500">File this solution where the crew can find it:</span> <button type="button" onclick="museaiSaveToWiki()" class="text-blue-700 font-bold hover:underline">Save to wiki \u2192</button>');
}
function museaiSaveToWiki(){
  try{
    if(!_museaiLastQA||!_museaiLastQA.a){toast('Nothing to save yet \u2014 ask Muse first.');return;}
    if(typeof MuseKB==='undefined'||typeof MuseKB.action!=='function'){toast('Wiki unavailable in this view.');return;}
    var q=String(_museaiLastQA.q||'').replace(/[\[\]{}|#<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,60)||'Muse solution';
    var stamp='';try{stamp=new Date().toLocaleString('en-US');}catch(eS){}
    var res=MuseKB.action({action:'edit',title:'Troubleshooting:'+q,text:'= '+q+' =\n\nFiled from Muse on '+stamp+'.\n\n== Question ==\n'+_museaiLastQA.q+'\n\n== Muse solution ==\n'+_museaiLastQA.a+'\n',summary:'Muse solution',token:'+\\\\'});
    if(res&&res.edit&&res.edit.result==='Success'){
      _museaiSavedTitle=res.edit.title;
      museaiPushHtml('Saved to the wiki as <b>'+esc(res.edit.title)+'</b> <button type="button" onclick="museaiOpenSavedWiki()" class="text-blue-700 font-bold hover:underline">Open \u2192</button>');
    }else if(res&&res.error){toast('Wiki save failed: '+(res.error.info||res.error.code));}
    else{toast('Wiki save failed \u2014 please retry.');}
  }catch(e){toast('Wiki save failed \u2014 please retry.');}
}
function museaiOpenSavedWiki(){
  try{
    if(typeof navGo==='function')navGo('kb');
    if(_museaiSavedTitle&&typeof MuseKB!=='undefined'&&MuseKB.openByTitle){var t=_museaiSavedTitle;setTimeout(function(){try{MuseKB.openByTitle(t);}catch(eO){}},150);}
  }catch(e){}
}
var _museaiPending=null;
var _museaiOffers={};
var _museaiOfferSeq=0;
var _museaiUndo=null;
/* Per-offer binding (BUG-05a): every Confirm/Cancel button carries the id of
   the offer it was rendered for, so an older bubble can never run a newer
   action. _museaiPending stays as the legacy latest-offer pointer because
   muse-ops-os wraps museaiConfirmAction and reads it for field notes. */
function museaiRegisterOffer(act){
  var id='museaiOf'+(++_museaiOfferSeq);
  act._offerId=id;_museaiOffers[id]=act;_museaiPending=act;
  return id;
}
function museaiTakeOffer(id){
  if(id){
    var act=_museaiOffers[id]||null;
    if(act){delete _museaiOffers[id];if(_museaiPending===act)_museaiPending=null;}
    return act;
  }
  var act2=_museaiPending;_museaiPending=null;
  if(act2&&act2._offerId)delete _museaiOffers[act2._offerId];
  return act2;
}
function museaiParseAction(qRaw){
  var q=String(qRaw||'').toLowerCase().trim();
  if(!q)return null;
  if(/^(restore|import) (a |my |the )?(muse live )?backup[.!]?$/.test(q))return {kind:'restoreBackup'};
  if(/^(export|download|save) (a |my |the )?(muse live )?backup[.!]?$/.test(q))return {kind:'exportBackup'};
  var key=findProd(q);
  if(!key&&typeof museaiFocusKey==='function')key=museaiFocusKey();
  if(!key||!productions[key])return null;
  var wantsWrite=/\b(mark|set|make|change|move|flag|approve|lock)\b/.test(q);
  var st=null;
  if(wantsWrite&&/\b(pending|unapproved)\b/.test(q))st='pending';
  else if(wantsWrite&&/\b(approved|ready)\b/.test(q))st='approved';
  else if(wantsWrite&&/\b(missing|blocked)\b/.test(q))st='missing';
  var dept=findDept(q);
  if(st&&dept)return {kind:'deptStatus',key:key,dept:dept,status:st};
  var wantsNav=/\b(open|show|go to|take me|switch to)\b/.test(q);
  var tab=null;
  if(wantsNav){
    if(/pack.?list/.test(q))tab='packlist';
    else if(/broadcast ops|go.?no.?go|signal path/.test(q))tab='ops';
    else if(/site survey/.test(q))tab='survey';
    else if(/\bcrew\b|call matrix/.test(q))tab='crew';
    else if(/\btravel\b/.test(q))tab='travel';
    else if(/\bfinance\b/.test(q))tab='finance';
    else if(/booking|muse schedule|resource schedul/.test(q))tab='schedule';
    else if(/\bschedule\b/.test(q))tab='schedule';
    else if(/track(ing)?/.test(q))tab='tracking';
    else if(/workflow/.test(q))tab='workflow';
    else if(/\bomni\b/.test(q))tab='omni';
    else if(/overview/.test(q))tab='overview';
  }
  if(tab)return {kind:'nav',key:key,tab:tab};
  if(/\b(export|download|generate)\b/.test(q)&&/tech.?book/.test(q))return {kind:'techbook',key:key};
  return null;
}
function museaiOfferAction(act){
  var id=museaiRegisterOffer(act);
  var p=productions[act.key];
  var name=p?p.name:act.key;
  var msg='';
  if(act.kind==='deptStatus')msg='I can set <b>'+esc(act.dept)+'</b> to <b>'+esc(act.status)+'</b> on <b>'+esc(name)+'</b>. Confirm to write it into the plan of record.';
  else if(act.kind==='nav')msg='Open the <b>'+esc(act.tab)+'</b> tab on <b>'+esc(name)+'</b>?';
  else if(act.kind==='techbook')msg='Export the live techbook PDF for <b>'+esc(name)+'</b>?';
  else if(act.kind==='restoreBackup')msg='Choose a Muse Live backup to validate and restore? You will review the record count before any changes are made.';
  else if(act.kind==='exportBackup')msg='Download a recovery backup of your current work, including unsaved changes?';
  else return false;
  museaiPushHtml(msg+'<div class="mt-2 flex flex-wrap gap-1.5">'+
    '<button type="button" onclick="museaiConfirmAction(\''+id+'\')" class="text-[10px] font-bold text-white bg-gray-900 rounded-lg px-2.5 py-1">Confirm</button>'+
    '<button type="button" onclick="museaiCancelAction(\''+id+'\')" class="text-[10px] font-bold text-gray-700 border border-gray-300 rounded-lg px-2.5 py-1">Cancel</button></div>');
  return true;
}
function museaiCancelAction(id){
  museaiTakeOffer(id);
  museaiPush('Cancelled — no change.','bot');
}
function museaiConfirmAction(id){
  var act=museaiTakeOffer(id);
  if(!act){museaiPush('Nothing pending to confirm.','bot');return;}
  if(act.kind==='restoreBackup'){MuseRecovery.chooseFile();return;}
  if(act.kind==='exportBackup'){museExportStateBackup();return;}
  if(act.kind==='deptStatus'){
    var p=productions[act.key];if(!p||!p.dept){museaiPush('That production is not loaded.','bot');return;}
    var idx=-1;for(var i=0;i<p.dept.length;i++){if(p.dept[i][0]===act.dept){idx=i;break;}}
    if(idx<0){museaiPush('I could not find '+act.dept+' on '+p.name+'.','bot');return;}
    var prev=p.dept[idx][1];
    _museaiUndo={kind:'deptStatus',key:act.key,idx:idx,prev:prev,dept:act.dept};
    setDeptStatus(act.key,idx,act.status);
    museaiPushHtml('Done — <b>'+esc(act.dept)+'</b> is now <b>'+esc(act.status)+'</b> on <b>'+esc(p.name)+'</b>.'+
      '<div class="mt-2"><button type="button" onclick="museaiUndoAction()" class="text-[10px] font-bold text-orange-900 border border-orange-300 bg-orange-50 rounded-lg px-2.5 py-1">Undo</button></div>');
    return;
  }
  if(act.kind==='nav'){
    try{if(typeof switchView==='function')switchView(act.key);if(typeof setProjTab==='function')setProjTab(act.key,act.tab);}catch(eN){}
    museaiPush('Opened '+act.tab+' on '+(productions[act.key]?productions[act.key].name:act.key)+'.','bot');
    return;
  }
  if(act.kind==='techbook'){
    try{if(typeof downloadTechbook==='function')downloadTechbook(act.key);}catch(eT){}
    museaiPush('Exporting live techbook for '+(productions[act.key]?productions[act.key].name:act.key)+'.','bot');
  }
}
function museaiUndoAction(){
  var u=_museaiUndo;_museaiUndo=null;
  if(!u||u.kind!=='deptStatus'){museaiPush('Nothing to undo.','bot');return;}
  setDeptStatus(u.key,u.idx,u.prev);
  museaiPush('Undone — '+u.dept+' is back to '+u.prev+'.','bot');
}
/* ===== MUSEAI — free real-world data (ESPN / Open-Meteo) — no paid edge AI ===== */
var MUSEAI_NFL_TEAMS={
  ari:{id:'ari',name:'Arizona Cardinals',aliases:['cardinals','arizona cardinals','ari']},
  atl:{id:'atl',name:'Atlanta Falcons',aliases:['falcons','atlanta falcons','atl']},
  bal:{id:'bal',name:'Baltimore Ravens',aliases:['ravens','baltimore ravens','bal']},
  buf:{id:'buf',name:'Buffalo Bills',aliases:['bills','buffalo bills','buf']},
  car:{id:'car',name:'Carolina Panthers',aliases:['panthers','carolina panthers','car']},
  chi:{id:'chi',name:'Chicago Bears',aliases:['bears','chicago bears','chi']},
  cin:{id:'cin',name:'Cincinnati Bengals',aliases:['bengals','cincinnati bengals','cin']},
  cle:{id:'cle',name:'Cleveland Browns',aliases:['browns','cleveland browns','cle']},
  dal:{id:'dal',name:'Dallas Cowboys',aliases:['cowboys','dallas cowboys','dal']},
  den:{id:'den',name:'Denver Broncos',aliases:['broncos','denver broncos','den']},
  det:{id:'det',name:'Detroit Lions',aliases:['lions','detroit lions','det']},
  gb:{id:'gb',name:'Green Bay Packers',aliases:['packers','green bay','green bay packers','gb']},
  hou:{id:'hou',name:'Houston Texans',aliases:['texans','houston texans','hou']},
  ind:{id:'ind',name:'Indianapolis Colts',aliases:['colts','indianapolis colts','ind']},
  jax:{id:'jax',name:'Jacksonville Jaguars',aliases:['jaguars','jags','jacksonville','jax']},
  kc:{id:'kc',name:'Kansas City Chiefs',aliases:['chiefs','kansas city','kc chiefs','kc']},
  lv:{id:'lv',name:'Las Vegas Raiders',aliases:['raiders','las vegas raiders','oakland raiders','lv']},
  lac:{id:'lac',name:'Los Angeles Chargers',aliases:['chargers','la chargers','lac']},
  lar:{id:'lar',name:'Los Angeles Rams',aliases:['rams','la rams','lar']},
  mia:{id:'mia',name:'Miami Dolphins',aliases:['dolphins','miami dolphins','fins','mia','miami']},
  min:{id:'min',name:'Minnesota Vikings',aliases:['vikings','minnesota vikings','min']},
  ne:{id:'ne',name:'New England Patriots',aliases:['patriots','pats','new england','ne']},
  no:{id:'no',name:'New Orleans Saints',aliases:['saints','new orleans','no saints','no']},
  nyg:{id:'nyg',name:'New York Giants',aliases:['giants','ny giants','new york giants','nyg']},
  nyj:{id:'nyj',name:'New York Jets',aliases:['jets','ny jets','new york jets','nyj']},
  phi:{id:'phi',name:'Philadelphia Eagles',aliases:['eagles','philadelphia eagles','phi']},
  pit:{id:'pit',name:'Pittsburgh Steelers',aliases:['steelers','pittsburgh steelers','pit']},
  sf:{id:'sf',name:'San Francisco 49ers',aliases:['49ers','niners','san francisco','sf']},
  sea:{id:'sea',name:'Seattle Seahawks',aliases:['seahawks','seattle seahawks','sea']},
  tb:{id:'tb',name:'Tampa Bay Buccaneers',aliases:['buccaneers','bucs','tampa bay','tb']},
  ten:{id:'ten',name:'Tennessee Titans',aliases:['titans','tennessee titans','ten']},
  wsh:{id:'wsh',name:'Washington Commanders',aliases:['commanders','washington commanders','wsh','washington']}
};
function museaiDetectNflTeam(q){
  q=String(q||'').toLowerCase();
  var best=null,bestLen=0;
  Object.keys(MUSEAI_NFL_TEAMS).forEach(function(id){
    var t=MUSEAI_NFL_TEAMS[id];
    (t.aliases||[]).forEach(function(a){
      if(a.length>=3&&q.indexOf(a)!==-1&&a.length>bestLen){best=t;bestLen=a.length;}
    });
  });
  return best;
}
function museaiFmtGameWhen(iso){
  try{
    var d=new Date(iso);
    if(isNaN(d.getTime()))return String(iso||'');
    return d.toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
  }catch(e){return String(iso||'');}
}
function museaiLooksRealWorld(q){
  q=String(q||'').toLowerCase();
  if(museaiDetectNflTeam(q))return true;
  if(/\b(nfl|pre.?season|regular season|super ?bowl|world series|mlb|nba|nhl|mls)\b/.test(q))return true;
  if(/\b(when is|next game|kickoff|who (do|does).*(play|face)|schedule for)\b/.test(q))return true;
  if(/\b(weather|forecast|temperature|how (hot|cold|warm)|rain (in|for)|aqi|air quality)\b/.test(q))return true;
  if(/\b(what time is it in|timezone|utc offset)\b/.test(q))return true;
  return false;
}
function museaiSportsAnswer(qRaw){
  var q=String(qRaw||'').toLowerCase().trim();
  var team=museaiDetectNflTeam(q);
  var wantsNext=/\b(next|upcoming|when|schedule|play|game|kickoff|pre.?season|regular season)\b/.test(q)||/\?/.test(q);
  if(!team&&!/\bnfl\b/.test(q))return Promise.resolve(null);
  if(team&&!wantsNext&&!/\b(game|play|schedule|when|next|pre.?season)\b/.test(q))return Promise.resolve(null);
  if(!team&&/\bnfl\b/.test(q)){
    return fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',{credentials:'omit'})
      .then(function(r){if(!r.ok)throw new Error('scoreboard '+r.status);return r.json();})
      .then(function(data){
        var events=data.events||[];
        if(!events.length)return 'No NFL games are listed on the live scoreboard right now.';
        var lines=events.slice(0,8).map(function(ev){
          var name=ev.name||ev.shortName||'Game';
          var st=((ev.status||{}).type||{}).description||'';
          var when=museaiFmtGameWhen(ev.date);
          return '• '+name+(st?' — '+st:'')+(when?' ('+when+')':'');
        });
        return 'NFL scoreboard (live public data):\n'+lines.join('\n');
      }).catch(function(){return null;});
  }
  var wantPre=/\bpre.?season\b/.test(q);
  var wantReg=/\bregular season\b/.test(q);
  return fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/'+team.id+'/schedule',{credentials:'omit'})
    .then(function(r){if(!r.ok)throw new Error('schedule '+r.status);return r.json();})
    .then(function(data){
      var events=data.events||[];
      var now=Date.now();
      var rootSeason=data.season||data.requestedSeason||{};
      function seasonMeta(ev){
        /* ESPN puts type on seasonType (and often root season), not always on event.season */
        return ev.seasonType||ev.season||rootSeason||{};
      }
      function seasonName(ev){
        var s=seasonMeta(ev);
        if(s.name)return s.name;
        if(s.type===1||s.slug==='preseason'||/pre/i.test(s.abbreviation||''))return 'Preseason';
        if(s.type===2||/reg/i.test(s.abbreviation||''))return 'Regular Season';
        if(s.type===3||/post/i.test(s.abbreviation||''))return 'Postseason';
        var wk=(ev.week&&ev.week.text)||'';
        if(/pre/i.test(wk))return 'Preseason';
        if(/regular/i.test(wk))return 'Regular Season';
        return wk||'NFL';
      }
      function isPre(ev){
        var s=seasonMeta(ev);var n=seasonName(ev);var wk=(ev.week&&ev.week.text)||'';
        return s.type===1||/pre/i.test(s.name||'')||/pre/i.test(s.abbreviation||'')||/pre/i.test(n)||/pre/i.test(wk);
      }
      function isReg(ev){
        var s=seasonMeta(ev);var n=seasonName(ev);var wk=(ev.week&&ev.week.text)||'';
        return s.type===2||/regular/i.test(s.name||'')||/reg/i.test(s.abbreviation||'')||/regular/i.test(n)||/regular/i.test(wk);
      }
      function isDone(ev){
        var t=((ev.competitions||[{}])[0].status||{}).type||{};
        return !!(t.completed||/final|status_final/i.test(t.name||'')||/final/i.test(t.description||''));
      }
      function kickDetail(ev){
        try{
          var d=(((ev.competitions||[{}])[0].status||{}).type||{}).detail;
          if(d)return d;
        }catch(e){}
        return museaiFmtGameWhen(ev.date);
      }
      var pool=events.slice();
      if(wantPre)pool=pool.filter(isPre);
      else if(wantReg)pool=pool.filter(isReg);
      /* If preseason filter emptied but root season is preseason, use all events */
      if(wantPre&&!pool.length&&(rootSeason.type===1||/pre/i.test(rootSeason.name||'')))pool=events.slice();
      var upcoming=pool.filter(function(ev){
        var t=new Date(ev.date).getTime();
        return !isNaN(t)&&t>=now-3*3600*1000&&!isDone(ev);
      }).sort(function(a,b){return new Date(a.date)-new Date(b.date);});
      var next=upcoming[0];
      if(!next){
        /* last resort: any future non-final game for the team */
        next=events.filter(function(ev){
          var t=new Date(ev.date).getTime();
          return !isNaN(t)&&t>=now-3*3600*1000&&!isDone(ev);
        }).sort(function(a,b){return new Date(a.date)-new Date(b.date);})[0];
        if(wantPre&&next&&!isPre(next)&&!(rootSeason.type===1))next=null;
      }
      if(!next){
        var last=pool.filter(isDone).sort(function(a,b){return new Date(b.date)-new Date(a.date);})[0];
        if(last){
          return 'I do not see another upcoming '+(wantPre?'preseason ':'')+'game for the '+team.name+' on the public schedule right now. Most recent: '+
            (last.name||last.shortName)+' — '+kickDetail(last)+' ('+((((last.competitions||[{}])[0].status||{}).type||{}).description||'final')+').';
        }
        return 'I could not find upcoming games for the '+team.name+' on the public NFL schedule right now.';
      }
      var comp=(next.competitions||[{}])[0]||{};
      var comps=comp.competitors||[];
      var home=null,away=null;
      comps.forEach(function(c){if(c.homeAway==='home')home=c;else if(c.homeAway==='away')away=c;});
      var homeN=home&&home.team?(home.team.displayName||home.team.name):'Home';
      var awayN=away&&away.team?(away.team.displayName||away.team.name):'Away';
      var venue=(comp.venue&&comp.venue.fullName)?comp.venue.fullName:'';
      var city=comp.venue&&comp.venue.address?(comp.venue.address.city||''):'';
      var broadcast='';
      try{
        var br=(comp.broadcasts||[]).map(function(b){
          if(b.names&&b.names.length)return b.names.join('/');
          if(b.media&&b.media.shortName)return b.media.shortName;
          return '';
        }).filter(Boolean);
        if(br.length)broadcast=br.filter(function(x,i,a){return a.indexOf(x)===i;}).join(', ');
        else if(comp.geoBroadcasts&&comp.geoBroadcasts.length)
          broadcast=comp.geoBroadcasts.map(function(g){return (g.media&&g.media.shortName)||g.type||'';}).filter(Boolean).join(', ');
      }catch(eB){}
      var sn=seasonName(next)||'NFL';
      var bits=[];
      bits.push('The next '+(wantPre||isPre(next)?'preseason ':'')+'game for the '+team.name+' is '+awayN+' at '+homeN+'.');
      bits.push('Kickoff: '+kickDetail(next)+'.');
      if(venue)bits.push('Venue: '+venue+(city?' ('+city+')':'')+'.');
      if(broadcast)bits.push('TV/stream: '+broadcast+'.');
      bits.push('('+sn+' · live public schedule data)');
      if(upcoming.length>1){
        var more=upcoming.slice(1,3).map(function(ev){return (ev.shortName||ev.name)+' — '+kickDetail(ev);});
        bits.push('After that: '+more.join('; ')+'.');
      }
      return bits.join(' ');
    }).catch(function(){return null;});
}
function museaiWeatherAnswer(qRaw){
  var q=String(qRaw||'').toLowerCase();
  if(!/\b(weather|forecast|temperature|how (hot|cold|warm)|rain|humidity|wind)\b/.test(q))return Promise.resolve(null);
  /* city: "weather in Miami" / "Miami weather" */
  var m=q.match(/(?:weather|forecast|temperature|rain).{0,12}\bin\s+([a-z][a-z\s]{1,40}?)(?:\?|$| today| tomorrow| this)/i)
    ||q.match(/\b([a-z][a-z\s]{1,30}?)\s+(weather|forecast|temperature)\b/i);
  var city=(m&&(m[1]||'').trim())||'';
  city=city.replace(/\b(the|a|an|for|today|tomorrow|current)\b/g,'').trim();
  if(!city||city.length<2){
    /* try venue of focus production */
    try{
      var fk=typeof museaiFocusKey==='function'?museaiFocusKey():null;
      var p=fk&&productions[fk]?productions[fk]:null;
      if(p&&p.location)city=String(p.location).split(',')[0].trim();
    }catch(e){}
  }
  if(!city)return Promise.resolve('Ask for weather in a city — e.g. \"weather in Miami\" or \"forecast for Los Angeles\".');
  var geo='https://geocoding-api.open-meteo.com/v1/search?name='+encodeURIComponent(city)+'&count=1&language=en&format=json';
  return fetch(geo,{credentials:'omit'}).then(function(r){return r.json();}).then(function(g){
    var hit=(g.results&&g.results[0])||null;
    if(!hit)return 'I could not find \"'+city+'\" for a weather lookup.';
    var url='https://api.open-meteo.com/v1/forecast?latitude='+hit.latitude+'&longitude='+hit.longitude+
      '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto';
    return fetch(url,{credentials:'omit'}).then(function(r2){return r2.json();}).then(function(w){
      var c=w.current||{};
      var place=hit.name+(hit.admin1?', '+hit.admin1:'')+(hit.country_code?', '+hit.country_code:'');
      return 'Weather in '+place+': '+Math.round(c.temperature_2m)+'°F, humidity '+c.relative_humidity_2m+'%, wind '+Math.round(c.wind_speed_10m)+' mph (Open-Meteo, free public data).';
    });
  }).catch(function(){return null;});
}
function museaiRealWorldTry(q){
  if(!museaiLooksRealWorld(q))return Promise.resolve(null);
  return museaiSportsAnswer(q).then(function(ans){
    if(ans)return ans;
    return museaiWeatherAnswer(q);
  }).catch(function(){return museaiWeatherAnswer(q).catch(function(){return null;});});
}

/* ===== MUSEAI — offline fallback: rules + free real-world APIs (the live agent is js/muse-agent.js) ===== */
var museaiHistory=[];var museaiBusy=false;
function museaiDeliver(q){
  var rawQ=q;
  var corr=null;try{corr=museCorrectQuery(q);if(corr&&corr.q)q=corr.q;}catch(eC){}
  museaiHistory.push({role:'user',content:rawQ});if(museaiHistory.length>24)museaiHistory.splice(0,museaiHistory.length-24);
  museaiBusy=true;museaiTyping(true);
  var spellNote=(corr&&corr.corrections&&corr.corrections.length)?museCorrectHint(corr):'';

  function finishBot(text,note){
    museaiTyping(false);museaiBusy=false;
    var t=(text==null?'':String(text)).trim();
    /* Never show garbage model output (!!!! etc.) — prefer live Muse Live rules */
    if(!t||/^[\s!?.,…]+$/.test(t)||/([!?])\1{4,}/.test(t)||((t.match(/!/g)||[]).length>10&&t.replace(/[^!]/g,'').length/t.length>0.2)){
      t=(typeof museaiAnswer==='function')?museaiAnswer(q):'No answer available.';
    }
    if(!t){t=(typeof museaiAnswer==='function')?museaiAnswer(q):'No answer available.';}
    /* Only quietly note domain spelling fixes (e.g. superbow) — never dump the whole rewrite */
    if(spellNote&&t&&t.indexOf(spellNote)<0)t=t+' '+spellNote;
    museaiHistory.push({role:'assistant',content:t});
    _museaiLastQA={q:rawQ,a:t};
    museaiPush(t,'bot');
    if(t&&t.length>40)museaiOfferWikiSave();
    if(note)museaiPush(note,'bot');
  }
  function rulesAnswer(){
    try{return (typeof museaiAnswer==='function')?museaiAnswer(q):'Muse rules unavailable.';}
    catch(e){return 'Muse could not answer from rules.';}
  }
  function tryModelOrRules(){
    if(typeof MuseAiMuseAi!=='undefined'&&MuseAiMuseAi.ask){
      MuseAiMuseAi.ask(q).then(function(ans){finishBot(ans,null);})
        .catch(function(){finishBot(rulesAnswer(),null);});
      return;
    }
    setTimeout(function(){finishBot(rulesAnswer(),null);},120);
  }

  /* 0) Confirmed Action Muse — mutate / navigate only after Confirm */
  try{
    var act=museaiParseAction(q);
    if(act){
      museaiTyping(false);museaiBusy=false;
      if(museaiOfferAction(act))return;
    }
  }catch(eAct){}

  /* 1) Structured Muse Live status → live rules first (authoritative facts, natural wording) */
  try{
    var ql=q.toLowerCase();
    var looksStatus=/\b(audio|camera|power|transmission|missing|pending|ready|looking|status|approved|blocked)\b/i.test(ql)
      && /\b(world ?tour|ray-?ban|orion|whatsapp|instagram|creator|charm|muse ai|muse live|show|production|for the)\b/i.test(ql);
    if(looksStatus&&typeof museaiAnswer==='function'){
      var quick=museaiAnswer(q);
      if(quick&&quick.length>20&&!/^I (track|can help)/i.test(quick)){
        finishBot(quick,null);
        return;
      }
    }
  }catch(eSt){}

  /* 1) Free real-world data (ESPN schedules, Open-Meteo weather) — no edge AI, no refusal */
  if(typeof museaiRealWorldTry==='function'&&museaiLooksRealWorld(q)){
    museaiRealWorldTry(q).then(function(ans){
      if(ans&&String(ans).trim()){finishBot(ans,null);return;}
      tryModelOrRules();
    }).catch(function(){tryModelOrRules();});
    return;
  }

  /* 2) Muse agent when connected, else rules */
  tryModelOrRules();


}
function museaiSend(){if(museaiBusy)return;var inp=document.getElementById('museaiInput');var q=inp.value.trim();if(!q)return;inp.value='';museaiPush(q,'user');museaiDeliver(q);}
function museaiAsk(q){if(!museaiOpen)toggleMuseAi();if(museaiBusy)return;museaiPush(q,'user');museaiDeliver(q);}
function museaiTyping(on){var m=document.getElementById('museaiMessages');var ex=document.getElementById('museaiTypingRow');
  if(!on){if(ex)ex.remove();return;}
  if(ex)return;var el=document.createElement('div');el.id='museaiTypingRow';el.className='flex justify-start';
  el.innerHTML='<div class="museai-bubble-bot museai-typing-bubble rounded-2xl rounded-bl-sm px-3 py-2.5 flex items-center gap-1"><span class="museai-dot"></span><span class="museai-dot" style="animation-delay:.15s"></span><span class="museai-dot" style="animation-delay:.3s"></span></div>';
  m.appendChild(el);m.scrollTop=m.scrollHeight;}
function museaiChip(b){document.getElementById('museaiInput').value=b.textContent;museaiSend();}

/* ---- THEME (light / dark) ---- */
function museThemePref(){
  try{var p=localStorage.getItem('museTheme');if(p==='light'||p==='dark'||p==='system')return p;}catch(e){}
  return 'dark'; /* first visit defaults to dark; a stored preference always wins */
}
function museOsDark(){try{return !!(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);}catch(e){return false;}}
function museAppliedScheme(){return museThemePref()==='system'?(museOsDark()?'dark':'light'):museThemePref();}
function museTheme(){return museAppliedScheme();}
function musePaintTheme(scheme,pref){
  var dark=scheme==='dark';
  document.documentElement.classList.toggle('dark',dark);
  document.documentElement.setAttribute('data-theme-pref',pref||museThemePref());
  document.documentElement.style.colorScheme=(pref==='system'||!pref)?'light dark':scheme;
  try{
    var bar=dark?'#242526':'#FFFFFF';
    var metas=document.querySelectorAll('meta[name="theme-color"]');
    if(metas[0])metas[0].setAttribute('content',bar);
    document.cookie='Muse-Theme='+scheme+'; Path=/; Max-Age=31536000; SameSite=Lax';
  }catch(eC){}
  try{if(typeof audioDrawWave==='function')for(var _aid in _audioBlobs)audioDrawWave(_aid);}catch(e){}
  try{if(typeof museRethemeMaps==='function')museRethemeMaps();}catch(e){}
  try{if(typeof trkSyncTheme==='function')trkSyncTheme();}catch(e){}
  try{syncThemeBtn();}catch(eS){}
}
function applyTheme(t){
  if(t==='system'){
    try{localStorage.setItem('museTheme','system');}catch(e){}
    musePaintTheme(museOsDark()?'dark':'light','system');
    try{if(typeof renderSnapshot==='function')renderSnapshot();}catch(eR){}
    try{if(typeof renderRoutingBoard==='function')renderRoutingBoard();}catch(eR2){}
    try{if(typeof renderSnapFilters==='function')renderSnapFilters();}catch(eR3){}
    return;
  }
  var scheme=t==='dark'?'dark':'light';
  try{localStorage.setItem('museTheme',scheme);}catch(e){}
  musePaintTheme(scheme,scheme);
  try{if(typeof renderSnapshot==='function')renderSnapshot();}catch(eR){}
  try{if(typeof renderRoutingBoard==='function')renderRoutingBoard();}catch(eR2){}
  try{if(typeof renderSnapFilters==='function')renderSnapFilters();}catch(eR3){}
}
function setThemePref(t){applyTheme(t);try{var ov=document.getElementById('userProfileOverlay');if(ov&&ov.style.display==='flex')openUserProfile();}catch(e){}try{
  toast(t==='system'?'Theme follows your device':' '+(t==='dark'?'Dark':'Light')+' mode saved');
}catch(e){}}
(function(){
  try{
    if(!window.matchMedia)return;
    var mq=window.matchMedia('(prefers-color-scheme: dark)');
    var fn=function(){if(museThemePref()==='system')musePaintTheme(museOsDark()?'dark':'light','system');};
    if(mq.addEventListener)mq.addEventListener('change',fn);else if(mq.addListener)mq.addListener(fn);
  }catch(e){}
  requestAnimationFrame(function(){requestAnimationFrame(function(){try{document.documentElement.classList.remove('muse-theme-boot');}catch(e2){}});});
})();
function themeSunSVG(s){return '<svg width="'+s+'" height="'+s+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';}
function themeMoonSVG(s){return '<svg width="'+s+'" height="'+s+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';}
function syncThemeBtn(){var b=document.getElementById('themeBtn');if(!b)return;var dark=document.documentElement.classList.contains('dark');
  var narrow=(typeof window!=='undefined'&&window.matchMedia&&window.matchMedia('(max-width:767px)').matches);
  if(narrow){
    /* single compact toggle — dual segment is too wide on phones */
    var next=dark?'light':'dark';
    var lab=dark?'Switch to light mode':'Switch to dark mode';
    var bg=dark?'background:#242526;color:#e7f3ff;border:1px solid #3e4042':'background:#f0f2f5;color:#18191A;border:1px solid #e4e6eb';
    b.classList.add('muse-theme-mobile');
    b.innerHTML='<button onclick="applyTheme(\''+next+'\')" title="'+lab+'" aria-label="'+lab+'" style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:10px;cursor:pointer;'+bg+'">'+(dark?themeSunSVG(15):themeMoonSVG(14))+'</button>';
    return;
  }
  b.classList.remove('muse-theme-mobile');
  function seg(on,icon,t,label){var st=on?(dark?'background:#4b4f56;color:#e7f3ff;box-shadow:0 1px 3px rgba(0,0,0,.4)':'background:#ffffff;color:#18191A;box-shadow:0 1px 3px rgba(0,0,0,.16)'):'background:transparent;color:'+(dark?'#8A8D91':'#b0b3b8');
    return '<button onclick="applyTheme(\''+t+'\')" title="'+label+'" aria-label="'+label+'" aria-pressed="'+(on?'true':'false')+'" style="display:flex;align-items:center;justify-content:center;width:27px;height:22px;border-radius:999px;border:none;cursor:pointer;transition:background .15s,color .15s;'+st+'">'+icon+'</button>';}
  b.innerHTML=seg(!dark,themeSunSVG(13),'light','Light mode')+seg(dark,themeMoonSVG(12),'dark','Dark mode');}
/* re-render theme control when crossing phone/desktop breakpoint */
(function(){try{if(window.matchMedia){var mq=window.matchMedia('(max-width:767px)');var fn=function(){try{syncThemeBtn();}catch(e){}};if(mq.addEventListener)mq.addEventListener('change',fn);else if(mq.addListener)mq.addListener(fn);}}catch(e){}})();
function themeChoiceBtn(t){
  var pref=museThemePref();
  var cur=pref===t;
  var lab=t==='dark'?'Dark':(t==='system'?'Follow OS':'Light');
  var ic=t==='dark'?themeMoonSVG(11):(t==='system'?'<span style="font-size:11px">◐</span>':themeSunSVG(12));
  return '<button onclick="setThemePref(\''+t+'\')" class="'+(cur?'border-blue-300 bg-blue-50/60 text-blue-700':'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50')+' border rounded-lg px-2.5 py-1.5 text-[10px] font-bold flex items-center gap-1.5 transition-colors">'+ic+'<span>'+lab+'</span>'+(cur?'<span>✓</span>':'')+'</button>';}
/* Reset the demo: clear saved demo data (theme is kept), re-anchor dates, reload */
function museResetDemo(){
  if(!window.confirm('Reset the demo? This clears saved changes in this browser and reloads Muse Live with fresh demo data.'))return;
  try{if(typeof MuseDemo!=='undefined'&&MuseDemo.reset){MuseDemo.reset();return;}}catch(e){}
  location.reload();
}
function initApp(){
  try{musePaintTheme(museAppliedScheme(),museThemePref());}catch(eTh){}
  /* rolling demo clock: move every show's seed dates relative to today before saved edits overlay */
  try{if(typeof MuseDemo!=='undefined'&&MuseDemo.applySeed)MuseDemo.applySeed();}catch(eDemo){}
  try{loadState();}catch(e){}
  try{if(typeof MuseBOps!=='undefined'&&MuseBOps.seedShowcase)MuseBOps.seedShowcase();}catch(e){}
  try{if(typeof permInit==='function')permInit();}catch(e){}
  try{syncThemeBtn();}catch(e){}
  try{order.forEach(function(k){if(productions[k])ensureAllDepts(productions[k]);});}catch(e){}
  try{normalizeAll();}catch(e){}
  try{ensureSail250Complete();}catch(eS2){}
  try{order.forEach(function(k){if(productions[k])applyReadiness(productions[k]);});}catch(eR){}
  try{locInit();}catch(e){}
  try{normalizeSchedules();}catch(e){}
  try{navRailInit();}catch(e){}
  try{renderTabs();}catch(e){}
  try{renderPortfolio();}catch(e){}
  try{renderEngPortfolio();}catch(e){}
  try{buildClocks();}catch(e){}
  try{cfgBannerInit();}catch(e){}
  try{if(typeof renderRoutingBoard==='function')renderRoutingBoard();}catch(e){}
  tickClock();tickAir();if(window.MuseHeartbeat&&typeof window.MuseHeartbeat.every==='function'){try{window.MuseHeartbeat.every('clocks:tick',tickClock,1000);window.MuseHeartbeat.every('clocks:air',tickAir,1000);window.MuseHeartbeat.every('clocks:lat',tickLat,2000);}catch(eHb){setInterval(tickClock,1000);setInterval(tickAir,1000);setInterval(tickLat,2000);}}else{setInterval(tickClock,1000);setInterval(tickAir,1000);setInterval(tickLat,2000);}
  try{museHistoryInit();}catch(e){}
  try{museClockBadge();}catch(e){}
  /* Broadcast Ops + truck telemetry load when the browser is idle (not on the critical path) */
  function loadBOpsIdle(){
    if(typeof MuseLazy==='undefined'||!MuseLazy.ensureBOps)return;
    MuseLazy.ensureBOps().then(function(){
      try{var a=document.querySelector('.view-pane.active');var k=a&&a.id.replace(/^view-/,'');if(productions[k])renderProjectView(k);}catch(e){}
    }).catch(function(){});
  }
  try{(window.requestIdleCallback||function(f){return setTimeout(f,1200);})(loadBOpsIdle,{timeout:2500});}catch(eIdle){setTimeout(loadBOpsIdle,1500);}
  function afterPaint(){
    try{renderSnapFilters();}catch(e){}
    try{renderSnapshot();}catch(e){}
    try{renderMatrix();}catch(e){}
    try{buildMuseAiChips();}catch(e){}
    try{renderSchedule();}catch(e){}
    try{var nav=document.getElementById('tabNav');if(nav&&!nav.getAttribute('data-wired')){nav.setAttribute('data-wired','1');nav.addEventListener('click',function(e){var b=e.target.closest('button');if(b&&b.getAttribute('data-view'))switchView(b.getAttribute('data-view'));});}}catch(e){}
    try{renderPersonnelDir();}catch(e){}
    try{if(window.MuseHeartbeat&&typeof window.MuseHeartbeat.every==='function')window.MuseHeartbeat.every('portal:tick',function(){if(typeof portalTick==='function')portalTick();},1000);else setInterval(function(){if(typeof portalTick==='function')portalTick();},1000);}catch(e){}
    try{trackInit();}catch(e){}
    try{opsInit();}catch(e){}
    try{engInit();}catch(e){}
    try{travelInit();}catch(e){}
    try{npcInit();}catch(e){}
    try{renderNPCAlert();}catch(e){}
    try{commsInit();}catch(e){}
    try{equipInit();}catch(e){}
    try{loadPerDataOnce();}catch(e){}
    try{loadCustomPersOnce();}catch(e){}
    try{museClockSync();if(window.MuseHeartbeat&&typeof window.MuseHeartbeat.every==='function')window.MuseHeartbeat.every('clocks:sync',museClockSync,600000);else setInterval(museClockSync,600000);
      document.addEventListener('visibilitychange',function(){if(!document.hidden&&(Date.now()-(_pClock.at||0))>120000)museClockSync();});}catch(e){}
    try{setTimeout(mountVisibleMaps,300);}catch(e){}
    try{
      window.addEventListener('storage',function(ev){
        if(!ev||(ev.key!=='muselive_edits'&&ev.key!=='muselive_edits_rev'))return;
        if(document.hidden===false){
          var focused=document.activeElement;
          if(_museSaveScheduled||(focused&&/INPUT|TEXTAREA|SELECT/.test(focused.tagName))||(_museSavedWorking&&museSerializeState(museBuildEdits(),false)!==_museSavedWorking)){
            if(typeof toast==='function')toast('Another tab saved. Finish or back up your current edit before reloading.');return;
          }
          try{if(typeof toast==='function')toast('Another tab saved — reloading state…');}catch(eT){}
          try{loadState();renderAll();}catch(eR){}
        }
      });
    }catch(eSt){}
    try{
      var warmBOps=function(){
        if(typeof MuseLazy!=='undefined'&&MuseLazy.ensureBOps){
          MuseLazy.ensureBOps().then(function(){
            try{if(typeof MuseBOps!=='undefined'&&MuseBOps.seedShowcase)MuseBOps.seedShowcase();}catch(e0){}
          }).catch(function(){});
        }
      };
      if(typeof requestIdleCallback==='function')requestIdleCallback(warmBOps,{timeout:2500});
      else setTimeout(warmBOps,1200);
    }catch(eW2){}
    try{museRefreshStorageChip();}catch(ePor){}
  }
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(function(){setTimeout(afterPaint,0);});
  else setTimeout(afterPaint,0);
}
/* ============================================================================
   RVON ALPHA MODEL · CROSS-PROJECT CONFLICT CHECK · SHARED SEARCHABLE PICKER  (v3)
   ----------------------------------------------------------------------------
   Unifies the former "RVON Channels" (port quantity) and "RVON Alphas" (per-port
   label) into ONE field: productions[k].tbFields.Audio.rvon = [alpha, ...].
     • array LENGTH  = channel count (port quantity)
     • each ENTRY    = the alpha assigned to that port ('' = unassigned)
   Alphas are globally unique across productions — assigning one in a production
   makes it unavailable in every other (rvonAlphaOwner / setRvonAlpha guard /
   the greyed-out rows in the picker).
   openDeptPicker() is a single shared, type-to-filter popover that replaces every
   long native <select> on the Department Status tiles (Audio, Cameras, Video,
   Transmission/Signal, …) so nobody scrolls a 60-row menu again.
   ============================================================================ */

/* ---- read / normalise a production's RVON alpha array ----
   v30 Module 2b: every channel is an object {a:alpha, t:'IFB'|'PL', p:'assigned person'}.
   Channel type (IFB vs Party Line) is a REQUIRED single-select; person is tied to the
   channel. Legacy entries were plain alpha strings — migrated in place on first read. */
function rvonAlphaDefaultType(al){var role=rvonAlphaRole(al);if(/\bPL\b/.test(role))return 'PL';return 'IFB';}
function rvonNormEntry(e){if(e&&typeof e==='object')return e;
  var al=(''+(e||'')).trim().toUpperCase();return {a:al,t:al?rvonAlphaDefaultType(al):'',p:''};}
function rvonArr(p){if(!p)return [];var tf=p.tbFields&&p.tbFields.Audio;var v=tf&&tf.rvon;if(!Array.isArray(v))return [];
  for(var i=0;i<v.length;i++){if(!v[i]||typeof v[i]!=='object')v[i]=rvonNormEntry(v[i]);}
  return v;}
function rvonArrKey(key){return rvonArr(productions[key]);}

/* ---- compact summary (dashboard note · packlist · techbook header) ---- */
function rvonLabel(p){var a=rvonArr(p);var n=a.length;var asg=a.filter(function(e){return e.a;});
  if(!n)return 'RVON — no channels';
  return n+' ch · '+(asg.length?asg.map(function(e){return e.a;}).join(', '):'no alphas assigned');}

/* ---- human role for an alpha (drives the techbook "Feed / Assignment" column) ---- */
function rvonAlphaRole(al){return {"XZ32":"Field Source 01","FB63":"Field Source 02","OK36":"Field Source 03","TG89":"Field Source 04","EB49":"Field Source 05","NY93":"Field Source 06","IM20":"Field Source 07","DJ34":"Field Source 08","II12":"Field Source 09","AT19":"Field Source 10","JA50":"Field Source 11","NC97":"Field Source 12","OR41":"Field Source 13","VX35":"Field Source 14","QO48":"Field Source 15","WK22":"Field Source 16","DG84":"Field Source 17","IF47":"Field Source 18","UL83":"Field Source 19","HE97":"Field Source 20","IF49":"Field Source 21","UF30":"Field Source 22","GH78":"Field Source 23","AE37":"Field Source 24","ZF45":"Field Source 25","RN24":"Field Source 26","HF58":"Field Source 27","UT86":"Field Source 28","GC35":"Field Source 29","GN31":"Field Source 30","GC16":"Field Source 31","JY81":"Field Source 32","RW85":"Field Source 33","HT80":"Field Source 34","SU61":"Field Source 35","TY82":"Field Source 36","GU47":"Field Source 37","MI23":"Field Source 38","HT57":"Field Source 39","LB29":"Field Source 40","TR63":"Producer PL","NN34":"Director PL","EO61":"Technical Director PL","GS74":"Associate Director PL","UD54":"Tech PL","XB33":"Audio PL","TO63":"Audio PL 2","EF16":"Transmission PL","FW20":"Host 1 IFB","EO83":"Host 2 IFB","AK79":"Host 3 IFB","RA33":"Host 4 IFB","JM52":"Camera 1 PL","FM16":"Camera 2 PL","GY23":"Camera 3 PL","WD43":"Camera 4 PL","CE35":"Camera 5 PL","JW45":"Camera 6 PL","HI22":"Camera 7 PL","AS22":"Camera 8 PL","NK89":"IFB Return 1","YX77":"IFB Return 2","IE26":"IFB Return 3","BO48":"IFB Return 4","EO29":"IFB Return 5","XI97":"IFB Return 6","HK64":"IFB Return 7","TT95":"IFB Return 8","PM85":"Intercom port","SU19":"Intercom port","AH59":"Intercom port","CX16":"Intercom port","KH48":"Intercom port","FY26":"Intercom port","UJ29":"Intercom port","CZ15":"Intercom port","TT73":"Intercom port","HQ96":"Intercom port"}[(""+al).toUpperCase()]||"Intercom port";}

/* ---- CONFLICT CHECK: which OTHER production currently owns this alpha (or null) ---- */
function rvonAlphaOwner(alpha,exceptKey){alpha=(''+alpha).trim().toUpperCase();if(!alpha)return null;
  for(var i=0;i<order.length;i++){var k=order[i];if(k===exceptKey)continue;
    var a=rvonArrKey(k);for(var j=0;j<a.length;j++){if((''+a[j].a).trim().toUpperCase()===alpha)return k;}}
  return null;}
/* alpha -> owning production key (excluding one production) — powers picker availability */
function rvonTakenMap(exceptKey){var m={};for(var i=0;i<order.length;i++){var k=order[i];if(k===exceptKey)continue;
  rvonArrKey(k).forEach(function(e){if(e.a)m[(''+e.a).trim().toUpperCase()]=k;});}return m;}
/* ---- SEED: unique, non-overlapping starter alphas per production (from ensureTB) ----
   Preserves any real array already present (incl. user edits and folded legacy
   "rvonalphas"); only seeds when rvon is missing or a legacy descriptive string. */
function seedRvonFor(p,t,key){if(!p)return;if(!p.tbFields)p.tbFields={};if(!p.tbFields.Audio)p.tbFields.Audio={};
  var cur=p.tbFields.Audio.rvon;
  var legacyAlphas=Array.isArray(p.tbFields.Audio.rvonalphas)?p.tbFields.Audio.rvonalphas.filter(Boolean):[];
  if(Array.isArray(cur)){ // already on the array model — absorb stray legacy alphas, retire old field
    var curE=rvonArr(p); // normalizes string entries → {a,t,p} objects in place
    if(legacyAlphas.length)legacyAlphas.forEach(function(al){var up=(''+al).toUpperCase();
      if(!curE.some(function(e){return e.a===up;}))curE.push(rvonNormEntry(al));});
    delete p.tbFields.Audio.rvonalphas;return;}
  delete p.tbFields.Audio.rvonalphas;
  /* Muse AI World Tour intercom & alphas (MPK Finale) */
  if(key==='museaitour'||(t&&t._fwc)){
    var fwcPairs=[
      ["NK89",'IFB','Presentation Studio IFB-1'],["PM85",'PL','Presentation Studio HM-1'],
      ["YX77",'IFB','Presentation Studio IFB-2'],["SU19",'PL','Presentation Studio HM-2'],
      ["IE26",'IFB','Presentation Studio IFB-3'],["AH59",'PL','Presentation Studio HM-3'],
      ["BO48",'IFB','Presentation Studio IFB-4'],["CX16",'PL','Presentation Studio HM-4'],
      ["EO29",'IFB','Outside Announce Platform IFB-5'],["KH48",'PL','Outside Announce Platform HM-5'],
      ["XI97",'IFB','Outside Announce Platform IFB-6'],["FY26",'PL','Outside Announce Platform HM-6'],
      ["UJ29",'PL','CAM PL A'],["CZ15",'PL','PROD PL A'],["TT73",'PL','TECH PL A'],["HQ96",'PL','AUDIO PL'],["EF16",'PL','TX PL']
    ];
    p.tbFields.Audio.rvon=fwcPairs.map(function(x){return {a:x[0],t:x[1],p:'',notes:x[2]||''};});
    return;}
  var ch=(t&&parseInt(t.audioCh,10))||16;ch=ch>=96?8:ch>=32?7:6;     // channel count from audio scale
  var arr=legacyAlphas.map(rvonNormEntry);                           // honour real prior alphas first
  var used={};order.forEach(function(k){if(productions[k]===p)return;rvonArrKey(k).forEach(function(e){if(e.a)used[(''+e.a).toUpperCase()]=1;});});
  arr.forEach(function(e){if(e.a)used[e.a.toUpperCase()]=1;});
  for(var pi=0;pi<RVON_ALPHA_POOL.length&&arr.length<ch;pi++){var cand=RVON_ALPHA_POOL[pi];
    if(!used[cand.toUpperCase()]){arr.push(rvonNormEntry(cand));used[cand.toUpperCase()]=1;}}
  while(arr.length<ch)arr.push({a:'',t:'',p:''});                    // pad to channel count if pool exhausted
  p.tbFields.Audio.rvon=arr;}

/* ---- mutations ---- */
function syncDeptNote(key,dept){var p=productions[key];if(!p)return;var di=-1;for(var i=0;i<p.dept.length;i++){if(p.dept[i][0]===dept){di=i;break;}}
  if(di>-1&&!p.dept[di].__customNote){var sum=deptSummary(p,dept);if(sum)p.dept[di][2]=sum;}}
function rvonMutTail(key){checkReapproval(key,'Audio','rvon');syncDeptNote(key,'Audio');stampEdit(key);renderAll();renderProjectView(key);}
function rvonSetCount(key,delta){var p=productions[key];if(!p)return;if(!p.tbFields)p.tbFields={};if(!p.tbFields.Audio)p.tbFields.Audio={};
  var a=rvonArr(p).slice();var n=a.length+delta;if(n<0)n=0;if(n>24)n=24;            // RVON front-card addresses 0–23
  while(a.length<n)a.push({a:'',t:'',p:''});while(a.length>n)a.pop();
  p.tbFields.Audio.rvon=a;rvonMutTail(key);}
function setRvonAlpha(key,idx,alpha){var p=productions[key];if(!p)return;alpha=(''+alpha).trim();
  var owner=alpha?rvonAlphaOwner(alpha,key):null;
  if(owner){toast('Alpha "'+alpha.toUpperCase()+'" is already assigned to '+(prodName(owner)||owner)+' — pick another.');return;}
  if(!p.tbFields)p.tbFields={};if(!p.tbFields.Audio)p.tbFields.Audio={};
  var a=rvonArr(p);while(a.length<=idx)a.push({a:'',t:'',p:''});
  a[idx].a=alpha.toUpperCase();
  if(!a[idx].t&&a[idx].a)a[idx].t=rvonAlphaDefaultType(a[idx].a); // sensible default; user can flip IFB ⇄ PL
  p.tbFields.Audio.rvon=a;rvonMutTail(key);}
function clearRvonAlpha(key,idx){var p=productions[key];if(!p)return;if(!p.tbFields)p.tbFields={};if(!p.tbFields.Audio)p.tbFields.Audio={};
  var a=rvonArr(p);while(a.length<=idx)a.push({a:'',t:'',p:''});a[idx]={a:'',t:'',p:''};
  p.tbFields.Audio.rvon=a;rvonMutTail(key);}
/* v30 Module 2b: required channel type (IFB vs Party Line) + assigned person per channel.
   Review fix: type/person edits don't affect conflicts or dashboards — save + repaint the
   board only, instead of the full renderAll thrash on every field the user tabs through. */
function setRvonType(key,idx,t){var p=productions[key];if(!p)return;var a=rvonArr(p);if(!a[idx])return;
  a[idx].t=(t==='IFB'||t==='PL')?t:'';checkReapproval(key,'Audio','rvon');stampEdit(key);renderDeptBoard(key);}
function setRvonPerson(key,idx,name){var p=productions[key];if(!p)return;var a=rvonArr(p);if(!a[idx])return;
  a[idx].p=(''+(name||'')).trim();checkReapproval(key,'Audio','rvon');stampEdit(key);renderDeptBoard(key);}

/* ---- the unified RVON control: channel-count stepper + per-port alpha pickers ----
   v30 Module 2b: every channel additionally carries a REQUIRED type (IFB vs Party Line)
   and the assigned person's name, edited inline per port. ---- */
function rvonControlHTML(key,dept,f){var p=productions[key];var a=rvonArr(p);var n=a.length;var assigned=a.filter(function(e){return e.a;}).length;
  var untyped=a.filter(function(e){return e.a&&!e.t;}).length;
  var rows=a.map(function(e,i){
    var al=e.a;
    var owner=al?rvonAlphaOwner(al,key):null;
    var pill=al
      ? '<button onclick="openDeptPicker(\''+key+'\',\''+dept.replace(/'/g,"\\'")+'\',\'rvon\',this,\'rvon\','+i+')" class="flex-1 text-left mono text-[11px] font-bold '+(owner?'text-red-700':'text-gray-800')+' bg-white border '+(owner?'border-red-300':'border-gray-200')+' rounded px-2 py-1 hover:border-blue-300 truncate" title="'+(owner?('CONFLICT — also assigned to '+esc(prodName(owner)||owner)).replace(/"/g,'&quot;'):'Click to change alpha')+'">'+esc(al)+'<span class="text-[8px] font-normal text-gray-400"> · '+esc(rvonAlphaRole(al))+'</span></button>'
      : '<button onclick="openDeptPicker(\''+key+'\',\''+dept.replace(/'/g,"\\'")+'\',\'rvon\',this,\'rvon\','+i+')" class="flex-1 text-left text-[10px] text-blue-700 font-semibold border border-dashed border-blue-200 rounded px-2 py-1 hover:bg-blue-50">+ Assign alpha</button>';
    var conf=owner?'<span class="text-[10px] font-bold text-red-600 mono" title="Already used by '+esc(prodName(owner)||owner).replace(/"/g,'&quot;')+'">⚠</span>':'';
    var typeSel='<select onchange="setRvonType(\''+key+'\','+i+',this.value)" title="Channel type — IFB (interrupt foldback) or PL (party line). Required." class="text-[9px] font-bold uppercase tracking-wider rounded border px-1 py-0.5 '+(e.t?'text-gray-700 border-gray-200 bg-white':'text-red-700 border-red-300 bg-red-50')+'" style="outline:none;cursor:pointer">'+
      '<option value=""'+(e.t?'':' selected')+'>type…</option>'+
      '<option value="IFB"'+(e.t==='IFB'?' selected':'')+'>IFB</option>'+
      '<option value="PL"'+(e.t==='PL'?' selected':'')+'>PL</option></select>';
    var person='<input value="'+esc(e.p||'').replace(/"/g,'&quot;')+'" onchange="setRvonPerson(\''+key+'\','+i+',this.value)" placeholder="Assigned person" class="flex-1 text-[10px] text-gray-700 bg-white border '+(e.p?'border-gray-200':'border-amber-200')+' rounded px-1.5 py-0.5" style="outline:none;min-width:90px">';
    return '<div class="rvon-card rounded-md border border-gray-200/60 bg-white/70 p-1.5 min-w-0">'+
      '<div class="flex items-center gap-1.5">'+
        '<span class="text-[9px] mono text-gray-400 w-9 flex-shrink-0">CH '+(i+1)+'</span>'+pill+conf+
        '<button onclick="clearRvonAlpha(\''+key+'\','+i+')" class="text-gray-300 hover:text-red-500 flex-shrink-0 px-1" title="Clear this port">✕</button></div>'+
      (al?'<div class="flex items-center gap-1.5 mt-1"><span class="w-9 flex-shrink-0"></span>'+typeSel+person+'</div>':'')+
      '</div>';
  }).join('');
  return '<div class="mb-1.5 dept-span-full">'+
    '<div class="flex items-center justify-between mb-1"><label class="text-[8px] font-bold uppercase tracking-wider text-gray-500">'+f[1]+'</label>'+
      '<span class="text-[8px] mono text-gray-400">'+assigned+'/'+n+' assigned'+(untyped?' · <span class="text-red-600 font-bold">'+untyped+' need IFB/PL type</span>':'')+'</span></div>'+
    '<div class="flex items-center gap-2 mb-1.5"><span class="text-[8px] font-bold uppercase tracking-wider text-gray-500">Channels</span>'+
      '<div class="inline-flex items-center border border-gray-200 rounded bg-white" style="height:26px">'+
        '<button onclick="rvonSetCount(\''+key+'\',-1)" class="text-gray-600 hover:text-gray-800 px-2 leading-none" style="font-size:14px">−</button>'+
        '<span class="mono text-[12px] font-bold text-gray-800 text-center" style="width:26px">'+n+'</span>'+
        '<button onclick="rvonSetCount(\''+key+'\',1)" class="text-gray-600 hover:text-gray-800 px-2 leading-none" style="font-size:14px">+</button>'+
      '</div><span class="text-[8px] text-gray-400">port quantity</span></div>'+
    (n?'<div class="rvon-grid">'+rows+'</div>':'<p class="text-[9px] text-gray-400 italic">Set a channel count, then assign an alpha to each port.</p>')+
    '</div>';
}

/* ============================================================================
   SHARED SEARCHABLE PICKER — type-to-filter popover (one DOM node, reused).
   mode 'multi': generic dept dropdown field (options from deptFields), multi-add.
   mode 'rvon' : assign an alpha to RVON channel #idx (options from RVON_ALPHA_POOL;
                 alphas owned by other productions render greyed-out / unavailable).
   ============================================================================ */
var deptPickerCtx=null;
function ensureDeptPicker(){var ov=document.getElementById('deptPickerOverlay');if(ov)return ov;
  ov=document.createElement('div');ov.id='deptPickerOverlay';ov.style.cssText='position:fixed;inset:0;z-index:60;display:none';
  ov.innerHTML='<div id="deptPickerBackdrop" style="position:absolute;inset:0;background:rgba(24,25,26,.08)"></div>'+
    '<div id="deptPickerBox" style="position:absolute;width:300px;max-width:92vw;background:#ffffff;border:1px solid rgba(0,0,0,.1);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.22);overflow:hidden">'+
      '<div style="padding:8px 8px 6px"><div id="deptPickerTitle" class="text-[10px] font-bold uppercase tracking-wider text-gray-500" style="margin-bottom:5px"></div>'+
        '<div style="position:relative"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#b0b3b8" stroke-width="2.5" style="position:absolute;left:8px;top:8px"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'+
        '<input id="deptPickerSearch" oninput="deptPickerFilter(this.value)" onkeydown="deptPickerKey(event)" placeholder="Search…" autocomplete="off" class="mono" style="width:100%;font-size:11px;border:1px solid #e4e6eb;border-radius:8px;padding:6px 8px 6px 26px;outline:none"></div></div>'+
      '<div id="deptPickerList" style="max-height:240px;overflow-y:auto;padding:0 6px 6px"></div>'+
      '<div style="border-top:1px solid #f0f2f5;padding:6px 8px;display:flex;justify-content:space-between;align-items:center;gap:6px">'+
        '<span id="deptPickerHint" class="text-[9px] text-gray-400"></span>'+
        '<button onclick="closeDeptPicker()" class="text-[10px] font-bold text-gray-700" style="padding:3px 10px;border:1px solid #e4e6eb;border-radius:7px;background:#ffffff;cursor:pointer">Done</button></div>'+
    '</div>';
  document.documentElement.appendChild(ov); // unzoomed host: rect-measured px stay 1:1
  ov.querySelector('#deptPickerBackdrop').addEventListener('click',closeDeptPicker);
  return ov;}
function openDeptPicker(key,dept,fk,anchor,mode,idx){var ov=ensureDeptPicker();
  deptPickerCtx={key:key,dept:dept,fk:fk,mode:mode||'multi',idx:(idx==null?-1:idx),q:''};
  var title=document.getElementById('deptPickerTitle');var search=document.getElementById('deptPickerSearch');var hint=document.getElementById('deptPickerHint');
  if(mode==='rvon'){title.textContent='RVON Alpha · Channel '+(idx+1);hint.textContent='Greyed = in use by another production';}
  else{var fdef=(deptFields[dept]||[]).filter(function(x){return x[0]===fk;})[0];title.textContent=(fdef?fdef[1]:fk);hint.textContent='Type to filter · Enter to add custom';}
  ov.style.display='block';
  var box=document.getElementById('deptPickerBox');var r=anchor.getBoundingClientRect();
  var bw=Math.min(box.offsetWidth||300,window.innerWidth-16);
  box.style.left=Math.min(Math.max(8,r.left),window.innerWidth-bw-8)+'px';
  box.style.top=Math.min(r.bottom+6,window.innerHeight-60)+'px';box.style.bottom='auto';
  deptPickerRender();
  var bh=box.offsetHeight;if(r.bottom+6+bh>window.innerHeight-8&&r.top-6-bh>8)box.style.top=(r.top-6-bh)+'px';
  if(search){search.value='';}setTimeout(function(){if(search)search.focus();},20);}
function closeDeptPicker(){var ov=document.getElementById('deptPickerOverlay');if(ov)ov.style.display='none';deptPickerCtx=null;}
function deptPickerKey(e){if(e.key==='Escape'){closeDeptPicker();return;}
  if(e.key==='Enter'){var ctx=deptPickerCtx;if(!ctx)return;var v=(e.target.value||'').trim();if(!v)return;
    if(ctx.mode==='rvon'){setRvonAlpha(ctx.key,ctx.idx,v);closeDeptPicker();}
    else{addDeptValue(ctx.key,ctx.dept,ctx.fk,v);deptPickerAfterPick();}}}
function deptPickerFilter(q){if(!deptPickerCtx)return;deptPickerCtx.q=(q||'').toLowerCase();deptPickerRender();}
function deptPickerOptions(){var ctx=deptPickerCtx;if(!ctx)return [];
  if(ctx.mode==='rvon'){var taken=rvonTakenMap(ctx.key);
    return RVON_ALPHA_POOL.map(function(al){var owner=taken[al.toUpperCase()]||null;
      return {val:al,sub:rvonAlphaRole(al),disabled:!!owner,note:owner?('in use · '+(prodName(owner)||owner)):''};});}
  var fdef=(deptFields[ctx.dept]||[]).filter(function(x){return x[0]===ctx.fk;})[0];
  var opts=fdef&&Array.isArray(fdef[2])?fdef[2]:[];
  /* v30 Module 8: Host Name options stay live — merge crew hosts + custom (imported) talent */
  if(ctx.dept==='Talent / Production'&&ctx.fk==='host_name'){opts=opts.slice();
    try{if(typeof talentRosterPool==='function')talentRosterPool(ctx.key).forEach(function(n){if(opts.indexOf(n)<0)opts.push(n);});}catch(e){}}
  var chosen=deptArr(productions[ctx.key],ctx.dept,ctx.fk);
  return opts.slice().sort(function(a,b){return (''+a).localeCompare((''+b),undefined,{numeric:true,sensitivity:'base'});})
    .map(function(o){var n=0;chosen.forEach(function(c){if(c===o)n++;});return {val:o,sub:n?('added \u00d7'+n):'',disabled:false};});}
function deptPickerRender(){var ctx=deptPickerCtx;if(!ctx)return;var box=document.getElementById('deptPickerList');if(!box)return;
  var q=ctx.q||'';var all=deptPickerOptions();
  var list=all.filter(function(o){return !q||(''+o.val).toLowerCase().indexOf(q)>-1||(''+(o.sub||'')).toLowerCase().indexOf(q)>-1;});
  var html=list.map(function(o){
    if(o.disabled)return '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;padding:6px 8px;border-radius:7px;opacity:.5;cursor:not-allowed">'+
      '<span class="mono text-[11px] font-bold text-gray-500">'+esc(o.val)+'</span><span class="text-[8px] text-red-500 font-bold uppercase tracking-wider">'+esc(o.note||'taken')+'</span></div>';
    var click=ctx.mode==='rvon'
      ? 'setRvonAlpha(\''+ctx.key+'\','+ctx.idx+',\''+(''+o.val).replace(/'/g,"\\'")+'\');closeDeptPicker()'
      : 'addDeptValue(\''+ctx.key+'\',\''+ctx.dept.replace(/'/g,"\\'")+'\',\''+ctx.fk.replace(/'/g,"\\'")+'\',\''+(''+o.val).replace(/'/g,"\\'").replace(/"/g,'&quot;')+'\');deptPickerAfterPick()';
    return '<div onclick="'+click+'" class="dept-opt" style="display:flex;justify-content:space-between;align-items:center;gap:6px;padding:6px 8px;border-radius:7px;cursor:pointer">'+
      '<span class="'+(ctx.mode==='rvon'?'mono ':'')+'text-[11px] text-gray-800">'+esc(o.val)+(o.sub?' <span class="text-[8px] text-gray-400">· '+esc(o.sub)+'</span>':'')+'</span></div>';
  }).join('');
  if(!list.length)html='<div style="padding:10px 8px" class="text-[10px] text-gray-400">No matches'+(q&&ctx.mode!=='rvon'?' — press Enter to add “'+esc(q)+'”':'')+'.</div>';
  box.innerHTML=html;
  Array.prototype.forEach.call(box.querySelectorAll('.dept-opt'),function(el){
    el.addEventListener('mouseenter',function(){el.style.background='#f0f2f5';});
    el.addEventListener('mouseleave',function(){el.style.background='';});});}
function deptPickerAfterPick(){var s=document.getElementById('deptPickerSearch');if(s)s.value='';if(deptPickerCtx)deptPickerCtx.q='';deptPickerRender();if(s)s.focus();}

/* ---- Department Status: v30 tile board — setDeptTab kept as a deep-link helper
   (expands the department's tile and scrolls to it; used by IFB board "edit ›" etc.) ---- */
function setDeptTab(key,cat){deptTileOpen(key)[cat]=1;
  try{if(deptUIGet(productions[key]).hidden[cat]){delete deptUIGet(productions[key]).hidden[cat];saveState();}}catch(e){} // review fix: deep-links un-hide the target tile
  renderDeptBoard(key);
  try{var t=document.getElementById('dept-'+key+'-'+cat.replace(/[^a-z0-9]/gi,''));if(t)t.scrollIntoView({block:'nearest',behavior:'smooth'});}catch(e){}}


/* ================================================================================
   IFB SIGNAL ROUTING — correlate REM / TIFF phone lines to transmission signals
   --------------------------------------------------------------------------------
   Model (persisted on the production as p.ifbRoute):
     signals: [{id, type:'LiveU'|'Fiber'|'Satellite', label}]
     lines  : [{id, ref:'REM 3 · 786-…', kind:'REM'|'TIFF', signalId, role:'Host'|'Guest'|'Backup', person}]
   Rules enforced by the UI:
     • one signal can carry one OR many REM/TIFF lines
     • REM lines link to Host names; TIFF lines link to Camera Operators / Producers
   ================================================================================ */
var IFB_SIG_TYPES={LiveU:{c:'#0866ff',bg:'#e7f3ff',bd:'#e7f3ff',dk:'#0866ff'},Fiber:{c:'#0866ff',bg:'#e7f3ff',bd:'#b9d7ff',dk:'#0866ff'},Satellite:{c:'#b24a00',bg:'#fef6e0',bd:'#f9db8e',dk:'#f7b928'}};
var IFB_ROLES=['Host','Guest','Backup'];
/* curated Muse Live on-air talent for REM (host) linking — supplements any host crew */
/* IFB_HOST_TALENT moved above DEFAULT_DEPT_FIELDS (v30 Module 8) so the Talent tile's
   Host Name dropdown can reference the same roster. */

function ifbGet(p){if(!p.ifbRoute)p.ifbRoute={signals:[],lines:[]};if(!p.ifbRoute.signals)p.ifbRoute.signals=[];if(!p.ifbRoute.lines)p.ifbRoute.lines=[];
  /* v28 (Work Item 2): one platform, not two — legacy "IFB Phone Line" picks made in the
     Audio department merge into the routing model once, then the routing board owns them */
  if(!p.ifbRoute.__merged){p.ifbRoute.__merged=true;
    try{var legacy=(p.tbFields&&p.tbFields.Audio&&p.tbFields.Audio.ifbphone)||[];if(!Array.isArray(legacy))legacy=legacy?[legacy]:[];
      var have={};p.ifbRoute.lines.forEach(function(l){if(l.ref)have[l.ref]=1;});
      legacy.forEach(function(ref){if(!ref||have[ref])return;var kind=/^tiff/i.test(ref)?'TIFF':'REM';
        p.ifbRoute.lines.push({id:'ln_'+Date.now().toString(36)+Math.floor(Math.random()*100000),ref:ref,kind:kind,signalId:'',role:kind==='TIFF'?'Guest':'Host',person:''});});
    }catch(e){}}
  return p.ifbRoute;}
/* keep the Audio dept mirror in lockstep so every consumer reads the same line list */
function ifbSyncAudioField(key){try{var p=productions[key];if(!p)return;var r=p.ifbRoute;if(!r)return;
  if(!p.tbFields)p.tbFields={};if(!p.tbFields.Audio)p.tbFields.Audio={};
  p.tbFields.Audio.ifbphone=r.lines.map(function(l){return l.ref;}).filter(Boolean);}catch(e){}}
function ifbScrollTo(key){try{
  // v30: the board lives inside the Audio tile — make sure that tile is visible and expanded first
  var changed=false;
  if(typeof deptTileOpen==='function'&&!deptTileOpen(key).Audio){deptTileOpen(key).Audio=1;changed=true;}
  if(typeof deptUIGet==='function'){var ui=deptUIGet(productions[key]);
    if(ui.hidden.Audio){delete ui.hidden.Audio;changed=true;}
    if(ui.secHidden.Audio&&ui.secHidden.Audio._ifbboard){delete ui.secHidden.Audio._ifbboard;changed=true;}}
  if(changed&&typeof renderDeptBoard==='function'){saveState();renderDeptBoard(key);}
  deptWorkspaceSelect(key,'Audio','routing');
  setTimeout(function(){var b=document.getElementById('ifbBoard-'+key);if(b){b.scrollIntoView({behavior:'smooth',block:'center'});b.style.transition='box-shadow .3s';b.style.boxShadow='0 0 0 3px rgba(8,102,255,.45)';setTimeout(function(){b.style.boxShadow='';},1400);}},changed?80:0);
}catch(e){}}
function ifbPhonePool(){
  /* REM/TIFF phone lines live under the "Audio" department (Comms & IFB is a sub-header,
     not a top-level dept key) — read the live library first, fall back to the defaults. */
  function findLines(src){var fs=(src&&src['Audio'])||[];var f=fs.filter(function(x){return x[0]==='ifbphone';})[0];return (f&&Array.isArray(f[2]))?f[2]:null;}
  var pool=findLines(deptFields)||findLines(DEFAULT_DEPT_FIELDS)||[];
  return pool.map(function(r){return {ref:r,kind:/^tiff/i.test(r)?'TIFF':'REM'};});}
function ifbCrewNames(key,re){var out=[];var p=productions[key];
  /* full personnel source: master rosters + this production's crew + the personnel
     directory (includes custom personnel and edited positions) — Work Item 2 */
  var master=CREW_FIELD.concat(CREW_IT,CREW_PCR,CREW_EXEC);
  master.forEach(function(m){if(re.test(m.pos)&&out.indexOf(m.name)<0)out.push(m.name);});
  if(p&&p.crew&&Array.isArray(p.crew))p.crew.forEach(function(m){if(m&&m.pos&&re.test(m.pos)&&m.name&&out.indexOf(m.name)<0)out.push(m.name);});
  try{if(typeof personnelRoster==='function')personnelRoster().forEach(function(m){if(re.test(m.pos||'')&&out.indexOf(m.name)<0)out.push(m.name);});}catch(e){}
  return out;}
function ifbHostPool(key){var crewHosts=ifbCrewNames(key,/host|anchor|talent|presenter|co-?host|conductor/i);
  var pool=crewHosts.concat(IFB_HOST_TALENT.filter(function(n){return crewHosts.indexOf(n)<0;}));
  /* talent rows join every talent dropdown */
  try{if(typeof customTalent!=='undefined')customTalent.forEach(function(t){if(t&&t.name&&pool.indexOf(t.name)<0)pool.push(t.name);});}catch(e){}
  return pool;}
function ifbTiffPool(key){return ifbCrewNames(key,/cam|steadicam|jib|photog|operator|producer|director|\bPM\b|production manager/i);}
function ifbPersonPool(key,kind){return kind==='TIFF'?ifbTiffPool(key):ifbHostPool(key);}

function ifbAddSignal(key,type){if(!type||!IFB_SIG_TYPES[type])return;var p=productions[key];var r=ifbGet(p);
  var n=r.signals.filter(function(s){return s.type===type;}).length+1;
  r.signals.push({id:'sig_'+Date.now().toString(36)+Math.floor(Math.random()*1000),type:type,label:type+' '+n});
  stampEdit(key);renderProjectView(key);toast(type+' signal added');}
function ifbRemoveSignal(key,id){var p=productions[key];var r=ifbGet(p);r.signals=r.signals.filter(function(s){return s.id!==id;});
  r.lines.forEach(function(l){if(l.signalId===id)l.signalId='';});stampEdit(key);renderProjectView(key);}
function ifbSetSignalLabel(key,id,val){var p=productions[key];var r=ifbGet(p);var s=r.signals.filter(function(x){return x.id===id;})[0];if(s){s.label=val;stampEdit(key);}}
function ifbAddLine(key){var p=productions[key];var r=ifbGet(p);
  r.lines.push({id:'ln_'+Date.now().toString(36)+Math.floor(Math.random()*1000),ref:'',kind:'REM',signalId:(r.signals[0]?r.signals[0].id:''),role:'Host',person:''});
  ifbSyncAudioField(key);stampEdit(key);renderProjectView(key);}
function ifbRemoveLine(key,id){var p=productions[key];var r=ifbGet(p);r.lines=r.lines.filter(function(l){return l.id!==id;});ifbSyncAudioField(key);stampEdit(key);renderProjectView(key);}
function ifbSetLine(key,id,field,val){var p=productions[key];var r=ifbGet(p);var l=r.lines.filter(function(x){return x.id===id;})[0];if(!l)return;
  if(field==='ref'){l.ref=val;l.kind=/^tiff/i.test(val)?'TIFF':'REM';
    /* role defaults sensibly per kind; clear a person that no longer fits the pool */
    if(l.kind==='TIFF'&&l.role==='Host')l.role='Guest';
    if(ifbPersonPool(key,l.kind).indexOf(l.person)<0)l.person='';}
  else l[field]=val;
  ifbSyncAudioField(key);stampEdit(key);renderProjectView(key);}

function ifbRoutingHTML(key){var p=productions[key];var r=ifbGet(p);var pool=ifbPhonePool();
  var sigById={};r.signals.forEach(function(s){sigById[s.id]=s;});
  // ---- signals strip ----
  var sigChips=r.signals.map(function(s){var t=IFB_SIG_TYPES[s.type]||IFB_SIG_TYPES.Fiber;var nLines=r.lines.filter(function(l){return l.signalId===s.id;}).length;
    return '<div class="ifb-sigcard" style="border-color:'+t.bd+'">'+
      '<div class="flex items-center gap-1.5"><span class="ifb-sigdot" style="background:'+t.c+'"></span>'+
        '<span class="text-[8px] font-bold uppercase tracking-wider" style="color:'+t.c+'">'+esc(s.type)+'</span>'+
        '<button onclick="ifbRemoveSignal(\''+key+'\',\''+s.id+'\')" class="ml-auto text-gray-300 hover:text-red-500 text-[11px] leading-none" title="Remove signal">✕</button></div>'+
      '<input value="'+esc(s.label||'')+'" onchange="ifbSetSignalLabel(\''+key+'\',\''+s.id+'\',this.value)" class="ifb-siglabel" style="color:'+t.c+'">'+
      '<span class="text-[8px] text-gray-400 mono">'+nLines+' line'+(nLines===1?'':'s')+' routed</span>'+
    '</div>';}).join('');
  var addSig='<div class="ifb-addsig"><span class="text-[8px] font-bold uppercase tracking-wider text-gray-400 block mb-1">Add signal</span>'+
    '<div class="flex items-center gap-1">'+Object.keys(IFB_SIG_TYPES).map(function(t){var c=IFB_SIG_TYPES[t];
      return '<button onclick="ifbAddSignal(\''+key+'\',\''+t+'\')" class="ifb-addbtn" style="color:'+c.c+';border-color:'+c.bd+';background:'+c.bg+'">+ '+t+'</button>';}).join('')+'</div></div>';
  // ---- routing lines ----
  var refOpts=function(l){var groups={REM:[],TIFF:[]};pool.forEach(function(o){groups[o.kind].push(o);});
    function grp(kind){return '<optgroup label="'+kind+'">'+groups[kind].map(function(o){return '<option value="'+esc(o.ref)+'"'+(l.ref===o.ref?' selected':'')+'>'+esc(o.ref)+'</option>';}).join('')+'</optgroup>';}
    return '<option value="">Select REM / TIFF…</option>'+grp('REM')+grp('TIFF');};
  var lineRows=r.lines.map(function(l){var t=l.signalId&&sigById[l.signalId]?(IFB_SIG_TYPES[sigById[l.signalId].type]||IFB_SIG_TYPES.Fiber):null;
    var kindPill='<span class="ifb-kind '+(l.kind==='TIFF'?'ifb-kind-tiff':'ifb-kind-rem')+'">'+l.kind+'</span>';
    var sigSel='<select onchange="ifbSetLine(\''+key+'\',\''+l.id+'\',\'signalId\',this.value)" class="ifb-sel" style="'+(t?'border-color:'+t.bd+';color:'+t.c:'')+'">'+
      '<option value="">— unrouted —</option>'+r.signals.map(function(s){return '<option value="'+s.id+'"'+(l.signalId===s.id?' selected':'')+'>'+esc(s.label)+' ('+s.type+')</option>';}).join('')+'</select>';
    var roleSel='<select onchange="ifbSetLine(\''+key+'\',\''+l.id+'\',\'role\',this.value)" class="ifb-sel ifb-role-'+(l.role||'Host').toLowerCase()+'">'+
      IFB_ROLES.map(function(ro){return '<option value="'+ro+'"'+(l.role===ro?' selected':'')+'>'+ro+'</option>';}).join('')+'</select>';
    var ppool=ifbPersonPool(key,l.kind);
    var personSel='<select onchange="ifbSetLine(\''+key+'\',\''+l.id+'\',\'person\',this.value)" class="ifb-sel"'+(l.ref?'':' disabled')+'>'+
      '<option value="">'+(l.kind==='TIFF'?'Cam Op / Producer…':'Host name…')+'</option>'+
      ppool.map(function(nm){return '<option value="'+esc(nm)+'"'+(l.person===nm?' selected':'')+'>'+esc(nm)+'</option>';}).join('')+
      (l.person&&ppool.indexOf(l.person)<0?'<option value="'+esc(l.person)+'" selected>'+esc(l.person)+'</option>':'')+'</select>';
    return '<div class="ifb-linerow">'+
      '<div class="ifb-cell" style="flex:2 1 150px"><span class="ifb-clabel">Line '+kindPill+'</span>'+
        '<select onchange="ifbSetLine(\''+key+'\',\''+l.id+'\',\'ref\',this.value)" class="ifb-sel mono">'+refOpts(l)+'</select></div>'+
      '<div class="ifb-cell ifb-arrow">→</div>'+
      '<div class="ifb-cell" style="flex:2 1 140px"><span class="ifb-clabel">Transmission Signal</span>'+sigSel+'</div>'+
      '<div class="ifb-cell" style="flex:1 1 90px"><span class="ifb-clabel">Role</span>'+roleSel+'</div>'+
      '<div class="ifb-cell" style="flex:2 1 150px"><span class="ifb-clabel">'+(l.kind==='TIFF'?'Cam Op / Producer':'Host Name')+'</span>'+personSel+'</div>'+
      '<button onclick="ifbRemoveLine(\''+key+'\',\''+l.id+'\')" class="ifb-del" title="Unlink">✕</button>'+
    '</div>';}).join('');
  var nRem=r.lines.filter(function(l){return l.kind==='REM';}).length,nTiff=r.lines.filter(function(l){return l.kind==='TIFF';}).length;
  // ---- linked Audio configuration (IFB transmitter · mic receiver · capsule) pulled live from the Audio dept ----
  var aIfb=(typeof fval==='function'?fval(p,'Audio','ifb'):'')||'';
  var aRx=(typeof fval==='function'?fval(p,'Audio','rxmodel'):'')||'';
  var aMic=(typeof fval==='function'?fval(p,'Audio','micmodel'):'')||'';
  var audioLink='<div class="ifb-audiolink"><span class="ifb-al-lbl">Linked audio</span>'+
    '<span class="ifb-al-chip">IFB TX · '+esc(aIfb||'not set')+'</span>'+
    '<span class="ifb-al-chip">Mic RX · '+esc(aRx||'not set')+'</span>'+
    (aMic?'<span class="ifb-al-chip">Capsule · '+esc(aMic)+'</span>':'')+
    '<button onclick="setDeptTab(\''+key+'\',\'Audio\');setTimeout(function(){var d=document.getElementById(\'deptDetail-'+key+'\');if(d)d.scrollIntoView({behavior:\'smooth\',block:\'center\'});},60)" class="ifb-al-edit" title="Edit in Audio department">edit ›</button>'+
  '</div>';
  return '<div id="ifbBoard-'+key+'" class="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">'+
    '<div class="flex flex-wrap items-center justify-between gap-2 mb-1"><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">IFB Signal Routing — Unified REM &amp; TIFF Platform</h3>'+
      '<span class="text-[9px] mono text-gray-400">'+r.signals.length+' signal'+(r.signals.length===1?'':'s')+' · '+nRem+' REM · '+nTiff+' TIFF</span></div>'+
    "<p class=\"text-[10px] text-gray-500 mb-2\">One platform for every dialed IFB line: map REMs and TIFFs to LiveU LU800, Fiber or Satellite paths. REMs carry host mix-minus; TIFFs carry camera-op / producer comms. The Audio department mirrors this board automatically.</p>"+
    audioLink+
    '<div class="ifb-sigwrap">'+(sigChips||'<span class="text-[10px] text-gray-400 italic self-center">No transmission signals yet — add one →</span>')+addSig+'</div>'+
    '<div class="ifb-lines">'+(lineRows||'<p class="text-[10px] text-gray-400 italic py-2">No REM/TIFF lines linked yet.</p>')+'</div>'+
    '<button onclick="ifbAddLine(\''+key+'\')" class="mt-2 text-[10px] font-bold text-blue-700 border border-blue-200 bg-blue-50 rounded-lg px-3 py-1.5 hover:bg-blue-100">+ Link REM / TIFF line</button>'+
  '</div>';
}

/* ================================================================================
   v30 MODULE 2a — AUDIO FILES: upload (any decodable format) → auto-convert to
   PCM WAV 48 kHz browser-side → first-class waveform player (play/pause/scrub/volume).
   Conversion: Web Audio decodeAudioData + OfflineAudioContext(48000) + PCM16 WAV
   encoder — fully in-browser, no CDN. (ffmpeg.wasm was considered; it needs a ~25 MB
   core fetch and COOP/COEP isolation this static server can't provide, while Web Audio
   natively decodes wav/mp3/m4a/aac/ogg/flac/webm and resamples exactly to 48 kHz.)
   Converted files get the Muse Live nomenclature tag before the extension: name_MUSE.wav.
   Model: p.audioAssets=[{id,name,orig,dur,sr,ch,bytes,ts,persisted,dataUri?}] — small
   files (≤1.5 MB WAV) persist as data URIs; larger ones are session-only (honest note).
   ================================================================================ */
var MUSE_AUDIO_TAG='_MUSE'; // the Muse-processed nomenclature tag — single source, used everywhere
var _audioBlobs={};   // id -> {url, peaks[]} runtime cache (blobs don't survive reload)
var _audioPlayers={}; // id -> {audio, playing} detached Audio elements — playback survives re-renders
function audioAssets(p){if(!p.audioAssets)p.audioAssets=[];return p.audioAssets;}
function audioFmtTime(s){if(!isFinite(s))s=0;var m=Math.floor(s/60),ss=Math.floor(s%60);return m+':'+(ss<10?'0':'')+ss;}
function audioFmtBytes(b){return b>1048576?(b/1048576).toFixed(1)+' MB':Math.round(b/1024)+' KB';}
function audioMuseName(orig){var base=(''+(orig||'audio')).replace(/\.[^.\/]+$/,'');return base+MUSE_AUDIO_TAG+'.wav';}
function audioEncodeWav(buf){var ch=buf.numberOfChannels,sr=buf.sampleRate,len=buf.length;
  var bytes=44+len*ch*2;var ab=new ArrayBuffer(bytes);var dv=new DataView(ab);
  function ws(o,s){for(var i=0;i<s.length;i++)dv.setUint8(o+i,s.charCodeAt(i));}
  ws(0,'RIFF');dv.setUint32(4,bytes-8,true);ws(8,'WAVE');ws(12,'fmt ');
  dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,ch,true);
  dv.setUint32(24,sr,true);dv.setUint32(28,sr*ch*2,true);dv.setUint16(32,ch*2,true);dv.setUint16(34,16,true);
  ws(36,'data');dv.setUint32(40,len*ch*2,true);
  var off=44;var chans=[];for(var c=0;c<ch;c++)chans.push(buf.getChannelData(c));
  for(var i=0;i<len;i++){for(var c2=0;c2<ch;c2++){var s=Math.max(-1,Math.min(1,chans[c2][i]));
    dv.setInt16(off,s<0?s*0x8000:s*0x7FFF,true);off+=2;}}
  return new Blob([ab],{type:'audio/wav'});}
function audioPeaks(buf,n){var d=buf.getChannelData(0);var step=Math.floor(d.length/n)||1;var out=[];
  for(var i=0;i<n;i++){var mx=0;var st=i*step;var en=Math.min(d.length,st+step);
    for(var j=st;j<en;j+=16){var v=Math.abs(d[j]);if(v>mx)mx=v;}out.push(mx);}
  return out;}
function audioUploadFiles(key,ev){var files=ev.target.files;if(!files||!files.length)return;
  Array.prototype.forEach.call(files,function(f){audioConvertFile(key,f);});ev.target.value='';}
function audioConvertFile(key,file){var p=productions[key];if(!p)return;
  toast('Converting '+txt(file.name)+' → PCM WAV 48 kHz…');
  var reader=new FileReader();
  reader.onload=function(){
    var AC=window.AudioContext||window.webkitAudioContext;
    if(!AC){toast('⚠ Web Audio not available in this browser — cannot convert');return;}
    var ac=new AC();
    ac.decodeAudioData(reader.result,function(buf){
      try{ac.close();}catch(e){}
      var ch=Math.max(1,Math.min(2,buf.numberOfChannels));
      var oac=new OfflineAudioContext(ch,Math.ceil(buf.duration*48000),48000);
      var src=oac.createBufferSource();src.buffer=buf;src.connect(oac.destination);src.start(0);
      oac.startRendering().then(function(out){
        var wav=audioEncodeWav(out);
        var id='aud_'+Date.now().toString(36)+Math.floor(Math.random()*1e4);
        var asset={id:id,name:audioMuseName(file.name),orig:file.name,dur:out.duration,sr:out.sampleRate,
          ch:out.numberOfChannels,bytes:wav.size,ts:new Date().toISOString().slice(0,16).replace('T',' '),persisted:false};
        _audioBlobs[id]={url:URL.createObjectURL(wav),peaks:audioPeaks(out,240)};
        var fin=function(){audioAssets(p).push(asset);stampEdit(key);renderAll();
          try{renderDeptBoard(key);}catch(e){}
          toast('✓ '+txt(asset.name)+' — PCM WAV '+Math.round(asset.sr/1000)+' kHz ready');};
        if(wav.size<=1500000){var r2=new FileReader();
          r2.onload=function(){asset.dataUri=r2.result;asset.persisted=true;fin();};
          r2.onerror=function(){fin();};r2.readAsDataURL(wav);}
        else fin();
      });
    },function(){try{ac.close();}catch(e){}
      toast('⚠ Could not decode "'+txt(file.name)+'" — format not supported by this browser’s decoder');});
  };
  reader.readAsArrayBuffer(file);}
function audioDelete(key,id){var p=productions[key];if(!p)return;
  p.audioAssets=audioAssets(p).filter(function(a){return a.id!==id;});
  audioStop(id);
  var rb=_audioBlobs[id];if(rb&&rb.url){try{URL.revokeObjectURL(rb.url);}catch(e){}} // free the blob
  delete _audioBlobs[id];
  stampEdit(key);renderAll();try{renderDeptBoard(key);}catch(e){}}
function audioSrcFor(asset){var rb=_audioBlobs[asset.id];if(rb&&rb.url)return rb.url;return asset.dataUri||null;}
function audioPlayerFor(asset){var pl=_audioPlayers[asset.id];
  if(pl&&pl.audio)return pl;
  var src=audioSrcFor(asset);if(!src)return null;
  var a=new Audio(src);a.preload='metadata';
  pl={audio:a,playing:false};_audioPlayers[asset.id]=pl;
  a.addEventListener('ended',function(){pl.playing=false;audioSyncRow(asset.id);});
  a.addEventListener('timeupdate',function(){audioSyncRow(asset.id);});
  return pl;}
function audioToggle(key,id){var p=productions[key];var asset=audioAssets(p).filter(function(a){return a.id===id;})[0];
  if(!asset)return;var pl=audioPlayerFor(asset);
  if(!pl){toast('This file was not persisted (too large for browser storage) — re-upload it to play.');return;}
  if(pl.playing){pl.audio.pause();pl.playing=false;}
  else{ // pause any other running player first
    Object.keys(_audioPlayers).forEach(function(k){if(k!==id&&_audioPlayers[k].playing){_audioPlayers[k].audio.pause();_audioPlayers[k].playing=false;audioSyncRow(k);}});
    var pr=pl.audio.play();pl.playing=true;
    if(pr&&pr.catch)pr.catch(function(){pl.playing=false;audioSyncRow(id);}); // autoplay-policy honesty: never show a fake playing state
  }
  audioSyncRow(id);}
function audioSeek(key,id,ev){var p=productions[key];var asset=audioAssets(p).filter(function(a){return a.id===id;})[0];
  if(!asset)return;var pl=audioPlayerFor(asset);if(!pl)return;
  var cv=ev.currentTarget;var r=cv.getBoundingClientRect();var frac=(ev.clientX-r.left)/r.width;
  var dur=pl.audio.duration||asset.dur||0;pl.audio.currentTime=Math.max(0,Math.min(dur,frac*dur));audioSyncRow(id);}
function audioSetVol(id,v){var pl=_audioPlayers[id];if(pl&&pl.audio)pl.audio.volume=parseFloat(v);}
function audioNudge(id,secs){var pl=_audioPlayers[id];if(!pl||!pl.audio)return;
  var d=pl.audio.duration||0;pl.audio.currentTime=Math.max(0,Math.min(d,pl.audio.currentTime+secs));audioSyncRow(id);}
function audioStop(id){var pl=_audioPlayers[id];if(pl){try{pl.audio.pause();}catch(e){}delete _audioPlayers[id];}}
function audioSyncRow(id){var pl=_audioPlayers[id];
  var btn=document.getElementById('audplay_'+id);var tm=document.getElementById('audtime_'+id);
  if(btn&&pl)btn.textContent=pl.playing?'❚❚':'▶';
  if(tm&&pl)tm.textContent=audioFmtTime(pl.audio.currentTime)+' / '+audioFmtTime(pl.audio.duration||0);
  audioDrawWave(id);}
function audioDrawWave(id){var cv=document.getElementById('audwf_'+id);if(!cv)return;
  var rb=_audioBlobs[id];var ctx=cv.getContext('2d');var W=cv.width,H=cv.height;
  var dark=document.documentElement.classList.contains('dark');
  ctx.clearRect(0,0,W,H);
  var peaks=(rb&&rb.peaks)||null;
  var pl=_audioPlayers[id];var frac=0;
  if(pl&&pl.audio&&pl.audio.duration)frac=pl.audio.currentTime/pl.audio.duration;
  var n=peaks?peaks.length:120;var bw=W/n;
  for(var i=0;i<n;i++){var amp=peaks?peaks[i]:0.18;
    var h=Math.max(2,amp*(H-4));var x=i*bw;var played=(i/n)<=frac&&frac>0;
    ctx.fillStyle=played?'#0866ff':(dark?'#4b4f56':'#ced0d4');
    ctx.fillRect(x,(H-h)/2,Math.max(1,bw-1),h);}}
function audioWaveformsMount(key){var p=productions[key];if(!p||!p.audioAssets)return;
  p.audioAssets.forEach(function(asset){
    var rb=_audioBlobs[asset.id];
    if((!rb||!rb.peaks)&&asset.dataUri){ // decode persisted files lazily so waveforms survive reload
      if(rb&&rb.decoding)return;
      _audioBlobs[asset.id]=_audioBlobs[asset.id]||{};_audioBlobs[asset.id].decoding=true;
      try{
        fetch(asset.dataUri).then(function(r){return r.arrayBuffer();}).then(function(ab){
          var AC=window.AudioContext||window.webkitAudioContext;var ac=new AC();
          ac.decodeAudioData(ab,function(buf){try{ac.close();}catch(e){}
            _audioBlobs[asset.id].peaks=audioPeaks(buf,240);_audioBlobs[asset.id].decoding=false;audioDrawWave(asset.id);},
            function(){try{ac.close();}catch(e){}_audioBlobs[asset.id].decoding=false;});
        });
      }catch(e){_audioBlobs[asset.id].decoding=false;}
    }
    audioDrawWave(asset.id);});}
function audioDownload(key,id){var p=productions[key];var asset=audioAssets(p).filter(function(a){return a.id===id;})[0];
  if(!asset)return;var src=audioSrcFor(asset);
  if(!src){toast('File not available this session — re-upload to regenerate.');return;}
  var a=document.createElement('a');a.href=src;a.download=asset.name;document.body.appendChild(a);a.click();a.remove();}
function audioFilesSectionHTML(key){var p=productions[key];var assets=audioAssets(p);
  var rows=assets.map(function(a){
    var avail=!!audioSrcFor(a);
    var pl=_audioPlayers[a.id];
    return '<div class="rounded-xl border border-gray-200/70 bg-gray-50/50 p-2.5 mb-2">'+
      '<div class="flex flex-wrap items-center justify-between gap-2 mb-1.5">'+
        '<span class="flex items-center gap-2 min-w-0"><span class="text-[11px] font-bold mono text-gray-800 truncate" title="Converted from '+esc(a.orig).replace(/"/g,'&quot;')+'">'+esc(a.name)+'</span></span>'+
        '<span class="flex items-center gap-1.5 flex-wrap">'+
          '<span class="dept-chip mono">PCM WAV</span><span class="dept-chip mono">'+Math.round(a.sr/1000)+' kHz</span>'+
          '<span class="dept-chip mono">'+(a.ch===1?'mono':a.ch===2?'stereo':a.ch+'ch')+'</span>'+
          '<span class="dept-chip mono">'+audioFmtBytes(a.bytes)+'</span>'+
          (a.persisted?'':'<span class="dept-chip dept-chip-alert mono" title="Too large for browser storage — playable this session only; download to keep">session only</span>')+
        '</span></div>'+
      (avail
        ? '<canvas id="audwf_'+a.id+'" width="560" height="44" onclick="audioSeek(\''+key+'\',\''+a.id+'\',event)" tabindex="0" role="slider" aria-label="Seek '+esc(a.name).replace(/"/g,'&quot;')+'" onkeydown="if(event.key===\'ArrowLeft\'||event.key===\'ArrowRight\'){event.preventDefault();audioNudge(\''+a.id+'\',event.key===\'ArrowRight\'?5:-5);}" style="width:100%;height:44px;cursor:pointer;display:block" title="Click to scrub · arrow keys seek ±5s"></canvas>'+
          '<div class="flex items-center gap-2 mt-1.5">'+
            '<button id="audplay_'+a.id+'" onclick="audioToggle(\''+key+'\',\''+a.id+'\')" class="text-[13px] font-bold text-white bg-gray-900 hover:bg-gray-800 rounded-lg flex items-center justify-center" style="width:34px;height:28px">'+((pl&&pl.playing)?'❚❚':'▶')+'</button>'+
            '<span id="audtime_'+a.id+'" class="text-[10px] mono text-gray-500" style="min-width:74px">0:00 / '+audioFmtTime(a.dur)+'</span>'+
            '<span class="text-[9px] text-gray-400">vol</span>'+
            '<input type="range" min="0" max="1" step="0.01" value="'+((pl&&pl.audio)?pl.audio.volume:1)+'" oninput="audioSetVol(\''+a.id+'\',this.value)" aria-label="Volume for '+esc(a.name).replace(/"/g,'&quot;')+'" style="width:80px">'+
            '<span style="margin-left:auto" class="flex items-center gap-2">'+
              '<button onclick="audioDownload(\''+key+'\',\''+a.id+'\')" class="text-[10px] font-bold text-blue-700 hover:underline">⬇ WAV</button>'+
              '<button onclick="audioDelete(\''+key+'\',\''+a.id+'\')" class="text-[10px] font-bold text-red-500 hover:underline">Delete</button>'+
            '</span></div>'
        : '<p class="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">Not persisted (file exceeded browser storage) — metadata kept; <b>re-upload '+esc(a.orig)+'</b> to play again, or delete this entry.'+
          ' <button onclick="audioDelete(\''+key+'\',\''+a.id+'\')" class="font-bold text-red-500 hover:underline">Delete</button></p>')+
      '</div>';
  }).join('');
  return '<div class="bg-white rounded-2xl p-4 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">'+
    '<div class="flex flex-wrap items-center justify-between gap-2 mb-1"><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">Audio Files — Upload · Convert · Play</h3>'+
      '<span class="text-[9px] mono text-gray-400">'+assets.length+' file'+(assets.length===1?'':'s')+' · auto-normalized</span></div>'+
    '<p class="text-[10px] text-gray-500 mb-2">Drop in any audio file — it is converted in the browser to <b>PCM WAV, 48 kHz</b> and tagged <span class="mono">'+esc(MUSE_AUDIO_TAG)+'</span> before the extension (Muse-processed marker).</p>'+
    '<label class="inline-flex items-center gap-1.5 text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-1.5 cursor-pointer mb-2">⬆ Upload audio'+
      '<input type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac,.webm,.aif,.aiff" multiple onchange="audioUploadFiles(\''+key+'\',event)" style="display:none"></label>'+
    (rows||'<p class="text-[10px] text-gray-400 italic">No audio files yet — upload reference mixes, IFB checks, VO stems, etc.</p>')+
  '</div>';}
/* department-specific rich sections plugged into the tile board (hideable like schema sections) */
function deptSourceNote(txt){return '<div class="rounded-xl border border-blue-200/70 bg-blue-50/50 px-3 py-2 mb-2 text-[10px] text-blue-800">'+txt+'</div>';}
/* v30 Module 4: total connected lighting load from per-fixture Power Draw × Count */
function lightingLoadW(key){var p=productions[key];var lines=(p&&p.tbEquip&&p.tbEquip.Lighting)||[];var w=0;
  lines.forEach(function(ln){if(!ln)return;var pw=parseFloat(ln.watts);if(isNaN(pw)||pw<=0)return;w+=pw*(parseInt(ln.qty,10)||1);});
  return w;}
function lightingPowerXlinkHTML(key){var w=lightingLoadW(key);var kw=w/1000;
  var amps208=w?Math.round(w/(208*1.732)):0; // approx line current, 208V 3-phase
  var pw=null;try{if(typeof ensurePower==='function'&&typeof getSurvey==='function')pw=ensurePower(getSurvey(key));}catch(e){}
  var cap=0;if(pw)pw.distros.forEach(function(d){cap+=(parseInt(d.amps,10)||0);});
  return '<div class="rounded-xl border border-amber-200/70 bg-amber-50/50 px-3 py-2 text-[10px] text-amber-800 flex flex-wrap items-center gap-2">'+
    '<span>⚡ <b>Connected lighting load:</b> '+(w?(kw.toFixed(kw<10?2:1)+' kW ≈ '+amps208+' A @ 208V 3φ (from per-fixture Power Draw × Count)'):'not yet calculable — set “Power Draw (W each)” on fixture lines above')+'</span>'+
    ((pw&&cap)?'<span class="mono">'+cap+' A provisioned · '+pw.distros.length+' distro(s)</span>':'')+
    '<button onclick="setDeptTab(\''+key+'\',\'Power / Electrical\')" class="font-bold text-blue-700 hover:underline" style="margin-left:auto">Open Power / Electrical →</button></div>';}
function powerLightingBackNoteHTML(key){var w=lightingLoadW(key);if(!w)return '';var kw=w/1000;
  return '<div class="rounded-xl border border-amber-200/70 bg-amber-50/50 px-3 py-2 mb-2 text-[10px] text-amber-800 flex flex-wrap items-center gap-2">'+
    '<span>⚡ Lighting department fixtures total <b>'+kw.toFixed(kw<10?2:1)+' kW</b> connected load — include it when sizing distros below.</span>'+
    '<button onclick="setDeptTab(\''+key+'\',\'Lighting\')" class="font-bold text-blue-700 hover:underline" style="margin-left:auto">Open Lighting →</button></div>';}
/* ================================================================================
   FIBER SCHEDULE — lives under Operational Matrix -> Transmission / Signal
   --------------------------------------------------------------------------------
   A real broadcast fiber schedule: one row per STRAND, grouped by trunk/cable, in
   the industry colour code so the sheet reads the same as the one taped to the
   patch panel.

   Colours are TIA-598-C, not decoration:
     - strand position 1-12 = Blue Orange Green Brown Slate White Red Black Yellow
       Violet Rose Aqua (repeating per 12-fibre group)
     - jacket/mode colour = yellow single-mode (OS1/OS2), orange OM1/OM2,
       aqua OM3, erika violet OM4, lime OM5
   "+ 12-strand trunk" lays in a full TIA group in one click, which is how these
   schedules are actually built.

   Model: p.fiber={trunks:[],strands:[]} — per VENUE on multi-venue productions
   (p.fiberLoc[locId], same alias pattern as surveyLoc/vendorsLoc), because a
   Muse AI World Tour site each has its own fibre plant.
   ================================================================================ */
var FIBER_TIA=[['Blue','#0866ff','#ffffff'],['Orange','#f5832a','#ffffff'],['Green','#1e7b34','#ffffff'],
  ['Brown','#b24a00','#ffffff'],['Slate','#65676b','#ffffff'],['White','#e7f3ff','#1c1e21'],
  ['Red','#e41e3f','#ffffff'],['Black','#18191A','#ffffff'],['Yellow','#f7b928','#1c1e21'],
  ['Violet','#0866ff','#ffffff'],['Rose','#b9d7ff','#1c1e21'],['Aqua','#0866ff','#ffffff']];
var FIBER_MODES=[['OS2 · single-mode','#f7b928','#1c1e21'],['OS1 · single-mode','#f7b928','#1c1e21'],
  ['OM1 · 62.5/125','#f5832a','#ffffff'],['OM2 · 50/125','#f5832a','#ffffff'],
  ['OM3 · 50/125','#0866ff','#ffffff'],['OM4 · 50/125','#0866ff','#ffffff'],['OM5 · 50/125','#31a24c','#1c1e21']];
var FIBER_CONN=['LC/UPC',"LC/APC",'SC/UPC',"SC/APC",'ST','FC','MPO / MTP-12',
  'Neutrik opticalCON DUO','Neutrik opticalCON QUAD','SMPTE 311M hybrid'];
var FIBER_STATUS=[['Spare','#b0b3b8'],['Pulled','#0866ff'],['Terminated','#0866ff'],
  ['Tested OK','#1E7B34'],['In service','#1E7B34'],['Fault','#e41e3f'],['Dark','#4B4F56']];
var FIBER_PATH=['A','B','—'];

function fiberTia(pos){var i=((parseInt(pos,10)||1)-1)%12;if(i<0)i=0;return FIBER_TIA[i];}
function fiberModeDef(m){for(var i=0;i<FIBER_MODES.length;i++)if(FIBER_MODES[i][0]===m)return FIBER_MODES[i];return FIBER_MODES[0];}
function fiberStatusColor(st){for(var i=0;i<FIBER_STATUS.length;i++)if(FIBER_STATUS[i][0]===st)return FIBER_STATUS[i][1];return '#b0b3b8';}
function fiberId(pfx){return pfx+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36);}

/* per-venue store — alias pattern: p.fiber always points at the ACTIVE venue's
   record on multi-venue productions, so every reader below stays venue-agnostic. */
function fiberGet(p){
  var k=(typeof prodKeyOf==='function')?prodKeyOf(p):null;
  if(k&&typeof hasLocs==='function'&&hasLocs(k)){
    var L=(typeof activeLocation==='function')?activeLocation(k):null;
    if(L){
      if(!p.fiberLoc){p.fiberLoc={};var first=locsOf(k)[0];
        p.fiberLoc[first.id]=(p.fiber&&((p.fiber.strands||[]).length||(p.fiber.trunks||[]).length))?p.fiber:{trunks:[],strands:[]};}
      if(!p.fiberLoc[L.id])p.fiberLoc[L.id]={trunks:[],strands:[]};
      p.fiber=p.fiberLoc[L.id];}}
  if(!p.fiber||typeof p.fiber!=='object')p.fiber={trunks:[],strands:[]};
  if(!Array.isArray(p.fiber.trunks))p.fiber.trunks=[];
  if(!Array.isArray(p.fiber.strands))p.fiber.strands=[];
  return p.fiber;}

function fiberMutTail(key){stampEdit(key);try{renderDeptBoard(key);}catch(e){}}
function fiberAddTrunk(key){var f=fiberGet(productions[key]);
  var n=f.trunks.length+1;
  var t={id:fiberId('ftr'),label:'TRUNK '+n,cable:'TAC-12 reel '+n,mode:FIBER_MODES[0][0],
    from:'',to:'',len:'',path:(n%2?'A':'B'),notes:''};
  f.trunks.push(t);
  for(var i=1;i<=12;i++){
    f.strands.push({id:fiberId('fst'),trunk:t.id,pos:i,mode:t.mode,path:t.path,
      from:'',to:'',conn:FIBER_CONN[0],signal:'',len:'',status:'Spare',loss:'',cadRef:'',notes:''});}
  fiberMutTail(key);
  toast&&toast('12-strand trunk added — TIA-598-C colour sequence laid in');}
function fiberAddStrand(key,trunkId){var f=fiberGet(productions[key]);
  var inTrunk=f.strands.filter(function(x){return x.trunk===trunkId;});
  var t=fiberTrunkById(f,trunkId);
  f.strands.push({id:fiberId('fst'),trunk:trunkId||'',pos:inTrunk.length+1,
    mode:(t?t.mode:FIBER_MODES[0][0]),path:(t?t.path:'A'),from:'',to:'',conn:FIBER_CONN[0],
    signal:'',len:'',status:'Spare',loss:'',cadRef:'',notes:''});
  fiberMutTail(key);}
function fiberTrunkById(f,id){for(var i=0;i<f.trunks.length;i++)if(f.trunks[i].id===id)return f.trunks[i];return null;}
function fiberEditTrunk(key,id,field,val){var f=fiberGet(productions[key]);var t=fiberTrunkById(f,id);if(!t)return;
  t[field]=val;
  /* mode and path belong to the cable — push them down the strands it carries */
  if(field==='mode'||field==='path')f.strands.forEach(function(x){if(x.trunk===id)x[field]=val;});
  fiberMutTail(key);}
function fiberDelTrunk(key,id){var f=fiberGet(productions[key]);var t=fiberTrunkById(f,id);if(!t)return;
  var n=f.strands.filter(function(x){return x.trunk===id;}).length;
  if(!confirm('Remove '+t.label+' and its '+n+' strand'+(n===1?'':'s')+' from the fiber schedule?'))return;
  f.trunks=f.trunks.filter(function(x){return x.id!==id;});
  f.strands=f.strands.filter(function(x){return x.trunk!==id;});
  fiberMutTail(key);}
function fiberEditStrand(key,id,field,val){var f=fiberGet(productions[key]);
  f.strands.forEach(function(x){if(x.id===id)x[field]=(field==='pos')?(parseInt(val,10)||1):val;});
  fiberMutTail(key);}
function fiberDelStrand(key,id){var f=fiberGet(productions[key]);
  f.strands=f.strands.filter(function(x){return x.id!==id;});fiberMutTail(key);}

/* signal pool so a strand can be pointed at something real without free-typing */
function fiberSignalPool(key){var p=productions[key];var out=['PGM','PGM CLEAN','PVW','RETURN 1','RETURN 2','IFB','COMMS','TALKBACK','DATA / VLAN','PTP / 2110 trunk','TX PATH','BACKUP PATH'];
  var n=parseInt(p.tbFields&&p.tbFields['Cameras / Video']&&p.tbFields['Cameras / Video'].count,10);
  if(isNaN(n)||n<1)n=Math.min(12,((p.tbEquip&&p.tbEquip['Cameras / Video'])||[]).length||8);
  if(n>40)n=40;
  for(var i=1;i<=n;i++)out.push('CAM '+i);
  return out;}

function fiberSel(val,opts,handler){
  var o=opts.map(function(x){var v=(typeof x==='string')?x:x[0];
    return '<option value="'+esc(v).replace(/"/g,'&quot;')+'"'+(v===val?' selected':'')+'>'+esc(v)+'</option>';}).join('');
  return '<select onchange="'+handler+'" class="w-full text-[10px] border border-gray-200 rounded px-1 py-1 bg-white" style="outline:none">'+o+'</select>';}
function fiberTxt(val,ph,handler,cls){
  return '<input value="'+esc(val==null?'':val).replace(/"/g,'&quot;')+'" placeholder="'+esc(ph||'')+'" onchange="'+handler+'" class="w-full text-[10px] '+(cls||'')+' border border-gray-200 rounded px-1.5 py-1 bg-white" style="outline:none">';}

function fiberLegendHTML(){
  return '<div class="flex flex-wrap items-center gap-1 mt-1">'+
    FIBER_TIA.map(function(c,i){
      return '<span title="Strand '+(i+1)+' — '+c[0]+'" class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 border border-gray-200 mono" style="font-size:8px;background:'+c[1]+';color:'+c[2]+'">'+(i+1)+' '+esc(c[0])+'</span>';
    }).join('')+'</div>';}

function fiberCadLinksHTML(key){
  var p=productions[key];var f=fiberGet(p);
  var linked=f.strands.filter(function(x){return x.cadRef&&String(x.cadRef).trim();});
  if(!linked.length)return '';
  return '<div class="rounded-xl border border-violet-200 bg-violet-50/50 px-3 py-2 mt-2 text-[10px] text-violet-900">'+
    '<b>CAD-linked strands:</b> '+linked.map(function(x){
      var c=fiberTia(x.pos);return '<span class="mono mx-1">#'+x.pos+' '+c[0]+' → '+esc(x.cadRef)+(x.signal&&String(x.signal).indexOf('unassigned')<0?' ('+esc(x.signal)+')':'')+'</span>';
    }).join(' · ')+
    ' <button type="button" onclick="setDeptTab(\''+key+'\',\'CAD\')" class="font-bold text-blue-700 hover:underline ml-1">Open CAD →</button></div>';
}
function fiberScheduleHTML(key){
  var p=productions[key];var f=fiberGet(p);
  var pool=fiberSignalPool(key);
  var venue=(typeof hasLocs==='function'&&hasLocs(key)&&typeof activeLocation==='function')?activeLocation(key):null;

  var counts={total:f.strands.length,live:0,spare:0,fault:0};
  f.strands.forEach(function(x){
    if(x.status==='In service'||x.status==='Tested OK')counts.live++;
    else if(x.status==='Spare')counts.spare++;
    if(x.status==='Fault')counts.fault++;});

  var head='<tr class="text-gray-500 uppercase tracking-wider text-[8px] border-b border-gray-200">'+
    '<th class="pb-1.5 pr-2" style="width:86px">Strand</th>'+
    '<th class="pb-1.5 pr-2">A/B</th>'+
    '<th class="pb-1.5 pr-2">From (panel · port)</th>'+
    '<th class="pb-1.5 pr-2">To (panel · port)</th>'+
    '<th class="pb-1.5 pr-2">Connector</th>'+
    '<th class="pb-1.5 pr-2">Signal / Circuit</th>'+
    '<th class="pb-1.5 pr-2">Length</th>'+
    '<th class="pb-1.5 pr-2">Status</th>'+
    '<th class="pb-1.5 pr-2">Loss dB</th>'+
    '<th class="pb-1.5 pr-2">CAD link</th>'+
    '<th class="pb-1.5"></th></tr>';

  function strandRows(list){
    return list.map(function(x){
      var c=fiberTia(x.pos);
      var stc=fiberStatusColor(x.status);
      return '<tr class="border-b border-gray-100">'+
        '<td class="py-1 pr-2"><span class="inline-flex items-center gap-1"><input value="'+esc(''+(x.pos||1))+'" onchange="fiberEditStrand(\''+key+'\',\''+x.id+'\',\'pos\',this.value)" title="Strand position in the 12-fibre group" class="text-[10px] mono border border-gray-200 rounded px-1 py-0.5 bg-white" style="width:30px;outline:none">'+
          '<span class="mono rounded px-1.5 py-0.5 border border-gray-200" style="font-size:8px;background:'+c[1]+';color:'+c[2]+'" title="TIA-598-C strand colour">'+esc(c[0])+'</span></span></td>'+
        '<td class="py-1 pr-2" style="min-width:52px">'+fiberSel(x.path,FIBER_PATH,'fiberEditStrand(\''+key+'\',\''+x.id+'\',\'path\',this.value)')+'</td>'+
        '<td class="py-1 pr-2" style="min-width:120px">'+fiberTxt(x.from,'TX rack · P1-01','fiberEditStrand(\''+key+'\',\''+x.id+'\',\'from\',this.value)','mono')+'</td>'+
        '<td class="py-1 pr-2" style="min-width:120px">'+fiberTxt(x.to,'Truck A · P4-06','fiberEditStrand(\''+key+'\',\''+x.id+'\',\'to\',this.value)','mono')+'</td>'+
        '<td class="py-1 pr-2" style="min-width:112px">'+fiberSel(x.conn,FIBER_CONN,'fiberEditStrand(\''+key+'\',\''+x.id+'\',\'conn\',this.value)')+'</td>'+
        '<td class="py-1 pr-2" style="min-width:118px">'+fiberSel(x.signal,['— unassigned —'].concat(pool),'fiberEditStrand(\''+key+'\',\''+x.id+'\',\'signal\',this.value)')+'</td>'+
        '<td class="py-1 pr-2" style="min-width:62px">'+fiberTxt(x.len,'m','fiberEditStrand(\''+key+'\',\''+x.id+'\',\'len\',this.value)','mono')+'</td>'+
        '<td class="py-1 pr-2" style="min-width:104px"><span class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full flex-shrink-0" style="background:'+stc+'"></span>'+fiberSel(x.status,FIBER_STATUS,'fiberEditStrand(\''+key+'\',\''+x.id+'\',\'status\',this.value)')+'</span></td>'+
        '<td class="py-1 pr-2" style="min-width:56px">'+fiberTxt(x.loss,'0.35','fiberEditStrand(\''+key+'\',\''+x.id+'\',\'loss\',this.value)','mono')+'</td>'+
        '<td class="py-1 pr-2" style="min-width:100px">'+fiberTxt(x.cadRef||'','CAD layer','fiberEditStrand(\''+key+'\',\''+x.id+'\',\'cadRef\',this.value)','mono')+'</td>'+
        '<td class="py-1 text-right"><button onclick="fiberDelStrand(\''+key+'\',\''+x.id+'\')" title="Remove strand" class="text-gray-300 hover:text-red-500 text-[11px]">✕</button></td></tr>';
    }).join('');}

  var trunkBlocks=f.trunks.map(function(t){
    var mine=f.strands.filter(function(x){return x.trunk===t.id;});
    var md=fiberModeDef(t.mode);
    return '<div class="border border-gray-200 rounded-xl p-3 mb-3">'+
      '<div class="flex flex-wrap items-end gap-2 mb-2">'+
        '<div style="flex:1 1 130px;min-width:110px"><span class="text-[7px] uppercase tracking-wider text-gray-400 block mb-0.5">Trunk</span>'+fiberTxt(t.label,'TRUNK 1','fiberEditTrunk(\''+key+'\',\''+t.id+'\',\'label\',this.value)','font-semibold')+'</div>'+
        '<div style="flex:1 1 140px;min-width:120px"><span class="text-[7px] uppercase tracking-wider text-gray-400 block mb-0.5">Cable / Reel</span>'+fiberTxt(t.cable,'TAC-12 reel 1','fiberEditTrunk(\''+key+'\',\''+t.id+'\',\'cable\',this.value)','mono')+'</div>'+
        '<div style="flex:1 1 150px;min-width:130px"><span class="text-[7px] uppercase tracking-wider text-gray-400 block mb-0.5">Fibre type</span>'+
          '<span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm flex-shrink-0 border border-gray-300" style="background:'+md[1]+'" title="Jacket colour — '+esc(md[0])+'"></span>'+
          fiberSel(t.mode,FIBER_MODES,'fiberEditTrunk(\''+key+'\',\''+t.id+'\',\'mode\',this.value)')+'</span></div>'+
        '<div style="flex:0 1 68px;min-width:60px"><span class="text-[7px] uppercase tracking-wider text-gray-400 block mb-0.5">Path</span>'+fiberSel(t.path,FIBER_PATH,'fiberEditTrunk(\''+key+'\',\''+t.id+'\',\'path\',this.value)')+'</div>'+
        '<div style="flex:1 1 120px;min-width:100px"><span class="text-[7px] uppercase tracking-wider text-gray-400 block mb-0.5">Route from</span>'+fiberTxt(t.from,'IBC / TOC','fiberEditTrunk(\''+key+'\',\''+t.id+'\',\'from\',this.value)')+'</div>'+
        '<div style="flex:1 1 120px;min-width:100px"><span class="text-[7px] uppercase tracking-wider text-gray-400 block mb-0.5">Route to</span>'+fiberTxt(t.to,'Camera plat 22m','fiberEditTrunk(\''+key+'\',\''+t.id+'\',\'to\',this.value)')+'</div>'+
        '<div style="flex:0 1 74px;min-width:64px"><span class="text-[7px] uppercase tracking-wider text-gray-400 block mb-0.5">Run (m)</span>'+fiberTxt(t.len,'250','fiberEditTrunk(\''+key+'\',\''+t.id+'\',\'len\',this.value)','mono')+'</div>'+
        '<button onclick="fiberDelTrunk(\''+key+'\',\''+t.id+'\')" title="Remove this trunk and its strands" class="text-red-400 hover:text-red-600 px-1 pb-1">✕</button>'+
      '</div>'+
      (mine.length?'<div class="overflow-x-auto"><table class="w-full text-left" style="min-width:940px"><thead>'+head+'</thead><tbody>'+strandRows(mine)+'</tbody></table></div>'
        :'<p class="text-[10px] text-gray-400 py-1">No strands on this trunk yet.</p>')+
      '<button onclick="fiberAddStrand(\''+key+'\',\''+t.id+'\')" class="mt-2 text-[10px] font-bold text-blue-700 hover:underline">+ Add strand</button>'+
    '</div>';
  }).join('');

  var loose=f.strands.filter(function(x){return !x.trunk||!fiberTrunkById(f,x.trunk);});
  var looseBlock=loose.length?('<div class="border border-gray-200 rounded-xl p-3 mb-3">'+
    '<p class="text-[10px] font-bold text-gray-600 mb-2">Unassigned strands <span class="font-normal text-gray-400">— not on a trunk</span></p>'+
    '<div class="overflow-x-auto"><table class="w-full text-left" style="min-width:940px"><thead>'+head+'</thead><tbody>'+strandRows(loose)+'</tbody></table></div></div>'):'';

  var chip=function(label,val,col){return '<span class="dept-chip mono" style="border-color:'+col+'33;background:'+col+'12;color:'+col+'">'+val+' '+label+'</span>';};

  return '<div class="bg-white rounded-2xl p-4 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">'+
    '<div class="flex flex-wrap items-start justify-between gap-2 mb-2">'+
      '<div><h4 class="text-[10px] font-bold uppercase tracking-wider text-gray-600">Fiber Schedule'+(venue?' — '+esc(venue.name):'')+'</h4>'+
        '<p class="text-[9px] text-gray-500 mt-0.5">One row per strand, grouped by trunk — TIA-598-C colour code (strand 1-12 Blue→Aqua, jacket colour by fibre type), A/B path, panel/port endpoints, signal, length, test loss and status.</p>'+
        fiberLegendHTML()+(typeof fiberCadLinksHTML==='function'?fiberCadLinksHTML(key):'')+'</div>'+
      '<div class="flex items-center gap-1.5 flex-wrap justify-end">'+
        chip('strands',counts.total,'#3E4042')+chip('in service',counts.live,'#1E7B34')+
        chip('spare',counts.spare,'#65676b')+(counts.fault?chip('fault',counts.fault,'#e41e3f'):'')+
      '</div></div>'+
    (f.trunks.length||loose.length?(trunkBlocks+looseBlock)
      :'<p class="text-[11px] text-gray-400 text-center py-4">No fiber logged yet — add a 12-strand trunk to lay in a full TIA-598-C group.</p>')+
    '<div class="flex items-center gap-3 pt-1">'+
      '<button onclick="fiberAddTrunk(\''+key+'\')" class="text-[10px] font-bold text-white bg-blue-600 rounded-lg px-3 py-1.5 hover:bg-blue-700">+ 12-strand trunk</button>'+
      '<button onclick="fiberAddStrand(\''+key+'\',\'\')" class="text-[10px] font-bold text-blue-700 hover:underline">+ Single strand</button>'+
    '</div>'+
  '</div>';}

/* v38 multi-venue: one transmission chain per venue. Reads each venue's own
   Transmission / Signal board out of the per-venue department bundles (deptLoc);
   the venue currently bound to the project-level board reads live tbFields. */
function txByVenueHTML(key){
  var p=productions[key];
  if(typeof hasLocs!=='function'||!hasLocs(key))return '';
  var act=activeLocation(key);var bound=p.__locBound;
  var FIELDS=[['transport','Transport'],['format','Format'],['satellite','Satellite'],['liveumodel',"LiveU LU800"],['encoder','Encoder'],['backup','Backup Path']];
  var rows=locsOf(key).map(function(L){
    var tf=(L.id===bound)?(p.tbFields&&p.tbFields['Transmission / Signal']):(p.deptLoc&&p.deptLoc[L.id]&&p.deptLoc[L.id].tbFields&&p.deptLoc[L.id].tbFields['Transmission / Signal']);
    tf=tf||{};
    var on=act&&act.id===L.id;
    var cells=FIELDS.map(function(f2){var v=tf[f2[0]];if(Array.isArray(v))v=v.join(' · ');v=(v==null?'':(''+v));
      return '<td class="py-1.5 pr-3 text-[10px] '+(v?'text-gray-700':'text-gray-300')+'">'+(v?esc(v):'—')+'</td>';}).join('');
    var st=(L.id===bound)?p.dept:(p.deptLoc&&p.deptLoc[L.id]&&p.deptLoc[L.id].dept);
    var stRow=null;if(st)for(var i2=0;i2<st.length;i2++){if(st[i2][0]==='Transmission / Signal'){stRow=st[i2];break;}}
    var dot=stRow?(stRow[1]==='approved'?'#1E7B34':(stRow[1]==='pending'?'#f5832a':'#e41e3f')):'#ced0d4';
    return '<tr class="border-b border-gray-100'+(on?' bg-blue-50/40':'')+'">'+
      '<td class="py-1.5 pr-3 whitespace-nowrap"><span class="inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-800"><span class="w-2 h-2 rounded-full flex-shrink-0" style="background:'+dot+'"></span>'+(L.flag||'\uD83D\uDCCD')+' '+esc(L.name)+'</span><br><span class="text-[8px] text-gray-400 mono">'+esc(L.city||'')+'</span></td>'+
      cells+
      '<td class="py-1.5 text-right">'+(on?'<span class="text-[9px] mono text-blue-700 font-bold">ACTIVE</span>':'<button onclick="setActiveLoc(\''+key+'\',\''+L.id+'\')" class="text-[9px] font-bold text-blue-700 hover:underline whitespace-nowrap">Edit this venue →</button>')+'</td></tr>';
  }).join('');
  return '<div class="overflow-x-auto"><table class="w-full text-left" style="min-width:760px"><thead><tr class="text-gray-500 uppercase tracking-wider text-[8px] border-b border-gray-200"><th class="pb-1.5 pr-3">Venue</th>'+FIELDS.map(function(f2){return '<th class="pb-1.5 pr-3">'+f2[1]+'</th>';}).join('')+'<th></th></tr></thead><tbody>'+rows+'</tbody></table>'+
    '<p class="text-[9px] text-gray-400 mt-2">One transmission chain per venue — each row is that venue\'s own Transmission / Signal board. "Edit this venue" switches the active site; this tile then edits that venue\'s chain.</p></div>';}
/* v39 — live production workflow checklists (enrich Department Status tiles) */
var DEPT_WORKFLOW_CHECKS={
  "Cameras / Video":["Lenses locked (wide / long / boxed)","Handhelds / ENG kits assigned","Studio configs posted","Cable lengths logged","Stabilized heads / jib confirmed","Panasonic (or assigned) model + P50 path","Teleprompter / iNews","Presidential / glass / LED panels","Decimator Hi5 adapters staged","Genlock / PTP on every hard cam","ISO paths to Replay confirmed"],
  "Audio":["Console showfile loaded & backed up","Telos / RVON paths live","Stageboxes / pop-ups placed","Music mix position set","Comms matrix A1 ↔ TD ↔ truck","RF coordination scan complete","IFB / REM tested to talent"],
  "Transmission / Signal":["Fiber content / strand count locked","SMPTE or Triax path chosen","ISO count to ingest","Satellite / microwave / Contribution unit booked","Cellular bonded credentials","TOC hand-off window","Primary + backup BER / eye clean"],
  "Engineering":["Switcher model + input count","Ingest server + drive space","Codec — DNxHD 145 / ProRes","Labeling convention posted","Router tally matches camera plan","PTP / genlock green"],
  "Replay / EVS":["How many ISOs?","XT3 / VIAZ channel map","Playback / Record paths","Spotbox assigned","HDCAM / tapestock if required","PGM + ISO inputs present"],
  "Power / Electrical":["2× 400A / 3-phase logged","1× 200A service","208V / 150A (2 hot + ground)","UPS + fuel estimate","Redundancy / ATS test","Yellow jackets / ramps","Emergency kill marked"],
  "Lighting":["HMI vs fluorescent 3200/5600","Cue stack backed up","DMX / sACN universes unique","Power draw shared with electrical","Spot-cool / practicals"],
  "Graphics (GFX)":["Chyron Prime (or equivalent)","Chyron Prime version locked","Chyron Prime path","Operator assigned","Show package + bugs approved"],
  "Networking / IT":["Data-drop bandwidth logged","Muse Live network / VPN","Wi-Fi isolated from media VLAN","Workstations + printers","QoS / DSCP marked"],
  "Legal / Rights":["Union agreement on file","Waivers / insurance","Venue permits / FAA","Seat kills / ADA","Talent releases / music cues"]
};
/* Event Check List (Desktop/Event Check List.pages) — source of truth for Site Survey air-readiness. */
var EVENT_CHECKLIST=[
  {id:'video',title:'Video',items:['1080i / 59.94 / 16×9 / 60 Hz confirmed']},
  {id:'truck',title:'TV Truck',items:['Dimensions logged','Parking location confirmed','Leveled surface','Height restrictions — 13 ft minimum','Ideal footprint 19 ft','Entrance height if underground / garage','Power requirements at truck','SMPTE or Triax path','Access — does a bridge need to be built?','Distances from A/B units','Fire egress']},
  {id:'fiber',title:'Fiber / Ingest',items:['Fiber content / strands','How many ISOs?','Hard-drive space required','Server assigned','Playback / Record paths','Spotbox','Codec — DNxHD 145 / ProRes','XT3 / VIAZ channels','HDCAM VTR + tapestock','Keypros','Drive size (USB / SSD)','Labeling convention']},
  {id:'switcher',title:'Switcher',items:['Model confirmed','Input count locked']},
  {id:'gfx',title:'Graphics',items:["Chyron Prime (or equivalent)",'Operator assigned',"Chyron Prime version","Chyron Prime"]},
  {id:'cameras',title:'Cameras',items:['Lenses — wide / long','Boxed vs open','ENG / handhelds','Studio configs','Triservo','Broadcast vs cinematic','Cable lengths','Cast / talent cams','Stabilized heads','Assigned camera model','Teleprompter / iNews','Presidential / glass / LED','Resolution / grey / black','Flown vs ground support','Rental vs owned',"Decimator Hi5 adapters",'Stands / wheels','OLED / color-correct / backup','Elevator / hanging / scaffold']},
  {id:'audio',title:'Audio / Comms',items:['Console showfile','360 Systems / replay2 if used','Telos / RVON','Stageboxes / pop-ups','Music mix','Chairs / expendables']},
  {id:'lighting',title:'Lighting',items:['HMI','Fluorescent 3200 / 5600','Spot cool']},
  {id:'power',title:'Power',items:['2× 400A / 3-phase','1× 200A','Amplifiers / WorldMix','Floor vs catwalk','208V / 150A (2 hot + ground)','110V edit circuits','DC / flyaway / trailer','UPS','Fuel estimate','Redundancy']},
  {id:'grip',title:'Grip / Access',items:['Jib / FOH / truss / platforms','Capacity (psf)','Wood plug / steel ramp / rails','4×4 — do not touch cam track','Yellow jackets / loaders / lifts']},
  {id:'schedule',title:'Schedule / Transport',items:['Schedule with venue','Receipts / transfers','Heavy equipment / climb','PPE','Walkie inventory','Steadicam / wireless','Catering / craft','Pyro extinguishers']},
  {id:'data',title:'Data / Network / TX',items:['Data drop + bandwidth','Wi-Fi','Muse Live network / VPN','Workstations / printers','Skytech / Verizon / carrier','News integration / MUSE1','Satellite','Microwave',"LiveU LU800 / cellular",'MOT / noise']},
  {id:'stream',title:'Streaming',items:['Destinations confirmed (Facebook Live · Instagram Live · meta.com embeds · Workplace)','RTMPS stream keys in vault — not in run-of-show','Contribution: SRT primary + bonded cellular backup paths green','MediaConnect flow + MediaLive channel healthy','ABR ladder locked (rungs · fps · bitrate per rung)','Packaging: HLS + LL-HLS + DASH/CMAF enabled','Multi-CDN delivery weight set (CloudFront / Akamai)','Loudness target met (−24 LKFS ±2) · audio description rendition','Captions tested (608/708 + live stenocaptions)','Monitoring: TAG probe + CloudWatch alarms + PagerDuty routes verified','QoE beacons firing (rebuffer · startup · failures)','DVR window + start-over tested','Thresholds set: SRT loss > 0.5%, edge 5xx > 0.5%, segment age > 6 s, rebuffer > 1%','Failover drill (primary → backup) rehearsed within 48 h','SCTE-35 slate / countdown markers armed']},
  {id:'venue',title:'Venue / Permits',items:['Times of operation','Union agreement','Empties / boneyard / dock','Security','IPTV / ribbon','Venue tech spec / layout / BSP','ADA area / seat kills','Fence / carpet','Forklift / scissor / articulating / boom','Harness / keys / insurance / waiver']},
  {id:'labor',title:'Labor / EHS',items:['Crew count / meal / per diem','Approvals / job positions / scope','Lodging / visa','Scenery — flame-retardant fabric','First aid / rigger / steward','Coordinator / makeup / gaffer / runners / supervisor','Plot / grid / ladders / lifts','Fall arrest / emergency plan / exits / rally','Rain / ponchos / umbrellas','Welcome / maps / road closures']}
];
function eventChecksOf(key){var s=(typeof getSurvey==='function')?getSurvey(key):((productions[key]&&productions[key].survey)||{});
  if(!s.eventChecks)s.eventChecks={};return s.eventChecks;}
function eventCheckToggle(key,cid,on){eventChecksOf(key)[cid]=!!on;try{stampEdit(key);}catch(e){}
  try{renderProjectView(key);}catch(e2){}}
function eventChecklistPct(key){var st=eventChecksOf(key);var total=0,done=0;
  EVENT_CHECKLIST.forEach(function(sec){sec.items.forEach(function(_,i){total++;if(st[sec.id+'.'+i])done++;});});
  return {done:done,total:total,pct:total?Math.round(done/total*100):0};}
function eventChecklistHTML(key){var st=eventChecksOf(key);var tot=eventChecklistPct(key);
  var secs=EVENT_CHECKLIST.map(function(sec){
    var n=sec.items.length,d=sec.items.filter(function(_,i){return st[sec.id+'.'+i];}).length;
    var rows=sec.items.map(function(label,i){
      var id=sec.id+'.'+i;var on=!!st[id];
      return '<label class="flex items-start gap-2 text-[11px] text-gray-700 py-0.5 cursor-pointer">'+
        '<input type="checkbox" '+(on?'checked':'')+' onchange="eventCheckToggle(\''+key+'\',\''+id+'\',this.checked)" class="mt-0.5">'+
        '<span>'+esc(label)+'</span></label>';
    }).join('');
    return '<details class="rounded-xl border border-gray-200/70 bg-white/70 px-3 py-2" '+(d&&d<n?'open':'')+'>'+
      '<summary class="flex items-center justify-between cursor-pointer list-none">'+
        '<span class="text-[10px] font-bold uppercase tracking-wider text-gray-700">'+esc(sec.title)+'</span>'+
        '<span class="text-[9px] mono font-bold '+(d===n?'text-emerald-600':'text-indigo-700')+'">'+d+'/'+n+'</span></summary>'+
      '<div class="mt-1.5 border-t border-gray-100 pt-1.5">'+rows+'</div></details>';
  }).join('');
  return '<div class="bg-white rounded-2xl p-4 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">'+
    '<div class="flex items-center justify-between mb-1"><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">Air-readiness checklist</h3>'+
    '<span class="text-[11px] mono font-bold text-indigo-700">'+tot.done+'/'+tot.total+' · '+tot.pct+'%</span></div>'+
    '<p class="text-[10px] text-gray-500 mb-3">Nested under Site Survey. Source: Event Check List (drawings + vendor meeting, schedule with venue + site walk → tasks → LBA).</p>'+
    '<div class="grid grid-cols-1 md:grid-cols-2 gap-2">'+secs+'</div></div>';}
function deptWorkflowHTML(key,dept){
  var items=DEPT_WORKFLOW_CHECKS[dept];if(!items||!items.length)return '';
  var p=productions[key];if(!p.deptChecks)p.deptChecks={};if(!p.deptChecks[dept])p.deptChecks[dept]={};
  var st=p.deptChecks[dept];
  var rows=items.map(function(label,i){
    var id='c'+i;var on=!!st[id];
    return '<label class="flex items-start gap-2 text-[10px] text-gray-700 py-0.5 cursor-pointer">'+
      '<input type="checkbox" '+(on?'checked':'')+' onchange="deptCheckToggle(\''+key+'\',\''+dept.replace(/'/g,"\\'")+'\',\''+id+'\',this.checked)" class="mt-0.5">'+
      '<span>'+esc(label)+'</span></label>';
  }).join('');
  var done=items.filter(function(_,i){return st['c'+i];}).length;
  return '<div class="rounded-xl border border-indigo-200 bg-indigo-50/40 px-3 py-2 mb-2">'+
    '<div class="flex items-center justify-between mb-1"><span class="text-[9px] font-bold uppercase tracking-wider text-indigo-800">Air-readiness checklist</span>'+
    '<span class="text-[9px] mono font-bold text-indigo-700">'+done+'/'+items.length+'</span></div>'+rows+'</div>';
}
function deptCheckToggle(key,dept,id,val){
  var p=productions[key];if(!p.deptChecks)p.deptChecks={};if(!p.deptChecks[dept])p.deptChecks[dept]={};
  p.deptChecks[dept][id]=!!val;stampEdit(key);
  try{renderDeptBoard(key);}catch(e){try{renderProjectView(key);}catch(e2){}}
}
function deptCustomSections(key,dept){var out=[];
  /* Air-readiness lives under Site Survey (Event Check List). GFX keeps QC/playback only. */
  if(dept!=='Graphics (GFX)'){
    try{var wf=deptWorkflowHTML(key,dept);if(wf)out.push({hkey:'_aircheck',title:'Department checklist',html:wf});}catch(e){}
  }

  if(dept==='Transmission / Signal'&&typeof fiberScheduleHTML==='function'){
    var fHtml='';try{fHtml=fiberScheduleHTML(key);}catch(e){fHtml='';}
    if(fHtml)out.push({hkey:'_fiber',label:'Fiber Schedule — strand-level, TIA-598-C colour code',html:fHtml});
  }
  if(dept==='Transmission / Signal'&&typeof hasLocs==='function'&&hasLocs(key)){
    var vHtml='';try{vHtml=txByVenueHTML(key);}catch(e){vHtml='';}
    if(vHtml)out.push({hkey:'_txvenues',label:'Transmission — BY VENUE (one chain per site)',html:vHtml});
  }
  if(dept==='Audio'){
    out.push({hkey:'_audiofiles',label:'Audio Files — Upload · Convert · Play',html:audioFilesSectionHTML(key)});
    if(typeof ifbRoutingHTML==='function')out.push({hkey:'_ifbboard',label:'IFB Signal Routing — Unified REM & TIFF Platform',html:ifbRoutingHTML(key)});
  }
  /* v30 Module 3: Power/Electrical + CAD tiles REUSE the Site Survey modules — same data
     object (survey.power / survey.cad), same renderers — never a second implementation. */
  if(dept==='Lighting'){
    out.push({hkey:'_lightload',label:'Power Draw — linked to Power / Electrical',html:lightingPowerXlinkHTML(key)});
  }
  if(dept==='Graphics (GFX)'&&typeof gfxSectionHTML==='function'){
    out.push({hkey:'_gfxplayer',label:'Graphics Playback · Alpha QC',html:gfxSectionHTML(key)});
  }
  if(dept==='Power / Electrical'&&typeof powerPaneHTML==='function'&&typeof getSurvey==='function'){
    var pHtml='';try{pHtml=powerPaneHTML(key);}catch(e){pHtml='';}
    if(pHtml)out.push({hkey:'_pwrsurvey',label:'Power Distribution — Site Survey (single source)',html:
      deptSourceNote('This is the <b>same</b> Power module as Site Survey → Power — one dataset, two views. Distros, cable runs, load vs. capacity, grounding/bonding, photos and hazards edited here update Site Survey and the Tech Book instantly.')+
      powerLightingBackNoteHTML(key)+pHtml});
  }
  /* v38: the Replay operations board lives INSIDE the Replay / EVS department tile
     (it was a standalone top-level tab through v37) — same renderer, same p.replay
     data, now a first-class Production Area like Audio or Power. */
  if(dept==='Replay / EVS'&&typeof replayPaneHTML==='function'){
    var rHtml='';try{rHtml=replayPaneHTML(key);}catch(e){rHtml='';}
    if(rHtml)out.push({hkey:'_replayboard',label:'Replay Operations Board — channels · clips · multiviewer · IP · storage',html:rHtml});
  }
  if(dept==='CAD'&&typeof cadSectionHTML==='function'&&typeof getSurvey==='function'){
    var cHtml='';try{cHtml=cadSectionHTML(key,getSurvey(key));}catch(e){cHtml='';}
    if(cHtml)out.push({hkey:'_cadsurvey',label:'CAD & Site Plans — Site Survey (single source)',html:
      deptSourceNote('This is the <b>same</b> CAD module as Site Survey → CAD — <b>read-only</b> 2D/3D viewer for DXF, DWG, OBJ, STL &amp; images. Geometry cannot be edited; drop colored note dots for the team. DWF / STEP / Parasolid / VWX are not supported in-browser.')+cHtml});
  }
  return out;}

/* ================================================================================
   v30 MODULE 6 — REPLAY operations board.
   v38: no longer a top-level tab — it renders inside the "Replay / EVS" tile on
   Department Status — Production Areas (deptCustomSections '_replayboard'), so it
   behaves exactly like every other Production Area (status, notes, vendor,
   approval, hide/restore, equipment lines).
   Vendor-agnostic — works for EVS, DreamCatcher, 3Play or any replay server.
   Sections: channels/servers · clip bin & playlist · multiviewer reference ·
   network/IP status (SDI vs SMPTE ST 2110, NMOS/PTP) · shared storage/archive.
   Model: p.replay={channels:[],clips:[],mv:{feeds:[]},net:{},store:{}} (persisted).
   ================================================================================ */
var REPLAY_CH_STATUS=['Idle','Recording','Cued','Playing','Fault'];
var REPLAY_CH_MODES=['Record','Play','Record + Play'];
var REPLAY_NET_TRANSPORT=['SDI (baseband)','SMPTE ST 2110 (IP)','Hybrid SDI + IP'];
var REPLAY_NMOS=['Registered (IS-04/IS-05)','Not registered','N/A — SDI only'];
var REPLAY_PTP=['Locked','Unlocked / free-run','N/A — SDI only'];
var REPLAY_STORE_STATUS=['Healthy','Degraded','Down','Not configured'];
function replayGet(p){if(!p.replay||typeof p.replay!=='object')p.replay={};var r=p.replay;
  if(!Array.isArray(r.channels))r.channels=[];
  if(!Array.isArray(r.clips))r.clips=[];
  if(!r.mv||typeof r.mv!=='object')r.mv={feeds:['PGM','PVW']};if(!Array.isArray(r.mv.feeds))r.mv.feeds=['PGM','PVW'];
  if(!r.net||typeof r.net!=='object')r.net={transport:REPLAY_NET_TRANSPORT[0],nmos:REPLAY_NMOS[2],ptp:REPLAY_PTP[2],gm:'',notes:''};
  if(!r.store||typeof r.store!=='object')r.store={status:'Not configured',capTb:'',usedTb:'',shared:'',archive:'',notes:''};
  return r;}
function replayId(pfx){return pfx+Date.now().toString(36)+Math.floor(Math.random()*1e4);}
/* camera-source pool: PGM/PVW/CLEAN + CAM 1..n (n = Cameras/Video count or entered lines) */
function replayCamPool(key){var p=productions[key];var out=['PGM','PVW','CLEAN'];
  var n=parseInt(p.tbFields&&p.tbFields['Cameras / Video']&&p.tbFields['Cameras / Video'].count,10);
  var lines=(p.tbEquip&&p.tbEquip['Cameras / Video'])||[];
  if(isNaN(n)||n<1)n=Math.max(lines.length,8);if(n>40)n=40;
  for(var i=1;i<=n;i++){var ln=lines[i-1];out.push('CAM '+i+(ln&&ln.model?' · '+ln.model:''));}
  return out;}
function replayMutTail(key){stampEdit(key);renderAll();renderProjectView(key);}
function replayAddChannel(key){var r=replayGet(productions[key]);
  r.channels.push({id:replayId('rch'),server:'Server '+String.fromCharCode(65+Math.min(25,Math.floor(r.channels.length/4))),ch:'CH '+(r.channels.length+1),mode:'Record',camera:'',status:'Idle'});replayMutTail(key);}
function replayEditChannel(key,id,f,v){var r=replayGet(productions[key]);r.channels.forEach(function(c){if(c.id===id)c[f]=v;});replayMutTail(key);}
function replayDelChannel(key,id){var r=replayGet(productions[key]);r.channels=r.channels.filter(function(c){return c.id!==id;});replayMutTail(key);}
function replayAddClip(key){var r=replayGet(productions[key]);
  r.clips.push({id:replayId('rcl'),name:'Clip '+(r.clips.length+1),src:'',tin:'',tout:'',notes:''});replayMutTail(key);}
function replayEditClip(key,id,f,v){var r=replayGet(productions[key]);r.clips.forEach(function(c){if(c.id===id)c[f]=v;});replayMutTail(key);}
function replayDelClip(key,id){var r=replayGet(productions[key]);r.clips=r.clips.filter(function(c){return c.id!==id;});replayMutTail(key);}
function replayMoveClip(key,id,dir){var r=replayGet(productions[key]);var i=-1;
  r.clips.forEach(function(c,j){if(c.id===id)i=j;});if(i<0)return;var j=i+dir;if(j<0||j>=r.clips.length)return;
  var tmp=r.clips[i];r.clips[i]=r.clips[j];r.clips[j]=tmp;replayMutTail(key);}
function replayMvToggle(key,feed){var r=replayGet(productions[key]);var i=r.mv.feeds.indexOf(feed);
  if(i>-1)r.mv.feeds.splice(i,1);else r.mv.feeds.push(feed);replayMutTail(key);}
function replayEditNet(key,f,v){var r=replayGet(productions[key]);r.net[f]=v;replayMutTail(key);}
function replayEditStore(key,f,v){var r=replayGet(productions[key]);r.store[f]=v;replayMutTail(key);}
function replayTcOk(tc){return !tc||/^\d{1,2}:\d{2}:\d{2}[:;]\d{2}$/.test(tc);}
function replayPaneHTML(key){var p=productions[key];var r=replayGet(p);var pool=replayCamPool(key);
  function card(title,sub,body){return '<div class="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">'+
    '<div class="flex flex-wrap items-center justify-between gap-2 mb-2"><div><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">'+title+'</h3>'+(sub?'<p class="text-[10px] text-gray-500 mt-0.5">'+sub+'</p>':'')+'</div></div>'+body+'</div>';}
  function selHTML(cur,opts,oc,extraCls){return '<select onchange="'+oc+'" class="w-full text-[10px] text-gray-700 border border-gray-200 rounded px-1.5 py-1 bg-white '+(extraCls||'')+'" style="outline:none;min-width:0;max-width:100%">'+
    opts.map(function(o){return '<option'+(String(cur)===String(o)?' selected':'')+'>'+esc(o)+'</option>';}).join('')+'</select>';}
  var chStatusCls={Idle:'bg-gray-100 text-gray-600',Recording:'bg-red-100 text-red-700',Cued:'bg-amber-100 text-amber-700',Playing:'bg-emerald-100 text-emerald-700',Fault:'bg-red-600 text-white'};
  // --- channels / servers ---
  var chRows=r.channels.map(function(c){
    return '<div class="flex flex-wrap items-end gap-1.5 mb-1.5 rounded-lg border border-gray-100 bg-gray-50/60 p-2">'+
      '<div style="flex:1 1 90px;min-width:80px"><span class="text-[7px] uppercase tracking-wider text-gray-400 block mb-0.5">Server</span><input value="'+esc(c.server).replace(/"/g,'&quot;')+'" onchange="replayEditChannel(\''+key+'\',\''+c.id+'\',\'server\',this.value)" class="w-full text-[10px] mono border border-gray-200 rounded px-1.5 py-1 bg-white" style="outline:none"></div>'+
      '<div style="flex:0 1 70px;min-width:60px"><span class="text-[7px] uppercase tracking-wider text-gray-400 block mb-0.5">Channel</span><input value="'+esc(c.ch).replace(/"/g,'&quot;')+'" onchange="replayEditChannel(\''+key+'\',\''+c.id+'\',\'ch\',this.value)" class="w-full text-[10px] mono border border-gray-200 rounded px-1.5 py-1 bg-white" style="outline:none"></div>'+
      '<div style="flex:1 1 100px;min-width:90px"><span class="text-[7px] uppercase tracking-wider text-gray-400 block mb-0.5">Mode</span>'+selHTML(c.mode,REPLAY_CH_MODES,'replayEditChannel(\''+key+'\',\''+c.id+'\',\'mode\',this.value)')+'</div>'+
      '<div style="flex:2 1 150px;min-width:120px"><span class="text-[7px] uppercase tracking-wider text-gray-400 block mb-0.5">Camera / Source</span>'+selHTML(c.camera,['— unmapped —'].concat(pool),'replayEditChannel(\''+key+'\',\''+c.id+'\',\'camera\',this.value)')+'</div>'+
      '<div style="flex:1 1 100px;min-width:90px"><span class="text-[7px] uppercase tracking-wider text-gray-400 block mb-0.5">Record Status</span>'+selHTML(c.status,REPLAY_CH_STATUS,'replayEditChannel(\''+key+'\',\''+c.id+'\',\'status\',this.value)')+'</div>'+
      '<span class="text-[8px] font-bold uppercase tracking-wider rounded px-1.5 py-1 '+(chStatusCls[c.status]||chStatusCls.Idle)+'">'+esc(c.status)+'</span>'+
      '<button onclick="replayDelChannel(\''+key+'\',\''+c.id+'\')" class="text-red-400 hover:text-red-600 px-1" title="Remove channel">✕</button></div>';
  }).join('');
  var provisioned=fval(p,'Replay / EVS','server')||fval(p,'Engineering','evs')||(p.tb&&p.tb.evs)||'';
  // --- clip bin / playlist ---
  var clipRows=r.clips.map(function(c,i){
    var tinBad=!replayTcOk(c.tin),toutBad=!replayTcOk(c.tout);
    return '<tr class="border-b border-gray-50">'+
      '<td class="py-1 pr-1"><span class="text-[9px] mono text-gray-400">'+(i+1)+'</span></td>'+
      '<td class="py-1 pr-2"><input value="'+esc(c.name).replace(/"/g,'&quot;')+'" onchange="replayEditClip(\''+key+'\',\''+c.id+'\',\'name\',this.value)" class="w-full text-[10px] font-semibold border border-gray-200 rounded px-1.5 py-1 bg-white" style="outline:none;min-width:90px"></td>'+
      '<td class="py-1 pr-2">'+selHTML(c.src,['—'].concat(pool),'replayEditClip(\''+key+'\',\''+c.id+'\',\'src\',this.value)')+'</td>'+
      '<td class="py-1 pr-2"><input value="'+esc(c.tin).replace(/"/g,'&quot;')+'" onchange="replayEditClip(\''+key+'\',\''+c.id+'\',\'tin\',this.value)" placeholder="hh:mm:ss:ff" class="w-full text-[10px] mono border '+(tinBad?'border-red-300 bg-red-50':'border-gray-200 bg-white')+' rounded px-1.5 py-1" style="outline:none;min-width:84px" title="Timecode in — hh:mm:ss:ff"></td>'+
      '<td class="py-1 pr-2"><input value="'+esc(c.tout).replace(/"/g,'&quot;')+'" onchange="replayEditClip(\''+key+'\',\''+c.id+'\',\'tout\',this.value)" placeholder="hh:mm:ss:ff" class="w-full text-[10px] mono border '+(toutBad?'border-red-300 bg-red-50':'border-gray-200 bg-white')+' rounded px-1.5 py-1" style="outline:none;min-width:84px" title="Timecode out — hh:mm:ss:ff"></td>'+
      '<td class="py-1 pr-1 whitespace-nowrap">'+
        '<button onclick="replayMoveClip(\''+key+'\',\''+c.id+'\',-1)" class="text-gray-400 hover:text-gray-700 px-0.5" title="Earlier in playlist">↑</button>'+
        '<button onclick="replayMoveClip(\''+key+'\',\''+c.id+'\',1)" class="text-gray-400 hover:text-gray-700 px-0.5" title="Later in playlist">↓</button>'+
        '<button onclick="replayDelClip(\''+key+'\',\''+c.id+'\')" class="text-red-400 hover:text-red-600 px-0.5" title="Delete clip">✕</button></td></tr>';
  }).join('');
  // --- multiviewer ---
  var mvChips=pool.map(function(f){var on=r.mv.feeds.indexOf(f)>-1;
    return '<button onclick="replayMvToggle(\''+key+'\',\''+f.replace(/'/g,"\\'").replace(/"/g,'&quot;')+'\')" class="text-[10px] font-bold px-2.5 py-1 rounded-lg border '+(on?'bg-gray-900 text-white border-gray-900':'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')+'">'+esc(f)+'</button>';}).join(' ');
  // --- storage bar ---
  var capT=parseFloat(r.store.capTb),usedT=parseFloat(r.store.usedTb);
  var pctUsed=(capT>0&&usedT>=0)?Math.min(100,Math.round(usedT/capT*100)):null;
  var storeCls={Healthy:'bg-emerald-100 text-emerald-700',Degraded:'bg-amber-100 text-amber-700',Down:'bg-red-600 text-white','Not configured':'bg-gray-100 text-gray-500'};
  function kv(label,inner){return '<label class="text-[8px] font-bold uppercase tracking-wider text-gray-400 block">'+label+inner+'</label>';}
  return '<div class="space-y-4">'+
    '<div class="flex flex-wrap items-center justify-between gap-2"><div><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">Replay — '+esc(p.name)+'</h3>'+
      '<p class="text-[10px] text-gray-500 mt-0.5">Vendor-agnostic replay operations board — channels, clips, multiviewer, IP status and shared storage.</p></div>'+
      (provisioned?'<span class="dept-chip mono" title="From this tile\'s Server Platform field">Provisioned: '+esc(provisioned)+'</span>':'')+'</div>'+
    card('Channels / Servers','Record channels in use, camera source mapped per channel, record status per channel.',
      (chRows?'<div class="replay-ch-grid">'+chRows+'</div>':'')+'<button onclick="replayAddChannel(\''+key+'\')" class="text-[10px] font-bold text-blue-700 border border-blue-200 bg-blue-50 rounded-lg px-3 py-1.5 hover:bg-blue-100">+ Add channel</button>')+
    card('Clip Bin / Playlist','Named clips with in/out timecode and source camera — reorder with ↑↓ to build the playlist.',
      '<div class="overflow-x-auto"><table class="w-full" style="min-width:560px"><thead><tr class="text-left text-[8px] font-bold uppercase tracking-wider text-gray-400"><th class="pb-1 pr-1">#</th><th class="pb-1 pr-2">Clip Name</th><th class="pb-1 pr-2">Source Camera</th><th class="pb-1 pr-2">TC In</th><th class="pb-1 pr-2">TC Out</th><th class="pb-1"></th></tr></thead><tbody>'+
      (clipRows||'<tr><td colspan="6" class="py-2 text-[10px] text-gray-400 italic">No clips logged yet.</td></tr>')+'</tbody></table></div>'+
      '<button onclick="replayAddClip(\''+key+'\')" class="mt-2 text-[10px] font-bold text-blue-700 border border-blue-200 bg-blue-50 rounded-lg px-3 py-1.5 hover:bg-blue-100">+ Add clip</button>')+
    card('Multiviewer Reference','Which feeds (PGM / PVW + ISO cameras) are visible to the replay operator.',
      '<div class="flex flex-wrap gap-1.5">'+mvChips+'</div>'+
      '<p class="text-[9px] text-gray-400 mt-1.5">'+r.mv.feeds.length+' feed'+(r.mv.feeds.length===1?'':'s')+' on the operator multiviewer.</p>')+
    '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">'+
    card('Network / IP Status','SDI vs SMPTE ST 2110 IP transport, NMOS registration and PTP lock per install.',
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">'+
        kv('Transport',selHTML(r.net.transport,REPLAY_NET_TRANSPORT,'replayEditNet(\''+key+'\',\'transport\',this.value)'))+
        kv('NMOS',selHTML(r.net.nmos,REPLAY_NMOS,'replayEditNet(\''+key+'\',\'nmos\',this.value)'))+
        kv('PTP',selHTML(r.net.ptp,REPLAY_PTP,'replayEditNet(\''+key+'\',\'ptp\',this.value)'))+
        kv('PTP Grandmaster / Clock ID','<input value="'+esc(r.net.gm||'').replace(/"/g,'&quot;')+'" onchange="replayEditNet(\''+key+'\',\'gm\',this.value)" placeholder="e.g. 00-1D-C1-…:0" class="w-full text-[10px] mono border border-gray-200 rounded px-1.5 py-1 bg-white" style="outline:none">')+
      '</div>'+
      '<label class="text-[8px] font-bold uppercase tracking-wider text-gray-400 block mt-2">Notes</label>'+
      museRichBox({id:'replayn_'+key,value:r.net.notes||'',toolbar:'slim',height:'62px',placeholder:'Network notes…',onchange:'function(v){replayEditNet(\''+key+'\',\'notes\',v)}'}))+
    card('Storage / Archive','Shared media network health and capacity between replay servers.',
      '<div class="flex items-center gap-2 mb-2"><span class="text-[8px] font-bold uppercase tracking-wider rounded px-1.5 py-1 '+(storeCls[r.store.status]||storeCls['Not configured'])+'">'+esc(r.store.status)+'</span>'+
        selHTML(r.store.status,REPLAY_STORE_STATUS,'replayEditStore(\''+key+'\',\'status\',this.value)','')+'</div>'+
      '<div class="grid grid-cols-2 gap-2">'+
        kv('Capacity (TB)','<input value="'+esc(''+(r.store.capTb||'')).replace(/"/g,'&quot;')+'" onchange="replayEditStore(\''+key+'\',\'capTb\',this.value)" class="w-full text-[10px] mono border border-gray-200 rounded px-1.5 py-1 bg-white" style="outline:none">')+
        kv('Used (TB)','<input value="'+esc(''+(r.store.usedTb||'')).replace(/"/g,'&quot;')+'" onchange="replayEditStore(\''+key+'\',\'usedTb\',this.value)" class="w-full text-[10px] mono border border-gray-200 rounded px-1.5 py-1 bg-white" style="outline:none">')+
      '</div>'+
      (pctUsed!=null?'<div class="mt-2"><div class="w-full bg-gray-100 rounded-full" style="height:8px"><div class="rounded-full" style="height:8px;width:'+pctUsed+'%;background:'+(pctUsed>90?'#e41e3f':pctUsed>75?'#f5832a':'#1E7B34')+'"></div></div><p class="text-[9px] mono text-gray-500 mt-0.5">'+pctUsed+'% of shared media network used</p></div>':'')+
      kv('Shared With (servers on the media network)','<input value="'+esc(r.store.shared||'').replace(/"/g,'&quot;')+'" onchange="replayEditStore(\''+key+'\',\'shared\',this.value)" placeholder="e.g. Server A, Server B, edit bay 2" class="w-full text-[10px] border border-gray-200 rounded px-1.5 py-1 bg-white mt-2" style="outline:none">')+
      kv('Archive Target','<input value="'+esc(r.store.archive||'').replace(/"/g,'&quot;')+'" onchange="replayEditStore(\''+key+'\',\'archive\',this.value)" placeholder="e.g. LTO / NAS / cloud bucket" class="w-full text-[10px] border border-gray-200 rounded px-1.5 py-1 bg-white mt-1" style="outline:none">'))+
    '</div>'+
  '</div>';}

/* ================================================================================
   v30 MODULE 7 — GFX PLAYBACK + ALPHA QC
   - Player: HTML5 <video> with Play / Cue / Loop / Pause. Companion audio (opens /
     bumpers / wipes) rides along.
   - Decode / probe / preview convert via FFmpeg (libavcodec + libavformat) — in-browser
     single-thread core. Preview never replaces the native deliverable.
   - Fill + matte pair uploads get a Fill and Matte Tally (not a MIRA label).
   - Environment sims (Open / Bumper / Wipe) seed every production.
   ================================================================================ */
var _gfxBlobs={};  // id -> {url, previewConverted:bool, matteUrl?}
var _gfxUi={};     // id -> {bg, loop, cue} transient player UI state
var GFX_SIM_SHOWS={
  museaitour:{open:'Show Open — Muse AI World Tour 2026',bumper:'Bumper — Muse AI World Tour',wipe:'Wipe — Muse AI World Tour'},
  charm:{open:'Show Open — Meta Charm Launch',bumper:'Bumper — Meta Charm Launch',wipe:'Wipe — Meta Charm Launch'},
  orion:{open:'Show Open — Orion Reveal',bumper:'Bumper — Orion Reveal',wipe:'Wipe — Orion Reveal'},
  raybangen3:{open:'Show Open — Ray-Ban Meta Gen 3 Launch',bumper:'Bumper — Ray-Ban Meta Gen 3 Launch',wipe:'Wipe — Ray-Ban Meta Gen 3 Launch'},
  museailaunch:{open:'Show Open — Muse AI Launch',bumper:'Bumper — Muse AI Launch',wipe:'Wipe — Muse AI Launch'},
  whatsapp:{open:'Show Open — WhatsApp Business Summit',bumper:'Bumper — WhatsApp Business Summit',wipe:'Wipe — WhatsApp Business Summit'},
  igcreators:{open:'Show Open — Instagram Creator Week',bumper:'Bumper — Instagram Creator Week',wipe:'Wipe — Instagram Creator Week'}
};
function gfxProdKey(p){
  if(!p)return '';
  if(typeof order!=='undefined'){for(var i=0;i<order.length;i++){if(productions[order[i]]===p)return order[i];}}
  return '';
}
function gfxEnvSimsFor(key){
  var show=GFX_SIM_SHOWS[key]?key:'_default';
  var labels=GFX_SIM_SHOWS[key]||{open:'Show Open — environment sim',bumper:'Bumper — environment sim',wipe:'Wipe — environment sim'};
  var base='assets/gfx-sims/'+show+'/';
  return [
    {simId:'sim_open_'+show,kind:'open',name:labels.open,src:base+'open.webm',poster:base+'open.jpg'},
    {simId:'sim_bumper_'+show,kind:'bumper',name:labels.bumper,src:base+'bumper.webm',poster:base+'bumper.jpg'},
    {simId:'sim_wipe_'+show,kind:'wipe',name:labels.wipe,src:base+'wipe.webm',poster:base+'wipe.jpg'}
  ];
}
function gfxEnsureEnvSims(p,key){
  if(!p.gfxAssets)p.gfxAssets=[];
  key=key||gfxProdKey(p);
  gfxEnvSimsFor(key).forEach(function(sim){
    var hit=null;
    for(var i=0;i<p.gfxAssets.length;i++){if(p.gfxAssets[i]&&p.gfxAssets[i].simId===sim.simId){hit=p.gfxAssets[i];break;}}
    if(hit){delete hit.audioSrc;if(!hit.src)hit.src=sim.src;if(!hit.poster)hit.poster=sim.poster;return;}
    p.gfxAssets.push({
      id:sim.simId,simId:sim.simId,kind:sim.kind,name:sim.name,src:sim.src,poster:sim.poster,
      bytes:0,mime:'video/mp4',w:1920,h:1080,dur:6,playable:true,persisted:true,envSim:true,
      declared:{scan:'1080p',rate:'59.94',codec:'H.264',audio:'48 kHz / 16-bit',alpha:sim.kind==='wipe'?'Yes':'No',alphaqc:'Not checked'}
    });
  });
}
var GFX_BGS=[['black','#000000','Black'],['white','#ffffff','White'],['green','#1e7b34','Green'],['checker','','Checker'],['onair','','On-air']];
var GFX_SCANS=['1080i','1080p','720p','2160p (UHD)','Other'];
var GFX_RATES=['59.94','50','29.97','25','23.976','60','Other'];
var GFX_CODECS=['AVC-Intra','DVCPro-HD','ProRes 4444','ProRes 422','H.264','HEVC','VP9 (WebM)','Animation / QT RLE','Other'];
var GFX_AUDIO=['48 kHz / 24-bit','48 kHz / 16-bit','44.1 kHz','No embedded audio','Unknown'];
var GFX_ALPHA=['Unknown','Yes','No'];
var GFX_ALPHAQC=['Not checked','Confirmed clean','Fringing / halo issues'];
function gfxAssets(p){if(!p.gfxAssets)p.gfxAssets=[];gfxEnsureEnvSims(p,gfxProdKey(p));return p.gfxAssets;}
function gfxUi(id){if(!_gfxUi[id])_gfxUi[id]={bg:'checker',loop:false,cue:0};return _gfxUi[id];}
function gfxBgCss(bg){return bg==='black'?'#000000':bg==='white'?'#ffffff':bg==='green'?'#1e7b34':bg==='onair'?'#0a58ca':'repeating-conic-gradient(#ced0d4 0% 25%, #e7f3ff 0% 50%) 50% / 20px 20px';}
function gfxAssetById(key,id){var a=gfxAssets(productions[key]);for(var i=0;i<a.length;i++){if(a[i].id===id)return a[i];}return null;}
function gfxSrcFor(a,which){var rb=_gfxBlobs[a.id];
  if(which==='matte'){if(rb&&rb.matteUrl)return rb.matteUrl;return a.matteSrc||a.matteDataUri||null;}
  if(rb&&rb.url)return rb.url;return a.dataUri||a.src||null;}
function gfxGuessRole(name){var n=(name||'').toLowerCase();
  if(/(^|[_\-\s.])(matte|key|alpha|mk)([_\-\s.]|$)/.test(n))return 'matte';
  if(/(^|[_\-\s.])(fill|fg|foreground)([_\-\s.]|$)/.test(n))return 'fill';
  return '';}
function gfxPairStem(name){return (name||'').toLowerCase().replace(/\.[a-z0-9]+$/,'').replace(/[_\-\s.](fill|fg|foreground|matte|key|alpha|mk)$/,'');}
function gfxProbeEl(url,cb){
  var v=document.createElement('video');v.preload='metadata';v.muted=true;
  v.style.cssText='position:fixed;left:-9999px;top:0;width:8px;height:8px';
  var settled=false;function settle(ok){if(settled)return;settled=true;
    var meta={ok:!!ok,w:ok?v.videoWidth:0,h:ok?v.videoHeight:0,dur:(ok&&isFinite(v.duration)&&v.duration)||0};
    try{v.remove();}catch(e){}cb(meta);}
  v.onloadedmetadata=function(){settle(true);};
  v.onerror=function(){settle(false);};
  setTimeout(function(){settle(false);},6000);
  document.body.appendChild(v);v.src=url;try{v.load();}catch(e){}}
function gfxUploadFiles(key,ev){var files=Array.prototype.slice.call(ev.target.files||[]);ev.target.value='';
  if(!files.length)return;
  var buckets={};
  files.forEach(function(f){
    var role=gfxGuessRole(f.name);var stem=gfxPairStem(f.name);
    if(!buckets[stem])buckets[stem]={fill:null,matte:null,other:[]};
    if(role==='fill')buckets[stem].fill=f;
    else if(role==='matte')buckets[stem].matte=f;
    else buckets[stem].other.push(f);
  });
  Object.keys(buckets).forEach(function(stem){
    var b=buckets[stem];
    if(b.fill&&b.matte){gfxAddPaired(key,b.fill,b.matte);return;}
    if(b.fill)gfxAddSingle(key,b.fill,'fill');
    if(b.matte)gfxAddSingle(key,b.matte,'matte');
    b.other.forEach(function(f){gfxAddSingle(key,f,'');});
  });}
function gfxAddSingle(key,file,role){
  var id='gfx_'+Date.now().toString(36)+Math.floor(Math.random()*1e4);
  var url=URL.createObjectURL(file);
  var asset={id:id,name:file.name,bytes:file.size,mime:file.type||'',w:0,h:0,dur:0,playable:false,role:role||'',
    declared:{scan:'',rate:'',codec:'',audio:'',alpha:role==='matte'?'Yes':'Unknown',alphaqc:'Not checked'},persisted:false};
  _gfxBlobs[id]={url:url,previewConverted:false};
  gfxProbeEl(url,function(meta){asset.playable=meta.ok;if(meta.ok){asset.w=meta.w;asset.h=meta.h;asset.dur=meta.dur;}gfxFinishAdd(key,asset,file);});
}
function gfxAddPaired(key,fillFile,matteFile){
  var id='gfx_'+Date.now().toString(36)+Math.floor(Math.random()*1e4);
  var fillUrl=URL.createObjectURL(fillFile);var matteUrl=URL.createObjectURL(matteFile);
  var stem=gfxPairStem(fillFile.name)||'GFX';
  var asset={id:id,name:stem+' (fill + matte)',pair:true,role:'fillmatte',
    fillName:fillFile.name,matteName:matteFile.name,
    bytes:(fillFile.size||0)+(matteFile.size||0),mime:fillFile.type||'',w:0,h:0,dur:0,playable:false,
    declared:{scan:'',rate:'',codec:'',audio:'',alpha:'Yes',alphaqc:'Not checked'},persisted:false};
  _gfxBlobs[id]={url:fillUrl,matteUrl:matteUrl,previewConverted:false};
  var left=2,fillMeta=null,matteMeta=null;
  function done(){
    asset.playable=!!(fillMeta&&fillMeta.ok);
    if(fillMeta&&fillMeta.ok){asset.w=fillMeta.w;asset.h=fillMeta.h;asset.dur=fillMeta.dur;}
    if(matteMeta&&matteMeta.ok){asset.matteW=matteMeta.w;asset.matteH=matteMeta.h;}
    gfxFinishAdd(key,asset,fillFile);
  }
  gfxProbeEl(fillUrl,function(m){fillMeta=m;if(--left<=0)done();});
  gfxProbeEl(matteUrl,function(m){matteMeta=m;if(--left<=0)done();});
}
function gfxFinishAdd(key,asset,file){var p=productions[key];
  var fin=function(){gfxAssets(p).push(asset);stampEdit(key);renderAll();try{renderDeptBoard(key);}catch(e){}
    var msg=asset.pair?'✓ Fill + matte ready — Fill and Matte Tally is on':(asset.playable?('✓ '+esc(asset.name)+' ready to QC'):('⚠ '+esc(asset.name)+' — browser cannot decode this codec; use FFmpeg preview'));
    toast(msg);};
  if(file&&file.size<=1500000){var r=new FileReader();
    r.onload=function(){asset.dataUri=r.result;asset.persisted=true;fin();};r.onerror=function(){fin();};r.readAsDataURL(file);}
  else fin();}
function gfxDelete(key,id){var p=productions[key];p.gfxAssets=gfxAssets(p).filter(function(a){return a.id!==id;});
  var rb=_gfxBlobs[id];if(rb){if(rb.url){try{URL.revokeObjectURL(rb.url);}catch(e){}}if(rb.srcUrl){try{URL.revokeObjectURL(rb.srcUrl);}catch(e){}}} // free the blobs
  delete _gfxBlobs[id];delete _gfxUi[id];stampEdit(key);renderAll();try{renderDeptBoard(key);}catch(e){}}
/* ---- transport: direct DOM control — playback never interrupted by re-renders ---- */
function gfxVideoEl(id){return document.getElementById('gfxv_'+id);}
function gfxMediaEls(id){
  return [document.getElementById('gfxv_'+id),document.getElementById('gfxv_'+id+'_matte'),document.getElementById('gfxa_'+id)].filter(Boolean);
}
function gfxPlay(id){
  gfxMediaEls(id).forEach(function(el){var pr=el.play&&el.play();if(pr&&pr.catch)pr.catch(function(){});});
}
function gfxPause(id){gfxMediaEls(id).forEach(function(el){try{el.pause();}catch(e){}});}
function gfxToggle(id,ev){
  if(ev){try{ev.preventDefault();ev.stopPropagation();}catch(e){}}
  var v=gfxVideoEl(id);if(!v)return;
  if(v.paused)gfxPlay(id);else gfxPause(id);
}
function gfxCueSet(id){var v=gfxVideoEl(id);if(!v)return;gfxUi(id).cue=v.currentTime;
  var lbl=document.getElementById('gfxcue_'+id);if(lbl)lbl.textContent='cue '+v.currentTime.toFixed(2)+'s';toast('Cue point set');}
function gfxCue(id){var t=gfxUi(id).cue||0;gfxMediaEls(id).forEach(function(el){try{el.pause();el.currentTime=t;}catch(e){}});}
function gfxLoop(id,btn){var ui=gfxUi(id);ui.loop=!ui.loop;
  gfxMediaEls(id).forEach(function(el){el.loop=ui.loop;});
  if(btn)btn.className=btn.className.replace(ui.loop?'bg-white text-gray-600':'bg-gray-900 text-white',ui.loop?'bg-gray-900 text-white':'bg-white text-gray-600');}
function gfxFps(id){
  var v=gfxVideoEl(id);var r=59.94;
  try{if(v&&v.getVideoPlaybackQuality&&v.currentTime>0){var q=v.getVideoPlaybackQuality();
    if(q&&q.totalVideoFrames>8){var f=q.totalVideoFrames/v.currentTime;if(f>10&&f<130)r=f;}}}catch(e){}
  return r;
}
function gfxStep(id,dir){
  gfxPause(id);
  var dt=1/gfxFps(id);
  gfxMediaEls(id).forEach(function(el){
    if(el.currentTime==null)return;
    var t=el.currentTime+(dir<0?-dt:dt);
    if(t<0)t=0;if(isFinite(el.duration)&&el.duration>0&&t>el.duration)t=el.duration;
    try{el.currentTime=t;}catch(e){}
  });
  gfxMarkFrame(id);
}
function gfxMarkFrame(id){
  var v=gfxVideoEl(id);var el=document.getElementById('gfxframe_'+id);if(!v||!el)return;
  var fps=gfxFps(id);var n=Math.round((v.currentTime||0)*fps)+1;
  el.textContent='f '+n;
}
function gfxSetBg(id,bg){gfxUi(id).bg=bg;var w=document.getElementById('gfxwrap_'+id);if(!w)return;
  if(bg==='checker'){w.style.background='repeating-conic-gradient(#ced0d4 0% 25%, #f7f8fa 0% 50%) 50% / 20px 20px';}
  else if(bg==='onair'){var c=document.getElementById('gfxbgc_'+id);w.style.background=(c&&c.value)||'#0a58ca';}
  else{w.style.background=(bg==='black'?'#000000':bg==='white'?'#ffffff':'#1e7b34');}
  var row=document.getElementById('gfxbgs_'+id);
  if(row){Array.prototype.forEach.call(row.querySelectorAll('button[data-bg]'),function(b){
    var on=b.getAttribute('data-bg')===bg;
    b.style.outline=on?'2px solid #0866ff':'none';});}}
/* ---- Ingest tally + alpha / fill-matte gates ---- */
function gfxTally(a){var d=a.declared||{};var ingest=[];var alpha=[];var fill=[];var matte=[];
  function line(arr,label,state,note){arr.push({label:label,state:state,note:note||''});}
  if(a.playable&&a.w){line(ingest,'Resolution 1920×1080',(a.w===1920&&a.h===1080)?'pass':'fail',a.w+'×'+a.h);}
  else line(ingest,'Resolution 1920×1080','unknown','not decodable in-browser — probe or declare');
  if(d.scan&&d.rate)line(ingest,'Interlaced 1080i @ 59.94',(d.scan==='1080i'&&d.rate==='59.94')?'pass':'fail',d.scan+' @ '+d.rate);
  else line(ingest,'Interlaced 1080i @ 59.94','unknown','declare scan type + field rate below');
  if(d.codec)line(ingest,'Native codec AVC-Intra / DVCPro-HD',(d.codec==='AVC-Intra'||d.codec==='DVCPro-HD')?'pass':'fail',d.codec);
  else line(ingest,'Native codec AVC-Intra / DVCPro-HD','unknown','declare (or probe) the file codec');
  if(d.audio&&d.audio!=='Unknown')line(ingest,'Embedded audio 48 kHz / 24-bit',(d.audio==='48 kHz / 24-bit')?'pass':'fail',d.audio);
  else line(ingest,'Embedded audio 48 kHz / 24-bit','unknown','declare (or probe) sample rate / bit depth');
  if(d.alpha==='Yes')line(alpha,'Alpha channel present','pass','');
  else if(d.alpha==='No')line(alpha,'Alpha channel present','fail','no alpha — fine for full-frame video, fails as keyed graphics');
  else line(alpha,'Alpha channel present','unknown','declare (or probe pixel format)');
  if(d.alphaqc==='Confirmed clean')line(alpha,'Alpha visually valid (QC on backgrounds)','pass','');
  else if(d.alphaqc==='Fringing / halo issues')line(alpha,'Alpha visually valid (QC on backgrounds)','fail','fringing / halo seen');
  else line(alpha,'Alpha visually valid (QC on backgrounds)','unknown','flip the backgrounds above to check edges');
  if(a.pair||a.role==='fillmatte'){
    line(fill,'Fill stream present',a.playable?'pass':'unknown',a.fillName||'fill');
    line(fill,'Fill resolution',a.w?(a.w+'×'+a.h):'unknown',a.w?(a.w+'×'+a.h):'');
    line(matte,'Matte stream present',(a.matteW||gfxSrcFor(a,'matte'))?'pass':'unknown',a.matteName||'matte');
    if(a.w&&a.matteW)line(matte,'Fill / matte size match',(a.w===a.matteW&&a.h===a.matteH)?'pass':'fail',(a.matteW||'?')+'×'+(a.matteH||'?'));
    else line(matte,'Fill / matte size match','unknown','probe both files');
  }
  function verdict(arr){var f=arr.some(function(l){return l.state==='fail';});var u=arr.some(function(l){return l.state==='unknown';});
    return f?'fail':(u?'unknown':'pass');}
  return {ingest:ingest,alpha:alpha,fill:fill,matte:matte,pair:!!(a.pair||a.role==='fillmatte'),
    ingestVerdict:verdict(ingest),alphaVerdict:verdict(alpha),fillVerdict:verdict(fill),matteVerdict:verdict(matte)};}
function gfxTallyHTML(key,a){var t=gfxTally(a);
  function rows(arr){return arr.map(function(l){
    var ic=l.state==='pass'?'<span style="color:#1E7B34">●</span>':l.state==='fail'?'<span style="color:#e41e3f">●</span>':'<span style="color:#f5832a">●</span>';
    return '<div class="flex items-start gap-1.5 text-[10px] py-0.5"><span>'+ic+'</span><span class="font-semibold text-gray-700">'+l.label+'</span>'+(l.note?'<span class="text-gray-400">— '+esc(l.note)+'</span>':'')+'</div>';}).join('');}
  function vchip(v,label){var cls=v==='pass'?'bg-emerald-500 text-white':v==='fail'?'bg-red-600 text-white':'bg-amber-100 text-amber-700';
    var txt=v==='pass'?'GREEN — all checks pass':v==='fail'?'RED — check failed':'INCOMPLETE — declare/probe remaining fields';
    return '<span class="text-[9px] font-bold uppercase tracking-wider rounded px-2 py-0.5 '+cls+'">'+label+': '+txt+'</span>';}
  if(t.pair){
    return '<div class="mt-2 rounded-lg border border-gray-200/70 bg-gray-50/60 p-2">'+
      '<div class="flex flex-wrap gap-1.5 mb-1.5">'+vchip(t.fillVerdict,'Fill tally')+vchip(t.matteVerdict,'Matte tally')+'</div>'+
      '<p class="text-[8px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Fill tally</p>'+rows(t.fill)+
      '<p class="text-[8px] font-bold uppercase tracking-wider text-gray-400 mt-1.5 mb-0.5">Matte tally</p>'+rows(t.matte)+
    '</div>';
  }
  return '<div class="mt-2 rounded-lg border border-gray-200/70 bg-gray-50/60 p-2">'+
    '<div class="flex flex-wrap gap-1.5 mb-1.5">'+vchip(t.ingestVerdict,'Ingest')+vchip(t.alphaVerdict,'Alpha / key')+'</div>'+
    '<p class="text-[8px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Ingest gate</p>'+rows(t.ingest)+
    '<p class="text-[8px] font-bold uppercase tracking-wider text-gray-400 mt-1.5 mb-0.5">Alpha / key gate</p>'+rows(t.alpha)+
  '</div>';}
function gfxDeclare(key,id,f,v){var a=gfxAssetById(key,id);if(!a)return;a.declared[f]=v;stampEdit(key);
  var td=document.getElementById('gfxtally_'+id);if(td)td.innerHTML=gfxTallyHTML(key,a); // live tally refresh — video keeps playing
}
/* ---- ffmpeg.wasm (single-thread core, lazy CDN — same pattern as SheetJS/Pannellum) ---- */
var FFMPEG_JS='https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js';
/* core-st = official single-threaded core: no SharedArrayBuffer / COOP-COEP needed,
   so it works from plain static hosting (slower than the MT build, preview-only anyway) */
var FFMPEG_CORE='https://unpkg.com/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js';
var _ffmpegP=null,_ffmpegInst=null;
function loadFFmpeg(){
  if(_ffmpegInst)return Promise.resolve(_ffmpegInst);
  if(_ffmpegP)return _ffmpegP;
  _ffmpegP=new Promise(function(resolve,reject){try{
    var s=document.createElement('script');s.src=FFMPEG_JS;s.async=true;
    s.onload=function(){try{
      if(!window.FFmpeg){reject(new Error('ffmpeg.wasm missing'));_ffmpegP=null;return;}
      var ff=window.FFmpeg.createFFmpeg({corePath:FFMPEG_CORE,mainName:'main',log:false});
      ff.load().then(function(){_ffmpegInst=ff;resolve(ff);}).catch(function(e){_ffmpegP=null;reject(e);});
    }catch(e){_ffmpegP=null;reject(e);}};
    s.onerror=function(){_ffmpegP=null;reject(new Error('ffmpeg.wasm CDN unreachable'));};
    document.head.appendChild(s);
  }catch(e){_ffmpegP=null;reject(e);}});
  return _ffmpegP;}
function gfxStatusLine(id,msg){var el=document.getElementById('gfxconv_'+id);if(el)el.textContent=msg;}
function gfxConvert(key,id){var a=gfxAssetById(key,id);if(!a)return;
  var src=gfxSrcFor(a);if(!src){toast('File not available this session — re-upload it first.');return;}
  gfxStatusLine(id,'Loading ffmpeg.wasm (~25 MB, one-time)…');
  loadFFmpeg().then(function(ff){
    gfxStatusLine(id,'Converting to WebM VP9+alpha — in-browser and SLOW; preview-only…');
    ff.setProgress(function(pr){if(pr&&pr.ratio)gfxStatusLine(id,'Converting… '+Math.round(pr.ratio*100)+'% (preview-only)');});
    return fetch(src).then(function(r){return r.arrayBuffer();}).then(function(ab){
      ff.FS('writeFile','in.src',new Uint8Array(ab));
      return ff.run('-i','in.src','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-b:v','1M','-auto-alt-ref','0','-an','out.webm');
    }).then(function(){
      var out=ff.FS('readFile','out.webm');
      var blob=new Blob([out.buffer],{type:'video/webm'});
      /* review fix: keep the NATIVE file's URL alongside the preview so the ffmpeg probe
         reads the real deliverable, never the audio-stripped VP9 preview; revoke only a
         superseded preview URL, never the native one */
      var rbOld=_gfxBlobs[id];
      var nativeUrl=rbOld?(rbOld.previewConverted?rbOld.srcUrl:rbOld.url):null;
      if(rbOld&&rbOld.previewConverted&&rbOld.url){try{URL.revokeObjectURL(rbOld.url);}catch(e){}}
      _gfxBlobs[id]={url:URL.createObjectURL(blob),previewConverted:true,srcUrl:nativeUrl||null};
      a.playable=true;
      gfxStatusLine(id,'');
      toast('✓ Preview ready via FFmpeg — preview-only; native file stays the deliverable');
      try{renderDeptBoard(key);}catch(e){}
      try{ff.FS('unlink','in.src');ff.FS('unlink','out.webm');}catch(e){}
    });
  }).catch(function(e){gfxStatusLine(id,'');toast('⚠ Preview conversion failed: '+txt((e&&e.message)||'ffmpeg unavailable'));});}
function gfxProbe(key,id){var a=gfxAssetById(key,id);if(!a)return;
  /* review fix: after a preview conversion the probe MUST read the native file — probing
     the -an VP9 preview would overwrite declared codec/audio/alpha with preview values */
  var rbp=_gfxBlobs[a.id];
  var src=(rbp&&rbp.previewConverted)?(rbp.srcUrl||a.dataUri||null):gfxSrcFor(a);
  if(!src){toast((rbp&&rbp.previewConverted)?'Probe reads the native file, and only its converted preview is available this session — re-upload the original to probe.':'File not available this session — re-upload it first.');return;}
  gfxStatusLine(id,'Loading ffmpeg.wasm for probe…');
  loadFFmpeg().then(function(ff){
    var lines=[];ff.setLogger(function(m){if(m&&m.message)lines.push(m.message);});
    gfxStatusLine(id,'Probing streams…');
    return fetch(src).then(function(r){return r.arrayBuffer();}).then(function(ab){
      ff.FS('writeFile','probe.src',new Uint8Array(ab));
      return ff.run('-i','probe.src').catch(function(){}); // -i with no output always "fails" — we want the log
    }).then(function(){
      try{ff.FS('unlink','probe.src');}catch(e){}
      ff.setLogger(function(){});
      var all=lines.join('\n');var d=a.declared;var found=[];
      var vm=all.match(/Video:\s*([a-z0-9_]+)([^\n]*)/i);
      if(vm){var vc=vm[1].toLowerCase();var rest=vm[2]||'';
        if(vc==='prores')d.codec=/4444/.test(rest)?'ProRes 4444':'ProRes 422';
        else if(vc==='h264')d.codec=/intra/i.test(rest)?'AVC-Intra':'H.264';
        else if(vc==='dvvideo')d.codec='DVCPro-HD';
        else if(vc==='vp9')d.codec='VP9 (WebM)';
        else if(vc==='hevc')d.codec='HEVC';
        else if(vc==='qtrle')d.codec='Animation / QT RLE';
        else d.codec='Other';found.push('codec '+d.codec);
        if(/yuva|argb|rgba|ya8/.test(rest)){d.alpha='Yes';found.push('alpha present');}
        var rm=rest.match(/(\d{3,4})x(\d{3,4})/);if(rm&&!a.playable){a.w=parseInt(rm[1],10);a.h=parseInt(rm[2],10);a.playable=false;found.push(rm[1]+'×'+rm[2]);}
        var fm=rest.match(/([\d.]+)\s*(?:fps|tbr)/);if(fm){var fps=parseFloat(fm[1]);var best='',bd=1e9;
          GFX_RATES.forEach(function(rt){var n=parseFloat(rt);if(!isNaN(n)&&Math.abs(n-fps)<bd){bd=Math.abs(n-fps);best=rt;}});
          if(bd<0.51){d.rate=best;found.push(best+' fps');}}
        if(/interlaced|top first|bottom first|tff|bff/i.test(all)){d.scan=(a.h===1080||/1080/.test(rest))?'1080i':d.scan;if(d.scan)found.push(d.scan);}
      }
      var am=all.match(/Audio:\s*pcm_s(\d+)[a-z]*[^\n]*?(\d{4,6})\s*Hz/i);
      if(am){var bits=parseInt(am[1],10);var hz=parseInt(am[2],10);
        d.audio=(hz===48000&&bits===24)?'48 kHz / 24-bit':(hz===48000?'48 kHz / 16-bit':(hz===44100?'44.1 kHz':'Unknown'));found.push(d.audio);}
      else if(/Audio:/i.test(all)===false&&vm){d.audio='No embedded audio';found.push('no audio stream');}
      gfxStatusLine(id,'');
      stampEdit(key);try{renderDeptBoard(key);}catch(e){}
      toast(found.length?('Probe: '+txt(found.join(' · '))):'Probe finished — could not parse stream info');
    });
  }).catch(function(e){gfxStatusLine(id,'');toast('⚠ Probe failed: '+txt((e&&e.message)||'ffmpeg unavailable'));});}
function gfxSectionHTML(key){var p=productions[key];var assets=gfxAssets(p,key);
  var rows=assets.map(function(a){
    var src=gfxSrcFor(a);var matteSrc=a.pair?gfxSrcFor(a,'matte'):null;var ui=gfxUi(a.id);var rb=_gfxBlobs[a.id];
    var declSel=function(f,label,opts){var cur=a.declared[f]||'';
      return '<label class="text-[8px] font-bold uppercase tracking-wider text-gray-400 block">'+label+
        '<select onchange="gfxDeclare(\''+key+'\',\''+a.id+'\',\''+f+'\',this.value)" class="w-full text-[9px] text-gray-700 border border-gray-200 rounded px-1 py-0.5 bg-white" style="outline:none;min-width:0;max-width:100%">'+
        '<option value=""'+(cur?'':' selected')+'>—</option>'+opts.map(function(o){return '<option'+(cur===o?' selected':'')+'>'+o+'</option>';}).join('')+'</select></label>';};
    var audioEl=a.audioSrc?'<audio id="gfxa_'+a.id+'" src="'+a.audioSrc+'" preload="auto"></audio>':'';
    var vidStyle='display:block;width:100%;height:100%;object-fit:contain;background:#18191A';
    var stageStyle='aspect-ratio:16/9;width:100%;overflow:hidden;background:#18191A;cursor:pointer;-webkit-tap-highlight-color:transparent';
    var fillVid=src?'<video id="gfxv_'+a.id+'" src="'+src+'"'+(a.poster?' poster="'+a.poster+'"':'')+(ui.loop?' loop':'')+(a.audioSrc?' muted':'')+' preload="metadata" playsinline webkit-playsinline ontimeupdate="gfxMarkFrame(\''+a.id+'\')" onclick="gfxToggle(\''+a.id+'\',event)" style="'+vidStyle+'"></video>':'';
    var matteVid=matteSrc?'<video id="gfxv_'+a.id+'_matte" src="'+matteSrc+'"'+(ui.loop?' loop':'')+' preload="metadata" playsinline webkit-playsinline onclick="gfxToggle(\''+a.id+'\',event)" style="'+vidStyle+'"></video>':'';
    var stage=a.pair&&fillVid&&matteVid
      ? '<div class="gfx-fm-grid grid grid-cols-1 sm:grid-cols-2 gap-2"><div><p class="text-[8px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Fill</p><div id="gfxwrap_'+a.id+'" class="gfx-stage" onclick="gfxToggle(\''+a.id+'\',event)" style="'+stageStyle+'">'+fillVid+'</div></div><div><p class="text-[8px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Matte</p><div class="gfx-stage" onclick="gfxToggle(\''+a.id+'\',event)" style="'+stageStyle+'">'+matteVid+'</div></div></div>'
      : (fillVid?'<div id="gfxwrap_'+a.id+'" class="gfx-stage" onclick="gfxToggle(\''+a.id+'\',event)" style="'+stageStyle+'">'+fillVid+'</div>':'');
    var player=a.playable&&src
      ? stage+audioEl+
        '<div class="gfx-transport flex items-center gap-1.5 mt-1.5 flex-wrap">'+
          '<button onclick="gfxPlay(\''+a.id+'\')" class="text-[10px] font-bold text-white bg-gray-900 hover:bg-gray-800 rounded-lg px-3 py-1.5">▶ Play</button>'+
          '<button onclick="gfxPause(\''+a.id+'\')" class="text-[10px] font-bold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg px-3 py-1.5">⏸ Pause</button>'+
          '<button onclick="gfxStep(\''+a.id+'\',-1)" class="text-[10px] font-bold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg px-3 py-1.5" title="Previous frame">‹ Frame</button>'+
          '<button onclick="gfxStep(\''+a.id+'\',1)" class="text-[10px] font-bold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg px-3 py-1.5" title="Next frame">Frame ›</button>'+
          '<button onclick="gfxCue(\''+a.id+'\')" class="text-[10px] font-bold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg px-3 py-1.5" title="Return to the cue point, paused">⏮ Cue</button>'+
          '<button onclick="gfxLoop(\''+a.id+'\',this)" class="text-[10px] font-bold '+(ui.loop?'bg-gray-900 text-white':'bg-white text-gray-600')+' border border-gray-300 hover:opacity-90 rounded-lg px-3 py-1.5" title="Toggle loop">∞ Loop</button>'+
          '<button onclick="gfxCueSet(\''+a.id+'\')" class="text-[9px] font-bold text-blue-700 hover:underline" title="Set the cue point at the current frame">set cue</button>'+
          '<span id="gfxcue_'+a.id+'" class="text-[9px] mono text-gray-400">cue '+(ui.cue||0).toFixed(2)+'s</span>'+
          '<span id="gfxframe_'+a.id+'" class="text-[9px] mono text-gray-400">f 1</span></div>'+
        ((rb&&rb.previewConverted)?'<p class="text-[9px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1.5"><b>Preview-only conversion</b> via FFmpeg (libavcodec / libavformat) — native file stays the deliverable.</p>':'')
      : '<div class="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[10px] text-amber-800">'+
          (src?'This browser cannot decode <b>'+esc(a.name)+'</b>. '+
            '<button onclick="gfxConvert(\''+key+'\',\''+a.id+'\')" class="font-bold text-blue-700 hover:underline">Make preview via FFmpeg</button>'
            :'Not persisted this session — re-upload <b>'+esc(a.name)+'</b> to preview.')+
        '</div>';
    return '<div class="rounded-xl border border-gray-200/70 bg-gray-50/40 p-2.5 mb-2.5">'+
      '<div class="flex flex-wrap items-center justify-between gap-2 mb-1.5">'+
        '<span class="text-[11px] font-bold mono text-gray-800 truncate">'+(a.kind?'<span class="dept-chip">'+esc(a.kind)+'</span> ':'')+esc(a.name)+'</span>'+
        '<span class="flex items-center gap-1.5 flex-wrap">'+
          (a.playable&&a.w?'<span class="dept-chip mono">'+a.w+'×'+a.h+'</span>':'')+
          (a.dur?'<span class="dept-chip mono">'+a.dur.toFixed(1)+'s</span>':'')+
          (a.bytes?'<span class="dept-chip mono">'+(a.bytes>1048576?(a.bytes/1048576).toFixed(1)+' MB':Math.round(a.bytes/1024)+' KB')+'</span>':'')+
          (a.envSim?'<span class="dept-chip">sim</span>':'')+
          (a.persisted?'':'<span class="dept-chip dept-chip-alert mono">session only</span>')+
          (a.envSim?'':'<button onclick="gfxDelete(\''+key+'\',\''+a.id+'\')" class="text-[10px] font-bold text-red-500 hover:underline">Delete</button>')+
        '</span></div>'+
      player+
      '<p id="gfxconv_'+a.id+'" class="text-[9px] mono text-blue-700 mt-1"></p>'+
      (a.envSim?'':'<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 mt-2">'+
        declSel('scan','Scan',GFX_SCANS)+declSel('rate','Field rate',GFX_RATES)+declSel('codec','Codec',GFX_CODECS)+
        declSel('audio','Embedded audio',GFX_AUDIO)+declSel('alpha','Alpha present',GFX_ALPHA)+declSel('alphaqc','Alpha QC',GFX_ALPHAQC)+'</div>'+
      '<div class="flex items-center gap-2 mt-1"><button onclick="gfxProbe(\''+key+'\',\''+a.id+'\')" class="text-[9px] font-bold text-blue-700 hover:underline" title="Probe with FFmpeg (libavcodec / libavformat)">⌕ Probe file (FFmpeg)</button></div>')+
      (a.envSim?'':'<div id="gfxtally_'+a.id+'">'+gfxTallyHTML(key,a)+'</div>')+
    '</div>';
  }).join('');
  return '<div class="bg-white rounded-2xl p-4 border border-gray-200/60" style="box-shadow:0 4px 20px rgba(0,0,0,.03)">'+
    '<div class="flex flex-wrap items-center justify-between gap-2 mb-1"><h3 class="text-xs font-bold uppercase tracking-wider text-gray-600">Graphics Playback · Alpha QC</h3>'+
      '<span class="text-[9px] mono text-gray-400">'+assets.length+' asset'+(assets.length===1?'':'s')+'</span></div>'+
    '<p class="text-[10px] text-gray-500 mb-2">Play–cue–loop–pause. Upload a fill + matte pair (names containing fill and matte/key) to open a <b>Fill and Matte Tally</b>. Playback uses FFmpeg (libavcodec / libavformat) for probe and preview convert.</p>'+
    '<label class="inline-flex items-center gap-1.5 text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-1.5 cursor-pointer mb-2">⬆ Upload for approval'+
      '<input type="file" accept="video/*,.webm,.mp4,.mov,.mxf,.avi" multiple onchange="gfxUploadFiles(\''+key+'\',event)" style="display:none"></label>'+
    rows+
  '</div>';}

/* ================================================================================
   LIVE WEATHER — Open-Meteo (free, no API key). Current + 5-day, severe alerts,
   and a crew-notification hook. Fetched client-side from the venue's coordinates.
   ================================================================================ */
/* v31 PHASE 5 — Open-Meteo wrapper: every forecast call builds its URL here so the
   base endpoint is config-driven (MUSE_LIVE_CONFIG.OPEN_METEO_BASE) and can later be
   pointed at the backend proxy without touching call sites. No key required. */
var wxClient={
  base:function(){return (typeof museCfg==='function'&&museCfg('OPEN_METEO_BASE'))||'https://api.open-meteo.com/v1/forecast';},
  forecastUrl:function(qs){return this.base()+'?'+qs;},
  fetchForecast:function(qs){return fetch(this.forecastUrl(qs)).then(function(r){if(!r.ok)throw new Error('Open-Meteo HTTP '+r.status);return r.json();});}
};
var WX_CACHE={}; /* key -> {ts, data|null, error} */
var WX_NOTIFIED={};
function wxCodeInfo(code){
  var m={0:['Clear','☀️'],1:['Mainly clear','🌤️'],2:['Partly cloudy','⛅'],3:['Overcast','☁️'],
    45:['Fog','🌫️'],48:['Rime fog','🌫️'],51:['Light drizzle','🌦️'],53:['Drizzle','🌦️'],55:['Dense drizzle','🌦️'],
    56:['Freezing drizzle','🌧️'],57:['Freezing drizzle','🌧️'],61:['Light rain','🌧️'],63:['Rain','🌧️'],65:['Heavy rain','🌧️'],
    66:['Freezing rain','🌧️'],67:['Freezing rain','🌧️'],71:['Light snow','🌨️'],73:['Snow','❄️'],75:['Heavy snow','❄️'],
    77:['Snow grains','🌨️'],80:['Light showers','🌦️'],81:['Showers','🌦️'],82:['Violent showers','⛈️'],
    85:['Snow showers','🌨️'],86:['Heavy snow showers','❄️'],95:['Thunderstorm','⛈️'],96:['Thunderstorm · hail','⛈️'],99:['Thunderstorm · hail','⛈️']};
  return m[code]||['—','🌡️'];}
function wxSevere(code,wind,precip){
  var badCode=[65,66,67,75,77,82,86,95,96,99].indexOf(code)>-1;
  return badCode||(wind!=null&&wind>=35)||(precip!=null&&precip>=70);}

function wxEnsure(key){
  var v=venueFor(key);var host=document.getElementById('wxband_'+key);if(!host)return;
  if(!v||v.lat==null||v.lng==null){WX_CACHE[key]={ts:Date.now(),data:null,error:'novenue'};host.innerHTML=wxInner(key);return;}
  var c=WX_CACHE[key];
  if(c&&c.data&&(Date.now()-c.ts)<1800000){host.innerHTML=wxInner(key);return;} // fresh <30min
  host.innerHTML=wxInner(key); // paint loading skeleton
  var url=wxClient.forecastUrl('latitude='+v.lat+'&longitude='+v.lng+
    '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m'+
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max'+
    '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=6');
  fetch(url).then(function(r){return r.json();}).then(function(j){
    WX_CACHE[key]={ts:Date.now(),data:j,error:null};
    var el=document.getElementById('wxband_'+key);if(el)el.innerHTML=wxInner(key);
  }).catch(function(e){
    WX_CACHE[key]={ts:Date.now(),data:null,error:'net'};
    var el=document.getElementById('wxband_'+key);if(el)el.innerHTML=wxInner(key);
  });
}
function wxRetry(key){WX_CACHE[key]=null;wxEnsure(key);}

/* ================================================================================
   CITY CONDITIONS PANEL  (v28 · Work Item 3)
   Click a Network Clock tile → live conditions for that city.
   Primary source : Windy.com Point Forecast API (POST /api/point-forecast/v2, GFS).
   Air quality    : Open-Meteo Air Quality API (no key) — always.
   Fallback       : ANY Windy failure (CORS / quota / network) → full Open-Meteo
                    forecast, and the panel says so honestly.
   Caching        : WXC_CACHE follows the established WX_CACHE pattern (10-min TTL).
   The Windy key ships inside this file by design — accepted for this demo.
   ================================================================================ */
var WXC_CITIES=[
 {city:'Menlo Park',lat:37.4848,lon:-122.1484},
 {city:'New York',lat:40.7536,lon:-74.0007},
 {city:'London',lat:51.5347,lon:-0.1246},
 {city:'Tel Aviv',lat:32.0853,lon:34.7818},
 {city:'Singapore',lat:1.2803,lon:103.8500},
 {city:'Tokyo',lat:35.6812,lon:139.7671}];
var WXC_KEY=''; /* Windy point-forecast key (optional). Empty = keyless Open-Meteo. */
var WXC_CACHE={}; /* idx -> {ts, source:'windy'|'openmeteo', cur, hours, aqi, error} */
var WXC_TTL=10*60*1000;
var WXC_FORCE_FALLBACK=!WXC_KEY; /* no key -> Open-Meteo directly */

function wxcCompass(deg){var pts=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];return pts[Math.round((((deg%360)+360)%360)/22.5)%16];}
function wxcAqiBand(a){if(a==null)return {label:'—',c:'#b0b3b8',bg:'#f0f2f5'};
  if(a<=50)return {label:'Good',c:'#1E7B34',bg:'#e6f4ea'};
  if(a<=100)return {label:'Moderate',c:'#b24a00',bg:'#fef6e0'};
  if(a<=150)return {label:'Unhealthy (Sensitive)',c:'#b24a00',bg:'#fff0e5'};
  if(a<=200)return {label:'Unhealthy',c:'#b3122e',bg:'#fde7ea'};
  if(a<=300)return {label:'Very Unhealthy',c:'#0866ff',bg:'#e7f3ff'};
  return {label:'Hazardous',c:'#B3122E',bg:'#fde7ea'};}

/* ---- Windy decoder: ts[] + <param>-surface arrays → normalized model ---- */
function wxcFromWindy(j){
  if(!j||!j.ts||!j.ts.length)throw new Error('windy: empty response');
  var now=Date.now(),i0=0,best=1/0;
  for(var i=0;i<j.ts.length;i++){var d=Math.abs(j.ts[i]-now);if(d<best){best=d;i0=i;}}
  function arr(name){return j[name]||[];}
  var u=arr('wind_u-surface'),v=arr('wind_v-surface');
  function at(i){
    var uu=u[i]||0,vv=v[i]||0;var spd=Math.sqrt(uu*uu+vv*vv);
    return {ts:j.ts[i],
      tempF:(arr('temp-surface')[i]!=null)?((arr('temp-surface')[i]-273.15)*9/5+32):null,
      windMph:spd*2.23694,
      windDir:wxcCompass(Math.atan2(-uu,-vv)*180/Math.PI),
      gustMph:(arr('gust-surface')[i]!=null)?arr('gust-surface')[i]*2.23694:null,
      precipMm:(arr('past3hprecip-surface')[i]!=null)?arr('past3hprecip-surface')[i]:0,
      rh:(arr('rh-surface')[i]!=null)?arr('rh-surface')[i]:null,
      hpa:(arr('pressure-surface')[i]!=null)?arr('pressure-surface')[i]/100:null};}
  var hours=[];for(var h=i0;h<Math.min(j.ts.length,i0+8);h++)hours.push(at(h));
  return {cur:at(i0),hours:hours,step:'3 h'};}

/* ---- Open-Meteo full fallback decoder ---- */
function wxcFromOpenMeteo(j){
  if(!j||!j.current)throw new Error('open-meteo: empty response');
  var c=j.current;
  var cur={ts:Date.now(),tempF:c.temperature_2m,feelsF:c.apparent_temperature,windMph:c.wind_speed_10m,
    windDir:wxcCompass(c.wind_direction_10m||0),gustMph:c.wind_gusts_10m,precipMm:c.precipitation||0,
    rh:c.relative_humidity_2m,hpa:c.surface_pressure};
  var hours=[];
  try{var H=j.hourly;var nowIso=(c.time||'').slice(0,13);var i0=0;
    for(var i=0;i<H.time.length;i++){if(H.time[i].slice(0,13)>=nowIso){i0=i;break;}}
    for(var k=i0;k<Math.min(H.time.length,i0+8);k++){
      hours.push({ts:new Date(H.time[k]).getTime(),tempF:H.temperature_2m[k],windMph:H.wind_speed_10m[k],
        gustMph:H.wind_gusts_10m[k],precipMm:H.precipitation[k]||0,rh:H.relative_humidity_2m[k],hpa:H.surface_pressure[k],
        windDir:''});}}catch(e){}
  return {cur:cur,hours:hours,step:'1 h'};}

function wxcLoad(i,cb){
  var c=WXC_CACHE[i];
  if(c&&!c.error&&(Date.now()-c.ts)<WXC_TTL){cb(c);return;}
  var ct=WXC_CITIES[i];if(!ct){cb({error:'no city'});return;}
  /* air quality — always Open-Meteo (Windy's point forecast carries no AQ) */
  var aqiP=fetch('https://air-quality-api.open-meteo.com/v1/air-quality?latitude='+ct.lat+'&longitude='+ct.lon+'&current=us_aqi,pm2_5,pm10,ozone')
    .then(function(r){if(!r.ok)throw new Error('aq http '+r.status);return r.json();})
    .then(function(j){return j&&j.current?{usAqi:j.current.us_aqi,pm25:j.current.pm2_5,pm10:j.current.pm10,ozone:j.current.ozone}:null;})
    .catch(function(){return null;});
  /* primary: Windy point forecast */
  var windyP=WXC_FORCE_FALLBACK?Promise.reject(new Error('forced fallback (demo)')):
    fetch('https://api.windy.com/api/point-forecast/v2',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({lat:ct.lat,lon:ct.lon,model:'gfs',parameters:['temp','wind','windGust','precip','rh','pressure'],levels:['surface'],key:WXC_KEY})})
    .then(function(r){if(!r.ok)throw new Error('windy http '+r.status);return r.json();})
    .then(function(j){var m=wxcFromWindy(j);m.source='windy';return m;});
  var omUrl=wxClient.forecastUrl('latitude='+ct.lat+'&longitude='+ct.lon+
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m,surface_pressure'+
    '&hourly=temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m,relative_humidity_2m,surface_pressure'+
    '&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=2&timezone=auto');
  windyP.catch(function(werr){
    return fetch(omUrl).then(function(r){if(!r.ok)throw new Error('open-meteo http '+r.status);return r.json();})
      .then(function(j){var m=wxcFromOpenMeteo(j);m.source='openmeteo';m.windyError=String(werr&&werr.message||werr);return m;});})
  .then(function(model){return aqiP.then(function(aqi){
      var entry={ts:Date.now(),source:model.source,cur:model.cur,hours:model.hours,step:model.step,aqi:aqi,windyError:model.windyError||null,error:null};
      WXC_CACHE[i]=entry;cb(entry);});})
  .catch(function(err){var entry={ts:Date.now(),error:String(err&&err.message||err)};WXC_CACHE[i]=entry;cb(entry);});}

function openCityWx(i){var ov=document.getElementById('wxCityOverlay');var bx=document.getElementById('wxCityBox');if(!ov||!bx)return;
  ov.style.display='flex';
  var z=tzZones[i]||[];var ct=WXC_CITIES[i]||{};
  bx.innerHTML='<div class="flex items-start justify-between mb-3"><div><h3 class="text-sm font-bold text-gray-900 leading-none">'+esc(ct.city||'')+' — Live Conditions</h3>'+
    '<p class="text-[10px] text-gray-500 mt-1">'+esc(z[0]||'')+' · fetching current conditions…</p></div>'+
    '<button onclick="closeCityWx()" class="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button></div>'+
    '<div class="text-center py-10"><span class="inline-block w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" style="animation:spin 1s linear infinite"></span>'+
    '<p class="text-[10px] text-gray-400 mt-2">Fetching live conditions…</p></div>';
  wxcLoad(i,function(){wxcRender(i);});}
function closeCityWx(){var ov=document.getElementById('wxCityOverlay');if(ov)ov.style.display='none';}
function wxcRefresh(i){WXC_CACHE[i]=null;openCityWx(i);}

function wxcRender(i){var bx=document.getElementById('wxCityBox');if(!bx)return;
  var z=tzZones[i]||[];var ct=WXC_CITIES[i]||{};var d=WXC_CACHE[i];
  var head='<div class="flex items-start justify-between mb-1"><div><h3 class="text-sm font-bold text-gray-900 leading-none">'+esc(ct.city||'')+' — Live Conditions</h3>'+
    '<p class="text-[10px] text-gray-500 mt-1">Meta '+esc(z[1]||'')+(z[3]?' · '+esc(z[3]):'')+' ('+esc(z[0]||'')+') · <span class="mono">'+ct.lat.toFixed(4)+', '+ct.lon.toFixed(4)+'</span></p></div>'+
    '<button onclick="closeCityWx()" class="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button></div>';
  if(!d||d.error){
    bx.innerHTML=head+'<div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center mt-3"><p class="text-[12px] font-bold text-amber-800 mb-1">Conditions unavailable</p>'+
      '<p class="text-[10px] text-amber-700 mb-2">Both Windy and Open-Meteo could not be reached'+(d&&d.error?' — <span class="mono">'+esc(d.error)+'</span>':'')+'.</p>'+
      '<button onclick="wxcRefresh('+i+')" class="text-[10px] font-bold text-white bg-gray-900 rounded-lg px-3 py-1.5 hover:bg-gray-800">Retry</button></div>';
    return;}
  var cur=d.cur||{};var srcWindy=(d.source==='windy');
  var srcChip=srcWindy?
    '<span class="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700">● Windy.com · GFS</span>':
    '<span class="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700">● Open-Meteo (fallback)</span>';
  var aqChip='<span class="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-600">AQ · Open-Meteo</span>';
  var fbNote=(!srcWindy&&d.windyError)?'<p class="text-[9px] text-gray-400 mt-1">Windy unavailable ('+esc(d.windyError)+') — all readings below are Open-Meteo.</p>':'';
  function n(v,dd){return (v==null||isNaN(v))?'—':(+v).toFixed(dd==null?0:dd);}
  var big='<div class="flex items-end justify-between mt-3 mb-3"><div class="flex items-end gap-2">'+
    '<span class="text-5xl font-bold text-gray-900 leading-none mono">'+n(cur.tempF)+'°</span><span class="text-sm text-gray-500 mb-1">F</span>'+
    (cur.feelsF!=null?'<span class="text-[10px] text-gray-500 mb-1.5">feels '+n(cur.feelsF)+'°</span>':'')+'</div>'+
    '<div class="text-right">'+srcChip+' '+aqChip+fbNote+'</div></div>';
  function metric(lbl,val,sub){return '<div class="wxc-metric"><p class="text-[8px] font-bold uppercase tracking-wider text-gray-500">'+lbl+'</p>'+
    '<p class="text-[15px] font-bold text-gray-900 mono leading-tight mt-0.5">'+val+'</p>'+(sub?'<p class="text-[8px] text-gray-400">'+sub+'</p>':'')+'</div>';}
  var inHg=cur.hpa!=null?(cur.hpa*0.02953):null;
  var grid='<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">'+
    metric('Wind',n(cur.windMph)+' mph',(cur.windDir?'from '+cur.windDir:'sustained'))+
    metric('Gusts',(cur.gustMph!=null?n(cur.gustMph)+' mph':'—'),'peak')+
    metric('Precip',n(cur.precipMm,1)+' mm',srcWindy?'past 3 h':'this hour')+
    metric('Humidity',(cur.rh!=null?n(cur.rh)+'%':'—'),'relative')+
    metric('Pressure',(inHg!=null?n(inHg,2)+' inHg':'—'),(cur.hpa!=null?n(cur.hpa)+' hPa':''))+
    (function(){var a=d.aqi;var band=wxcAqiBand(a?a.usAqi:null);
      return '<div class="wxc-metric" style="border-color:'+band.c+'33"><p class="text-[8px] font-bold uppercase tracking-wider text-gray-500">Air Quality</p>'+
        '<p class="text-[15px] font-bold mono leading-tight mt-0.5" style="color:'+band.c+'">'+(a&&a.usAqi!=null?Math.round(a.usAqi):'—')+' AQI</p>'+
        '<p class="text-[8px] font-bold" style="color:'+band.c+'">'+band.label+(a&&a.pm25!=null?' · PM2.5 '+n(a.pm25,1):'')+'</p></div>';})()+
    '</div>';
  var tzName=z[2]||'America/New_York';
  var strip=(d.hours&&d.hours.length>1)?'<p class="text-[8px] font-bold uppercase tracking-wider text-gray-500 mt-3 mb-1">Next '+d.hours.length+' × '+d.step+'</p>'+
    '<div class="flex gap-1.5 overflow-x-auto pb-1">'+d.hours.map(function(h){
      var t='—';try{t=new Intl.DateTimeFormat('en-US',{timeZone:tzName,hour:'numeric'}).format(new Date(h.ts));}catch(e){}
      var wet=(h.precipMm||0)>=0.2;
      return '<div class="wxc-hour'+(wet?' wxc-wet':'')+'"><p class="text-[8px] text-gray-500">'+t+'</p>'+
        '<p class="text-[11px] font-bold text-gray-900 mono">'+n(h.tempF)+'°</p>'+
        '<p class="text-[7px] mono '+(wet?'font-bold':'text-gray-400')+'"'+(wet?' style="color:#0a58ca"':'')+'>'+n(h.precipMm,1)+'mm</p>'+
        '<p class="text-[7px] text-gray-400 mono">'+n(h.windMph)+'mph</p></div>';}).join('')+'</div>':'';
  var foot='<div class="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">'+
    '<span class="text-[8px] mono text-gray-400">fetched '+new Date(d.ts).toLocaleTimeString()+' · cached 10 min</span>'+
    '<button onclick="wxcRefresh('+i+')" class="text-[9px] font-bold text-blue-700 hover:underline">⟳ Refresh</button></div>';
  bx.innerHTML=head+big+grid+strip+foot;}

function wxInner(key){var v=venueFor(key);var c=WX_CACHE[key];
  var place=v?(v.name||''):'';
  if(!c){return '<div class="wx-skel"><div class="wx-spin"></div><span class="text-[11px] text-gray-400">Loading live weather'+(place?' · '+esc(place):'')+'…</span></div>';}
  if(c.error==='novenue'){return '<div class="wx-fallback"><span class="text-[11px] text-gray-400">📍 Add a venue location to enable live weather for this production.</span></div>';}
  if(c.error||!c.data||!c.data.current){return '<div class="wx-fallback"><span class="text-[11px] text-gray-500">Live weather unavailable right now'+(place?' for '+esc(place):'')+'.</span><button onclick="wxRetry(\''+key+'\')" class="wx-retry">↻ Retry</button></div>';}
  var cur=c.data.current,d=c.data.daily;
  var ci=wxCodeInfo(cur.weather_code);
  var alert=wxSevere(cur.weather_code,cur.wind_speed_10m,null)||(d&&d.precipitation_probability_max&&wxSevere(d.weather_code[0],d.wind_speed_10m_max[0],d.precipitation_probability_max[0]));
  var banner=alert?'<div class="wx-alert"><span class="wx-alert-ic">⚠</span><div class="flex-1"><p class="wx-alert-t">Severe weather may impact outdoor production</p>'+
      '<p class="wx-alert-s">'+esc(ci[0])+' · winds to '+Math.round((d?d.wind_speed_10m_max[0]:cur.wind_speed_10m))+' mph'+(d&&d.precipitation_probability_max?' · '+d.precipitation_probability_max[0]+'% precip':'')+' at '+esc(place)+'</p></div>'+
      '<button onclick="wxNotifyCrew(\''+key+'\')" class="wx-notify">'+(WX_NOTIFIED[key]?'✓ Crew Alerted':'📣 Alert Crew')+'</button></div>':'';
  // current (left)
  var current='<div class="wx-current">'+
    '<div class="wx-cur-ic">'+ci[1]+'</div>'+
    '<div><div class="wx-cur-temp">'+Math.round(cur.temperature_2m)+'°<span class="wx-cur-unit">F</span></div>'+
      '<div class="wx-cur-lbl">'+esc(ci[0])+'</div>'+
      '<div class="wx-cur-meta">Feels '+Math.round(cur.apparent_temperature)+'° · 💨 '+Math.round(cur.wind_speed_10m)+' mph · 💧 '+cur.relative_humidity_2m+'%</div></div>'+
  '</div>';
  // 5-day tiles (right) — skip today (index 0), show next 5
  var days='';for(var i=1;i<=5&&d&&i<d.time.length;i++){var di=wxCodeInfo(d.weather_code[i]);
    var dt=new Date(d.time[i]+'T00:00');var dow=dt.toLocaleDateString('en-US',{weekday:'short'});
    var sev=wxSevere(d.weather_code[i],d.wind_speed_10m_max[i],d.precipitation_probability_max[i]);
    days+='<div class="wx-tile'+(sev?' wx-tile-sev':'')+'" role="button" tabindex="0" style="cursor:pointer" title="Open the hour-by-hour forecast for '+dow+'" onclick="openDayWx(\''+key+'\','+i+')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openDayWx(\''+key+'\','+i+');}"><span class="wx-tile-dow">'+dow+'</span>'+
      '<span class="wx-tile-ic">'+di[1]+'</span>'+
      '<span class="wx-tile-hi">'+Math.round(d.temperature_2m_max[i])+'°</span>'+
      '<span class="wx-tile-lo">'+Math.round(d.temperature_2m_min[i])+'°</span>'+
      '<span class="wx-tile-p">💧'+(d.precipitation_probability_max[i]||0)+'%</span></div>';}
  return banner+
    '<div class="wx-grid">'+
      '<div class="wx-left"><div class="wx-place">📍 '+esc(place)+'</div>'+current+'</div>'+
      '<div class="wx-days">'+days+'</div>'+
    '</div>';
}
function wxBandHTML(key){return '<section id="wxband_'+key+'" class="wx-band">'+wxInner(key)+'</section>';}
/* ---- v31 PHASE 5: per-day forecast modal (click any daily wx tile) ---- */
var DAYWX_CACHE={}; // key|date -> {ts,hours|null,error}
function openDayWx(key,di){
  var ov=document.getElementById('dayWxOverlay'),bx=document.getElementById('dayWxBox');if(!ov||!bx)return;
  var c=WX_CACHE[key];if(!c||!c.data||!c.data.daily){toast('Weather not loaded yet');return;}
  ov.style.display='flex';
  renderDayWx(key,di);
  var date=c.data.daily.time[di];
  var ck=key+'|'+date;
  var hc=DAYWX_CACHE[ck];
  if(hc&&!hc.error&&(Date.now()-hc.ts)<1800000){renderDayWx(key,di);return;}
  var v=venueFor(key);if(!v||!v.lat){return;}
  wxClient.fetchForecast('latitude='+v.lat+'&longitude='+v.lng+
    '&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m'+
    '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto'+
    '&start_date='+date+'&end_date='+date)
  .then(function(j){DAYWX_CACHE[ck]={ts:Date.now(),hours:j.hourly||null,error:null};
    if(document.getElementById('dayWxBox'))renderDayWx(key,di);})
  .catch(function(){DAYWX_CACHE[ck]={ts:Date.now(),hours:null,error:'net'};
    if(document.getElementById('dayWxBox'))renderDayWx(key,di);});}
function closeDayWx(){var ov=document.getElementById('dayWxOverlay');if(ov)ov.style.display='none';}
function dayWxRetry(key,di){var c=WX_CACHE[key];if(c&&c.data&&c.data.daily)delete DAYWX_CACHE[key+'|'+c.data.daily.time[di]];openDayWx(key,di);}
function renderDayWx(key,di){
  var bx=document.getElementById('dayWxBox');if(!bx)return;
  var p=productions[key]||{};var v=venueFor(key)||{};
  var d=(WX_CACHE[key]||{}).data;if(!d||!d.daily)return;
  var date=d.daily.time[di];
  var ci=wxCodeInfo(d.daily.weather_code[di]);
  var sev=wxSevere(d.daily.weather_code[di],d.daily.wind_speed_10m_max[di],d.daily.precipitation_probability_max[di]);
  var dt=new Date(date+'T00:00');
  var dayLabel=dt.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  var hc=DAYWX_CACHE[key+'|'+date];
  var strip;
  if(!hc)strip='<div class="flex items-center gap-2 py-4 justify-center"><div class="wx-spin"></div><span class="text-[10px] text-gray-400">Loading hour-by-hour…</span></div>';
  else if(hc.error||!hc.hours)strip='<div class="text-center py-3"><span class="text-[10px] text-gray-500">Hourly forecast unavailable.</span> <button onclick="dayWxRetry(\''+key+'\','+di+')" class="text-[9px] font-bold text-blue-700 hover:underline">↻ Retry</button></div>';
  else{
    var hh=hc.hours;strip='<div class="flex gap-1.5 overflow-x-auto pb-1">';
    for(var i=0;i<hh.time.length;i++){
      var hci=wxCodeInfo(hh.weather_code[i]);
      var wet=(hh.precipitation_probability[i]||0)>=40;
      var hr=new Date(hh.time[i]).getHours();
      strip+='<div class="flex-shrink-0 text-center border rounded-lg px-1.5 py-1.5 '+(wet?'border-sky-300 bg-sky-50':'border-gray-100 bg-gray-50')+'" style="min-width:52px">'+
        '<p class="text-[8px] text-gray-500 mono">'+(hr===0?'12a':hr<12?hr+'a':hr===12?'12p':(hr-12)+'p')+'</p>'+
        '<p class="text-[13px] leading-none my-0.5">'+hci[1]+'</p>'+
        '<p class="text-[11px] font-bold mono">'+Math.round(hh.temperature_2m[i])+'°</p>'+
        '<p class="text-[7px] mono '+(wet?'font-bold text-sky-700':'text-gray-400')+'">💧'+(hh.precipitation_probability[i]||0)+'%</p>'+
        '<p class="text-[7px] mono text-gray-400">'+Math.round(hh.wind_speed_10m[i])+'mph</p></div>';}
    strip+='</div>';}
  bx.innerHTML='<div class="flex items-center justify-between px-4 py-3 border-b border-gray-100"><div><h3 class="text-sm font-bold text-gray-900">'+esc(dayLabel)+'</h3>'+
    '<p class="text-[10px] text-gray-500">'+esc(p.name||'')+' · '+esc(v.name||p.venue||'')+' · Open-Meteo</p></div>'+
    '<button onclick="closeDayWx()" class="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button></div>'+
    '<div class="p-4 space-y-3 overflow-y-auto" style="max-height:74vh">'+
    (sev?'<div class="wx-alert"><span class="wx-alert-ic">⚠</span><div class="flex-1"><p class="wx-alert-t">Severe weather risk this day</p><p class="wx-alert-s">'+esc(ci[0])+' · winds to '+Math.round(d.daily.wind_speed_10m_max[di])+' mph · '+(d.daily.precipitation_probability_max[di]||0)+'% precip</p></div></div>':'')+
    '<div class="flex items-center gap-4"><span style="font-size:40px;line-height:1">'+ci[1]+'</span>'+
      '<div><p class="text-xl font-bold mono">'+Math.round(d.daily.temperature_2m_max[di])+'° <span class="text-gray-400 text-sm">/ '+Math.round(d.daily.temperature_2m_min[di])+'°</span></p>'+
      '<p class="text-[10px] text-gray-600">'+esc(ci[0])+' · 💧 '+(d.daily.precipitation_probability_max[di]||0)+'% · 💨 up to '+Math.round(d.daily.wind_speed_10m_max[di])+' mph</p></div></div>'+
    '<p class="text-[8px] font-bold uppercase tracking-wider text-gray-500">Hour by hour (venue local)</p>'+strip+
    '</div>';}
function wxNotifyCrew(key){var p=productions[key];WX_NOTIFIED[key]=true;
  // count checked-in crew for this production from the barcode/crew model where available
  var n=0;try{if(p&&p.crewMatrix)n=Object.keys(p.crewMatrix).length;}catch(e){}
  if(!n)n=(CREW_FIELD.length);
  console.groupCollapsed('%c[WEATHER] Crew disruption alert (SIMULATED)','color:#b24a00;font-weight:bold');
  console.log('Production :',p?p.name:key);
  console.log('Recipients :',n+' checked-in crew');
  console.log('Channel    :','SMS + Email (Graph sendMail / Teams channel post)');
  console.log('Message    :','Severe weather may impact today\u2019s outdoor production at '+((venueFor(key)||{}).name||'')+'. Monitor comms for schedule holds.');
  console.groupEnd();
  try{sendTeamsNotification&&sendTeamsNotification('ops-room-'+key,'Weather disruption alert dispatched to '+n+' crew');}catch(e){}
  try{omniLogSystem&&omniLogSystem('Weather alert dispatched to '+n+' crew · '+(p?p.name:key));}catch(e){}
  try{logEvent&&logEvent(key,'📣 Weather disruption alert sent to '+n+' checked-in crew');saveState&&saveState();}catch(e){}
  var el=document.getElementById('wxband_'+key);if(el)el.innerHTML=wxInner(key);
  toast('Weather alert simulated → '+n+' crew (see console)');
}

/* Wave B: init deferred to muse-app-b.js after all modules load */


