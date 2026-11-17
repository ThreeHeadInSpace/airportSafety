import {readSnapshot} from '../../../lib/store.mjs';
export const dynamic='force-dynamic';
export async function GET(){
  try{const data=await readSnapshot();if(!data)return Response.json({error:'История ещё не загружена. Ожидается первый сбор сообщений.'},{status:503});
    const {messages,...publicData}=data;
    return Response.json({...publicData,reviews:messages.filter(m=>m.review).map(({id,at,url,text})=>({id,at,url,text}))},{headers:{'Cache-Control':'public, max-age=60, s-maxage=120'}});
  }catch{ return Response.json({error:'Хранилище временно недоступно. Попробуйте позже.'},{status:503}); }
}
