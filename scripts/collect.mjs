import {parsePage} from '../lib/parser.mjs';
import {rebuild,day} from '../public/engine.mjs';
import {readSnapshot,writeSnapshot} from '../lib/store.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
async function fetchPage(url){
  if(process.platform==='win32'){
    const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',`[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $ProgressPreference='SilentlyContinue'; (Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 -Uri '${url}').Content`],{maxBuffer:8*1024*1024,timeout:45000,windowsHide:true});return stdout;
  }
  const res=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!res.ok)throw new Error(`Telegram ${res.status}`);return res.text();
}
const old=await readSnapshot();
const full=process.argv.includes('--full')||!old;
const now=Date.now(),target=full?now-98*day:Math.min(old.checkedAt-2*day,now-2*day);
const records=new Map((old?.messages||[]).map(m=>[m.id,m]));
let before,earliest=now,pages=0,reached=false,lastId=Infinity;
while(pages<600){
  let batch;
  for(let attempt=0;attempt<3;attempt++){
    try{batch=parsePage(await fetchPage(`https://t.me/s/favt_info${before?`?before=${before}`:''}`));if(!batch.length)throw new Error('Telegram returned no readable messages');break;}
    catch(e){if(attempt===2)throw e;await new Promise(r=>setTimeout(r,2000*(attempt+1)));}
  }
  const min=Math.min(...batch.map(m=>m.id));if(min>=lastId)throw new Error('Telegram pagination did not advance');lastId=min;
  for(const msg of batch) {if(msg.events.length||records.has(msg.id))records.set(msg.id,msg);earliest=Math.min(earliest,msg.at);}
  pages++;if(earliest<=target){reached=true;break;}before=min;
  if(pages%15===0)console.log(`Scanned ${pages} pages; reached ${new Date(earliest).toISOString()}`);
  await new Promise(r=>setTimeout(r,250));
}
if(!reached)throw new Error('History traversal incomplete; previous snapshot retained');
const from=full?earliest:old.from;
const messages=[...records.values()].filter(m=>m.at>=from).sort((a,b)=>a.at-b.at||a.id-b.id);
const intervals=rebuild(messages,from,now);
// A collector outage cannot prove the status between the last check and this crawl.
// Retain the outage as unknown unless a fresh event establishes a state afterward.
const gaps=[...(old?.gaps||[])];if(old&&now-old.checkedAt>45*60000)gaps.push({start:old.checkedAt,end:now});
let safe=intervals;
for(const gap of gaps){safe=safe.flatMap(i=>{
  if(i.end<=gap.start||i.start>=gap.end)return [i];
  // Historical backfill spans the outage and recovers published transitions. Deleted posts
  // cannot be recovered, so conservatively mark the whole unobserved span unknown.
  const pieces=[];if(i.start<gap.start)pieces.push({...i,end:gap.start,durationMs:gap.start-i.start});
  const a=Math.max(i.start,gap.start),b=Math.min(i.end,gap.end);pieces.push({...i,start:a,end:b,state:'unknown',source:null,durationMs:b-a});
  if(i.end>gap.end)pieces.push({...i,start:gap.end,durationMs:i.end-gap.end});return pieces;
});}
await writeSnapshot({version:1,checkedAt:now,from,messages,intervals:safe,gaps,reviewCount:messages.filter(m=>m.review).length,source:'https://t.me/s/favt_info'});
console.log(JSON.stringify({pages,messages:messages.length,from:new Date(from).toISOString(),review:messages.filter(m=>m.review).length}));
