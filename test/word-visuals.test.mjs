import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/word-visuals.js';
import {buildRequest,parseResponse} from '../lib/judge.mjs';
import {buildRefereeRequest,parseRefereeResponse,DEFAULT_REFEREE} from '../lib/referee.mjs';
import {judgeGameWord} from '../lib/pipeline.mjs';
import {jevResponse} from './jev-fixture.mjs';
const V=globalThis.NaimonoVisual;
const word='もにゅらっぴ';
const hint={shape:'cloud',material:'fluff',expression:'curious',detail:'tuft'};
const assistant=visual=>({kind:'invented',certainty:'clear',name:'',domain:'other',detail:'新しく作った音の名前。',parts:[],issue:'none',...(visual?{visual}:{})});

test('visual: same normalized word and saved recipe redraw identically',()=>{
 const a=V.ruleRecipe(word),b=V.ruleRecipe('モニュラッピ');
 assert.deepEqual(a,b);assert.equal(V.render(a),V.render(JSON.parse(JSON.stringify(a))));
 assert.notEqual(V.render(a),V.render(V.ruleRecipe('もにゅらっぽ')));
});
test('visual: eight silhouette families and reading-aware fallback',()=>{
 const names=['もにゅらっぴ','ごるだむ','ぴりきゅる','ぬるぉーん','ふわるね','かぽねった','りょりら','ぽむぴっこ'];
 assert.equal(new Set(names.map(n=>V.ruleRecipe(n).shape)).size,8);
 assert.equal(V.ruleRecipe('夢想物','ふわるね').shape,'cloud');
});
test('visual: 1344 combinations produce finite deterministic SVG without executable markup',()=>{
 const base=V.ruleRecipe(word);let count=0;
 for(const shape of V.TYPES)for(const material of V.MATERIALS)for(const expression of V.EXPRESSIONS)for(const detail of V.DETAILS){
  const r={...base,shape,material,expression,detail},svg=V.render(r);
  assert.equal(svg,V.render(r));assert.ok(svg.length<25000);
  assert.doesNotMatch(svg,/NaN|Infinity|<script|<foreignObject|<image|onload=/i);count++;
 }
 assert.equal(count,1344);
});
test('visual: malformed, foreign-word and old-version recipes safely use a local recipe',()=>{
 const valid=V.ruleRecipe(word);
 for(const invalid of [null,[],{},{...valid,word:'ごるだむ'},{...valid,shape:'<script>'},{...valid,seed:Infinity},{...valid,roundness:NaN},{...valid,version:'future'},{...valid,reason:'x'.repeat(1000)}]){
  const fixed=V.sanitizeRecipe(invalid,word);
  assert.equal(fixed.word,word);assert.equal(fixed.origin,'local-rule');assert.ok(V.validRecipe(fixed,word));
 }
 const clean=V.sanitizeRecipe({...valid,url:'https://invalid.example',path:'BAD',onclick:'BAD'},word);
 assert.equal(Object.hasOwn(clean,'url'),false);assert.equal(Object.hasOwn(clean,'onclick'),false);
});
test('visual: only allowlisted hints survive and caller attributes cannot be interpolated',()=>{
 assert.equal(V.sanitizeHints({shape:'<svg>',material:123,expression:'unknown',detail:{}}),null);
 assert.deepEqual(V.sanitizeHints({...hint,url:'https://invalid.example',onload:'BAD'}),hint);
 const markup=V.render(V.ruleRecipe(word),{className:'good-class " data-probe="injected'});
 assert.doesNotMatch(markup,/\sdata-probe=/);assert.match(markup,/good-class/);
});
test('visual: reactive SVG has exactly one role and label; static render is not animated',()=>{
 const svg=V.render(V.ruleRecipe(word),{reactive:true,motion:true});
 assert.equal((svg.match(/\brole=/g)||[]).length,1);assert.equal((svg.match(/aria-label=/g)||[]).length,1);
 assert.match(svg,/role="button"/);assert.match(svg,/tabindex="0"/);
 const staticSvg=V.render(V.ruleRecipe(word));assert.match(staticSvg,/role="img"/);assert.doesNotMatch(staticSvg,/<style|nm-animating/);
});
test('visual: category and flavor are retained without altering the existence result',()=>{
 const decision=Object.freeze({status:'safe',source:'jev',category:'tool',flavor:'bold',visual:hint});
 const art=V.fromJudgment(word,'',decision);
 assert.equal(art.category,'tool');assert.equal(art.flavor,'bold');assert.equal(art.shape,'cloud');assert.equal(decision.status,'safe');
});
test('visual: verdict source is not mistaken for the illustrator source',()=>{
 const base={status:'safe',source:'jev',decisionBy:'jev'};
 assert.equal(V.fromJudgment(word,'',base).origin,'local-rule');
 assert.equal(V.fromJudgment(word,'',{...base,visual:hint}).origin,'jev');
 const fallback={...base,decisionBy:'assistant',visual:hint,fallback:{answer:assistant(null)}};
 assert.equal(V.fromJudgment(word,'',fallback).origin,'jev');
 assert.equal(V.fromJudgment(word,'',{...fallback,fallback:{answer:assistant({shape:'ribbon'})}}).origin,'assistant');
 assert.equal(V.fromJudgment(word,'',{...fallback,source:'manual'}).origin,'local-rule');
 assert.equal(V.fromJudgment(word,'',{...base,visual:{shape:'not-a-shape'}}).origin,'local-rule');
});
test('visual: optional Jev choices do not change the old question contract',()=>{
 const original=buildRequest(word),visual=buildRequest(word,'','free',{visual:true});
 assert.deepEqual(original.state,visual.state);
 assert.equal(Object.keys(visual.questions).filter(k=>k.startsWith('visual_')).length,4);
 for(const key of Object.keys(original.questions))assert.deepEqual(original.questions[key],visual.questions[key]);
});
test('visual: missing or invalid optional answers never change the Jev verdict',()=>{
 const base=parseResponse(jevResponse());
 const a=parseResponse(jevResponse(.1,{visual_shape:{type:'choice',choice:'<svg>'},visual_material:{type:'noul',noul:.9}}));
 assert.deepEqual(a,base);
 const b=parseResponse(jevResponse(.1,{visual_shape:{type:'choice',choice:'cloud'}}));
 assert.equal(b.visual.shape,'cloud');assert.deepEqual(b.assessment,base.assessment);assert.equal(b.status,base.status);
});
test('visual: invalid referee hints cannot invalidate an otherwise valid verdict',()=>{
 const a=parseRefereeResponse({response:JSON.stringify(assistant(null))},{word});
 const b=parseRefereeResponse({response:JSON.stringify(assistant({shape:'<script>',url:'https://invalid.example'}))},{word});
 assert.deepEqual(a,b);
 const c=parseRefereeResponse({response:JSON.stringify(assistant(hint))},{word});
 assert.deepEqual(c.visual,hint);const {visual,...rest}=c;assert.deepEqual(rest,a);
});
test('visual: referee keeps byte and output limits and required verdict fields',()=>{
 const req=buildRefereeRequest({word,reading:word});
 assert.ok(Buffer.byteLength(JSON.stringify(req))<5000);assert.equal(req.max_tokens,256);
 assert.ok(req.response_format.json_schema.properties.visual);
 assert.equal(req.response_format.json_schema.required.includes('visual'),false);
});
test('visual: a clear word uses one Jev call including its visual questions',async()=>{
 const calls=[];
 const result=await judgeGameWord({word},{ai:{run:async(model,request)=>{
  calls.push({model,request});return jevResponse(.1,{visual_shape:{type:'choice',choice:'blob'}});
 }},fallback:{enabled:true,model:DEFAULT_REFEREE},reserve:async()=>{throw new Error('No helper budget should be requested');}});
 assert.equal(calls.length,1);assert.ok(calls[0].request.questions.visual_shape);assert.equal(result.status,'safe');
});
test('visual: the boundary helper is reused, never called for art alone',async()=>{
 const calls=[];let reserved=0;
 const result=await judgeGameWord({word},{ai:{run:async(model)=>{
  calls.push(model);return model==='typesafe/jev'?jevResponse(.45,{visual_shape:{type:'choice',choice:'blob'}}):{response:JSON.stringify(assistant(hint))};
 }},fallback:{enabled:true,model:DEFAULT_REFEREE},reserve:async()=>{reserved++;return true;}});
 assert.equal(calls.length,2);assert.equal(reserved,1);assert.equal(result.status,'safe');assert.deepEqual(result.visual,hint);
 assert.equal(V.fromJudgment(word,'',result).origin,'assistant');
});
