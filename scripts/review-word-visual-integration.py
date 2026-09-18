"""One-time review repair for the preserved visual integration worktree.
Applies only to the known incomplete integration; backs up changed source locally.
No network calls, credentials, deployments, or unrelated repository writes.
"""
from pathlib import Path
import subprocess

ROOT = Path.cwd()
BASE = '527b9ef47bf943a62d80fed0e877e7a06278d681'
assert ROOT.name == 'naimono-feat-naimono-visual-integrate-0918', 'Wrong worktree'
paths = ['public/word-visuals.js','public/app.js','public/style.css','lib/referee.mjs']
original = {name:(ROOT/name).read_text() for name in paths}
updated = dict(original)
assert 'function fromJudgment(' not in original['public/word-visuals.js'], 'Repair already applied'

def replace_once(text, before, after):
    count = text.count(before)
    assert count == 1, (before[:100],count)
    return text.replace(before,after,1)

# The procedural paths are retained; only data validation and SVG metadata change.
s = updated['public/word-visuals.js']
s = replace_once(s,"&&typeof r.reason==='string';","&&typeof r.reason==='string'&&r.reason.length<=300;")
s = replace_once(s,"reason=overrides.reason.trim();","reason=overrides.reason.trim().slice(0,160);")
s = replace_once(s,'const normReading = normalize(reading);',"const normReading = reading.normalize('NFKC').trim().replace(/[ァ-ヶ]/gu,c=>String.fromCharCode(c.charCodeAt(0)-0x60));")
s = replace_once(s,'if (normReading) phoneticText = normReading;',"if (/^[ぁ-ゖー]+$/u.test(normReading) && normReading.length<=40) phoneticText=normReading;")
helpers = r'''function sanitizeHints(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const result={};
 for(const [key,allowed] of Object.entries({shape:TYPES,material:MATERIALS,expression:EXPRESSIONS,detail:DETAILS}))if(allowed.includes(value[key]))result[key]=value[key];
 return Object.keys(result).length?result:null;
}
function fromJudgment(word,reading='',judgment={}){
 let hints=null,origin='local-rule';
 if(judgment.status==='safe'&&judgment.source==='jev'){
  const assisted=judgment.decisionBy==='assistant'?sanitizeHints(judgment.fallback?.answer?.visual):null;
  hints=assisted||sanitizeHints(judgment.visual);
  if(hints)origin=assisted?'assistant':'jev';
 }
 const reason=origin==='local-rule'?undefined:origin==='assistant'?'助っ人の選択を手がかりにした、名前の想像スケッチ。':'Jevの選択を手がかりにした、名前の想像スケッチ。';
 return ruleRecipe(word,reading,{...(hints||{}),category:judgment.category,flavor:judgment.flavor,origin,reason});
}
'''
s = replace_once(s,'function shapePath(',helpers+'function shapePath(')
a=s.index(' const dur='); b=s.index('\n}\nconst API=',a)
s=s[:a]+r''' const dur=(5.5+(p.seed%2000)/1000).toFixed(2),delay=(-((p.seed%4500)/1000)).toFixed(2);
 const motionClass=motion?`nm-animating nm-motion-${p.shape}`:'';
 const extra=typeof className==='string'?className.split(/\s+/u).filter(name=>/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(name)).join(' '):'';
 const classes=['nm-visual',motionClass,extra].filter(Boolean).join(' ');
 const semantics=reactive?`role="button" tabindex="0" aria-label="${escape(p.word)}をつつく"`:`role="img" aria-label="${escape(p.word)}の想像イラスト"`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 280" class="${classes}" ${semantics}><title>${escape(p.word)} — 語感から想像したナイモノ</title><ellipse cx="161" cy="245" rx="${p.shape==='ribbon'?57:70}" ry="5" fill="#E5E4D7"/><g class="nm-life nm-shape-${p.shape}" style="--nm-dur:${dur}s;--nm-delay:${delay}s">${art}${effect}</g></svg>`;'''+s[b:]
s=replace_once(s,'sanitizeRecipe,originLabel,render','sanitizeRecipe,sanitizeHints,fromJudgment,originLabel,render')
updated['public/word-visuals.js']=s

