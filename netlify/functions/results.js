'use strict';
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');
const { getConfig } = require('./lib/config');

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

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, body: '' };

  const config = await getConfig(context);
  if (!config) {
    return { statusCode: 503, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'not_configured' }) };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!verifyToken(token, config.tokenSecret)) {
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const store = getStore({ name: 'assessment-results', context });

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

  if (event.httpMethod === 'DELETE') {
    let password;
    try { ({ password } = JSON.parse(event.body || '{}')); }
    catch (_) { return { statusCode: 400, body: JSON.stringify({ error: 'Bad request' }) }; }

    const submittedHash = crypto.createHash('sha256').update(String(password || '')).digest('hex');
    const submittedBuf  = Buffer.from(submittedHash, 'hex');
    const storedBuf     = Buffer.from(config.passwordHash, 'hex');
    const match = submittedBuf.length === storedBuf.length &&
      crypto.timingSafeEqual(submittedBuf, storedBuf);

    if (!match) {
      return { statusCode: 403, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Incorrect password. Deletion cancelled.' }) };
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
