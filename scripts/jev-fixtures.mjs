import '../public/core.js';
const C = globalThis.NaimonoCore;
const base = process.env.NAIMONO_BASE_URL || 'http://localhost:8787';
const cases = [
  { group:'existing', word:'りんご' },
  { group:'existing', word:'ぞう' },
  { group:'existing', word:'新幹線' },
  { group:'existing', word:'ピカチュウ' },
  { group:'existing', word:'マンドラゴラ' },
  { group:'existing', word:'ChatGPT' },
  { group:'existing', word:'サカナクション', source:'https://sakanaction.jp/' },
  { group:'existing', word:'ヨルシカ', source:'https://yorushika.com/' },
  { group:'existing', word:'よるしか', source:'https://yorushika.com/' },
  { group:'existing', word:'マンウィズアミッション', source:'https://www.mwamjapan.info/' },
  { group:'existing', word:'量子もつれ' },
  { group:'invented', word:'モチャペロン' },
  { group:'invented', word:'ギャラポンチ' },
  { group:'invented', word:'フワミミペンギツネ' },
  { group:'invented', word:'ズボラッキョン' },
  { group:'boundary', word:'カフェラテ' },
  { group:'boundary', word:'ドラゴンりんご' },
  { group:'boundary', word:'ナイモノ研究所' }
];

const configResponse = await fetch(`${base}/api/config`);
const config = await configResponse.json();
if (!configResponse.ok || config.judge !== 'jev') throw new Error(`Jev binding is not active at ${base}`);

const results = [];
for (const fixture of cases) {
  const response = await fetch(`${base}/api/judge`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({word:fixture.word}),
    signal:AbortSignal.timeout(15000)
  });
  const body = await response.json();
  const oldScore = body.assessment?.scores?.exists;
  results.push({ ...fixture, httpStatus:response.status, status:body.status, singleViewStatus:C.unitScore(oldScore) ? C.fromNoul(oldScore) : null, probability:body.probability ?? null, assessment:body.assessment ?? null, category:body.category ?? null, flavor:body.flavor ?? null, model:body.model ?? null, cached:Boolean(body.cached), message:body.message ?? body.error ?? null });
  if (!response.ok) break; // Do not spend the rest of the fixture budget after a provider failure.
}
const existing = results.filter(row => row.group === 'existing');
const invented = results.filter(row => row.group === 'invented');
const summary = {
  completed:results.length,total:cases.length,
  existing:{out:existing.filter(row => row.status === 'out').length,review:existing.filter(row => row.status === 'review').length,falseSafe:existing.filter(row => row.status === 'safe').length,singleViewFalseSafe:existing.filter(row => row.singleViewStatus === 'safe').length},
  constructedWords:{safe:invented.filter(row => row.status === 'safe').length,review:invented.filter(row => row.status === 'review').length,out:invented.filter(row => row.status === 'out').length}
};
console.log(JSON.stringify({base,recordedAt:new Date().toISOString(),policy:C.JUDGMENT_POLICY,config:{judge:config.judge,model:config.model},summary,notes:['Single-view baseline uses only the exists answer from the same multi-question response, not a separate old-model run.','Constructed words were chosen as inventions for this fixture; their real-world nonexistence is not proven.','This small fixture is not an accuracy benchmark for all Japanese words.'],results}, null, 2));
if (results.length !== cases.length || results.some(result => result.httpStatus !== 200 || !['safe','out','review'].includes(result.status) || (result.group === 'existing' && result.status === 'safe') || (result.group === 'invented' && result.status === 'out'))) process.exitCode = 1;