# Restore the original speech and game-event handlers, not just their appearance.
base=subprocess.check_output(['git','show',BASE+':public/app.js'],text=True)
s=updated['public/app.js']; marker='  function startSpeech() {'
s=s[:s.index(marker)]+base[base.index(marker):]
a=s.index('  function setupVisualObserver() {'); b=s.index('  function loadCollection() {',a)
s=s[:a]+r'''  const motionPreference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const reactionTimers=new Map();
  function clearVisualReactions(){
    for(const [svg,timer] of reactionTimers){clearTimeout(timer);svg.classList.remove('nm-reacting');}
    reactionTimers.clear();
  }
  function isVisualShown(svg){
    if(!svg.isConnected||document.hidden||svg.closest('[hidden]'))return false;
    const dialog=svg.closest('dialog');return !dialog||dialog.open;
  }
  function setupVisualObserver(){
    if(typeof IntersectionObserver!=='function')return;
    visualObserver=new IntersectionObserver(entries=>{
      for(const entry of entries)entry.target.classList.toggle('nm-paused',!entry.isIntersecting||!isVisualShown(entry.target));
    },{threshold:0.02});
  }
  function observeVisuals(){
    visualObserver?.disconnect();
    for(const [svg,timer] of reactionTimers)if(!isVisualShown(svg)){
      clearTimeout(timer);svg.classList.remove('nm-reacting');reactionTimers.delete(svg);
    }
    document.querySelectorAll('.nm-visual').forEach(svg=>{
      svg.classList.add('nm-paused');if(!isVisualShown(svg))return;
      if(visualObserver)visualObserver.observe(svg);
      else{const rect=svg.getBoundingClientRect();svg.classList.toggle('nm-paused',rect.bottom<=0||rect.top>=innerHeight||rect.right<=0||rect.left>=innerWidth);}
    });
  }
  function triggerVisualReaction(target){
    const svg=target?.closest?.('.nm-visual[role="button"]');
    if(!svg||motionStopped||motionPreference.matches||!isVisualShown(svg))return;
    const previous=reactionTimers.get(svg);if(previous)clearTimeout(previous);
    svg.classList.remove('nm-reacting');void svg.getBoundingClientRect();svg.classList.add('nm-reacting');
    reactionTimers.set(svg,setTimeout(()=>{svg.classList.remove('nm-reacting');reactionTimers.delete(svg);},450));
  }
  function toggleMotion(){
    motionStopped=!motionStopped;
    try{localStorage.setItem(MOTION_KEY,String(motionStopped));}catch{}
    document.body.classList.toggle('stop-motion',motionStopped);
    clearVisualReactions();updateMotionButton();observeVisuals();
  }
  function updateMotionButton(){
    const btn=$('motion-button');if(!btn)return;
    btn.setAttribute('aria-pressed',String(motionStopped));
    btn.setAttribute('aria-label',motionStopped?'動きを再開する':'動きをとめる');
    btn.title=motionStopped?'動きを再開する':'動きをとめる';
    $('motion-icon').textContent=motionStopped?'▶':'⏸';
  }
  function resolveEntryVisual(entry){
    const V=globalThis.NaimonoVisual;if(!V)return null;
    try{return V.sanitizeRecipe(entry.visual,entry.word,entry.reading||'',{category:entry.category,flavor:entry.flavor,origin:'local-rule'});}
    catch{return null;}
  }
  function resolveVerdictVisual(value,word,reading){
    const V=globalThis.NaimonoVisual;if(!V)return null;
    try{
      const saved=collection.find(entry=>C.toHiragana(entry.word)===C.toHiragana(word));
      return(saved&&resolveEntryVisual(saved))||V.fromJudgment(word,reading,value);
    }catch{return null;}
  }
  function discoveryDecision(entry){
    return entry.source==='manual'?'みんなで決めたナイモノ':entry.decisionBy==='assistant'?'助っ人も確認したナイモノ':'Jevが知らないと判定';
  }

'''+s[b:]
s=replace_once(s,"['jev','manual','assistant','local'].includes(item.source)","['jev','manual','assistant'].includes(item.source)")
s=replace_once(s,'            source: item.source,',"            source:item.source==='manual'?'manual':'jev',\n            decisionBy:item.source==='manual'?'manual':item.source==='assistant'||item.decisionBy==='assistant'?'assistant':'jev',")
a=s.index('    if (safe && globalThis.NaimonoVisual && !value.visualRecipe) {'); b=s.index('    const decisionReason = ',a)
s=s[:a]+"    if(safe)value.visualRecipe=resolveVerdictVisual(value,word,currentWord?.reading||'');\n"+s[b:]
s=s.replace('motion:!motionStopped','motion:true')
s=replace_once(s,"const source = result.decisionBy === 'assistant' ? 'assistant' : result.source === 'jev' ? 'jev' : 'manual';","const source=result.source==='jev'?'jev':'manual';")
s=replace_once(s,'        source,\n        avatar:',"        source,\n        decisionBy:source==='manual'?'manual':result.decisionBy==='assistant'?'assistant':'jev',\n        avatar:")
s=s.replace("source:'manual',meaning:null","source:'manual',decisionBy:'manual',meaning:null")
s=replace_once(s,'<span>${escapeHTML(originText)}</span></article>','<span class="visual-origin-note">${escapeHTML(originText)}</span><span class="discovery-decision">${discoveryDecision(entry)}</span></article>')
s=replace_once(s,'<span class="visual-origin-badge">${escapeHTML(originText)}</span><div class="referee-bubble">','<div class="referee-bubble">')
for signature in ['  function setScreen(screen) {','  function prepareTurn() {','  function showResult(value) {','  function editWord() {','  function renderGallery() {']:
    s=replace_once(s,signature,signature+'\n    queueMicrotask(observeVisuals);')
