(() => {
  'use strict';
  const C = globalThis.NaimonoCore;
  const $ = id => document.getElementById(id);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const creature = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 240 250" aria-hidden="true"><use href="#creature-${name}"/></svg>`;
  const AVATARS = [ {name:'あおさん',avatar:'blue',color:'#b8c9f3'}, {name:'ももさん',avatar:'pink',color:'#efb3c7'}, {name:'だいだいさん',avatar:'orange',color:'#f6b37b'}, {name:'みどりさん',avatar:'green',color:'#c4eb6b'} ];
  const COLLECTION_KEY = 'naimono.collection.v1';
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  let playerCount = 2, names = AVATARS.map(x => x.name);
  let phase = 'home', game = null, turnToken = 0;
  let config = {judge:'demo',configured:false,model:null}, configNote = '';
  let remainingMs = 10000, deadline = 0, clock = null, lastBeep = null;
  let recognition = null, speechExpired = false, speechExpiryTimer = null, microphoneAllowed = false;
  let requestController = null, composing = false, result = null, currentWord = null;
  let audio = null, soundOn = false, toastTimer = null;
  let confirmCallback = null;
  let galleryCategory = 'all';
  const modalPauses = new WeakMap();
  let collection = loadCollection();

  function loadCollection() {
    try {
      const data = JSON.parse(localStorage.getItem(COLLECTION_KEY) || '[]');
      if (!Array.isArray(data)) return [];
      return data.filter(item => item && typeof item.word === 'string' && item.word.length <= 48 && ['blue','pink','orange','green'].includes(item.avatar) && ['jev','manual'].includes(item.source))
        .slice(-60).map(item => ({word:item.word,reading:typeof item.reading === 'string' ? item.reading.slice(0,40) : '',source:item.source,avatar:item.avatar,date:typeof item.date === 'string' ? item.date : '',category:C.categoryFor(item.category)?.id || null,flavor:C.flavorFor(item.flavor)?.id || null}));
    } catch { return []; }
  }
  function persistCollection() {
    try { localStorage.setItem(COLLECTION_KEY,JSON.stringify(collection)); }
    catch { toast('このブラウザでは保存できません。今回の発見は画面で見られます。'); }
    updateCollectionCount();
  }
  function updateCollectionCount() { $('collection-count').textContent = String(collection.length).padStart(2,'0'); }
  function toast(text) { clearTimeout(toastTimer); $('toast').textContent = text; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; },4500); }

  function chirp(type = 'tap') {
    if (!soundOn || document.hidden || recognition) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      const notes = type === 'safe' ? [523.25,659.25,783.99] : type === 'out' ? [329.63,261.63] : type === 'win' ? [523.25,659.25,783.99,1046.5] : [440];
      const duration = type === 'tick' ? .045 : .10;
      notes.forEach((freq,index) => {
        const oscillator = audio.createOscillator(), gain = audio.createGain();
        const start = audio.currentTime + index * .10;
        oscillator.type = 'sine'; oscillator.frequency.value = freq;
        gain.gain.setValueAtTime(0,start); gain.gain.linearRampToValueAtTime(.065,start+.009); gain.gain.exponentialRampToValueAtTime(.001,start+duration);
        oscillator.connect(gain); gain.connect(audio.destination);
        oscillator.start(start); oscillator.stop(start+duration+.02);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
    } catch { soundOn = false; updateSoundButton(); }
  }
  function updateSoundButton() {
    $('sound-button').innerHTML = icon(soundOn ? 'sound':'mute');
    $('sound-button').setAttribute('aria-pressed',String(soundOn));
    $('sound-button').setAttribute('aria-label',soundOn ? '効果音をオフにする':'効果音をオンにする');
  }
  function renderNames() {
    $('player-count').innerHTML = `${playerCount}<span>人</span>`;
    $('players-minus').disabled = playerCount <= 2; $('players-plus').disabled = playerCount >= 4;
    $('player-names').innerHTML = AVATARS.slice(0,playerCount).map((p,i) => `<label class="player-name">${creature(p.avatar)}<input aria-label="プレイヤー${i+1}の名前" data-player="${i}" value="${escapeHTML(names[i])}" maxlength="10"></label>`).join('');
    $('player-names').querySelectorAll('input').forEach(input => input.addEventListener('input',() => { names[Number(input.dataset.player)] = input.value; }));
  }
  function renderConfig() {
    const live = config.judge === 'jev';
    $('judge-label').textContent = live ? 'Jevで判定 / サーバー設定あり' : 'おためしモード / Jev未接続';
    $('judge-badge').classList.toggle('is-live',live);
    $('setup-note').textContent = live ? 'モデルの判断を使います。まちがったら、みんなで訂正。' : (configNote || '小さな辞書で体験。辞書にないことばは、みんなで判定。');
    $('settings-status').innerHTML = live ? `Cloudflare Workers AI経由でJevを使います。<small>${escapeHTML(config.model || 'typesafe/jev')} ／ 実際の接続は、ことばを送ったときに確認します。</small>` : 'いまは、おためしモードです。<small>Workers AIは使っていません。おためし辞書にないことばは、みんなで決めます。</small>';
    $('judge-note').textContent = live ? 'Jevの判断であそびます。世界に存在しないことの証明ではありません。まちがいは訂正できます。' : 'Jev未接続。小さな辞書にないことばは、みんなの判定で進めます。';
  }
  async function initConfig() {
    $('start-button').disabled = true;
    if (location.protocol !== 'file:' && globalThis.NAIMONO_STANDALONE !== true) {
      try {
        const response = await fetch('/api/config',{signal:AbortSignal.timeout(4000)});
        if (!response.ok) throw new Error('config unavailable');
        const value = await response.json();
        if (!['demo','jev'].includes(value.judge)) throw new Error('invalid config');
        config = value;
      } catch { configNote = '接続設定を確認できなかったため、おためし辞書で遊べます。'; }
    }
    renderConfig(); $('start-button').disabled = false;
  }

  function setScreen(screen) {
    $('home-screen').hidden = screen !== 'home'; $('play-screen').hidden = screen !== 'play'; $('finish-screen').hidden = screen !== 'finish';
  }
  function stopClock() {
    if (clock) remainingMs = Math.max(0,deadline - performance.now());
    clearInterval(clock); clock = null;
    $('timer').classList.add('countdown-paused');
  }
  function updateTimer() {
    const unlimited = game?.seconds === 0;
    const seconds = unlimited ? '∞' : String(Math.max(0,Math.ceil(remainingMs/1000)));
    $('timer-value').textContent = seconds;
    $('timer').setAttribute('aria-label',unlimited ? '時間制限なし' : `残り${seconds}秒`);
    $('timer').style.setProperty('--remaining',unlimited ? '1' : String(Math.max(0,Math.min(1,remainingMs/(game.seconds*1000)))));
    $('timer').classList.toggle('urgent',!unlimited && remainingMs <= 3000 && remainingMs > 0);
  }
  function startClock() {
    if (!game || game.seconds === 0 || clock || phase !== 'thinking') return;
    $('timer').classList.remove('countdown-paused');
    deadline = performance.now() + remainingMs;
    clock = setInterval(() => {
      remainingMs = Math.max(0,deadline - performance.now()); updateTimer();
      const s = Math.ceil(remainingMs/1000);
      if (s > 0 && s <= 3 && lastBeep !== s) { lastBeep = s; chirp('tick'); }
      if (remainingMs <= 0) expireTurn();
    },80);
  }
  function beginThinking() {
    if (phase !== 'ready') return;
    phase = 'thinking'; $('phase-badge').textContent = 'ことばを、はっけん中';
    $('lab-message').textContent = 'どんな へんてこが生まれるかな？'; startClock();
  }
  function stopRecognition() {
    clearTimeout(speechExpiryTimer); speechExpiryTimer = null; speechExpired = false;
    if (recognition) {
      const old = recognition; recognition = null;
      old.onresult = old.onerror = old.onend = old.onstart = null;
      try { old.abort(); } catch { /* Some browsers have already stopped. */ }
    }
    $('mic-button').classList.remove('listening');
    $('mic-button').setAttribute('aria-label','音声で答える');
  }
  function cleanupTurn() {
    stopClock(); stopRecognition(); requestController?.abort(); requestController = null;
    $('arena').querySelectorAll('.confetti').forEach(el => el.remove());
  }
  function startGame(reuse = false) {
    cleanupTurn(); turnToken++;
    if (!reuse || !game) {
      game = {
        mode:document.querySelector('input[name="mode"]:checked').value,
        seconds:Number(document.querySelector('input[name="time"]:checked').value),
        players:AVATARS.slice(0,playerCount).map((p,i) => ({...p,name:names[i].trim().slice(0,10) || p.name,out:false})),
        current:0,turn:1,history:[],required:''
      };
    } else { game = {...game,current:0,turn:1,history:[],required:'',players:game.players.map(p => ({...p,out:false}))}; }
    setScreen('play'); $('game-mode').textContent = game.mode === 'shiritori' ? 'ナイモノしりとり' : 'なんでもナイモノ';
    renderHistory(); prepareTurn(); window.scrollTo({top:0,behavior:'instant'}); chirp();
  }
  function renderPlayers() {
    $('players-strip').style.setProperty('--player-count',game.players.length);
    $('players-strip').classList.toggle('many',game.players.length > 2);
    $('players-strip').innerHTML = game.players.map((p,i) => `<div class="player-chip ${i === game.current && !p.out ? 'active' : ''} ${p.out ? 'eliminated' : ''}" style="--player-color:${p.color}" ${i === game.current ? 'aria-current="true"' : ''}>${creature(p.avatar)}<span><strong>${escapeHTML(p.name)}</strong><small>${p.out ? 'おやすみ' : i === game.current ? 'いま、あなたのばん' : 'じゅんばん待ち'}</small></span></div>`).join('');
  }
  function prepareTurn() {
    cleanupTurn(); turnToken++; phase = 'ready'; result = null; currentWord = null;
    remainingMs = game.seconds * 1000; lastBeep = null;
    $('input-stage').hidden = false; $('judging-stage').hidden = true; $('verdict-stage').hidden = true;
    $('phase-badge').textContent = 'じゅんび OK？'; $('turn-title').textContent = `${game.players[game.current].name}の ばん！`;
    $('turn-prompt').innerHTML = game.mode === 'shiritori' && game.required ? `<span class="required-kana">${escapeHTML(game.required)}</span> からはじまる、ないことば。` : 'この世にないことばを、ひとつ。';
    $('turn-count').textContent = `TURN ${String(game.turn).padStart(2,'0')}`;
    $('word-input').value = ''; $('reading-input').value = ''; $('reading-wrap').hidden = true;
    $('form-error').hidden = true; $('word-input').disabled = false; $('submit-button').disabled = false;
    $('lab-message').textContent = ['でたらめで、だいじょうぶ。','きみの頭の中、のぞいてみたい。','まだない名前、つけてみよう。'][game.turn % 3];
    $('input-hint').textContent = '漢字・カタカナもOK。スペースは自動でつめるよ。';
    $('mic-button').disabled = !Speech; $('mic-button').title = Speech ? '音声で入力。聞き取った文字のまま判定できます。' : '音声入力に対応していません。文字であそべます。';
    $('submit-button').innerHTML = `このことばで、判定！${icon('arrow')}`;
    updateTimer(); renderPlayers();
  }
  function refreshReading() {
    const word = C.cleanWord($('word-input').value);
    $('reading-wrap').hidden = !(game?.mode === 'shiritori' && word && !C.readingFor(word) && (config.judge !== 'jev' || $('reading-input').value));
  }
  function expireTurn() {
    stopClock(); remainingMs = 0; updateTimer();
    if (!['thinking','ready'].includes(phase)) return;
    phase = 'confirm'; $('phase-badge').textContent = 'ことばを、かくにん';
    $('input-hint').textContent = '時間です！いまのことばを確認して、判定しよう。';
    if (recognition) {
      speechExpired = true;
      try { recognition.stop(); } catch { /* Finalize below. */ }
      const token = turnToken;
      speechExpiryTimer = setTimeout(() => { if (token === turnToken && phase === 'confirm' && speechExpired) finishExpiredInput(); },1500);
    } else finishExpiredInput();
  }
  function finishExpiredInput() {
    const word = C.cleanWord($('word-input').value);
    stopRecognition();
    if (word) { phase = 'confirm'; refreshReading(); $('lab-message').textContent = 'このことばで、あってる？'; }
    else { currentWord = {word:'',reading:'',identity:''}; showResult({status:'out',source:'rule',reason:'time',message:'時間の中に、ことばが出なかったね。'}); }
  }
  function showFormError(message, needsReading = false) {
    stopClock(); phase = 'confirm'; $('form-error').textContent = message; $('form-error').hidden = false;
    $('phase-badge').textContent = 'ことばを、かくにん';
    if (needsReading) { $('reading-wrap').hidden = false; $('reading-input').focus(); }
  }

  async function submitWord(event) {
    event?.preventDefault();
    if (composing || !['ready','thinking','confirm'].includes(phase)) return;
    stopClock(); stopRecognition(); $('form-error').hidden = true;
    const checked = C.checkTurn({word:$('word-input').value,reading:$('reading-input').value,mode:game.mode,required:game.required,history:game.history,deferReading:config.judge === 'jev'});
    if (checked.status === 'invalid') { showFormError(checked.message,checked.needsReading); return; }
    currentWord = checked;
    if (checked.status === 'out') { showResult({...checked,source:'rule'}); return; }
    await judgeCurrent();
  }
  async function judgeCurrent() {
    if (!currentWord || !game) return;
    const token = turnToken;
    phase = 'judging'; $('input-stage').hidden = true; $('verdict-stage').hidden = true; $('judging-stage').hidden = false;
    $('phase-badge').textContent = 'しんぱん中'; $('judging-word').textContent = currentWord.word;
    $('submit-button').disabled = true;
    try {
      let value;
      if (config.judge === 'demo') {
        value = C.demoJudge(currentWord.word,currentWord.reading);
        await new Promise(resolve => setTimeout(resolve,350)); // Presentation only; no invented latency claims.
      } else {
        requestController = new AbortController();
        const timeout = setTimeout(() => requestController?.abort(),13000);
        try {
          const response = await fetch('/api/judge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word:currentWord.word,reading:currentWord.reading,mode:game.mode}),signal:requestController.signal});
          const data = await response.json();
          if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'しんぱんに接続できませんでした。');
          if (!['safe','out','review'].includes(data.status) || data.source !== 'jev') throw new Error('Jevの判定を確認できません。サーバーの設定を確認してください。');
          value = data;
        } finally { clearTimeout(timeout); requestController = null; }
      }
      if (token !== turnToken || phase !== 'judging') return;
      if (C.validSounds(value.sounds)) currentWord.sounds = value.sounds;
      if (value.status !== 'out' && !resolveCurrentSounds()) return;
      showResult(value);
    } catch (error) {
      if (token !== turnToken || phase !== 'judging') return;
      const message = error.name === 'AbortError' ? '返事が間に合いませんでした。負けにはなりません。' : error.message || 'しんぱんにつながりませんでした。';
      showResult({status:'error',source:'error',message});
    }
  }
  function resolveCurrentSounds() {
    const checked = C.checkTurn({...currentWord,mode:game.mode,required:game.required,history:game.history});
    if (checked.status === 'invalid') { editWord(); showFormError(checked.message,checked.needsReading); return false; }
    currentWord = checked;
    if (checked.status === 'out') { showResult({...checked,source:'rule'}); return false; }
    return true;
  }
  function categoryBadge(category) {
    const value = C.categoryFor(category);
    return value ? `<span class="category-badge" data-category-id="${value.id}"><span aria-hidden="true">${value.symbol}</span>${value.label}</span>` : '';
  }
  function flavorBadge(flavor) {
    const value = C.flavorFor(flavor);
    return value ? `<span class="flavor-badge">語感は、${value.label}</span>` : '';
  }
  function refereeReaction(value, art) {
    const category = C.categoryFor(value.category), flavor = C.flavorFor(value.flavor);
    if (!category && !flavor) return creature(art,'verdict-art');
    const impressions = {
      soft:'ふわふわの予感！', bold:'つよそうな響き！', mysterious:'ひみつがありそう！',
      futuristic:'未来から来たみたい！', cheerful:'なんだか、ごきげん！', natural:'すっと、なじむ名前！'
    };
    const title = category ? category.id === 'other' ? 'ふしぎなものっぽい！' : `${category.label}！` : impressions[flavor.id];
    return `<div class="referee-reaction" data-impression="${category?.id || 'other'}">${creature(art,'verdict-art')}<div class="referee-bubble"><small>Jevのひらめき</small><strong><span class="referee-symbol" aria-hidden="true">${category?.symbol || '✳'}</span>${title}</strong>${category && flavor ? `<span class="referee-flavor">${impressions[flavor.id]}</span>` : ''}<span class="referee-caption">名前から想像したよ</span></div></div>`;
  }
  function scoreLabel(value) {
    const score = value * 100, rounded = Math.round(score);
    // Keep rounded labels from appearing to cross the decision thresholds.
    if ([30,35,45,85].includes(rounded) && score !== rounded) return `${score < rounded ? '<' : '>'}${rounded}`;
    return String(rounded);
  }
  function judgmentPanel(value) {
    let assessment;
    try { assessment = C.assessExistence(value.assessment?.scores,value.assessment?.nameRisk,value.assessment?.compoundRisk,value.assessment?.sentenceRisk); } catch { /* Older responses may only contain the original single score. */ }
    const score = assessment?.score ?? value.probability;
    if (!C.unitScore(score)) return '';
    const heading = `<div class="judgment-heading"><div><span>Jevの総合スコア</span><h3>総合スコア</h3><small>高いほど、アウトの手がかり</small></div><div class="judgment-total"><strong>${escapeHTML(scoreLabel(score))}</strong><span> / 100</span></div></div>`;
    const manualNote = value.source === 'manual' ? '<p class="manual-score-note">勝敗は、みんなの判断で変更しました。スコアはJevの元の判断です。</p>' : '';
    if (!assessment) return `<section class="judgment-panel" aria-label="Jevの判定スコア">${heading}<details class="score-details"><summary>どうして？ 判定の内訳</summary><p class="score-note">詳しい内訳は届いていません。数値はJevの判断で、実在の確率ではありません。</p></details>${manualNote}</section>`;
    const strongest = [...C.PERSPECTIVES,C.COMPOUND_PERSPECTIVE,C.SENTENCE_PERSPECTIVE].find(view => view.id === assessment.strongest);
    const row = ({id,label,hint},score) => `<div class="score-row ${id === assessment.strongest ? 'strongest' : ''}" data-score="${id}"><dt><strong>${label}</strong><small>${hint}</small></dt><dd><meter min="0" max="100" value="${score*100}" aria-label="${label}のスコア"></meter><span>${escapeHTML(scoreLabel(score))}</span></dd></div>`;
    const {outAt,safeAt,nameCautionAt,structureReviewAt} = C.JUDGMENT_POLICY;
    const helper = value.fallback ? `<div class="assistant-evidence"><strong>助っ人の追加確認</strong><p>${value.fallback.state === 'completed' ? escapeHTML(value.fallback.answer?.detail || '具体的な手がかりを追加確認したよ。') : '追加確認できなかったため、勝敗はみんなで決められます。'}</p><small>Jevの元の数値は変えず、追加の手がかりで判定しています。モデルの記憶で、Web検索の結果ではありません。</small></div>` : '';
    return `<section class="judgment-panel" data-assessment="${assessment.status}" aria-label="Jevの判定スコア">${heading}<details class="score-details"><summary>どうして？ 判定の内訳</summary><p class="judgment-basis">実在の7観点と、つぎはぎ・文章をチェック。いちばん強い手がかりは「${strongest.label}」。</p><dl class="score-list">${C.PERSPECTIVES.map(view => row(view,assessment.scores[view.id])).join('')}${row(C.COMPOUND_PERSPECTIVE,assessment.compoundRisk)}${row(C.SENTENCE_PERSPECTIVE,assessment.sentenceRisk)}</dl><dl class="name-caution">${row({id:'name_risk',label:'名前かも',hint:'未知の固有名詞・専門語を見落としていない？'},assessment.nameRisk)}</dl><p class="score-policy">実在・つぎはぎ・文章のどれか${outAt*100}以上でアウト。実在が全部${safeAt*100}以下で、「名前かも」が${nameCautionAt*100}未満、つぎはぎ・文章も${structureReviewAt*100}未満ならセーフ。その間は助っ人にも確認し、争点が残るときはみんなで審議。</p>${helper}<p class="score-note">実在・つぎはぎ・文章のうち、いちばん高い値が総合スコア。つぎはぎ・文章判定は、実在するという意味ではありません。数値はJevの判断で、実在の確率や検索結果ではありません。</p></details>${manualNote}</section>`;
  }
  function showResult(value) {
    phase = 'verdict'; result = value;
    stopClock(); stopRecognition();
    $('arena').querySelectorAll('.confetti').forEach(el => el.remove());
    $('input-stage').hidden = true; $('judging-stage').hidden = true; $('verdict-stage').hidden = false;
    $('phase-badge').textContent = value.status === 'error' ? '接続を、かくにん' : value.status === 'review' ? 'みんなで、しんぱん' : 'はんてい結果';
    const word = currentWord?.word || '';
    const safe = value.status === 'safe', out = value.status === 'out', review = value.status === 'review', error = value.status === 'error';
    const decisionReason = value.decisionReason || value.assessment?.reason;
    const compoundCheck = ['compound','possible_compound'].includes(decisionReason);
    const sentenceCheck = ['sentence','possible_sentence'].includes(decisionReason);
    const title = safe ? 'ナイモノ、はっけん！' : out ? (value.source === 'rule' ? (value.reason === 'time' ? 'じかん、きちゃった！' : value.reason === 'pass' ? '今回は、おやすみ！' : value.reason === 'n' ? '「ん」で おしまい！' : value.reason === 'repeat' ? 'それ、もう出た！' : 'つながらなかった！') : value.source === 'manual' ? 'みんなで、アウト！' : sentenceCheck ? '文章に、なってる！' : compoundCheck ? 'ことばの、つぎはぎ！' : 'それ、あるって！') : review ? (sentenceCheck ? '名前かな？ 文章かな？' : compoundCheck ? 'つぎはぎかも？' : 'ある？ ない？ どっちだろう。') : 'しんぱん、ひとやすみ。';
    const stamp = safe ? 'NEW NAIMONO!' : out ? (sentenceCheck ? 'SENTENCE! OUT!' : compoundCheck ? 'MIX! OUT!' : 'OH! NO!') : review ? 'HMM…?' : 'NO PENALTY';
    const art = safe ? game.players[game.current].avatar : out ? 'pink' : 'green';
    const scores = judgmentPanel(value);
    let buttons;
    if (review) {
      buttons = `<button class="primary-button" data-verdict="safe">新しいことば！ セーフ${icon('check')}</button><button class="secondary-button" data-verdict="out">${sentenceCheck ? '文章になってる！' : compoundCheck ? 'ことばのつぎはぎ！' : 'それ知ってる！'} アウト</button><button class="text-button appeal" data-verdict="edit">ことばを直す</button>`;
    } else if (error) {
      buttons = `<button class="primary-button" data-verdict="retry">もう一度、つなぐ${icon('reset')}</button><button class="secondary-button" data-verdict="manual">みんなで判定して、続ける</button><button class="text-button appeal" data-verdict="edit">ことばを直す</button>`;
    } else {
      const last = out && game.players.filter(p => !p.out).length === 2;
      buttons = `<button class="primary-button" data-verdict="next">${last ? 'けっかを、見よう！' : 'つぎの人に、わたそう'}${icon('arrow')}</button><button class="text-button appeal" data-verdict="${value.source === 'rule' ? 'edit' : 'appeal'}">${value.source === 'rule' ? '入力・聞きまちがいだった' : 'ちょっと待った！ 判定を直す'}</button>`;
    }
    $('verdict-stage').className = `verdict-stage ${value.status}`;
    const sounds = game.mode === 'shiritori' && !currentWord?.reading && C.validSounds(currentWord?.sounds) ? `<p class="sound-note">しりとりの音：${escapeHTML(currentWord.sounds.first)} → ${escapeHTML(currentWord.sounds.last)}</p>` : '';
    const discussion = value.discussion;
    const discussionBox = value.source !== 'manual' && discussion?.prompt && (discussion.level === 'optional' || (discussion.level === 'required' && review)) ? `<aside class="discussion-box ${discussion.level}" aria-label="${discussion.level === 'required' ? 'みんなで審議' : 'おしゃべりのタネ'}"><strong>${discussion.level === 'required' ? 'みんなで、審議！' : 'おしゃべりのタネ'}</strong><p>${escapeHTML(discussion.prompt)}</p>${discussion.level === 'optional' ? '<small>お話ししながら、次へ進んでOK。</small>' : ''}</aside>` : '';
    $('verdict-stage').innerHTML = `<span class="verdict-stamp">${stamp}</span>${refereeReaction(value,art)}<div class="verdict-word">${escapeHTML(word)}</div><h2 class="verdict-title">${title}</h2>${scores}<p class="verdict-message">${value.decisionBy === 'assistant' ? '<span class="assistant-badge">助っ人も確認！</span>' : ''}${escapeHTML(value.message)}</p>${discussionBox}${sounds}${value.meaning ? `<div class="meaning-box">${escapeHTML(value.meaning)}</div>` : ''}<div class="verdict-actions">${buttons}</div>`;
    $('verdict-stage').querySelectorAll('[data-verdict]').forEach(button => button.addEventListener('click',() => handleVerdict(button.dataset.verdict)));
    if (safe) { chirp('safe'); confetti(); } else if (out) chirp('out');
  }
  function handleVerdict(action) {
    if (phase !== 'verdict') return;
    if (action === 'next') { commitResult(); return; }
    if (action === 'retry') { judgeCurrent(); return; }
    if (action === 'edit') { editWord(); return; }
    if (action === 'appeal' || action === 'manual') {
      showResult({...result,status:'review',source:'manual',meaning:null,message:'みんなが納得するほうを、選んでね。'}); return;
    }
    if (action === 'safe' && !resolveCurrentSounds()) return;
    if (action === 'safe' || action === 'out') showResult({...result,status:action,source:'manual',meaning:null,message:action === 'safe' ? 'みんなで、ないことばに決定！' : 'みんなで、アウトに決定。'});
  }
  function editWord() {
    $('verdict-stage').hidden = true; $('input-stage').hidden = false; $('judging-stage').hidden = true;
    $('submit-button').disabled = false; phase = 'confirm';
    $('phase-badge').textContent = 'ことばを、かくにん'; $('lab-message').textContent = '聞きまちがいは、直してね。';
    $('input-hint').textContent = '確認中は、じかんが止まっています。';
    $('word-input').value = currentWord?.word || ''; $('reading-input').value = currentWord?.reading || ''; refreshReading();
    if (game.mode === 'shiritori' && !C.readingFor(currentWord?.word)) $('reading-wrap').hidden = false;
    $('word-input').focus();
  }
  function commitResult() {
    if (!['safe','out'].includes(result?.status)) return;
    const p = game.players[game.current];
    if (result.status === 'safe') {
      const entry = {word:currentWord.word,reading:currentWord.reading,identity:currentWord.identity,source:result.source === 'jev' ? 'jev' : 'manual',avatar:p.avatar,date:new Date().toISOString(),category:C.categoryFor(result.category)?.id || null,flavor:C.flavorFor(result.flavor)?.id || null};
      game.history.push(entry);
      const existing = collection.find(x => (C.readingFor(x.word,x.reading) || C.toHiragana(x.word)) === entry.identity || C.cleanWord(x.word) === entry.word);
      if (!existing) { collection.push(entry); collection = collection.slice(-60); persistCollection(); }
      else if ((!existing.category && entry.category) || (!existing.flavor && entry.flavor)) { existing.category ||= entry.category; existing.flavor ||= entry.flavor; persistCollection(); }
      if (game.mode === 'shiritori') game.required = currentWord.sounds.last;
      renderHistory();
    } else p.out = true;
    if (game.players.filter(x => !x.out).length <= 1) { finishGame(); return; }
    game.current = C.nextActive(game.players,game.current); game.turn++;
    prepareTurn(); $('play-screen').scrollIntoView({block:'start',behavior:'instant'});
  }
  function renderHistory() {
    $('session-count').textContent = String(game.history.length).padStart(2,'0');
    if (!game.history.length) { $('session-history').innerHTML = '<div class="empty-notebook"><span>?</span><p>まだ、まっしろ。<br>さいしょの発見は、だれかな？</p></div>'; return; }
    $('session-history').innerHTML = game.history.map((item,index) => `<div class="history-entry">${creature(item.avatar)}<div><strong>${escapeHTML(item.word)}</strong><small>${C.categoryFor(item.category)?.label || (item.source === 'jev' ? 'Jevの判定' : 'みんなで決定')}</small></div><span class="entry-num">${String(index+1).padStart(2,'0')}</span></div>`).join('');
    $('session-history').scrollTop = $('session-history').scrollHeight;
  }
  function finishGame() {
    cleanupTurn(); turnToken++; phase = 'finish';
    const winner = game.players.find(x => !x.out);
    $('winner-art').innerHTML = creature(winner?.avatar || 'green');
    $('finish-title').textContent = `${winner?.name || 'みんな'}、ナイモノ名人！`;
    $('finish-description').textContent = game.history.length ? `きょうは ${game.history.length}個のナイモノが 生まれました。` : '次は、どんな へんてこが生まれるかな？';
    $('finish-words').innerHTML = game.history.map(h => `<span class="word-pill">${escapeHTML(h.word)}</span>`).join('');
    setScreen('finish'); window.scrollTo({top:0,behavior:'instant'}); chirp('win');
  }
  function goHome() {
    cleanupTurn(); turnToken++; phase = 'home'; setScreen('home'); window.scrollTo({top:0,behavior:'instant'});
  }
  function confirmExit() {
    if (phase === 'home' || phase === 'finish') { goHome(); return; }
    askConfirm('いったん、やめる？','見つけたナイモノは図鑑に残ります。途中の対戦は終わります。','やめて、もどる',goHome);
  }
  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#c4eb6b','#efb3c7','#b8c9f3','#f6b37b'];
    for (let i = 0; i < 28; i++) {
      const piece = document.createElement('i'); piece.className = 'confetti'; piece.setAttribute('aria-hidden','true');
      piece.style.setProperty('--x',`${2+i*3.5}%`); piece.style.setProperty('--delay',`${(i%6)*.07}s`); piece.style.setProperty('--confetti-color',colors[i%4]);
      $('arena').append(piece); piece.addEventListener('animationend',() => piece.remove(),{once:true});
    }
  }

  function openModal(id) {
    const dialog = $(id), wasClock = Boolean(clock), token = turnToken;
    stopClock();
    if (recognition) {
      stopRecognition(); phase = $('word-input').value.trim() ? 'confirm':'ready';
      $('input-hint').textContent = '音声入力を止めました。確認してから、続けてね。';
    }
    modalPauses.set(dialog,{wasClock,token}); dialog.showModal();
  }
  function askConfirm(title,message,yes,callback) {
    $('confirm-title').textContent = title; $('confirm-message').textContent = message; $('confirm-yes').textContent = yes;
    confirmCallback = callback; openModal('confirm-dialog');
  }
  function renderGallery() {
    const pending = {id:'unclassified',label:'これから分類',symbol:'?'};
    const groups = [...C.CATEGORIES,pending].map(category => ({...category,entries:collection.map((entry,index) => ({...entry,number:index+1})).filter(entry => (entry.category || 'unclassified') === category.id)}));
    const discovered = groups.filter(group => group.id !== 'unclassified' && group.entries.length).length;
    if (galleryCategory === 'unclassified' && !groups.at(-1).entries.length) galleryCategory = 'all';
    $('gallery-progress').textContent = `${discovered} / ${C.CATEGORIES.length} カテゴリーで発見！ · ${collection.length}個のナイモノ`;
    const filters = [{id:'all',label:'ぜんぶ',symbol:'',entries:collection},...groups.filter(group => group.id !== 'unclassified' || group.entries.length)];
    $('gallery-categories').innerHTML = filters.map(group => `<button type="button" class="category-filter ${group.entries.length ? 'discovered' : ''}" data-category="${group.id}" aria-pressed="${galleryCategory === group.id}"><span aria-hidden="true">${group.symbol}</span><span>${group.label}</span><b>${group.entries.length}</b></button>`).join('');
    $('clear-collection').hidden = !collection.length;
    const visible = groups.filter(group => galleryCategory === 'all' ? group.entries.length : group.id === galleryCategory);
    $('gallery-grid').innerHTML = visible.length ? visible.map(group => `<section class="gallery-section" aria-labelledby="category-heading-${group.id}"><h3 id="category-heading-${group.id}" class="category-heading"><span aria-hidden="true">${group.symbol}</span>${group.label}<small>${group.entries.length}個 はっけん</small></h3><div class="gallery-grid">${group.entries.length ? group.entries.map(entry => `<article class="discovery-card"><small>NO. ${String(entry.number).padStart(3,'0')}</small>${creature(entry.avatar)}<h3>${escapeHTML(entry.word)}</h3>${categoryBadge(entry.category)}${flavorBadge(entry.flavor)}<span>${entry.source === 'jev' ? 'Jevが知らないと判定' : 'みんなで決めたナイモノ'}</span></article>`).join('') : '<p class="gallery-empty">このなかまは、まだ見つかっていないよ。<br>さいしょの発見は、どんな名前かな？</p>'}</div></section>`).join('') : '<p class="gallery-empty">まだ、まっしろな図鑑。<br>遊びながら、いろんななかまを集めよう。</p>';
  }
  function startSpeech() {
    if (!game || !['ready','thinking','confirm'].includes(phase)) return;
    if (!Speech) { toast('音声入力には対応していません。文字を入力してあそべます。'); $('word-input').focus(); return; }
    if (!microphoneAllowed) { openModal('mic-dialog'); return; }
    if (recognition) {
      stopClock(); phase = 'confirm'; $('phase-badge').textContent = 'ことばを、かくにん';
      try { recognition.stop(); } catch { stopRecognition(); }
      return;
    }
    const token = turnToken;
    const r = new Speech(); recognition = r; speechExpired = false;
    r.lang = 'ja-JP'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    $('lab-message').textContent = 'マイクの じゅんび中。';
    let failed = false;
    r.onstart = () => {
      if (token !== turnToken || recognition !== r) return;
      beginThinking(); $('mic-button').classList.add('listening'); $('mic-button').setAttribute('aria-label','音声入力を止める');
      $('input-hint').textContent = '聞いているよ。マイクをもう一度押すと、止まります。'; $('lab-message').textContent = 'きみの、へんてこを聞かせて。';
    };
    r.onresult = event => {
      if (token !== turnToken || recognition !== r || !['ready','thinking','confirm'].includes(phase)) return;
      let text = '';
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
      $('word-input').value = C.cleanWord(text).slice(0,48); $('reading-input').value = ''; refreshReading();
    };
    r.onerror = event => {
      if (token !== turnToken || recognition !== r) return;
      failed = true; stopClock(); stopRecognition();
      phase = $('word-input').value.trim() ? 'confirm' : 'ready';
      if (phase === 'ready') { remainingMs = game.seconds*1000; updateTimer(); }
      const message = ['not-allowed','service-not-allowed'].includes(event.error) ? 'マイクを使えません。文字を入力して遊べます。' : event.error === 'no-speech' ? '声が聞き取れませんでした。もう一度か、文字でどうぞ。' : '音声を聞き取れませんでした。負けにはなりません。文字でも遊べます。';
      $('input-hint').textContent = message; $('phase-badge').textContent = '入力を、かくにん'; $('lab-message').textContent = '文字でも、だいじょうぶ。';
    };
    r.onend = () => {
      if (token !== turnToken || recognition !== r || failed) return;
      const wasExpired = speechExpired;
      stopClock(); stopRecognition();
      if (wasExpired) { finishExpiredInput(); return; }
      if ($('word-input').value.trim()) {
        phase = 'confirm'; $('phase-badge').textContent = 'ことばを、かくにん';
        $('lab-message').textContent = 'このことばで、あってる？';
        $('input-hint').textContent = 'スペースは自動でつめるよ。聞きまちがいだけ直してね。';
      } else {
        phase = 'ready'; remainingMs = game.seconds*1000; updateTimer();
        $('input-hint').textContent = '聞き取れなかったみたい。もう一度か、文字でどうぞ。';
      }
    };
    try { r.start(); } catch { stopRecognition(); stopClock(); phase = 'ready'; toast('マイクを起動できません。文字を入力してあそべます。'); }
  }

  $('players-minus').addEventListener('click',() => { if (playerCount > 2) { playerCount--; renderNames(); chirp(); } });
  $('players-plus').addEventListener('click',() => { if (playerCount < 4) { playerCount++; renderNames(); chirp(); } });
  $('start-button').addEventListener('click',() => startGame());
  $('again-button').addEventListener('click',() => startGame(true));
  $('finish-home').addEventListener('click',goHome); $('exit-button').addEventListener('click',confirmExit);
  $('home-link').addEventListener('click',event => { event.preventDefault(); confirmExit(); });
  $('word-form').addEventListener('submit',submitWord);
  $('word-input').addEventListener('compositionstart',() => { composing = true; beginThinking(); });
  $('word-input').addEventListener('compositionend',() => { composing = false; refreshReading(); });
  $('word-input').addEventListener('input',() => {
    if (recognition) { stopRecognition(); stopClock(); phase = 'confirm'; }
    $('form-error').hidden = true; $('reading-input').value = ''; beginThinking(); refreshReading();
  });
  $('mic-button').addEventListener('click',startSpeech);
  $('mic-consent').addEventListener('click',() => { microphoneAllowed = true; $('mic-dialog').close(); startSpeech(); });
  $('concede-button').addEventListener('click',() => askConfirm('このばんは、おしまいにする？','パスすると、この対戦はおやすみになります。次の対戦でもう一度あそぼう。','パスする',() => { currentWord = {word:'',reading:'',identity:''}; showResult({status:'out',source:'rule',reason:'pass',message:'今回はパス。また次の対戦であそぼう。'}); }));
  $('sound-button').addEventListener('click',() => { soundOn = !soundOn; updateSoundButton(); if (soundOn) chirp(); else audio?.suspend().catch(() => {}); });
  $('help-button').addEventListener('click',() => openModal('help-dialog'));
  $('judge-badge').addEventListener('click',() => openModal('settings-dialog'));
  $('gallery-button').addEventListener('click',() => { renderGallery(); openModal('gallery-dialog'); });
  $('gallery-categories').addEventListener('click',event => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    galleryCategory = button.dataset.category; renderGallery();
    $('gallery-categories').querySelector(`[data-category="${galleryCategory}"]`).focus({preventScroll:true});
  });
  $('clear-collection').addEventListener('click',() => askConfirm('図鑑を、まっさらにする？','このブラウザに保存したナイモノを消します。元には戻せません。','記録を消す',() => { collection = []; persistCollection(); renderGallery(); }));
  $('confirm-no').addEventListener('click',() => { confirmCallback = null; $('confirm-dialog').close(); });
  $('confirm-yes').addEventListener('click',() => { const fn = confirmCallback; confirmCallback = null; $('confirm-dialog').close(); fn?.(); });
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click',() => button.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('close',() => {
      const pause = modalPauses.get(dialog); modalPauses.delete(dialog);
      if (pause?.wasClock && pause.token === turnToken && phase === 'thinking' && !document.querySelector('dialog[open]')) startClock();
      if (dialog.id === 'confirm-dialog') confirmCallback = null;
    });
    dialog.addEventListener('click',event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
  });
  document.addEventListener('visibilitychange',() => {
    if (document.hidden) {
      const active = ['ready','thinking','confirm'].includes(phase);
      stopClock(); stopRecognition(); audio?.suspend().catch(() => {});
      if (active) {
        phase = $('word-input').value.trim() ? 'confirm':'ready';
        $('phase-badge').textContent = 'いったん、おやすみ';
        $('input-hint').textContent = '画面を離れたので時間を止めました。続けてあそべます。';
      }
    }
  });
  window.addEventListener('pagehide',() => { cleanupTurn(); audio?.close().catch(() => {}); audio = null; });

  renderNames(); updateCollectionCount(); updateSoundButton(); initConfig();
})();
