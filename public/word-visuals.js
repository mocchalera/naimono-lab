/* Original procedural illustrator, recovered from the approved word-shapes prototype.
 * No dependencies, network requests, generated code, or external SVG. */
(function(root){
'use strict';
const VERSION='naimono-visual-0.1';
const TYPES=['blob','boulder','spark','ribbon','cloud','vessel','sprout','cluster'];
const MATERIALS=['mochi','stone','jelly','fluff','ceramic','leaf','paper'];
const EXPRESSIONS=['sleepy','blank','curious','cheery'];
const DETAILS=['none','antenna','ears','tuft','tail','sprinkles'];
const CATEGORIES=['food','animal','move','person','tool','place','other'];
const FLAVORS=['soft','bold','mysterious','futuristic','cheerful','natural'];
const PALETTES={soft:['#F2C9B9','#B8CCA5'],bold:['#BAB4A6','#E8AC75'],mysterious:['#B8C7D0','#D5BBCE'],futuristic:['#BDCCAF','#E7CD87'],cheerful:['#EDBC70','#CDD591'],natural:['#CBD4B8','#D9B795']};
const INK='#343C36';
const LABELS={blob:'むにっと',boulder:'ごつごつ',spark:'ぴりっと',ribbon:'ぬるーん',cloud:'ふわふわ',vessel:'からっぽ道具',sprout:'にょっきり',cluster:'ちびっこ群れ',mochi:'もちもち',stone:'かちかち',jelly:'ぷるぷる',fluff:'もふもふ',ceramic:'つるつる',leaf:'葉っぱ質',paper:'かさかさ',sleepy:'ねむそう',blank:'ぽけーっ',curious:'きょとん',cheery:'ごきげん',none:'かざりなし',antenna:'ひょろ触角',ears:'ちいさな耳',tuft:'ひと房',tail:'ちょろしっぽ',sprinkles:'ぽつぽつ',food:'たべものっぽい',animal:'いきものっぽい',move:'わざっぽい',person:'ひとっぽい',tool:'どうぐっぽい',place:'ばしょっぽい',other:'なにかっぽい'};
function normalize(value){if(typeof value!=='string')throw new TypeError('ことばを文字で入力してください。');const word=value.normalize('NFKC').trim().replace(/[ァ-ヶ]/gu,c=>String.fromCharCode(c.charCodeAt(0)-0x60));if(!/^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー々〆]+$/u.test(word)||Array.from(word).length>24)throw new TypeError('ひらがな・カタカナ・漢字で1〜24文字にしてください。');return word;}
function hash(s){let h=2166136261;for(const c of s){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const f=n=>Number(n.toFixed(2));
function ruleRecipe(raw, reading = '', overrides = {}){
 const word=normalize(raw);
 let phoneticText = word;
 if (typeof reading === 'string' && reading.trim()) {
  try {
   const normReading = reading.normalize('NFKC').trim().replace(/[ァ-ヶ]/gu,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
   if (/^[ぁ-ゖー]+$/u.test(normReading) && normReading.length<=40) phoneticText=normReading;
  } catch {}
 }
 const letters=Array.from(phoneticText),voiced=(phoneticText.match(/[がぎぐげござじずぜぞだぢづでどばびぶべぼ]/gu)||[]).length;
 let shape='blob',material='mochi',expression='blank',detail='none',category='other',flavor='soft';
 let reason='丸い音と長さから、小さなかたまりを想像する仮ルール。';
 if(/ふわ|ふぁ|ほわ|ふる|ふぉ/.test(phoneticText)){shape='cloud';material='fluff';detail='tuft';expression='sleepy';category='animal';flavor='mysterious';reason='「ふわ」系の響き → 空気を含んだ輪郭、という仮ルール。';}
 else if(/ぬ|にょろ|るぉ|ろー|とろ/.test(phoneticText)){shape='ribbon';material='jelly';expression='sleepy';category='animal';flavor='mysterious';reason='ぬめる・のびる響き → 流れる細長い体、という仮ルール。';}
 else if(/ぴり|きゅる|きり|ちり|しゅ/.test(phoneticText)){shape='spark';material='paper';expression='curious';detail='antenna';category='move';flavor='cheerful';reason='ぴり・きゅるの響き → 小さくはじける形、という仮ルール。';}
 else if(/ぽむ|ぴっ|ぷっ|ぽこ/.test(phoneticText)){shape='cluster';material='mochi';expression='cheery';category='animal';flavor='cheerful';detail='sprinkles';reason='弾む短い音 → ちびっこが集まる形、という仮ルール。';}
 else if(/かぽ|こぽ|ねった|ぽっと|けっと/.test(phoneticText)){shape='vessel';material='ceramic';expression='blank';category='tool';flavor='natural';reason='カポッと空洞を感じる響き → 名前のない道具、という仮ルール。';}
 else if(/きゅり|りょり|にょき|りり/.test(phoneticText)){shape='sprout';material='leaf';detail='tuft';expression='curious';category='other';flavor='natural';reason='すっと伸びる響き → 葉っぱのような形、という仮ルール。';}
 else if(/ごる|がん|ぐど|だむ|どむ/.test(phoneticText)||voiced>=Math.max(2,letters.length*.30)){shape='boulder';material='stone';expression='blank';detail='ears';category='animal';flavor='bold';reason='重い濁音が続く響き → 低くて大きい体、という仮ルール。';}
 else if(/もに|にゅ|むに|ぷに|もち|ぽに/.test(phoneticText)){shape='blob';material='mochi';expression='sleepy';detail='antenna';category='food';flavor='soft';reason='もにゅ・ぷに系の響き → 押すと戻る形、という仮ルール。';}
 else {const tail=letters.at(-1);if(/[るりれ]/.test(tail)){shape='sprout';material='leaf';flavor='natural';expression='curious';reason='伸びる語尾 → 細い茎のある形、という仮ルール。';}else if(/[ぱぴぷぺぽ]/.test(letters[0])){shape='cluster';expression='cheery';flavor='cheerful';reason='弾む出だし → 小さい群れ、という仮ルール。';}}
 if(voiced&&shape==='blob'){flavor='bold';expression='blank';reason+=' 濁音ぶん、少しずっしり。';}

 let origin='local-rule';
 if(overrides && typeof overrides==='object'){
  if(TYPES.includes(overrides.shape)) shape=overrides.shape;
  if(MATERIALS.includes(overrides.material)) material=overrides.material;
  if(EXPRESSIONS.includes(overrides.expression)) expression=overrides.expression;
  if(DETAILS.includes(overrides.detail)) detail=overrides.detail;
  if(CATEGORIES.includes(overrides.category)) category=overrides.category;
  if(FLAVORS.includes(overrides.flavor)) flavor=overrides.flavor;
  if(['local-rule','jev','referee','assistant','manual'].includes(overrides.origin)) origin=overrides.origin;
  if(typeof overrides.reason==='string'&&overrides.reason.trim()) reason=overrides.reason.trim().slice(0,160);
 }

 const roundness=shape==='boulder'?.22:shape==='spark'?.1:shape==='ribbon'?.82:shape==='sprout'?.6:.75;
 return {
  version:VERSION,
  rendererVersion:VERSION,
  origin,
  word,
  seed:hash(word+'|'+VERSION),
  category,
  flavor,
  shape,
  material,
  expression,
  detail,
  roundness,
  reason
 };
}
function validRecipe(r, expectedWord = null){
 if(!r||typeof r!=='object'||Array.isArray(r))return false;
 if(r.version!==VERSION||r.rendererVersion!==VERSION)return false;
 try{
  if(normalize(r.word)!==r.word)return false;
  if(expectedWord!==null&&expectedWord!==undefined){
   if(normalize(expectedWord)!==r.word)return false;
  }
 }catch{return false;}
 return TYPES.includes(r.shape)&&MATERIALS.includes(r.material)&&EXPRESSIONS.includes(r.expression)&&DETAILS.includes(r.detail)&&CATEGORIES.includes(r.category)&&FLAVORS.includes(r.flavor)&&['local-rule','jev','referee','assistant','manual'].includes(r.origin)&&Number.isInteger(r.seed)&&r.seed>=0&&r.seed<=4294967295&&Number.isFinite(r.roundness)&&r.roundness>=0&&r.roundness<=1&&typeof r.reason==='string'&&r.reason.length<=300;
}
function sanitizeRecipe(recipe, word, reading = '', overrides = {}){
 if(validRecipe(recipe, word)){
  return {
   version:VERSION,
   rendererVersion:VERSION,
   origin:recipe.origin,
   word:recipe.word,
   seed:recipe.seed,
   category:recipe.category,
   flavor:recipe.flavor,
   shape:recipe.shape,
   material:recipe.material,
   expression:recipe.expression,
   detail:recipe.detail,
   roundness:recipe.roundness,
   reason:recipe.reason
  };
 }
 return ruleRecipe(word, reading, overrides);
}
function originLabel(origin, defaultText = '語感からの仮スケッチ'){
 switch(origin){
  case 'jev': return 'Jevの語感スケッチ';
  case 'referee':
  case 'assistant': return '助っ人の想像';
  case 'manual': return 'みんなで決めたスケッチ';
  case 'local-rule': return '語感からの仮スケッチ';
  default: return defaultText;
 }
}
function sanitizeHints(value){
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
function shapePath(points,smooth=.65){
 const n=points.length;if(!smooth)return 'M'+points.map(p=>p.map(f).join(',')).join('L')+'Z';
 let d=`M${f(points[0][0])},${f(points[0][1])}`;
 for(let i=0;i<n;i++){const prev=points[(i-1+n)%n],a=points[i],b=points[(i+1)%n],next=points[(i+2)%n],k=smooth/6;d+=`C${f(a[0]+(b[0]-prev[0])*k)},${f(a[1]+(b[1]-prev[1])*k)} ${f(b[0]-(next[0]-a[0])*k)},${f(b[1]-(next[1]-a[1])*k)} ${f(b[0])},${f(b[1])}`;}
 return d+'Z';
}
function ellipsePath(x,y,rx,ry,r,smooth=.9,n=12){const points=Array.from({length:n},(_,i)=>{const a=i/n*Math.PI*2,k=.94+r()*.11;return[x+Math.cos(a)*rx*k,y+Math.sin(a)*ry*k];});return shapePath(points,smooth);}
function render(recipe,{motion=false,reactive=false,className=''}={}){
 if(!validRecipe(recipe))throw new TypeError('Unknown or malformed visual recipe.');
 const p=recipe,r=rng(p.seed),rnd=(a,b)=>a+r()*(b-a),[fill,accent]=PALETTES[p.flavor],sx=rnd(.96,1.05),tilt=rnd(-4,4),faceX=rnd(151,168),faceY=rnd(150,160),stroke=3.2;
 const draw=(d,color=fill,width=stroke)=>`<path d="${d}" fill="${color}" stroke="${INK}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
 const line=(d,width=stroke,color=INK)=>draw(d,'none',width).replace(`stroke="${INK}"`,`stroke="${color}"`);
 const circle=(x,y,rx,ry,color,sw=stroke)=>`<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${color}" stroke="${sw?INK:'none'}" stroke-width="${sw}"/>`;
 const foot=(x,y,len=13)=>line(`M${x},${y}q-3,${len} -11,${len-1}`);
 function face(x,y,size=1,kind=p.expression){
  const space=19*size,s=2.4*size,l=x-space,rr=x+space;let out='';
  if(kind==='sleepy'){out+=line(`M${f(l-5)},${f(y)}q5,4 10,-1`,s)+line(`M${f(rr-5)},${f(y-2)}q5,4 10,-1`,s);}
  else if(kind==='curious'){out+=circle(l,y,5.6*size,7.2*size,'#FFFDF4',2.2*size)+circle(rr,y-2*size,5.3*size,7*size,'#FFFDF4',2.2*size)+circle(l+1.5*size,y+1*size,1.9*size,2.4*size,INK,0)+circle(rr+1.3*size,y,1.9*size,2.4*size,INK,0);}
  else if(kind==='cheery'){out+=line(`M${f(l-4)},${f(y+2)}q4,-7 8,0`,s)+line(`M${f(rr-4)},${f(y)}q4,-7 8,0`,s);}
  else out+=circle(l,y,2.9*size,4.5*size,INK,0)+circle(rr,y-2.5*size,2.8*size,4.1*size,INK,0);
  out+=kind==='cheery'?draw(`M${f(x-6*size)},${f(y+17*size)}q6,10 12,-1Z`,INK,1.4):line(`M${f(x-4*size)},${f(y+17*size)}q4,${kind==='sleepy'?'-2':'2'} ${f(8*size)},-1`,1.8*size);
  if(p.material==='mochi'||p.material==='fluff'){out+=circle(l-9*size,y+13*size,8*size,3.2*size,'#DA927E',0)+circle(rr+9*size,y+11*size,7.5*size,3.2*size,'#DA927E',0);}
  return out;
 }
 let body='',back='',fore='',effect='',faceMarkup='',surfacePath='';
 if(p.shape==='blob'){
  back+=foot(125,226,16)+foot(201,223,17);
  const w=p.flavor==='bold'?90:rnd(77,88),h=p.flavor==='bold'?55:rnd(57,64);
  surfacePath=ellipsePath(159,170,w,h,r,.9);body+=draw(surfacePath);
  fore+=line('M90,184q-13,-7 -17,5q3,12 16,6',2.5)+line('M229,177q11,-4 13,6',2.5);
  if(p.detail==='antenna')back+=line('M144,111q-11,-34 -27,-30q-14,3 -5,13M167,109q16,-24 34,-18',2.4);
  faceMarkup=face(faceX,faceY);
 }else if(p.shape==='boulder'){
  back+=draw('M93,191L71,206L68,223L99,225Z',accent)+draw('M219,178L242,192L252,214L224,219Z',accent);
  back+=draw('M111,215L111,238L141,241L144,224Z',fill)+draw('M181,217L184,239L219,238L215,217Z',fill);
  const pts=[[85,155],[95,109],[128,90],[183,86],[221,120],[235,184],[224,219],[169,228],[109,222]];surfacePath=shapePath(pts.map(([x,y])=>[x+rnd(-4,4),y+rnd(-5,5)]),p.roundness*.7);body+=draw(surfacePath);
  if(p.detail==='ears')back+=draw('M111,106L104,81L124,85L137,97Z',accent)+draw('M192,96L205,78L214,107Z',accent);
  fore+=line('M101,169l9,6 -2,12M206,199l-12,3',2.2);faceMarkup=face(164,158,.97);
 }else if(p.shape==='spark'){
  const points=[],n=9,rr=rnd(64,74);for(let i=0;i<n*2;i++){const a=i/(n*2)*Math.PI*2-.5;const v=(i%2?rr*.60:rr)*rnd(.91,1.08);points.push([159+Math.cos(a)*v,154+Math.sin(a)*v]);}
  surfacePath=shapePath(points,p.roundness);body+=draw(surfacePath);faceMarkup=face(161,148,.85);
  back+=foot(137,210,18)+line('M180,211q11,19 20,7',2.6);
  if(p.detail==='antenna')back+=line('M141,107q-21,-36 -7,-44',2.1)+circle(135,61,5,5,accent,2.2);
  effect+=line('M254,106l9,-8M253,121l14,-1M76,95l-9,-8',2.2);
 }else if(p.shape==='ribbon'){
  surfacePath='M115,208C70,226 84,242 132,238C182,241 195,226 180,206C159,180 182,151 213,126C240,102 230,66 206,62C174,56 151,89 148,125C145,151 139,180 115,208Z';body+=draw(surfacePath);
  fore+=line('M121,222q10,6 29,-3',2)+line('M204,92q6,5 9,11',2,'#EEECE2');
  faceMarkup=face(193,113,.86);effect+=line('M249,156q-6,9 0,12q8,0 0,-12',2.2,'#8DADBA');
 }else if(p.shape==='cloud'){
  back+=line('M136,215q-2,26 -11,22M190,214q2,24 12,23',2.7);
  const pts=Array.from({length:48},(_,i)=>{const a=i/48*Math.PI*2,rad=1+.12*Math.cos(a*8+.3);return[159+Math.cos(a)*82*rad,162+Math.sin(a)*59*rad];});surfacePath=shapePath(pts,.9);body+=draw(surfacePath);
  if(p.detail==='tuft')back+=line('M156,107q-11,-33 -20,-35M159,105q12,-31 27,-26',2.5)+draw('M132,73q-6,-18 -18,-11q0,16 18,11Z',accent,2.5)+draw('M182,78q17,-14 20,1q-8,9 -20,-1Z',accent,2.5);
  faceMarkup=face(161,157,1);effect+=line('M57,157q-14,10 -5,16M261,166q14,8 8,16',2,'#B8B6AC');
 }else if(p.shape==='vessel'){
  back+=draw('M212,130C265,113 269,181 216,180L214,164C244,167 243,135 215,145Z',accent,3.1);
  back+=foot(123,221,18)+foot(191,220,17);surfacePath='M102,112Q143,120 208,112L217,195Q216,224 158,228Q104,226 99,204Z';body+=draw(surfacePath);
  fore+=circle(154,112,54,12,accent)+draw('M114,112Q157,99 197,110Q170,119 117,116Z','#726D5C',1.8);
  fore+=line('M112,180l2,13M200,186l-1,12',2,'#B6AA93');faceMarkup=face(154,164,.9);
  effect+=line('M158,74q-15,-9 -1,-20q10,-8 0,-16',2,'#A4AC99');
 }else if(p.shape==='sprout'){
  back+=line('M160,200q-8,28 -15,38M159,211q18,19 30,26',3);
  surfacePath='M134,193C108,177 113,150 141,138C127,116 138,81 159,62C189,78 198,110 181,140C215,155 211,180 186,196Q161,206 134,193Z';body+=draw(surfacePath);faceMarkup=face(161,163,.75);
  fore+=line('M150,91q13,22 6,39',2,'#9BA57E');back+=draw('M131,199q-50,2 -37,-26q21,0 37,26Z',accent,2.5);
 }else if(p.shape==='cluster'){
  back+=foot(110,221,16)+foot(216,213,15);
  body+=draw(ellipsePath(167,144,39,42,r));body+=face(168,143,.56,'curious');
  body+=draw(ellipsePath(122,194,46,34,r),accent);body+=face(122,190,.59,'cheery');
  body+=draw(ellipsePath(206,186,37,39,r));body+=face(206,183,.57,'blank');
  fore+=line('M144,116q-14,-16 -25,-12',2.3)+line('M148,105q-2,-16 9,-20',2.1);
 }
 if(p.material==='stone'&&p.shape!=='boulder')fore+=line('M122,187l7,-6 8,9M189,203l10,-4',1.7);
 if(p.material==='mochi'&&p.shape!=='cluster'&&p.shape!=='ribbon')fore+=line('M114,129q6,-8 16,-9',4.5,'#FFF3DD');
 if(p.material==='jelly'&&p.shape!=='ribbon')fore+=circle(127,127,8,13,'#F8FFF6',0);
 if(p.detail==='sprinkles'&&p.shape!=='ribbon')for(let i=0;i<5;i++)fore+=circle(135+r()*50,118+r()*19,1.5,2.3,INK,0);
 if(p.detail==='ears'&&!['boulder','vessel','spark'].includes(p.shape))back+=draw('M102,132Q69,65 98,66Q120,90 123,127Z',accent,2.7)+draw('M182,126Q196,76 211,85Q221,105 206,137Z',accent,2.7);
 if(p.detail==='tail'&&!['ribbon','vessel'].includes(p.shape))back+=line('M222,201q45,-4 37,-31q-11,-14 -21,2',2.7);
 const art=`<g transform="translate(160 159) rotate(${f(tilt)}) scale(${f(sx)} 1) translate(-160 -159)">${back}${body}${fore}${faceMarkup}</g>`;
 const dur=(5.5+(p.seed%2000)/1000).toFixed(2),delay=(-((p.seed%4500)/1000)).toFixed(2);
 const motionClass=motion?`nm-animating nm-motion-${p.shape}`:'';
 const extra=typeof className==='string'?className.split(/\s+/u).filter(name=>/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(name)).join(' '):'';
 const classes=['nm-visual',motionClass,extra].filter(Boolean).join(' ');
 const semantics=reactive?`role="button" tabindex="0" aria-label="${escape(p.word)}をつつく"`:`role="img" aria-label="${escape(p.word)}の想像イラスト"`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 280" class="${classes}" ${semantics}><title>${escape(p.word)} — 語感から想像したナイモノ</title><ellipse cx="161" cy="245" rx="${p.shape==='ribbon'?57:70}" ry="5" fill="#E5E4D7"/><g class="nm-life nm-shape-${p.shape}" style="--nm-dur:${dur}s;--nm-delay:${delay}s">${art}${effect}</g></svg>`;
}
const API=Object.freeze({VERSION,TYPES,MATERIALS,EXPRESSIONS,DETAILS,CATEGORIES,FLAVORS,LABELS,normalize,hash,ruleRecipe,validRecipe,sanitizeRecipe,sanitizeHints,fromJudgment,originLabel,render});root.NaimonoVisual=API;
})(globalThis);
