import '../public/core.js';
const C = globalThis.NaimonoCore;
const base = process.env.NAIMONO_BASE_URL || 'http://127.0.0.1:8794';
const cases = [
  {group:'compound',word:'宇宙バナナ'},
  {group:'compound',word:'ねこ りんご'},
  {group:'compound',word:'深海メロン'},
  {group:'compound',word:'おばけラーメン'},
  {group:'sentence',word:'ねこが空を飛ぶ'},
  {group:'sentence',word:'今日は いい 天気'},
  {group:'sentence',word:'もにゅらっぴが走っている'},
  {group:'sentence',word:'昨日ぷるみょが踊った'},
  {group:'invented',word:'もにゅらっぴ'},
  {group:'invented',word:'ギャラポンチ'},
  {group:'invented',word:'リンゴロロン'},
  {group:'invented',word:'ペンギツネ'},
  {group:'existing',word:'りんご'},
  {group:'existing',word:'サカナクション'}
];
const configResponse = await fetch(`${base}/api/config`);
const config = await configResponse.json();
if (!configResponse.ok || config.judge !== 'jev') throw new Error(`No Jev binding at ${base}`);
const results = [];
for (const fixture of cases) {
  const response = await fetch(`${base}/api/judge`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word:fixture.word}),signal:AbortSignal.timeout(15000)});
  const body = await response.json();
  const a = body.assessment;
  let passed = response.ok && body.source === 'jev' && a?.version === C.JUDGMENT_POLICY.version;
  if (passed && ['compound','sentence'].includes(fixture.group)) passed = a[`${fixture.group}Risk`] >= C.JUDGMENT_POLICY.structureReviewAt && ['out','review'].includes(body.status);
  if (passed && fixture.group === 'invented') passed = a.compoundRisk < C.JUDGMENT_POLICY.structureReviewAt && a.sentenceRisk < C.JUDGMENT_POLICY.structureReviewAt && body.status !== 'out';
  if (passed && fixture.group === 'existing') passed = body.status !== 'safe';
  results.push({...fixture,passed,httpStatus:response.status,status:body.status,assessment:a,category:body.category,flavor:body.flavor,model:body.model,message:body.message || body.error});
  if (!response.ok) break;
}
const report = {base,recordedAt:new Date().toISOString(),policy:C.JUDGMENT_POLICY,summary:{completed:results.length,total:cases.length,passed:results.filter(r=>r.passed).length},notes:['Small live fixture, not a general accuracy benchmark.','Some examples are in the prompts; 深海メロン, おばけラーメン and 昨日ぷるみょが踊った are separate probes.','Invented examples are test constructions; nonexistence in the real world is not proven.'],results};
console.log(JSON.stringify(report,null,2));
if (results.length !== cases.length || results.some(r=>!r.passed)) process.exitCode = 1;
