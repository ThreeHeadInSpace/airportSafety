import {readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
const file=path.join(process.cwd(),'data','snapshot.json');
export async function readSnapshot() {
  if(process.env.SUPABASE_URL&&(process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY)){
    const r=await fetch(`${process.env.SUPABASE_URL}/rest/v1/airport_snapshots?id=eq.main&select=payload`,{headers:headers(),cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw new Error(`Storage read failed: ${r.status}`);
    const rows=await r.json();if(rows[0])return rows[0].payload;
  }
  try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
}
function headers(){const key=process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;return {apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};}
export async function writeSnapshot(payload) {
  if(process.env.SUPABASE_URL&&process.env.SUPABASE_INGEST_TOKEN){
    const r=await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/airport_ingest`,{method:'POST',headers:headers(),body:JSON.stringify({p_token:process.env.SUPABASE_INGEST_TOKEN,p_payload:payload}),signal:AbortSignal.timeout(30000)});
    if(!r.ok)throw new Error(`Storage write failed: ${r.status}`);
  }
  await writeFile(file+'.tmp',JSON.stringify(payload));
  await rename(file+'.tmp',file);
}
export async function logFailure(message){
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_INGEST_TOKEN)return;
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/airport_log_failure`,{method:'POST',headers:headers(),body:JSON.stringify({p_token:process.env.SUPABASE_INGEST_TOKEN,p_error:String(message).slice(0,200)}),signal:AbortSignal.timeout(10000)});
}
