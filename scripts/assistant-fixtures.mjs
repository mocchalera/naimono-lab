import {writeFile} from 'node:fs/promises';
import '../public/core.js';
const C=globalThis.NaimonoCore,base=process.env.NAIMONO_BASE_URL || 'http://127.0.0.1:8794';
const cases=[
  ...['りんご','サカナクション','よるしか','マンウィズアミッション','まかろにえんぴつ','マカロニえんぴつ','クロマニヨンズ','ポルカドットスティングレイ'].map(word=>({word,group:'existing'})),
  ...['もにゅらっぴ','ギャラポンチ','リンゴロロン','ペンギツネ','モチャペロン','ふわもこポンデリス'].map(word=>({word,group:'invented'})),
  ...['宇宙バナナ','深海メロン'].map(word=>({word,group:'compound'})),
  ...['もにゅらっぴが走っている','ねこが空を飛ぶ'].map(word=>({word,group:'sentence'}))
];
const results=[];
for(const fixture of cases){
  const start=Date.now();
  const response=await fetch(`${base}/api/judge`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word:fixture.word}),signal:AbortSignal.timeout(15000)});
  const body=await response.json(),a=body.assessment;
  const previousStatus=a ? a.score>=.85?'out':a.existenceScore<=.20&&a.nameRisk<.45&&a.compoundRisk<.45&&a.sentenceRisk<.45?'safe':'review':null;
  const passed=response.ok && a?.version===C.JUDGMENT_POLICY.version && (fixture.group==='existing'?body.status!=='safe':fixture.group==='invented'?body.status!=='out':body.status!=='safe');
  results.push({...fixture,passed,previousStatus,elapsedMs:Date.now()-start,...body});
  console.log(JSON.stringify({word:fixture.word,passed,before:previousStatus,after:body.status,by:body.decisionBy,fallback:body.fallback?.state,ms:Date.now()-start}));
  if(!response.ok)break;
}
const percent=(list,q)=>list.length?[...list].sort((a,b)=>a-b)[Math.ceil(list.length*q)-1]:null;
const helper=results.filter(r=>r.fallback),uncached=results.filter(r=>!r.cached);
const report={base,recordedAt:new Date().toISOString(),summary:{completed:results.length,total:cases.length,passed:results.filter(r=>r.passed).length,
  previousReviews:results.filter(r=>r.previousStatus==='review').length,reviews:results.filter(r=>r.status==='review').length,
  falseSafe:results.filter(r=>r.group==='existing'&&r.status==='safe').length,falseOut:results.filter(r=>r.group==='invented'&&r.status==='out').length,
  fallbackCalls:helper.filter(r=>!r.cached).length,fallbackCompleted:helper.filter(r=>r.fallback.state==='completed').length,
  p50Ms:percent(uncached.map(r=>r.elapsedMs),.5),p95Ms:percent(uncached.map(r=>r.elapsedMs),.95),fallbackP95Ms:percent(helper.filter(r=>!r.cached).map(r=>r.fallback.elapsedMs),.95)},
  notes:['Small constructed fixture, not a general accuracy benchmark.','Previous policy is replayed on the same Jev scores, not a separate historical model run.','Invented fixtures do not prove universal nonexistence.'],results};
if(process.env.REPORT_PATH)await writeFile(process.env.REPORT_PATH,JSON.stringify(report,null,2));
console.log(JSON.stringify(report.summary,null,2));
if(results.length!==cases.length || results.some(r=>!r.passed) || !helper.some(r=>r.fallback.state==='completed'))process.exitCode=1;
