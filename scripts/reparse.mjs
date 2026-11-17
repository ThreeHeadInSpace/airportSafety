import {readFile,writeFile} from 'node:fs/promises';
import {parseText} from '../lib/parser.mjs';
import {rebuild} from '../public/engine.mjs';
const file=new URL('../data/snapshot.json',import.meta.url),s=JSON.parse(await readFile(file,'utf8'));
s.messages=s.messages.map(m=>({...m,...parseText(m.text,m.at)}));s.intervals=rebuild(s.messages,s.from,s.checkedAt);s.reviewCount=s.messages.filter(m=>m.review).length;
await writeFile(file,JSON.stringify(s));console.log(JSON.stringify({messages:s.messages.length,review:s.reviewCount,intervals:s.intervals.length}));
