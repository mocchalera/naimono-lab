import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/core.js';
const C = globalThis.NaimonoCore;

test('normalizes half-width kana and voice-added punctuation', () => {
  assert.equal(C.cleanWord('「ﾓﾆｭﾗｯﾋﾟ！」'),'モニュラッピ');
  assert.equal(C.toHiragana('ﾓﾆｭﾗｯﾋﾟ'),'もにゅらっぴ');
  assert.equal(C.toHiragana('ガギグゲゴ'),'がぎぐげご');
});
test('spaces from speech and typing disappear before validation, readings and duplicate checks', () => {
  for (const word of ['雲 ぷる 餅',' 雲　ぷる　餅。 ','「雲\tぷる\n餅！」','雲\u00a0ぷる\u2009餅']) {
    const result = C.checkTurn({word});
    assert.equal(result.status,'pending'); assert.equal(result.word,'雲ぷる餅');
  }
  const kana = C.checkTurn({word:' モ ニュ　ラッピ ',mode:'shiritori'});
  assert.equal(kana.word,'モニュラッピ'); assert.equal(kana.identity,'もにゅらっぴ');
  assert.deepEqual(kana.sounds,{first:'も',last:'ぴ'});
  const kanji = C.checkTurn({word:'雲 ぷる 餅',reading:' クモ　プル モチ ',mode:'shiritori'});
  assert.deepEqual(kanji.sounds,{first:'く',last:'ち'}); assert.equal(kanji.reading,'くもぷるもち');
  assert.equal(C.checkTurn({word:'モニュ ラッピ',history:[{word:'もにゅらっぴ'}]}).reason,'repeat');
  assert.equal(C.checkTurn({word:'モ ニュラッピ',mode:'shiritori',required:'く'}).reason,'first');
  assert.equal(C.checkTurn({word:'り ん ご',reading:'   '}).reading,'りんご');
  assert.equal(C.validateWord('な い こ と ば').word,'ないことば');
  assert.equal(C.validateWord('あ '.repeat(25)).ok,false);
  assert.equal(C.validateWord('　 \n\t').ok,false);
});
test('kana pronunciation cannot be replaced to cheat shiritori',() => {
  assert.equal(C.readingFor('りんご','あいう'),'りんご');
  assert.equal(C.readingFor('不思議','ふしぎ'),'ふしぎ');
  assert.equal(C.readingFor('不思議'), '');
});
test('final long vowel is skipped; final small kana is enlarged',() => {
  assert.equal(C.lastSound('ぴょもー'),'も');
  assert.equal(C.lastSound('ほにゃ'),'や');
  assert.equal(C.lastSound('ぐにゅー'),'ゆ');
  assert.equal(C.lastSound('ぽねーー'),'ね');
  assert.equal(C.firstSound('ゃぎゅ'),'や');
});
test('voicing is preserved rather than silently rewritten',() => {
  assert.equal(C.lastSound('ぽにょぎ'),'ぎ');
  assert.equal(C.checkTurn({word:'きょなも',mode:'shiritori',required:'ぎ'}).reason,'first');
});
test('rejects empty, markup, punctuation inside words, numbers-only, oversize and invalid readings',() => {
  for (const word of ['', '<script>alert(1)</script>', '< script >', '１２３', 'ない!ことば','あ'.repeat(25)]) assert.equal(C.validateWord(word).ok,false);
  assert.equal(C.validateWord('ChatGPT').ok, true);
  assert.equal(C.validateWord('不思議','abc','shiritori').ok,false);
  assert.equal(C.validateWord('ーもにゃ').ok,false);
});
test('requests a kana reading for kanji only in shiritori mode',() => {
  assert.equal(C.validateWord('空想生物','','free').ok,true);
  assert.equal(C.validateWord('空想生物','','shiritori').needsReading,true);
  assert.equal(C.validateWord('空想生物','くうそうせいぶつ','shiritori').ok,true);
});
test('original kanji and katakana spelling can be submitted without rewriting',() => {
  for (const word of ['雲ぷる餅','モニュラッピ','架空ぴょこ丸']) {
    const result = C.checkTurn({word});
    assert.equal(result.status,'pending'); assert.equal(result.word,word);
  }
});
test('kanji shiritori can defer its sounds to Jev, then still enforces the rules',() => {
  const word = '雲ぷる餅', mode = 'shiritori';
  assert.equal(C.checkTurn({word,mode,deferReading:true}).status,'pending');
  assert.equal(C.checkTurn({word,mode}).needsReading,true);
  const sounds = {first:'く',last:'ち'};
  assert.equal(C.checkTurn({word,mode,sounds,required:'く'}).status,'pending');
  assert.equal(C.checkTurn({word,mode,sounds,required:'ぴ'}).reason,'first');
  assert.equal(C.checkTurn({word,mode,sounds:{first:'く',last:'ん'}}).reason,'n');
  assert.equal(C.checkTurn({word,mode,sounds:{first:'く',last:'unknown'}}).needsReading,true);
  assert.equal(C.checkTurn({word,mode,sounds,history:[{word}]}).reason,'repeat');
});
test('Jev sounds never override kana or an explicitly supplied reading',() => {
  const sounds = {first:'あ',last:'ん'};
  assert.deepEqual(C.checkTurn({word:'モニュラッピ',mode:'shiritori',sounds}).sounds,{first:'も',last:'ぴ'});
  assert.deepEqual(C.checkTurn({word:'雲ぷる餅',reading:'くもぷるもち',mode:'shiritori',sounds}).sounds,{first:'く',last:'ち'});
});
test('category ids are a closed set and invalid saved ids stay unclassified',() => {
  assert.equal(C.CATEGORIES.length,7);
  assert.equal(C.categoryFor('person').label,'人っぽい');
  for (const value of [null,undefined,'__proto__','<script>','new']) assert.equal(C.categoryFor(value),null);
});
test('free mode allows final n while shiritori loses on final n',() => {
  assert.equal(C.checkTurn({word:'モチャペロン',mode:'free'}).status,'pending');
  assert.equal(C.checkTurn({word:'モチャペロン',mode:'shiritori'}).reason,'n');
  assert.equal(C.checkTurn({word:'モチャペロンー',mode:'shiritori'}).reason,'n');
});
test('duplicate words normalize hiragana and katakana',() => {
  const history = [{word:'モニュラッピ',identity:'もにゅらっぴ'}];
  assert.equal(C.checkTurn({word:'もにゅらっぴ',history}).reason,'repeat');
});
test('correct shiritori opening is pending, incorrect is a rule out',() => {
  assert.equal(C.checkTurn({word:'ぴょこなも',mode:'shiritori',required:'ぴ'}).status,'pending');
  assert.equal(C.checkTurn({word:'ぐるぴょな',mode:'shiritori',required:'ぴ'}).reason,'first');
});
test('Noul threshold policy is conservative and validates all boundaries',() => {
  assert.equal(C.fromNoul(0),'safe'); assert.equal(C.fromNoul(.25),'safe');
  assert.equal(C.fromNoul(.25001),'review'); assert.equal(C.fromNoul(.84999),'review');
  assert.equal(C.fromNoul(.85),'out'); assert.equal(C.fromNoul(1),'out');
  for (const value of [NaN, Infinity,-.1,1.01,'0.99',null,undefined]) assert.throws(() => C.fromNoul(value));
});
test('multi-angle judgment uses the strongest recognition, never a mean or summed probability',() => {
  const low = Object.fromEntries(C.PERSPECTIVES.map(view => [view.id,.02]));
  const result = C.assessExistence({...low,names:.9},.7,0,0);
  assert.equal(result.status,'out'); assert.equal(result.score,.9); assert.equal(result.strongest,'names');
  const allMedium = Object.fromEntries(C.PERSPECTIVES.map(view => [view.id,.4]));
  assert.equal(C.assessExistence(allMedium,.1,0,0).status,'review');
  assert.equal(C.assessExistence(allMedium,.1,0,0).score,.4);
  assert.equal(C.assessExistence(low,.8,0,0).status,'review');
  assert.equal(C.assessExistence(low,.1,0,0).status,'safe');
  assert.equal(C.assessExistence({...low,exists:.95,names:.95},.7,0,0).strongest,'names');
});
test('multi-angle boundaries and ambiguous-name guard are explicit and monotonic',() => {
  const scores = Object.fromEntries(C.PERSPECTIVES.map(view => [view.id,0]));
  for (const [score,risk,status] of [[.2,.44999,'safe'],[.20001,0,'review'],[.84999,0,'review'],[.85,0,'out'],[0,.45,'review'],[.99,1,'out']]) {
    assert.equal(C.assessExistence({...scores,specialist:score},risk,0,0).status,status,`${score}/${risk}`);
  }
  for (const bad of [undefined,null,'0.1',NaN,Infinity,-.1,1.01]) {
    assert.throws(() => C.assessExistence({...scores,culture:bad},.1,0,0));
    assert.throws(() => C.assessExistence(scores,bad,0,0));
    assert.throws(() => C.assessExistence(scores,.1,bad,0));
    assert.throws(() => C.assessExistence(scores,.1,0,bad));
  }
});
test('word-form checks guard compounds and sentences without turning familiar fragments into existence',() => {
  const low = Object.fromEntries(C.PERSPECTIVES.map(view => [view.id,.02]));
  for (const [risk,status,reason] of [[0,'safe','unrecognized'],[.44999,'safe','unrecognized'],[.45,'review','possible_'],[.84999,'review','possible_'],[.85,'out',''],[1,'out','']]) {
    for (const id of ['compound','sentence']) {
      const result = C.assessExistence(low,.1,id === 'compound' ? risk : .01,id === 'sentence' ? risk : .01);
      assert.equal(result.status,status); assert.equal(result.reason,status === 'safe' ? reason : reason+id);
      assert.equal(result.existenceScore,.02); assert.equal(result.score,Math.max(.02,risk));
    }
  }
  assert.equal(C.assessExistence(low,.1,.93,.98).reason,'sentence');
  assert.equal(C.assessExistence({...low,names:.99},.1,.93,.98).reason,'recognized');
  const mildCompound = C.assessExistence({...low,names:.3},.1,.4,.1);
  assert.equal(mildCompound.reason,'possible_match'); assert.match(C.assessmentMessage(mildCompound),/バンド・人名/);
  assert.equal(C.assessExistence(low,.8,.3,.1).reason,'name_caution');
});
test('demo dictionary does not pretend that unknown words are nonexistent',() => {
  const result = C.demoJudge('もにゅらっぴ');
  assert.equal(result.status,'review'); assert.equal(result.source,'demo'); assert.equal(result.probability,null);
});
test('demo recognizes common kana, kanji and already named fictional things',() => {
  for (const word of ['りんご','リンゴ','林檎','ドラゴン','ピカチュウ','ゆうれい','マンドラゴラ']) {
    const result = C.demoJudge(word); assert.equal(result.status,'out',word); assert.ok(result.meaning);
  }
});
test('demo checks the whole invented word, not merely a known part',() => {
  assert.equal(C.demoJudge('ふわみみぺんぎつね').status,'review');
  assert.equal(C.demoJudge('りんごもにゅぴょ').status,'review');
});
test('turns skip eliminated players and wrap around correctly',() => {
  const players = [{out:false},{out:true},{out:false},{out:true}];
  assert.equal(C.nextActive(players,0),2); assert.equal(C.nextActive(players,2),0);
  assert.equal(C.nextActive([{out:true},{out:true}],1),-1);
});
