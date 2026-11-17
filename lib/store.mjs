import {readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
const file=path.join(process.cwd(),'data','snapshot.json');
export async function readSnapshot() {
  if(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY){
    const r=await fetch(`${process.env.SUPABASE_URL}/rest/v1/airport_snapshots?id=eq.main&select=payload`,{headers:headers(),cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw new Error(`Storage read failed: ${r.status}`);
    const rows=await r.json();if(rows[0])return rows[0].payload;
  }
  try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
}
function headers(){return {apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'};}
export async function writeSnapshot(payload) {
  if(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY){
    const r=await fetch(`${process.env.SUPABASE_URL}/rest/v1/airport_snapshots?on_conflict=id`,{method:'POST',headers:{...headers(),Prefer:'resolution=merge-duplicates'},body:JSON.stringify({id:'main',payload}),signal:AbortSignal.timeout(30000)});
    if(!r.ok)throw new Error(`Storage write failed: ${r.status}`);
  }
  await writeFile(file+'.tmp',JSON.stringify(payload));
  await rename(file+'.tmp',file);
}
