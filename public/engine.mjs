export const airports = [['UFA','Уфа',5],['SVO','Шереметьево',3],['DME','Домодедово',3],['VKO','Внуково',3],['ZIA','Жуковский',3]];
export const hour = 3600000;
export const day = 24*hour;
export const offset = code => airports.find(a=>a[0]===code)[2];
export const localDate = (t,off) => new Date(t+off*hour).toISOString().slice(0,10);
export const midnight = (date,off) => Date.parse(date+'T00:00:00Z')-off*hour;
export function rebuild(messages, from, until) {
  const intervals=[];
  for(const [airport] of airports) for(const direction of ['dep','arr']) {
    let state='unknown',start=from,source=null;
    for(const msg of [...messages].sort((a,b)=>a.at-b.at||a.id-b.id)) {
      for(const event of msg.events.filter(e=>e.airport===airport&&e.direction===direction)) {
        if(msg.at>until) continue;
        if(event.state===state) continue;
        if(msg.at>start) intervals.push({airport,direction,state,start,end:msg.at,source,durationMs:msg.at-start});
        start=Math.max(from,msg.at);state=event.state;source=msg.url;
      }
    }
    if(start<until) intervals.push({airport,direction,state,start,end:until,source,durationMs:until-start});
  }
  return intervals;
}
export function measure(intervals,airport,direction,start,end) {
  const dirs=direction==='both'?['dep','arr']:[direction];
  const relevant=intervals.filter(i=>i.airport===airport&&dirs.includes(i.direction)&&i.start<end&&i.end>start);
  const cuts=[...new Set([start,end,...relevant.flatMap(i=>[Math.max(start,i.start),Math.min(end,i.end)])])].sort((a,b)=>a-b);
  let known=0,restricted=0,partial=0;
  for(let n=1;n<cuts.length;n++) {
    const a=cuts[n-1],b=cuts[n],active=dirs.map(d=>relevant.find(i=>i.direction===d&&i.start<=a&&i.end>=b));
    if(active.some(i=>i&&['restricted','partial'].includes(i.state))) {known+=b-a;restricted+=b-a;if(active.some(i=>i?.state==='partial'))partial+=b-a;}
    else if(active.every(i=>i&&i.state==='clear')) known+=b-a;
  }
  return {known,restricted,partial,share:known?restricted/known:null,coverage:known/(end-start),sources:[...new Set(relevant.filter(i=>i.state!=='clear'&&i.state!=='unknown').map(i=>i.source).filter(Boolean))]};
}
export function hourly(intervals,airport,direction,from,until,off=offset(airport)) {
  const bins=Array.from({length:24},()=>({known:0,restricted:0,days:0}));
  for(let t=Math.floor((from+off*hour)/hour)*hour-off*hour;t<until;t+=hour){
    const a=Math.max(t,from),b=Math.min(t+hour,until);if(a>=b)continue;
    const m=measure(intervals,airport,direction,a,b),h=new Date(t+off*hour).getUTCHours();
    bins[h].known+=m.known;bins[h].restricted+=m.restricted;if(m.known)bins[h].days++;
  }
  return bins.map(b=>({...b,share:b.known?b.restricted/b.known:null}));
}
// Pair the same historical departure day with its arrival after elapsed flight time.
// Only jointly observed minutes contribute; overlapping restrictions count once.
export function routeScore(intervals,fromAirport,toAirport,h,minutes,from,until,targetDate=null) {
  const off=offset(fromAirport),shift=minutes*60000;let known=0,restricted=0,samples=0;
  const first=midnight(localDate(from,off),off);
  for(let d=first;d<until;d+=day){
    if(targetDate&&new Date(d+off*hour).getUTCDay()!==new Date(targetDate+'T12:00:00Z').getUTCDay())continue;
    const a=d+h*hour,b=a+hour;if(a<from||b+shift>until)continue;
    const dep=intervals.filter(i=>i.airport===fromAirport&&i.direction==='dep'&&i.start<b&&i.end>a);
    const arr=intervals.filter(i=>i.airport===toAirport&&i.direction==='arr'&&i.start<b+shift&&i.end>a+shift).map(i=>({...i,start:i.start-shift,end:i.end-shift}));
    const cuts=[...new Set([a,b,...dep.concat(arr).flatMap(i=>[Math.max(a,i.start),Math.min(b,i.end)])])].sort((x,y)=>x-y);let daily=0;
    for(let n=1;n<cuts.length;n++) {const x=cuts[n-1],y=cuts[n],p=dep.find(i=>i.start<=x&&i.end>=y),q=arr.find(i=>i.start<=x&&i.end>=y);
      if(!p||!q||p.state==='unknown'||q.state==='unknown')continue;
      known+=y-x;daily+=y-x;if(p.state!=='clear'||q.state!=='clear')restricted+=y-x;
    }if(daily)samples++;
  }
  return {share:known?restricted/known:null,known,restricted,samples};
}
