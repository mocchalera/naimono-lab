import { judgeWord, JudgeError, DEFAULT_MODEL, POLICY_VERSION } from './lib/judge.mjs';
import './public/core.js';

const MAX_BODY_BYTES = 2048;
const WINDOW_MS = 60000;
const PER_CLIENT_LIMIT = 30;
const GLOBAL_LIMIT = 60;
const CACHE_MS = 3600000;
const windows = new Map();
const cache = new Map();
let globalWindow = { at: Date.now(), count: 0 };

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY'
};

function responseWithHeaders(response, extra = {}) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries({ ...SECURITY_HEADERS, ...extra })) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extra
    }
  });
}

function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return false;
  return request.headers.get('Sec-Fetch-Site') !== 'cross-site';
}

function rateLimit(request) {
  const now = Date.now();
  if (now - globalWindow.at >= WINDOW_MS) globalWindow = { at: now, count: 0 };
  const client = request.headers.get('CF-Connecting-IP') || 'anonymous';
  for (const [id, value] of windows) if (now - value.at >= WINDOW_MS) windows.delete(id);
  const window = windows.get(client) || { at: now, count: 0 };
  if (window.count >= PER_CLIENT_LIMIT || globalWindow.count >= GLOBAL_LIMIT) return false;
  window.count += 1;
  globalWindow.count += 1;
  windows.set(client, window);
  return true;
}

async function parseBody(request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new JudgeError('入力が長すぎます。', 'TOO_LARGE', 413);
  try { return JSON.parse(raw); }
  catch { throw new JudgeError('JSONを読み取れませんでした。', 'BAD_JSON', 400); }
}

async function judge(request, env) {
  if (request.method !== 'POST') return json({ error: 'POSTを使用してください。' }, 405, { Allow: 'POST' });
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) return json({ error: 'JSONが必要です。' }, 415);
  if (!rateLimit(request)) return json({ error: '判定が多いため少し休憩中です。負けにはなりません。', code: 'RATE_LIMITED' }, 429, { 'Retry-After': '60' });
  try {
    const input = await parseBody(request);
    if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.word !== 'string' || (input.reading !== undefined && typeof input.reading !== 'string')) {
      throw new JudgeError('ことばの形式を確認してください。', 'INVALID_WORD', 400);
    }
    const value = globalThis.NaimonoCore.validateWord(input.word, input.reading);
    if (!value.ok) throw new JudgeError(value.message, 'INVALID_WORD', 400);
    const mode = input.mode === undefined ? 'free' : input.mode;
    if (!['free','shiritori'].includes(mode)) throw new JudgeError('あそびかたを確認してください。', 'INVALID_MODE', 400);
    if (!env.AI) return json(globalThis.NaimonoCore.demoJudge(value.word, value.reading));
    const key = JSON.stringify([POLICY_VERSION, DEFAULT_MODEL, value.word, value.reading, mode]);
    const now = Date.now();
    const stored = cache.get(key);
    if (stored && now - stored.at < CACHE_MS) return json({ ...stored.result, cached: true });
    const result = await judgeWord({...value,mode}, { ai: env.AI, model: DEFAULT_MODEL });
    if (cache.size >= 256) cache.delete(cache.keys().next().value);
    cache.set(key, { at: now, result });
    return json(result);
  } catch (error) {
    if (error instanceof JudgeError) return json({ error: error.message, code: error.code }, error.status);
    // Provider details are intentionally not returned to the browser.
    return json({ error: '判定を続けられませんでした。もう一度ためせます。', code: 'SERVER_ERROR' }, 503);
  }
}

export async function handleRequest(request, env = {}) {
  if (!sameOrigin(request)) return json({ error: '別のサイトからは利用できません。' }, 403);
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/api/config') {
    return json({ judge: env.AI ? 'jev' : 'demo', model: env.AI ? DEFAULT_MODEL : null, configured: Boolean(env.AI) });
  }
  if (url.pathname === '/api/judge') return judge(request, env);
  if (env.ASSETS?.fetch) return responseWithHeaders(await env.ASSETS.fetch(request));
  return json({ error: 'ページが見つかりません。' }, 404);
}

export default { fetch: handleRequest };
