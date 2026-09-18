import {judgeWord} from './judge.mjs';
import {askReferee,refereeSettings} from './referee.mjs';
import '../public/core.js';
const C = globalThis.NaimonoCore;
const PROMPTS = {
  wordplay:'新しいひびき？ それとも、ことばのつぎはぎ？',
  name:'この名前、知っている人はいる？',
  reading:'どう読むかで変わりそう。どの読みであそぶ？',
  conflict:'しんぱんの見方が分かれたよ。どちらにする？',
  uncertain:'あることばの手がかりはある？ みんなで決めよう。',
  timeout:'助っ人の返事が間に合わなかったよ。今回はみんなで判定！',
  budget:'助っ人はひとやすみ。今回はみんなで判定！',
  unavailable:'今回はみんなで判定しよう。',error:'助っ人につながらなかったよ。今回はみんなで判定！'
};
function required(reason) {return {level:'required',reason,prompt:PROMPTS[reason] || PROMPTS.uncertain};}
function conversation(input,result) {
  const prompts = {food:'甘い？ しょっぱい？ どんな味だろう。',animal:'この生きもの、どんな声で鳴く？',move:'この技、どんなポーズで出す？',person:'この人、どんな仕事をしていそう？',tool:'この道具、何に使う？',place:'ここには、何がありそう？',other:'これ、どんなものか想像してみよう。'};
  const pick = Array.from(input.word).reduce((sum,c)=>sum+c.codePointAt(0),0) % 3;
  return result.status === 'safe' && pick === 0 && prompts[result.category] ? {level:'optional',reason:'imagination',prompt:prompts[result.category]} : {level:'none',reason:null,prompt:null};
}
export function finalizeJev(input,result) {
  const reason = result.assessment.reason;
  const discussion = result.status === 'review' ? required(reason.includes('compound') || reason.includes('sentence') ? 'wordplay' : reason === 'name_caution' ? 'name' : 'uncertain') : conversation(input,result);
  return {...result,decisionBy:'jev',decisionReason:reason,discussion};
}

export function resolveReferee(input,initial,fallback) {
  const base = {...finalizeJev(input,initial),fallback};
  if (fallback.state !== 'completed') return {...base,discussion:required(fallback.state)};
  const a = fallback.answer, j = initial.assessment;
  if (a.certainty !== 'clear' || a.issue !== 'none' || a.kind === 'uncertain') return {...base,discussion:required(a.issue !== 'none' ? a.issue : 'uncertain')};
  let status,reason,message;
  if (a.kind === 'invented') {
    // Lack of LLM recall cannot erase a strong name or grammatical clue.
    if (j.existenceScore >= .65 || j.nameRisk >= .65 || j.compoundRisk >= .60 || j.sentenceRisk >= .60) return {...base,discussion:required('conflict')};
    status = 'safe'; reason = 'assisted_invention';
    message = '助っ人も確認。既存のことばや反則の強い手がかりは見つからなかったよ！';
  } else if (a.kind === 'known') {
    if (a.domain === 'other' || [input.word,a.name].some(name=>C.toHiragana(a.detail) === C.toHiragana(name))) return {...base,discussion:required('name')};
    status = 'out'; reason = 'recognized';
    message = `助っ人が「${a.name}」を思い出したよ。${a.detail}`;
  } else if (a.kind === 'compound') {
    const joined = C.toHiragana(a.parts.join(''));
    if (a.parts.length < 2 || ![C.toHiragana(input.word),C.toHiragana(input.reading || '')].includes(joined)) return {...base,discussion:required('wordplay')};
    status = 'out'; reason = 'compound';
    message = `「${a.parts.join('＋')}」のつぎはぎみたい。${a.detail}`;
  } else {
    status = 'out'; reason = 'sentence'; message = `助っ人も、文章の形を見つけたよ。${a.detail}`;
  }
  const result = {...base,status,decisionBy:'assistant',decisionReason:reason,message};
  return {...result,discussion:conversation(input,result)};
}

export async function judgeGameWord(input,{ai,model,fallback = refereeSettings(),reserve,jevTimeoutMs} = {}) {
  const result = await judgeWord(input,{ai,model,timeoutMs:jevTimeoutMs});
  if (result.status !== 'review' || !fallback.enabled) return finalizeJev(input,result);
  return resolveReferee(input,result,await askReferee(input,{ai,...fallback,reserve}));
}
