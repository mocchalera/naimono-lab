import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import http from 'node:http';
import {createApp} from '../server.mjs';
import {jevResponse} from './jev-fixture.mjs';
async function app(t, options = {}) {
  const server = createApp(options); server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}
const post = (url,body,headers = {}) => fetch(`${url}/api/judge`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});

test('serves local assets but not secrets or arbitrary filesystem paths',async t => {
  const url = await app(t);
  assert.equal((await fetch(url)).status,200);
  for (const path of ['/style.css','/app.js','/core.js','/favicon.svg']) assert.equal((await fetch(url+path)).status,200);
  for (const path of ['/.env','/server.mjs','/package.json','/lib/judge.mjs','/etc/passwd']) assert.equal((await fetch(url+path)).status,404);
  const headers = (await fetch(url)).headers;
  assert.match(headers.get('Content-Security-Policy'),/script-src 'self'/);
});
test('config exposes mode but never the key',async t => {
  const url = await app(t,{ai:{run:async () => ({})}});
  const res = await fetch(url+'/api/config'), text = await res.text();
  assert.ok(text.includes('"judge":"jev"')); assert.ok(text.includes('typesafe/jev'));
});
test('demo route is explicitly demo and unknowns are review',async t => {
  const url = await app(t);
  const r = await post(url,{word:'もにゅらっぴ'}); assert.equal(r.status,200);
  const body = await r.json(); assert.equal(body.source,'demo'); assert.equal(body.status,'review');
});
test('live route and bounded cache use Jev answers; duplicate requests reuse the result',async t => {
  let calls = 0;
  const url = await app(t,{ai:{run:async () => {calls++; return jevResponse(.97);}}});
  assert.equal((await (await post(url,{word:'り ん　ご'})).json()).status,'out');
  const second = await (await post(url,{word:'りんご'})).json();
  assert.equal(second.cached,true); assert.equal(second.source,'jev'); assert.equal(calls,1);
});
test('kanji and category survive the HTTP route, and sound requests have a separate cache key',async t => {
  const calls = [];
  const url = await app(t,{ai:{run:async (_model,input) => {
    calls.push(input);
    return jevResponse(.1,{category:{type:'choice',choice:'food'},...(input.questions.first_sound ? {first_sound:{type:'choice',choice:'く',probabilities:{'く':.9}},last_sound:{type:'choice',choice:'ち',probabilities:{'ち':.9}}} : {})});
  }}});
  const input = {word:'雲ぷる餅'};
  assert.equal((await (await post(url,{word:' 雲 ぷる　餅。 '})).json()).sounds,null);
  assert.equal(calls[0].state.word,'雲ぷる餅');
  const shiri = await (await post(url,{...input,mode:'shiritori'})).json();
  assert.equal(shiri.category,'food'); assert.deepEqual(shiri.sounds,{first:'く',last:'ち'});
  assert.equal(calls.length,2); assert.equal(calls[1].state.word,'雲ぷる餅');
  assert.equal((await (await post(url,{...input,mode:'shiritori'})).json()).cached,true);
  assert.equal(calls.length,2);
  assert.equal((await post(url,{...input,mode:'bad'})).status,400);
});
test('cross-site and DNS-rebinding host requests are rejected',async t => {
  const url = await app(t);
  assert.equal((await post(url,{word:'ねこ'},{Origin:'https://evil.example'})).status,403);
  assert.equal((await post(url,{word:'ねこ'},{'Sec-Fetch-Site':'cross-site'})).status,403);
  // Node's fetch overwrites Host; raw HTTP is needed to exercise the actual guard.
  const reboundStatus = await new Promise((resolve,reject) => {
    const req = http.get(url+'/api/config',{headers:{Host:'evil.example'}},res => {res.resume(); resolve(res.statusCode);});
    req.on('error',reject);
  });
  assert.equal(reboundStatus,403);
});
test('invalid content type, JSON, body size, fields and method are rejected',async t => {
  const url = await app(t);
  assert.equal((await fetch(url+'/api/judge')).status,405);
  assert.equal((await fetch(url+'/api/judge',{method:'POST',body:'hello'})).status,415);
  assert.equal((await fetch(url+'/api/judge',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
  assert.equal((await post(url,{word:'あ'.repeat(1000)})).status,413);
  for (const input of [[],{}, {word:123},{word:'ねこ',reading:123}]) assert.equal((await post(url,input)).status,400);
});
test('per-client rate limit protects API calls',async t => {
  const url = await app(t);
  for (let i = 0; i < 30; i++) assert.equal((await post(url,{word:'ねこ'})).status,200);
  const res = await post(url,{word:'ねこ'}); assert.equal(res.status,429); assert.equal(res.headers.get('Retry-After'),'60');
});
test('an unavailable provider does not become a demo answer or an out',async t => {
  const url = await app(t,{ai:{run:async () => {throw new Error('private upstream error');}}});
  const r = await post(url,{word:'ねこ'}), body = await r.json();
  assert.equal(r.status,503); assert.equal(body.status,undefined); assert.equal(body.error.includes('private'),false);
});
