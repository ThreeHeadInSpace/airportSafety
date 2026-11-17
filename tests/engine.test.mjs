import test from 'node:test';
import assert from 'node:assert/strict';
import {rebuild,measure,hourly,routeScore,episodeStats,hour,day,midnight,localDate} from '../public/engine.mjs';
import {parseText,parsePage} from '../lib/parser.mjs';
const msg=(id,at,events)=>({id,at,events,url:`https://t.me/favt_info/${id}`});
const event=(airport,direction,state)=>({airport,direction,state});
test('partial removal affects departures only',()=>{
  const p=parseText('Аэропорты\n— ВНУКОВО\n— ЖУКОВСКИЙ (Раменское)\nСНЯТЫ ограничения на выпуск воздушных судов. Ограничения на прием введены для обеспечения безопасности полетов.');
  assert.equal(p.review,false);assert.equal(p.events.length,2);assert.ok(p.events.every(e=>e.direction==='dep'&&e.state==='clear'));
});
test('quoted previous message is excluded from HTML extraction',()=>{
  const p=parsePage('<div class="tgme_widget_message" data-post="favt_info/42"><div class="js-message_reply_text">Аэропорт УФА ВВЕДЕНЫ ограничения на прием и выпуск.</div><div class="js-message_text">Аэропорт УФА<br>СНЯТЫ ограничения на прием и выпуск.</div><time datetime="2026-11-10T12:00:00Z"></time></div>');
  assert.ok(p[0].events.every(e=>e.state==='clear'));assert.ok(!p[0].text.includes('ВВЕДЕНЫ'));
});
test('unknown initial state; duplicate introductions do not restart episode',()=>{
  const I=rebuild([msg(1,hour,[event('UFA','dep','restricted')]),msg(2,2*hour,[event('UFA','dep','restricted')]),msg(3,3*hour,[event('UFA','dep','clear')])],0,4*hour);
  const x=I.filter(i=>i.airport==='UFA'&&i.direction==='dep');assert.equal(x.length,3);assert.equal(x[1].durationMs,2*hour);assert.equal(measure(I,'UFA','dep',0,hour).share,null);
});
test('duration weighted fractions and union do not double count',()=>{
  const I=rebuild([msg(1,0,[event('UFA','dep','clear'),event('UFA','arr','clear')]),msg(2,hour/2,[event('UFA','dep','restricted'),event('UFA','arr','partial')])],0,hour);
  const m=measure(I,'UFA','both',0,hour);assert.equal(m.share,.5);assert.equal(m.partial,hour/2);
});
test('missing observations are excluded, never treated as clear',()=>{
  const I=rebuild([msg(1,hour/2,[event('UFA','dep','clear')])],0,hour);const m=measure(I,'UFA','dep',0,hour);assert.equal(m.coverage,.5);assert.equal(m.share,0);assert.equal(measure(I,'UFA','arr',0,hour).share,null);
});
test('local midnight and Ufa/Moscow date rollover',()=>{
  const t=midnight('2026-11-17',5);assert.equal(new Date(t).toISOString(),'2026-11-16T19:00:00.000Z');assert.equal(localDate(t,3),'2026-11-16');
  const start=midnight('2026-11-17',3),I=rebuild([msg(1,start,[event('SVO','dep','restricted')])],start,start+2*hour);const b=hourly(I,'SVO','dep',start,start+2*hour);assert.equal(b[0].share,1);assert.equal(b[2].share,null);
});
test('route pairs elapsed time, both directions, and next-day arrivals',()=>{
  const from=midnight('2026-11-01',5),until=from+3*day;
  const I=rebuild([msg(1,from,[event('UFA','dep','clear'),event('SVO','arr','clear')]),msg(2,from+23*hour+140*60000,[event('SVO','arr','restricted')]),msg(3,from+24*hour+140*60000,[event('SVO','arr','clear')])],from,until);
  const s=routeScore(I,'UFA','SVO',23,140,from,until);assert.equal(s.samples,2);assert.equal(s.share,.5);
});
test('complex and conflicting text marks status unknown',()=>{
  for(const t of ['Аэропорт УФА. С 13:40 МСК введены ограничения на прием и выпуск.','Аэропорт УФА. СНЯТЫ ограничения на прием и выпуск. ВВЕДЕНЫ ограничения на выпуск.','Аэропорт УФА. Ограничения не сняты.']){const p=parseText(t);assert.equal(p.review,true);assert.ok(p.events.every(e=>e.state==='unknown'));}
});
test('partial mode is retained separately from full restrictions',()=>{
  const p=parseText('Аэропорт ШЕРЕМЕТЬЕВО. Прием воздушных судов по согласованию.');assert.deepEqual(p.events,[event('SVO','arr','partial')]);
});
test('actual Rosaviatsia agreement wording applies to both directions',()=>{
  const p=parseText('Аэропорт ВНУКОВО\nпринимает и отправляет рейсы по согласованию с соответствующими органами в связи с введением временных ограничений на использование воздушного пространства.');assert.equal(p.review,false);assert.equal(p.events.length,2);assert.ok(p.events.every(e=>e.state==='partial'));
});
test('explicit Moscow clock uses previous local day across midnight',()=>{
  const at=Date.parse('2026-11-17T00:10:00+03:00'),p=parseText('Аэропорт УФА. С 23:40 МСК введены ограничения на прием и выпуск.',at);assert.equal(p.review,false);assert.equal(p.events[0].effectiveAt,Date.parse('2026-11-16T23:40:00+03:00'));assert.equal(p.events[0].timeBasis,'explicit_msk');
});
test('independent airport blocks do not leak states',()=>{
  const p=parseText('Аэропорт УФА. ВВЕДЕНЫ ограничения на прием и выпуск. Аэропорт ВНУКОВО. СНЯТЫ ограничения на прием и выпуск.');assert.equal(p.events.find(e=>e.airport==='UFA').state,'restricted');assert.equal(p.events.find(e=>e.airport==='VKO').state,'clear');
});
test('03:20 through 05:40 distributes 40, 60, 40 minutes',()=>{
  const start=midnight('2026-11-01',3),I=rebuild([msg(1,start,[event('SVO','dep','clear')]),msg(2,start+(3*60+20)*60000,[event('SVO','dep','restricted')]),msg(3,start+(5*60+40)*60000,[event('SVO','dep','clear')])],start,start+day),b=hourly(I,'SVO','dep',start,start+day);
  assert.equal(b[3].restricted,40*60000);assert.equal(b[4].restricted,60*60000);assert.equal(b[5].restricted,40*60000);
});
test('mode changes and simultaneous directions form a single episode',()=>{
  const I=rebuild([msg(1,0,[event('UFA','dep','restricted'),event('UFA','arr','restricted')]),msg(2,hour,[event('UFA','dep','partial')]),msg(3,2*hour,[event('UFA','dep','clear'),event('UFA','arr','clear')])],0,3*hour);
  assert.equal(episodeStats(I,'UFA','both',0,3*hour).count,1);assert.equal(episodeStats(I,'UFA','both',0,3*hour).total,2*hour);
});
test('reprocessing edited source replaces the original transition',()=>{
  const a=msg(1,0,parseText('Аэропорт УФА. ВВЕДЕНЫ ограничения на прием и выпуск.').events),b={...a,events:parseText('Аэропорт УФА. СНЯТЫ ограничения на прием и выпуск.').events};
  const store=new Map([[a.id,a]]);store.set(b.id,b);const I=rebuild([...store.values()],0,hour);assert.equal(measure(I,'UFA','both',0,hour).share,0);assert.deepEqual(rebuild([...store.values()],0,hour),I);
});
