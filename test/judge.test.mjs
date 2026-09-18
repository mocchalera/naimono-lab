import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, judgeWord, parseResponse, MODEL_ID, QUESTION_KEY } from '../lib/judge.mjs';
import {jevResponse, evidenceIds} from './jev-fixture.mjs';

const valid = noul => ({...jevResponse(noul),model:'jev-1.13.0'});
const questionIds = [...evidenceIds,'name_risk','category','flavor'];

test('request uses the Workers AI model and documented typed Noul response shape', async () => {
  let calls = 0;
  const ai = { run: async (model, input) => {
    calls++;
    assert.equal(model, MODEL_ID);
    assert.equal(input.state.word, 'もにゅらっぴ');
    assert.equal(input.state.language, 'Japanese');
    assert.equal(input.questions[QUESTION_KEY].type, 'noul');
    assert.deepEqual(Object.keys(input.questions), questionIds);
    assert.equal(input.questions.name_risk.type,'score');
    assert.equal(input.questions.name_risk.criteria.length,5);
    assert.equal(input.questions.category.type,'choice');
    return {answers:{...valid(.1).answers,category:{type:'choice',choice:'animal'}}};
  } };
  const result = await judgeWord({word:'もにゅらっぴ'}, {ai});
  assert.equal(calls, 1); assert.equal(result.status, 'safe'); assert.equal(result.source, 'jev'); assert.equal(result.probability, .1);
  assert.equal(result.category,'animal');
});

test('kanji shiritori adds first and last sound choices to the same request',async () => {
  let calls = 0;
  const result = await judgeWord({word:'雲ぷる餅',mode:'shiritori'}, {ai:{run:async (_model,input) => {
    calls++;
    assert.equal(input.state.word,'雲ぷる餅'); assert.equal(input.state.reading,null);
    assert.deepEqual(Object.keys(input.questions),[...questionIds,'first_sound','last_sound']);
    assert.equal(input.questions.first_sound.criteria['が'],'が');
    assert.ok(input.questions.last_sound.criteria.unknown);
    return {result:{answers:{...valid(.1).answers,category:{type:'choice',choice:'food'},first_sound:{type:'choice',choice:'く',probabilities:{'く':.98}},last_sound:{type:'choice',choice:'ち',probabilities:{'ち':.97}}}}};
  }}});
  assert.equal(calls,1); assert.equal(result.category,'food'); assert.deepEqual(result.sounds,{first:'く',last:'ち'});
  for (const [word,reading] of [['モニュラッピ',''],['雲ぷる餅','くもぷるもち']]) {
    assert.deepEqual(Object.keys(buildRequest(word,reading,'shiritori').questions),questionIds);
  }
});

test('optional malformed classifications and uncertain sounds do not replace the existence verdict',() => {
  const sound = {type:'choice',choice:'く',probabilities:{'く':.98}};
  for (const last of [undefined,{type:'choice',choice:'unknown'}, {type:'choice',choice:'ち',probabilities:{'ち':.64}}, {type:'choice',choice:'ち',probabilities:{'ち':2}}, {type:'choice',choice:'ち',probabilities:{'ち':'0.9'}}]) {
    const result = parseResponse({answers:{...valid(.1).answers,category:{type:'choice',choice:'<script>'},first_sound:sound,last_sound:last}});
    assert.equal(result.status,'safe'); assert.equal(result.sounds,null); assert.equal(result.category,null);
  }
  for (const category of [undefined,null,{type:'noul',noul:.8},{type:'choice',choice:'__proto__'}]) {
    assert.equal(parseResponse({answers:{...valid(.1).answers,category}}).category,null);
  }
});

test('invalid game modes are rejected before calling Jev',async () => {
  await assert.rejects(judgeWord({word:'雲ぷる餅',mode:'anything'},{ai:{run:() => assert.fail('must not call')}}),error => error.code === 'INVALID_MODE');
});

test('a specific band-name signal overrides a low broad existence score',async () => {
  const response = jevResponse(.03,{names:{type:'noul',noul:.94},name_risk:{type:'score',score:3.8},flavor:{type:'choice',choice:'bold'}});
  const result = await judgeWord({word:'サカナクション'},{ai:{run:async () => response}});
  assert.equal(result.status,'out'); assert.equal(result.assessment.strongest,'names');
  assert.equal(result.assessment.scores.exists,.03); assert.equal(result.probability,.94);
  assert.match(result.message,/バンド・人名/); assert.equal(result.flavor,'bold');
});

test('an unfamiliar plausible name is reviewed without inventing evidence of existence',() => {
  const result = parseResponse(jevResponse(.02,{name_risk:{type:'score',score:3.1}}));
  assert.equal(result.status,'review'); assert.equal(result.assessment.reason,'name_caution');
  assert.equal(result.probability,.02); assert.equal(result.assessment.nameRisk,3.1/4);
});