s=replace_once(s,'  function cleanupTurn() {','  function cleanupTurn() {\n    clearVisualReactions();visualObserver?.disconnect();')
s=replace_once(s,'dialog.showModal();','dialog.showModal();queueMicrotask(observeVisuals);')
s=replace_once(s,"      if (dialog.id === 'confirm-dialog') confirmCallback = null;","      if (dialog.id === 'confirm-dialog') confirmCallback = null;\n      queueMicrotask(observeVisuals);")
s=replace_once(s,"  document.addEventListener('visibilitychange',() => {","  document.addEventListener('visibilitychange',() => {\n    document.body.classList.toggle('tab-hidden',document.hidden);\n    if(document.hidden)clearVisualReactions();\n    observeVisuals();")
s=replace_once(s,'  renderNames(); updateCollectionCount(); updateSoundButton(); initConfig();',r'''  $('motion-button')?.addEventListener('click',toggleMotion);
  document.addEventListener('click',event=>triggerVisualReaction(event.target));
  document.addEventListener('keydown',event=>{
    if(!event.repeat&&['Enter',' '].includes(event.key)&&event.target.closest?.('.nm-visual[role="button"]')){
      event.preventDefault();triggerVisualReaction(event.target);
    }
  });
  motionPreference.addEventListener('change',()=>{clearVisualReactions();observeVisuals();});
  setupVisualObserver();
  renderNames();updateCollectionCount();updateSoundButton();updateMotionButton();initConfig();''')
assert s.count('function stopRecognition()')==1,'Duplicate speech handler'
assert "$('start-button').addEventListener('click',() => startGame());" in s
updated['public/app.js']=s

s=updated['lib/referee.mjs']
s=replace_once(s,'Return only a flat JSON answer, no thinking.','Return only a JSON object, no thinking.')
s=replace_once(s,'Optional visual for invented words: visual with shape, material, expression, detail from schema.','Optional visual ONLY for invented words: a nested visual object choosing shape, material, expression, detail from schema. This is a playful impression of the name, never evidence for existence. Omit visual when unsure; complete the verdict first.')
updated['lib/referee.mjs']=s

s=updated['public/style.css'].replace('transform-origin:160px 235px;will-change:transform','transform-origin:160px 235px;transform-box:view-box')
s=s.replace('.discovery-card:hover .nm-visual:not(.nm-animating) .nm-life{transform:scale(1.04);transition:transform .2s ease-out}','')
s+='''
/* Sketch motion must not inherit the older referee mascot animation. */
.verdict-visual-wrap > .nm-visual{width:100%;height:auto;animation:none!important;transform:none!important}
.discovery-card .nm-visual{width:100%;height:auto;aspect-ratio:8/7}
.discovery-card .visual-origin-note,.discovery-card .discovery-decision{display:block;margin-top:3px;font-size:9px}
.nm-visual.nm-animating:not(.nm-paused) .nm-life{will-change:transform}
.nm-visual.nm-paused .nm-life,body.tab-hidden .nm-visual .nm-life{animation-play-state:paused!important;will-change:auto}
body.stop-motion .nm-visual .nm-life{animation:none!important;transition:none!important;transform:none!important;will-change:auto}
@media(prefers-reduced-motion:reduce){.nm-visual .nm-life{animation:none!important;transition:none!important;transform:none!important;will-change:auto}}
@media(max-width:380px){
 .site-header .brand-creature{width:29px;height:36px}.site-header .brand{gap:4px}
 .site-header .brand-jp{font-size:12px}.site-header .brand-en{font-size:8px;letter-spacing:1px}
 .header-nav{gap:5px}.header-nav .icon-button{width:28px;height:30px}.header-nav .notebook-button{height:30px;padding:0 7px;gap:4px}
}
'''
updated['public/style.css']=s

# Every assertion runs before writing. Keep local backups, and reject concurrent changes.
for name in paths:
    assert (ROOT/name).read_text()==original[name], 'Concurrent change: '+name
backup=ROOT/'test-results'/'pre-review-backup'
for name in paths:
    target=backup/name;target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(original[name])
    (ROOT/name).write_text(updated[name])
    print('REPAIRED',name,flush=True)
print('Speech/input baseline restored; visual provenance and lifecycle fixed. Run tests next.')
