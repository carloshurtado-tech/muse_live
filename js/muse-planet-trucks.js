/* Stable planet names for production vehicles, saved records and export data. */
(function(root){
 'use strict';
 var planets=['Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune'];
 var primary={worldcup:'Jupiter',sail250:'Venus',superbowl:'Mars',muse100:'Earth',midterms:'Mercury',parade:'Saturn',winterolympics:'Neptune'};
 var uplinks={worldcup:'Neptune',sail250:'Mercury',superbowl:'Neptune',muse100:'Venus',midterms:'Uranus',parade:'Mars',winterolympics:'Uranus'};
 var aliases={
  'NEP ND1 — Supershooter 23':'Jupiter','NEP ND1':'Jupiter','Supershooter 23':'Jupiter','ND1':'Jupiter',
  'Game Creek — Edge':'Mars','Game Creek Edge':'Mars','OB Truck A · Edge':'Mars',
  'NEP Sat-4':'Neptune','K2 Ku Uplink':'Neptune','Ku Uplink 118':'Neptune','Uplink / TX Bay':'Neptune',
  'Muse Live Field Ops Flypack · Double Technical Cabin':'Jupiter','Jupiter A':'Jupiter','Jupiter':'Jupiter',
  'Double Technical Cabin':'Saturn','Double Tech Cabin':'Saturn','Harbor Contrib Cart':'Uranus',
  'Harbor Flypack A':'Venus','Harbor flypack':'Venus','HB-2 Flypack':'Venus','HB-2':'Venus','Dockside TX':'Mercury',
  'OB Truck B · Compound':'Earth','OB Truck A':'Earth','OB Truck B':'Saturn',
  'TBD compound truck':'Mars','Mobile Unit 1':'Earth'
 };
 var escaped=Object.keys(aliases).sort(function(a,b){return b.length-a.length;}).map(function(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');});
 var names=new RegExp('(^|[^A-Za-z0-9_])('+escaped.join('|')+')(?=$|[^A-Za-z0-9_])','g');
 function text(s){
  if(/^(?:https?:|data:|blob:)/.test(s)||/\.(?:pdf|dwg|dxf|png|jpg)$/i.test(s))return s;
  return s.replace(names,function(all,prefix,name){return prefix+aliases[name];});
 }
 function name(s,key,index){
  if(planets.indexOf(s)>=0)return s;
  if(!index&&primary[key]&&(!s||s==='Mobile Unit 1'||s==='OB Truck A'||s==='Grass Valley Kayenne'))return primary[key];
  if(aliases[s])return aliases[s];
  if(index===7&&uplinks[key])return uplinks[key];
  if(!index&&primary[key])return primary[key];
  return planets[(index||0)%planets.length];
 }
 var protectedFields=/^(?:id|ref|url|href|path|src|docs|email|vendor|token|deviceToken|apiKey|api_key|password|serial|barcode|thingsboardDeviceId|activeTruckId|type|cat|category)$/;
 function convert(value,key,field){
  if(typeof value==='string'){
   if(field==='truck')return /plant|IBC|central/i.test(value)?value:name(value,key,0);
   if(field==='uplinkTruck')return value?name(value,key,7):value;
   return text(value);
  }
  if(!value||typeof value!=='object')return value;
  if(Array.isArray(value)){
   value.forEach(function(item,i){var oldName=item&&item.name;value[i]=convert(item,key,'');if(field==='trucks'&&item&&typeof item==='object')item.name=name(oldName,key,i);});return value;
  }
  key=value.prod||value.project||key;
  if((value.cat==='truck'||value.cat==='uplink')&&value.name)value.name=name(value.name,key,value.cat==='uplink'?7:0);
  Object.keys(value).forEach(function(k){
   if(protectedFields.test(k))return;
   var childKey=primary[k]?k:key;
   if(k==='truck'&&value[k]&&typeof value[k]==='object'){
    convert(value[k],childKey,k);if(value[k].name)value[k].name=name(value[k].name,childKey,0);
   }else value[k]=convert(value[k],childKey,k);
  });
  return value;
 }
 function migrate(storage){
  var marker='muselive_planet_trucks_20260923';if(storage.getItem(marker))return;
  var keys=['muselive_edits','muselive_custom','muselive_inventory_v1','muselive_ops_v1','muselive_fin_v1','muselive_comms_v1','muselive_records_v1_operations'];
  var before={},after={};
  keys.forEach(function(k){var raw=storage.getItem(k);if(raw){var next=JSON.stringify(convert(JSON.parse(raw),'',''));if(raw!==next){before[k]=raw;after[k]=next;}}});
  var changed=Object.keys(after);if(changed.length)storage.setItem(marker+'_backup',JSON.stringify(before));
  try{changed.forEach(function(k){storage.setItem(k,after[k]);});storage.setItem(marker,'done');}
  catch(error){changed.forEach(function(k){storage.setItem(k,before[k]);});throw error;}
 }
 function normalize(){
  ['tbSpecs','productions','inventory','workOrders','txBookings','finPOs','finInvoices','comms','trkDevices','trkEvents'].forEach(function(k){if(root[k])convert(root[k],'','');});
 }
 function after(fn,done){var original=root[fn];if(typeof original!=='function')return;root[fn]=function(){var result=original.apply(this,arguments);done.apply(this,arguments);return result;};}
 function install(){
  if(!root.productions)return;
  normalize();
  var originalFleet=root.trkFleetSpec;
  if(typeof originalFleet==='function')root.trkFleetSpec=function(key){return originalFleet(key).map(function(row){var next=row.slice();if(next[0]==='truck'||next[0]==='uplink')next[1]=name(next[1],key,next[0]==='uplink'?7:0);return next;});};
  after('ensureTB',function(p,key){convert(p,key,'');});
  ['loadState','loadOps','loadComms','loadInventory'].forEach(function(fn){after(fn,normalize);});
  if(typeof root.renderAll==='function')root.renderAll();
 }
 root.MusePlanetTrucks={text:text,name:name,convert:convert,migrate:migrate,normalize:normalize,planets:planets};
 try{migrate(root.localStorage);}catch(error){if(root.console)root.console.warn('Truck name migration could not be saved; prior records retained.',error);}
 if(root.document)root.document.addEventListener('DOMContentLoaded',install,{once:true});
})(typeof window!=='undefined'?window:globalThis);
