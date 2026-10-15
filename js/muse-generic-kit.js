/* Runtime safety net: leftover old-catalog names → industry truck kit.
   New kit names are left as-is (Sony HDC-3500/5500, Kayenne, Calrec, RTS, EVS, etc.). */
(function(root){
 'use strict';
 var names={
  "Panasonic AK-HC3900":"Sony HDC-5500",
  "Blackmagic Micro Studio Camera 4K G2":"Sony HDC-3500",
  "Blackmagic PYXIS 6K":"Sony HDC-3500",
  "Canon CR-N500":"Grass Valley LDX 86N",
  "JVC GY-HC500":"Sony HDC-P31",
  "Datavideo HS-3200":"Grass Valley Kayenne",
  "Panasonic AV-UHS500":"Grass Valley Kayenne",
  "Soundcraft Vi7000":"Calrec Artemis",
  "Allen & Heath Avantis":"Calrec Apollo",
  "Allen & Heath DX168":"Calrec Hydra2",
  "Datavideo ITC-300":"RTS ADAM",
  "Hollyland Solidcom M1":"Riedel Bolero",
  "Green-GO MCX":"Clear-Com FreeSpeak II",
  "Ross Mira+":"EVS XT-VIA",
  "AJA Ki Pro GO2":"EVS XS-VIA",
  "Teradek Prism Flex Mk II":"Harmonic XOS",
  "Teradek Prism Mobile":"LiveU LU800",
  "Nanlite PavoSlim 60C":"ARRI SkyPanel S60-C",
  "Chauvet Ovation F-915FC":"ETC Source Four LED Series 3",
  "HPE Aruba CX 6300":"Cisco Catalyst 9300",
  "NewBlue Titler Live 5 Broadcast":"Chyron Prime",
  "Sony HDC-5500":"Sony HDC-5500"
 };
 var keys=Object.keys(names).sort(function(a,b){return b.length-a.length;});
 var re=new RegExp('('+keys.map(function(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}).join('|')+')','g');
 function text(s){
  if(typeof s!=='string'||!s)return s;
  return s.replace(re,function(m){return names[m]||m;});
 }
 function convert(v){
  if(typeof v==='string')return text(v);
  if(Array.isArray(v))return v.map(convert);
  if(v&&typeof v==='object'){
   Object.keys(v).forEach(function(k){v[k]=convert(v[k]);});
   return v;
  }
  return v;
 }
 function apply(){
  try{if(root.DEFAULT_DEPT_FIELDS)convert(root.DEFAULT_DEPT_FIELDS);}catch(e){}
  try{if(root.deptFields)convert(root.deptFields);}catch(e){}
  try{if(root.inventory)convert(root.inventory);}catch(e){}
  try{if(root.productions)convert(root.productions);}catch(e){}
 }
 root.MuseGenericKit={text:text,convert:convert,apply:apply};
 if(root.document)root.document.addEventListener('DOMContentLoaded',function(){
  apply();
  var orig=root.techbookSections;
  if(typeof orig==='function')root.techbookSections=function(p){return convert(orig(p));};
 },{once:true});
})(typeof window!=='undefined'?window:globalThis);