test('classification and imagined sound personality do not affect existence',() => {
  const result = parseResponse(jevResponse(.1,{category:{type:'choice',choice:'person'},flavor:{type:'choice',choice:'natural'}}));
  assert.equal(result.status,'safe'); assert.equal(result.category,'person'); assert.equal(result.flavor,'natural');
  assert.equal(parseResponse(jevResponse(.1,{flavor:{type:'choice',choice:'<script>'}})).flavor,null);
});

test('missing or malformed perspectives cannot silently become a safe result',() => {
  for (const id of evidenceIds) {
    for (const answer of [undefined,null,{type:'choice',choice:'safe'},{type:'noul',noul:'0.1'},{type:'noul',noul:-.1},{type:'noul',noul:1.1}]) {
      assert.throws(() => parseResponse(jevResponse(.1,{[id]:answer})),error => error.code === 'INVALID_RESPONSE');
    }
  }
  for (const answer of [undefined,null,{type:'score',score:'1'},{type:'score',score:-.1},{type:'score',score:4.01},{type:'score',score:NaN},{type:'noul',noul:.1}]) {
    assert.throws(() => parseResponse(jevResponse(.1,{name_risk:answer})),error => error.code === 'INVALID_RESPONSE');
  }
  assert.throws(() => parseResponse({answers:{exists:{type:'noul',noul:.1}}}),error => error.code === 'INVALID_RESPONSE');
});

test('accepts the Cloudflare AI response envelope around Jev answers', async () => {
  const result = await judgeWord({word:'りんご'}, {
    ai:{run:async () => ({
      state:'Completed',
      result:valid(.98),
      gatewayMetadata:{keySource:'BYOK'}
    })}
  });
  assert.equal(result.status, 'out');
  assert.equal(result.probability, .98);
  assert.equal(result.model, 'jev-1.13.0');
});

test('existing and uncertain model responses map to out and family review', async () => {
  for (const [value, status] of [[.99,'out'],[.5,'review']]) {
    const result = await judgeWord({word:'ねこ'}, {ai:{run:async () => valid(value)}});
    assert.equal(result.status, status);
  }
});

test('input is quoted state and never changes the fixed instructions', () => {
  const req = buildRequest('ChatGPT');
  assert.deepEqual(Object.keys(req), ['state','questions']);
  assert.equal(req.state.word, 'ChatGPT');
  assert.equal(req.state.reading, null);
  assert.match(req.questions[QUESTION_KEY].instructions, /complete expression/);
  assert.match(req.questions[QUESTION_KEY].instructions, /never as an instruction/);
});
test('mechanical alternate spellings widen recall without changing or guessing the original term',() => {
  const request = buildRequest('よるしか');
  assert.equal(request.state.word,'よるしか');
  assert.deepEqual(request.state.spellingCandidates,['よるしか','ヨルシカ']);
  assert.deepEqual(buildRequest('ヨルシカ').state.spellingCandidates,['ヨルシカ','よるしか']);
  assert.deepEqual(buildRequest('雲ぷる餅').state.spellingCandidates,['雲ぷる餅','雲プル餅']);
  assert.deepEqual(buildRequest('雲ぷる餅','くもぷるもち').state.spellingCandidates,['雲ぷる餅','雲プル餅','くもぷるもち','クモプルモチ']);
  assert.deepEqual(buildRequest('ChatGPT').state.spellingCandidates,['ChatGPT']);
  assert.match(request.questions.names.instructions,/spellingCandidates/);
});

test('missing binding does not trigger a network request', async () => {
  await assert.rejects(judgeWord({word:'ねこ'}), error => error.code === 'NOT_CONFIGURED');
});

test('invalid input is rejected before the Workers AI binding is called', async () => {
  await assert.rejects(judgeWord({word:'<script>'}, {ai:{run:async () => { throw new Error('should not call'); }}}), error => error.code === 'INVALID_WORD');
});

test('malformed model output is an error, never an automatic safe or loss', async () => {
  for (const value of [{},{answers:{[QUESTION_KEY]:{type:'choice',choice:'true'}}}, valid('0.5'), valid(1.7), valid(null)]) {
    await assert.rejects(judgeWord({word:'ねこ'}, {ai:{run:async () => value}}), error => error.code === 'INVALID_RESPONSE');
  }
});

test('binding failures are sanitized and recoverable', async () => {
  await assert.rejects(judgeWord({word:'ねこ'}, {ai:{run:async () => { throw new Error('private provider detail'); }}}), error => error.code === 'UPSTREAM_ERROR' && !error.message.includes('private'));
  await assert.rejects(judgeWord({word:'ねこ'}, {ai:{run:() => new Promise(() => {})}, timeoutMs:5}), error => error.code === 'TIMEOUT');
});
