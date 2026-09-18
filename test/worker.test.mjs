import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../worker.mjs';
import {jevResponse} from './jev-fixture.mjs';

const assets = { fetch: async request => new Response(`asset:${new URL(request.url).pathname}`, { headers:{'Content-Type':'text/plain'} }) };
const json = response => response.json();
const request = (path, options = {}) => new Request(`https://naimono.example${path}`, options);
const post = (path, body, headers = {}) => request(path, { method:'POST', headers:{'Content-Type':'application/json', 'Origin':'https://naimono.example', ...headers}, body:JSON.stringify(body) });

test('Worker config and static assets are reachable without exposing secrets', async () => {
  const config = await handleRequest(request('/api/config'), { ASSETS:assets });
  assert.deepEqual(await json(config), {judge:'demo',model:null,configured:false});
  const page = await handleRequest(request('/'), { ASSETS:assets });
  assert.equal(page.status, 200); assert.equal(await page.text(), 'asset:/'); assert.equal(page.headers.get('X-Frame-Options'), 'DENY');
});

test('Worker sends judgment and classification through one AI binding call', async () => {
  let received;
  const env = { ASSETS:assets, AI:{run:async (model, input) => {
    received = {model, input};
    return jevResponse(.96);
  }} };
  const config = await handleRequest(request('/api/config'), env);
  assert.deepEqual(await json(config), {judge:'jev',model:'typesafe/jev',configured:true});
  const response = await handleRequest(post('/api/judge',{word:'ChatGPT'},{'CF-Connecting-IP':'worker-test-1'}), env);
  const body = await json(response);
  assert.equal(response.status, 200); assert.equal(body.status, 'out'); assert.equal(body.source, 'jev');
  assert.equal(received.model, 'typesafe/jev'); assert.equal(received.input.state.word, 'ChatGPT'); assert.equal(received.input.questions.exists.type, 'noul');
  assert.equal(received.input.questions.category.type,'choice');
  assert.equal(Object.keys(body.assessment.scores).length,7);
});

test('Worker passes kanji through and caches shiritori sounds independently',async () => {
  let calls = 0;
  const env = {ASSETS:assets,AI:{run:async (_model,input) => {
    calls++; assert.equal(input.state.word,'雲ぷる餅');
    return jevResponse(.1,{category:{type:'choice',choice:'food'},...(input.questions.first_sound ? {first_sound:{type:'choice',choice:'く',probabilities:{'く':.95}},last_sound:{type:'choice',choice:'ち',probabilities:{'ち':.95}}} : {})});
  }}};
  const input = {word:'雲ぷる餅'}, headers = {'CF-Connecting-IP':'worker-sounds'};
  assert.equal((await json(await handleRequest(post('/api/judge',{word:' 雲 ぷる　餅。 '},headers),env))).sounds,null);
  assert.equal((await json(await handleRequest(post('/api/judge',input,headers),env))).cached,true);
  const result = await json(await handleRequest(post('/api/judge',{...input,mode:'shiritori'},headers),env));
  assert.equal(result.category,'food'); assert.deepEqual(result.sounds,{first:'く',last:'ち'});
  assert.equal((await json(await handleRequest(post('/api/judge',{...input,mode:'shiritori'},headers),env))).cached,true);
  assert.equal(calls,2);
  assert.equal((await handleRequest(post('/api/judge',{...input,mode:'bad'},headers),env)).status,400);
  assert.equal(calls,2);
});

test('an AI failure is retryable and never becomes a loss', async () => {
  const response = await handleRequest(post('/api/judge',{word:'モチャペロン'},{'CF-Connecting-IP':'worker-test-2'}), { AI:{run:async () => { throw new Error('provider detail'); }}, ASSETS:assets });
  const body = await json(response);
  assert.equal(response.status, 503); assert.equal(body.status, undefined); assert.equal(body.error.includes('provider detail'), false);
});

test('demo fallback and request guards remain safe', async () => {
  const demo = await handleRequest(post('/api/judge',{word:'ギャラポンチ'},{'CF-Connecting-IP':'worker-test-3'}), {ASSETS:assets});
  assert.equal((await json(demo)).status, 'review');
  assert.equal((await handleRequest(post('/api/judge',{word:'ねこ'},{Origin:'https://evil.example','CF-Connecting-IP':'worker-test-4'}), {ASSETS:assets})).status, 403);
  assert.equal((await handleRequest(post('/api/judge',{word:'<script>'},{'CF-Connecting-IP':'worker-test-5'}), {AI:{run:async () => { throw new Error('must not run'); }},ASSETS:assets})).status, 400);
});

test('Worker cache separates model settings, reserves budget before fallback and skips caching transient failures',async()=>{
  let jevCalls=0,helperCalls=0,reservations=0,available=true;
  const env={AI:{run:async(model)=>{
    if(model==='typesafe/jev'){jevCalls++;return jevResponse(.5);}
    helperCalls++;return {response:{kind:'invented',certainty:'clear',name:'',domain:'other',detail:'新しく作った音。',parts:[],issue:'none'}};
  }},FALLBACK_BUDGET:{getByName:name=>{
    assert.equal(name,'naimono-fallback-allowance');return {reserve:async cost=>{assert.ok(cost>0);reservations++;return available;}};
  }}};
  const headers={'CF-Connecting-IP':'pipeline-cache'},input={word:'ぽちゅらみ'};
  const call=async(custom=env)=>json(await handleRequest(post('/api/judge',input,headers),custom));
  assert.equal((await call()).decisionBy,'assistant');assert.equal((await call()).cached,true);
  assert.deepEqual([jevCalls,helperCalls,reservations],[1,1,1]);
  assert.equal((await call({...env,FALLBACK_ENABLED:'false'})).status,'review');
  assert.equal((await call({...env,FALLBACK_MODEL:'@cf/google/gemma-4-26b-a4b-it'})).decisionBy,'assistant');
  assert.deepEqual([jevCalls,helperCalls,reservations],[3,2,2]);
  available=false;
  const second={word:'れみょふゅ'};
  for(let i=0;i<2;i++) {
    const value=await json(await handleRequest(post('/api/judge',second,headers),env));
    assert.equal(value.fallback.state,'budget');assert.equal(value.status,'review');assert.equal(value.cached,undefined);
  }
  assert.deepEqual([jevCalls,helperCalls,reservations],[5,2,4]);
});
