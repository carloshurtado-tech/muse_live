/* Techbook PDF: map any leftover old-catalog labels to the industry truck kit. */
(function(root){
 'use strict';
 var names={
  "Marshall CV504":"Sony HDC-P31",
  "Ultrix":"Evertz EQX 32×32",
  "RIO 3224":"Calrec Hydra2",
  "Helix Net hardwire":"RTS ADAM",
  "Helixnet":"RTS ADAM",
  "HelixNet":"RTS ADAM",
  "Elite Core EC-WBP-VC":"RTS RM-325",
  "Elite Core IFB":"RTS IFB-325",
  "Elite Core":"RTS IFB-325",
  "NIMBRA":"Harmonic XOS",
  "Nimbra":"Harmonic XOS",
  "Appear":"Harmonic XOS",
  "PM3":"Calrec Artemis",
  "HDC-5500":"Sony HDC-5500",
  "HDC-3500":"Sony HDC-3500",
  "Tektronix PRISM":"Leader LV5600",
  "WinPlus-IP":"Autoscript WinPlus",
  "WinPlus-News":"Autoscript WinPlus",
  "Datavideo Central":"Autoscript WinPlus",
  "Voodoo control":"CueScript CSF-17",
  "Sony HDC-5500":"Sony HDC-5500"
 };
 var pattern=new RegExp('(^|[^A-Za-z0-9_])('+Object.keys(names).sort(function(a,b){return b.length-a.length;}).map(function(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}).join('|')+')(?=$|[^A-Za-z0-9_])','g');
 function text(value){return String(value).replace(pattern,function(all,prefix,name){return prefix+(names[name]||name);});}
 function convert(value){
  if(typeof value==='string')return text(value);
  if(Array.isArray(value))return value.map(convert);
  if(value&&typeof value==='object'){Object.keys(value).forEach(function(k){value[k]=convert(value[k]);});return value;}
  return value;
 }
 var original=root.techbookSections;
 if(typeof original!=='function')return;
 root.techbookSections=function(production){
  var sections=convert(original(production));
  sections.forEach(function(section){
   if(section.title!=='Intercom & Alphas (RVON)'||!section.blocks||!section.blocks[0])return;
   var channels=root.rvonArr(production);
   section.blocks[0].rows=channels.length?channels.map(function(entry,index){
    return ['Ch '+(index+1),entry.a||'—',entry.t||'—',entry.p||'—',entry.a?root.rvonAlphaRole(entry.a):'Unassigned'];
   }):[['—','—','—','—','No RVON channels assigned']];
  });
  return sections;
 };
})(window);
