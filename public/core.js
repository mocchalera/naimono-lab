/* Shared, dependency-free game rules. Works in a browser and in Node. */
(function (root) {
  'use strict';
  const SMALL = { 'ぁ':'あ','ぃ':'い','ぅ':'う','ぇ':'え','ぉ':'お','ゃ':'や','ゅ':'ゆ','ょ':'よ','っ':'つ','ゎ':'わ','ゕ':'か','ゖ':'け' };
  const KANA = /^[ぁ-ゖー]+$/u;
  const WORD = /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Letter}\p{Number}ー々〆ヶヵ]+$/u;
  const SOUNDS = Object.freeze(Array.from('あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽゔ'));
  const CATEGORIES = Object.freeze([
    {id:'food',label:'食べ物っぽい',symbol:'🍮'},
    {id:'animal',label:'動物っぽい',symbol:'🐾'},
    {id:'move',label:'技っぽい',symbol:'⚡'},
    {id:'person',label:'人っぽい',symbol:'👤'},
    {id:'tool',label:'道具っぽい',symbol:'🔧'},
    {id:'place',label:'場所っぽい',symbol:'🏝'},
    {id:'other',label:'ふしぎなもの',symbol:'✳'}
  ].map(Object.freeze));
  function categoryFor(id) { return CATEGORIES.find(category => category.id === id) || null; }
  const FLAVORS = Object.freeze([
    {id:'soft',label:'ふわふわ'}, {id:'bold',label:'つよそう'}, {id:'mysterious',label:'ミステリアス'},
    {id:'futuristic',label:'未来っぽい'}, {id:'cheerful',label:'ごきげん'}, {id:'natural',label:'すっとなじむ'}
  ].map(Object.freeze));
  function flavorFor(id) { return FLAVORS.find(flavor => flavor.id === id) || null; }
  const PERSPECTIVES = Object.freeze([
    {id:'exists',label:'全体の聞き覚え',hint:'ことば全体を知っている？'},
    {id:'everyday',label:'日常のことば',hint:'辞書・食べ物・生きものなど'},
    {id:'names',label:'バンド・人名',hint:'音楽グループ・芸名・人の名前'},
    {id:'culture',label:'作品・キャラクター',hint:'本・曲・ゲーム・技の名前'},
    {id:'places_products',label:'地名・商品名',hint:'場所・ブランド・会社の名前'},
    {id:'specialist',label:'専門用語',hint:'科学・技術・趣味のことば'},
    {id:'variants',label:'読み・表記違い',hint:'かな・英字・略称でも考える'}
  ].map(Object.freeze));
  const JUDGMENT_POLICY = Object.freeze({version:'multi-angle-v3',outAt:.85,safeAt:.20,nameCautionAt:.45});
  function unitScore(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1; }
  function assessExistence(input, nameRisk) {
    if (!input || !PERSPECTIVES.every(({id}) => unitScore(input[id])) || !unitScore(nameRisk)) throw new Error('Invalid judgment scores');
    const scores = Object.fromEntries(PERSPECTIVES.map(({id}) => [id,input[id]]));
    const strongest = PERSPECTIVES.reduce((best,view) => scores[view.id] > scores[best.id] || (scores[view.id] === scores[best.id] && best.id === 'exists') ? view : best).id;
    const score = scores[strongest];
    // These related model judgments are not independent probabilities. A single
    // specific match must not be averaged away by unrelated, low-scoring views.
    const status = score >= JUDGMENT_POLICY.outAt ? 'out' : score <= JUDGMENT_POLICY.safeAt && nameRisk < JUDGMENT_POLICY.nameCautionAt ? 'safe' : 'review';
    const reason = status === 'out' ? 'recognized' : status === 'safe' ? 'unrecognized' : score > JUDGMENT_POLICY.safeAt ? 'possible_match' : 'name_caution';
    return {version:JUDGMENT_POLICY.version,scores,nameRisk,score,strongest,status,reason};
  }
  function assessmentMessage(assessment) {
    const label = PERSPECTIVES.find(view => view.id === assessment.strongest)?.label || 'ことば';
    if (assessment.reason === 'recognized') return `「${label}」の観点で、既存のことばの強い手がかりがあったよ。`;
    if (assessment.reason === 'possible_match') return `「${label}」に気になる手がかり。あることばか、みんなで確かめよう。`;
    if (assessment.reason === 'name_caution') return '名前や専門用語かもしれないよ。知らないだけではセーフにせず、みんなで確認しよう。';
    return 'どの観点でも、既存のことばの強い手がかりは見つからなかったよ。';
  }
  function validSounds(value) { return Boolean(value && SOUNDS.includes(value.first) && SOUNDS.includes(value.last)); }
  function cleanWord(value) {
    if (typeof value !== 'string') return '';
    return value.normalize('NFKC').replace(/\s+/gu, '').replace(/^[「『]+|[」』。．.!！?？]+$/gu, '');
  }
  function toHiragana(value) {
    return cleanWord(value).replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  }
  function readingFor(word, supplied = '') {
    const native = toHiragana(word);
    if (KANA.test(native)) return native; // A supplied reading cannot override kana spelling.
    const reading = toHiragana(supplied);
    return KANA.test(reading) ? reading : '';
  }
  function sound(value) { return SMALL[value] || value; }
  function firstSound(reading) { return sound(Array.from(reading)[0] || ''); }
  function lastSound(reading) {
    // Public house rule: skip trailing ー, enlarge a final small kana. Do not fold dakuten.
    return sound(Array.from(reading.replace(/ー+$/u, '')).at(-1) || '');
  }
  function validateWord(raw, supplied = '', mode = 'free') {
    const word = cleanWord(raw);
    if (!word) return { ok:false, message:'ことばを いれてね。' };
    if (Array.from(word).length > 24) return { ok:false, message:'ことばは 24文字までにしてね。' };
    if (!WORD.test(word)) return { ok:false, message:'文字やカタカナ・漢字で、ことばをひとつ いれてね。' };
    if (/^\p{Number}+$/u.test(word)) return { ok:false, message:'数字だけではなく、ことばを いれてね。' };
    const reading = readingFor(word, supplied);
    if (cleanWord(supplied) && (!KANA.test(toHiragana(supplied)) || Array.from(toHiragana(supplied)).length > 40)) {
      return { ok:false, message:'よみかたは ひらがなかカタカナで いれてね。' };
    }
    if (mode === 'shiritori' && !reading) return { ok:false, needsReading:true, message:'しりとりのために、よみかたを いれてね。' };
    if (reading && !firstSound(reading).match(/[ぁ-ゖ]/u)) return { ok:false, message:'「ー」ではなく、音のある文字から はじめてね。' };
    return { ok:true, word, reading, identity:reading || toHiragana(word) };
  }
  function checkTurn({ word, reading = '', mode = 'free', required = '', history = [], sounds = null, deferReading = false }) {
    const valid = validateWord(word, reading);
    if (!valid.ok) return { status:'invalid', ...valid };
    if (history.some(h => (h.identity || readingFor(h.word, h.reading) || toHiragana(h.word)) === valid.identity || cleanWord(h.word) === valid.word)) {
      return { ...valid, status:'out', reason:'repeat', message:'そのことばは、もう出たよ！' };
    }
    if (mode === 'shiritori') {
      const resolved = valid.reading ? {first:firstSound(valid.reading),last:lastSound(valid.reading)} : validSounds(sounds) ? sounds : null;
      if (!resolved) return deferReading ? { ...valid, status:'pending' } : { ...valid, ok:false, status:'invalid', needsReading:true, message:'読みがわからなかったよ。しりとり用の よみかたを教えてね。' };
      valid.sounds = {first:resolved.first,last:resolved.last};
      if (required && resolved.first !== required) return { ...valid, status:'out', reason:'first', message:`「${required}」から はじまっていないよ。` };
      if (resolved.last === 'ん') return { ...valid, status:'out', reason:'n', message:'「ん」で おわっちゃった！' };
    }
    return { ...valid, status:'pending' };
  }
  function fromNoul(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error('Invalid Noul value');
    // Conservative game policy, not calibrated Japanese accuracy. Evaluate before public release.
    if (value >= 0.85) return 'out';
    if (value <= 0.25) return 'safe';
    return 'review';
  }
  // Small, deliberately transparent DEMO dictionary, not a claim of real-world nonexistence.
  const rows = [
    ['りんご','赤や緑のくだもの。','林檎'],['ばなな','黄色くて、細長いくだもの。','バナナ'],['みかん','皮をむいて食べる、かんきつのくだもの。','蜜柑'],
    ['いちご','赤い、小さなくだもの。','苺'],['ぶどう','実がふさになっているくだもの。','葡萄'],['もも','やわらかい果肉のくだもの。','桃'],
    ['すいか','しましまの皮をした、大きなくだもの。','西瓜'],['めろん','あまいくだもの。','メロン'],['さくらんぼ','小さな赤い実のくだもの。'],
    ['ねこ','「にゃー」と鳴くどうぶつ。','猫'],['いぬ','「わん」と鳴くどうぶつ。','犬'],['ぞう','鼻が長いどうぶつ。','象'],
    ['さる','木登りの得意などうぶつ。','猿'],['きりん','首が長いどうぶつ。','麒麟'],['うさぎ','耳の長いどうぶつ。','兎'],
    ['くま','大きなからだのどうぶつ。','熊'],['きつね','ふさふさのしっぽのどうぶつ。','狐'],['たぬき','イヌ科のどうぶつ。','狸'],
    ['ぱんだ','白と黒のどうぶつ。','パンダ'],['らいおん','たてがみのある大きなネコの仲間。','ライオン'],['とら','しましまの大きなネコの仲間。','虎'],
    ['りす','木の実を食べる、小さなどうぶつ。','栗鼠'],['かば','水辺にすむ、大きなどうぶつ。','河馬'],['うま','人を乗せて走るどうぶつ。','馬'],
    ['うし','「もー」と鳴くどうぶつ。','牛'],['ぶた','ぶうぶうと鳴くどうぶつ。','豚'],['ひつじ','毛がもこもこのどうぶつ。','羊'],
    ['やぎ','角があるどうぶつ。','山羊'],['いるか','海にすむ、ほ乳類。','海豚'],['くじら','海にすむ、大きなほ乳類。','鯨'],
    ['さめ','海にすむ魚。','鮫'],['たこ','腕が8本ある海の生きもの。','蛸'],['いか','海にすむ、軟体動物。','烏賊'],
    ['かに','はさみをもつ生きもの。','蟹'],['えび','海や川にすむ生きもの。','海老'],['かめ','こうらをもつ生きもの。','亀'],
    ['かえる','ぴょんと跳ぶ生きもの。','蛙'],['へび','脚のない、は虫類。','蛇'],['わに','水辺にすむ、は虫類。','鰐'],
    ['ぺんぎん','空は飛ばず、水を泳ぐ鳥。','ペンギン'],['すずめ','小さな鳥。','雀'],['からす','黒い羽をした鳥。','烏'],
    ['にわとり','こけこっこと鳴く鳥。','鶏'],['ひよこ','鳥のひな。'],['あひる','水鳥の仲間。','家鴨'],
    ['ちょうちょ','羽を広げて飛ぶ虫。','蝶々'],['かぶとむし','角のある虫。','カブトムシ'],['くわがた','大きなあごのある虫。','クワガタ'],
    ['せみ','夏によく鳴く虫。','蝉'],['とんぼ','細長い体の虫。','蜻蛉'],['あり','小さな虫。','蟻'],
    ['ごはん','炊いたお米や、食事のこと。','御飯'],['ぱん','小麦粉などから作る食べもの。','パン'],['ぷりん','たまごなどで作るおやつ。','プリン'],
    ['けーき','お祝いにも食べるおやつ。','ケーキ'],['すし','ごはんと具を組み合わせた食べもの。','寿司'],['らーめん','スープとめんの料理。','ラーメン'],
    ['うどん','小麦粉から作るめん。','饂飩'],['そば','めん料理。','蕎麦'],['ぴざ','丸い生地に具をのせて焼く料理。','ピザ'],
    ['かれー','スパイスを使う料理。','カレー'],['ちょこれーと','カカオから作るおやつ。','チョコレート'],['あいす','つめたいおやつなどを指すことば。','アイス'],
    ['おにぎり','ごはんを握った食べもの。'],['たまご','鳥などが産む卵。','卵'],['ぎゅうにゅう','牛のミルク。','牛乳'],
    ['みず','飲んだり、泳いだりする水。','水'],['おちゃ','茶の葉などを使った飲みもの。','お茶'],['とうふ','大豆から作る食べもの。','豆腐'],
    ['とまと','赤い実の野菜。','トマト'],['にんじん','オレンジ色の根菜。','人参'],['ぴーまん','野菜の名前。','ピーマン'],
    ['かぼちゃ','硬い皮をもつ野菜。','南瓜'],['じゃがいも','いもの仲間。'],['だいこん','白くて長い根菜。','大根'],
    ['くるま','タイヤで走る乗りもの。','車'],['でんしゃ','線路の上を走る乗りもの。','電車'],['ひこうき','空を飛ぶ乗りもの。','飛行機'],
    ['ふね','水の上を進む乗りもの。','船'],['ばす','大勢で乗れる車。','バス'],['じてんしゃ','ペダルをこぐ乗りもの。','自転車'],
    ['ろけっと','宇宙へ行くときにも使う乗りもの。','ロケット'],['しんかんせん','高速で走る電車。','新幹線'],
    ['いす','座る家具。','椅子'],['つくえ','ものを置く家具。','机'],['えんぴつ','字を書く道具。','鉛筆'],['けしごむ','鉛筆の字を消す道具。','消しゴム'],
    ['ほん','読むもの。','本'],['かさ','雨をよける道具。','傘'],['くつ','足にはくもの。','靴'],['ぼうし','頭にかぶるもの。','帽子'],
    ['とけい','時間を知る道具。','時計'],['めがね','顔にかけて使う道具。','眼鏡'],['はさみ','紙などを切る道具。','鋏'],
    ['てれび','番組などを見る機械。','テレビ'],['すまほ','電話などができる機械。','スマホ'],['でんわ','離れた人と話す道具。','電話'],
    ['ふうせん','空気などでふくらませるもの。','風船'],['ろぼっと','作業などをする機械。','ロボット'],['ぼーる','丸い遊び道具。','ボール'],
    ['たいよう','地球を照らす星。','太陽'],['つき','夜空に見える、地球の衛星。','月'],['ほし','空に見える天体。','星'],
    ['そら','見上げると広がる空。','空'],['くも','空に浮かぶ雲や、虫の仲間のクモ。','雲','蜘蛛'],['あめ','空から降る雨や、おやつの飴。','雨','飴'],
    ['ゆき','空から降る氷の結晶。','雪'],['にじ','空に見える、色の帯。','虹'],['やま','地面が高く盛り上がったところ。','山'],
    ['うみ','地球に広がる、塩水の水域。','海'],['かわ','水が流れているところ。','川'],['はな','植物の花や、顔の鼻。','花','鼻'],
    ['き','植物の木。','木'],['さくら','春に咲く花や、その木。','桜'],['ひまわり','大きな花の植物。','向日葵'],
    ['おばけ','お話などに登場する、すでにあることば。','お化け'],['ゆうれい','お話などに登場する、すでにあることば。','幽霊'],
    ['どらごん','伝説などに登場する、すでにある名前。','ドラゴン'],['ゆにこーん','物語などに登場する、すでにある名前。','ユニコーン'],
    ['まんどらごら','植物の名前。伝説にも登場する。','マンドラゴラ'],['つちのこ','すでに知られている、伝説の生きものの名前。','ツチノコ'],
    ['どらえもん','既存の作品のキャラクター名。','ドラえもん'],['ぴかちゅう','既存の作品のキャラクター名。','ピカチュウ'],
    ['あんぱんまん','既存の作品のキャラクター名。','アンパンマン'],['ぷりきゅあ','既存の作品の名前。','プリキュア'],
    ['もんじゃら','既存の作品のキャラクター名。','モンジャラ'],['かーびぃ','既存の作品のキャラクター名。','カービィ'],
    ['まりお','既存のキャラクター名や人名。','マリオ'],['ととろ','既存の作品のキャラクター名。','トトロ'],
    ['ありがとう','感謝を伝える、すでにあることば。'],['こんにちは','あいさつのことば。'],['おはよう','朝のあいさつ。'],
    ['さようなら','別れるときのあいさつ。'],['だいすき','好きな気持ちを表すことば。','大好き'],['せーふ','すでに使われていることば。','セーフ'],
    ['あうと','すでに使われていることば。','アウト'],['じしょ','ことばを調べる本など。','辞書'],['ことば','意味や音を伝える表現。','言葉'],
    ['ChatGPT','会話をするAIサービスの名前。'],
  ];
  const dictionary = new Map();
  for (const [kana, meaning, ...aliases] of rows) for (const alias of [kana, ...aliases]) dictionary.set(toHiragana(alias), { word:kana, meaning });
  function demoJudge(word, reading = '') {
    const entry = dictionary.get(toHiragana(word)) || (reading ? dictionary.get(toHiragana(reading)) : null);
    if (entry) return { status:'out', source:'demo', probability:null, meaning:entry.meaning, message:'おためし辞書に、のっていたよ。' };
    return { status:'review', source:'demo', probability:null, message:'おためし辞書にはないことば。みんなで決めてね。' };
  }
  function nextActive(players, current) {
    for (let step = 1; step <= players.length; step++) {
      const index = (current + step) % players.length;
      if (!players[index].out) return index;
    }
    return -1;
  }
  root.NaimonoCore = Object.freeze({ cleanWord, toHiragana, readingFor, firstSound, lastSound, validateWord, checkTurn, fromNoul, demoJudge, nextActive, SOUNDS, CATEGORIES, categoryFor, validSounds, FLAVORS, flavorFor, PERSPECTIVES, JUDGMENT_POLICY, unitScore, assessExistence, assessmentMessage });
})(globalThis);
