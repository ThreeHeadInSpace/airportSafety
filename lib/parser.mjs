import {load} from 'cheerio';
const names={UFA:/\bUFA\b|уф[ауы]|уфимск/iu,SVO:/шереметьев|\bSVO\b/iu,DME:/домодедов|\bDME\b/iu,VKO:/внуков|\bVKO\b/iu,ZIA:/жуковск|раменск|\bZIA\b/iu};
export function parseText(text) {
  const normalized=text.toLowerCase().replaceAll('ё','е');
  const selected=Object.entries(names).filter(([,re])=>re.test(normalized)).map(([c])=>c);
  if(!selected.length||!/огранич|согласован|разрешен|возобнов|приостанов/.test(normalized))return {events:[],review:false};
  const events=[];
  // Separate airport blocks must be interpreted independently, never broadcast mixed states.
  const blocks=normalized.split(/(?=аэропорт(?:ы|а|ов)?\s)/u).filter(Boolean);
  for(const block of blocks) {
    let aps=Object.entries(names).filter(([,re])=>re.test(block)).map(([c])=>c);
    if(!aps.length)continue;
    const sentences=block.split(/[.!?\n]+/u);
    for(const s of sentences) {
      let state;
      if(/снят[ыоа]?|отменен|возобновлен/.test(s))state='clear';
      else if(/по согласован|по разрешен|частичн|согласованию/.test(s))state='partial';
      else if(/введен[ыоа]?|вводятся|приостановлен|сохраняются|продолжают действовать/.test(s))state='restricted';
      if(!state||/вводили|вводились|ранее|необходимы|для обеспечения/.test(s))continue;
      const dirs=[];if(/выпуск|вылет/.test(s))dirs.push('dep');if(/прием|прилет|посадк/.test(s))dirs.push('arr');
      // A generic removal explicitly refers to restrictions in both directions.
      if(!dirs.length&&/ограничен/.test(s)&&state!=='partial')dirs.push('dep','arr');
      for(const airport of aps)for(const direction of dirs)events.push({airport,direction,state});
    }
  }
  const conflicts=events.some((e,i)=>events.slice(i+1).some(q=>q.airport===e.airport&&q.direction===e.direction&&q.state!==e.state));
  // Explicit clock times and complex conditions need review; publication time is not substituted silently.
  const ambiguous=conflicts||/\d{1,2}[:.]\d{2}|мск|местного времени|за исключением|кроме |только |одн[аоу] полос|сектор|не ввод|не снят|планиру|будут |будет /.test(normalized);
  if(ambiguous||!events.length)return {events:selected.flatMap(airport=>['dep','arr'].map(direction=>({airport,direction,state:'unknown'}))),review:true};
  return {events:[...new Map(events.map(e=>[e.airport+e.direction,e])).values()],review:false};
}
export function parsePage(html) {
  const $=load(html),messages=[];
  $('.tgme_widget_message[data-post]').each((_,el)=>{
    const box=$(el),id=Number(box.attr('data-post').split('/')[1]);
    const node=box.find('.js-message_text').first();node.find('br').replaceWith('\n');
    const text=node.text(),at=Date.parse(box.find('time[datetime]').first().attr('datetime'));
    if(!id||!Number.isFinite(at))return;
    messages.push({id,at,text,url:`https://t.me/favt_info/${id}`,...parseText(text)});
  });
  return messages;
}
