'use strict';
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

function verifyToken(token, secret) {
  try {
    const { exp, sig } = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    if (!exp || !sig || Date.now() > exp) return false;
    const expected = crypto.createHmac('sha256', secret).update(String(exp)).digest('hex');
    const sigBuf  = Buffer.from(sig,      'hex');
    const expBuf  = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch (_) { return false; }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, body: '' };

  const TOKEN_SECRET   = process.env.TOKEN_SECRET;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  if (!TOKEN_SECRET || !ADMIN_PASSWORD) {
    return { statusCode: 503, body: JSON.stringify({ error: 'Server misconfiguration' }) };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!verifyToken(token, TOKEN_SECRET)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const store = getStore('assessment-results');

  // GET — return all results sorted newest first
  if (event.httpMethod === 'GET') {
    const { blobs } = await store.list();
    const items = await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' }).catch(() => null)));
    const results = items.filter(Boolean).sort((a, b) => b.id - a.id);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(results),
    };
  }

  // DELETE — require password re-confirmation, then wipe all results
  if (event.httpMethod === 'DELETE') {
    let password;
    try { ({ password } = JSON.parse(event.body || '{}')); }
    catch (_) { return { statusCode: 400, body: JSON.stringify({ error: 'Bad request' }) }; }

    const pwBuf      = Buffer.from(String(password      || '').padEnd(64));
    const correctBuf = Buffer.from(String(ADMIN_PASSWORD).padEnd(64));
    const match = pwBuf.length === correctBuf.length &&
      crypto.timingSafeEqual(pwBuf, correctBuf) &&
      password === ADMIN_PASSWORD;
    if (!match) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Incorrect password. Deletion cancelled.' }) };
    }

    const { blobs } = await store.list();
    await Promise.all(blobs.map(b => store.delete(b.key)));
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  }

  return { statusCode: 405, body: 'Method not allowed' };
};
