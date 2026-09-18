import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { JudgeError, DEFAULT_MODEL, POLICY_VERSION } from './lib/judge.mjs';
import {judgeGameWord} from './lib/pipeline.mjs';
import './public/core.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
try { loadEnvFile(join(ROOT, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const STATIC = new Map([['/','index.html'], ['/index.html','index.html'], ['/style.css','style.css'], ['/core.js','core.js'], ['/word-visuals.js','word-visuals.js'], ['/app.js','app.js'], ['/favicon.svg','favicon.svg']]);
const TYPES = { html:'text/html; charset=utf-8', css:'text/css; charset=utf-8', js:'text/javascript; charset=utf-8', svg:'image/svg+xml' };

export function createApp({ ai = null, model = DEFAULT_MODEL } = {}) {
  // This Node server remains a dependency-free local demo. Real Jev calls use worker.mjs + env.AI.
  const windows = new Map();
  const cache = new Map();
  let globalWindow = { at:Date.now(), count:0 };
  function json(res, status, data, extra = {}) { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', ...extra }); res.end(JSON.stringify(data)); }
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Frame-Options','DENY');
    let path;
    try { path = new URL(req.url, 'http://localhost').pathname; } catch { return json(res,400,{ error:'不正なURLです。' }); }
    const hostname = (req.headers.host || '').replace(/:\d+$/, '');
    if (!['localhost','127.0.0.1','[::1]'].includes(hostname)) return json(res,403,{error:'このローカル試作はlocalhost専用です。'});
    if (req.headers.origin && ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(req.headers.origin)) return json(res,403,{error:'別のサイトからは利用できません。'});
    if (req.headers['sec-fetch-site'] === 'cross-site') return json(res,403,{error:'別のサイトからは利用できません。'});
    if (req.method === 'GET' && path === '/api/config') return json(res,200,{judge:ai ? 'jev' : 'demo', model:ai ? model : null, configured:Boolean(ai)});
    if (path === '/api/judge') {
      if (req.method !== 'POST') return json(res,405,{error:'POSTを使用してください。'},{Allow:'POST'});
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res,415,{error:'JSONが必要です。'});
      const now = Date.now();
      if (now - globalWindow.at >= 60000) globalWindow = {at:now,count:0};
      const ip = req.socket.remoteAddress || 'local';
      for (const [id, value] of windows) if (now - value.at >= 60000) windows.delete(id);
      const window = windows.get(ip) || {at:now,count:0};
      if (window.count >= 30 || globalWindow.count >= 60) return json(res,429,{error:'判定が多いため少し休憩中です。負けにはなりません。',code:'RATE_LIMITED'},{'Retry-After':'60'});
      window.count++; globalWindow.count++; windows.set(ip,window);
      try {
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 2048) throw new JudgeError('入力が長すぎます。','TOO_LARGE',413); }
        let input;
        try { input = JSON.parse(raw); } catch { throw new JudgeError('JSONを読み取れませんでした。','BAD_JSON',400); }
        if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.word !== 'string' || (input.reading !== undefined && typeof input.reading !== 'string')) throw new JudgeError('ことばの形式を確認してください。','INVALID_WORD',400);
        const mode = input.mode === undefined ? 'free' : input.mode;
        if (!['free','shiritori'].includes(mode)) throw new JudgeError('あそびかたを確認してください。','INVALID_MODE',400);
        const v = globalThis.NaimonoCore.validateWord(input.word,input.reading);
        if (!v.ok) throw new JudgeError(v.message,'INVALID_WORD',400);
        if (!ai) return json(res,200,globalThis.NaimonoCore.demoJudge(v.word,v.reading));
        const key = JSON.stringify([POLICY_VERSION,model,v.word,v.reading,mode]);
        const stored = cache.get(key);
        if (stored && now - stored.at < 3600000) return json(res,200,{...stored.result,cached:true});
        const result = await judgeGameWord({...v,mode},{ai,model,fallback:{enabled:false}});
        if (cache.size >= 256) cache.delete(cache.keys().next().value);
        cache.set(key,{at:now,result});
        return json(res,200,result);
      } catch (error) {
        if (error instanceof JudgeError) return json(res,error.status,{error:error.message,code:error.code});
        return json(res,503,{error:'判定を続けられませんでした。もう一度ためせます。',code:'SERVER_ERROR'});
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res,405,{error:'この操作は使えません。'});
    const file = STATIC.get(path);
    if (!file) return json(res,404,{error:'ページが見つかりません。'});
    try {
      const data = await readFile(join(ROOT,'public',file));
      res.setHeader('Content-Type',TYPES[file.split('.').at(-1)] || 'application/octet-stream');
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { json(res,500,{error:'画面を読み込めませんでした。'}); }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  const server = createApp();
  server.listen(port,host,() => {
    console.log(`ナイモノ研究所のおためし版: http://localhost:${port}`);
    console.log('判定: 付属辞書（実際のJevは npx wrangler dev で確認）');
  });
  server.on('error',() => { console.error('サーバーを起動できません。PORTやHOSTを確認してください。'); process.exitCode = 1; });
}
