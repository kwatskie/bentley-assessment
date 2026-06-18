import crypto from 'crypto';
import { getStore } from '@netlify/blobs';
import { getConfig } from './lib/config.js';

function verifyToken(token, secret) {
  try {
    const { exp, sig } = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    if (!exp || !sig || Date.now() > exp) return false;
    const expected = crypto.createHmac('sha256', secret).update(String(exp)).digest('hex');
    const sigBuf   = Buffer.from(sig,      'hex');
    const expBuf   = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch (_) { return false; }
}

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response('', { status: 200 });

  const config = await getConfig();
  if (!config) {
    return new Response(JSON.stringify({ error: 'not_configured' }), {
      status: 503, headers: { 'Content-Type': 'application/json' }
    });
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!verifyToken(token, config.tokenSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }

  const store = getStore('assessment-results');

  if (request.method === 'GET') {
    const { blobs } = await store.list();
    const items = await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' }).catch(() => null)));
    const results = items.filter(Boolean).sort((a, b) => b.id - a.id);
    return new Response(JSON.stringify(results), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.method === 'DELETE') {
    let password;
    try { ({ password } = await request.json()); }
    catch (_) { return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 }); }

    const submittedHash = crypto.createHash('sha256').update(String(password || '')).digest('hex');
    const submittedBuf  = Buffer.from(submittedHash, 'hex');
    const storedBuf     = Buffer.from(config.passwordHash, 'hex');
    const match = submittedBuf.length === storedBuf.length &&
      crypto.timingSafeEqual(submittedBuf, storedBuf);

    if (!match) {
      return new Response(JSON.stringify({ error: 'Incorrect password. Deletion cancelled.' }), {
        status: 403, headers: { 'Content-Type': 'application/json' }
      });
    }

    const { blobs } = await store.list();
    await Promise.all(blobs.map(b => store.delete(b.key)));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response('Method not allowed', { status: 405 });
};
