// Regression: /api/voice?action=list intentionally omits quality_status,
// while eligible same-model public references MUST still arm CAM++.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('voice-panel.js','utf8');
const elements=new Map();
function elem(key){
 if(!elements.has(key))elements.set(key,{value:'',checked:true,style:{},textContent:'',innerHTML:'',options:[],addEventListener(){},onclick:null});
 return elements.get(key);
}
const id='21e5098f-0f04-4571-92a4-9b1d52f4d48c';
const names=['Maribel Vaquero','Oskar Matute','Gabriel Rufián','Emilio Delgado','Míriam Nogueras','Ester Muñoz','Patxi López','Pepa Millán'];
const profiles=names.flatMap((person_name)=>Array.from({length:10},(_,n)=>({
 id:person_name+'-'+n,person_name,party:'test',source_type:'public-reference',
 model_id:'sherpaw-campplus-zh-en-advanced@5fc23543',created_at:'2026-11-23T20:00:00Z'
 // deliberately NO quality_status, as on the deployed /api/voice list response
})));
const calls=[];
const windowMock={dispatchEvent(){},addEventListener(){}};
const context={
 window:windowMock,
 document:{querySelector:elem,querySelectorAll:()=>[]},
 localStorage:{getItem:key=>key==='debate_live_id'?id:null},
 sessionStorage:{getItem:()=>''},
 CustomEvent:class {constructor(type,options){this.type=type;this.detail=options?.detail}},
 setInterval(){},setTimeout(){},
 console,
 fetch:async url=>{
  calls.push(url);
  if(url.startsWith('/api/voice?action=list'))return {ok:true,json:async()=>({profiles,events:[]})};
  if(url.startsWith('/api/supervisor?action=identity'))return {ok:true,json:async()=>({roster:names.map(name=>({name,party:'test',role:'candidate'}))})};
  throw Error('Unexpected request '+url);
 }
};
vm.createContext(context);
vm.runInContext(src,context,{filename:'voice-panel.js'});
(async()=>{
 await new Promise(resolve=>setImmediate(resolve));
 await new Promise(resolve=>setImmediate(resolve));
 const d=windowMock.debateVoice.diagnostics();
 assert.equal(d.profiles,80,'80 public reference profiles must load without quality_status in GET response');
 assert.equal(calls.filter(x=>x.includes('action=list')).length,1);
 assert.match(elem('#voiceStatus').textContent,/80 huellas vocales cargadas/);
 console.log('PASS: production API metadata shape => browser CAM++ has 80 voice references');
})().catch(e=>{console.error(e);process.exitCode=1});
