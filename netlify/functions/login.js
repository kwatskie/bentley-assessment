'use strict';
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 15 * 60 * 1000; // 15 minutes
const TOKEN_TTL_MS =  8 * 60 * 60 * 1000; // 8 hours

function makeToken(secret) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const sig = crypto.createHmac('sha256', secret).update(String(exp)).digest('hex');
  return Buffer.from(JSON.stringify({ exp, sig })).toString('base64');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const TOKEN_SECRET   = process.env.TOKEN_SECRET;
  if (!ADMIN_PASSWORD || !TOKEN_SECRET) {
    return { statusCode: 503, body: JSON.stringify({ error: 'Server misconfiguration' }) };
  }

  // Rate limit check
  const authStore = getStore('auth-state');
  let attempts = { count: 0, firstAttemptTime: 0 };
  try {
    const stored = await authStore.get('failed-attempts', { type: 'json' });
    if (stored) attempts = stored;
  } catch (_) { /* first ever call */ }

  const withinWindow = (Date.now() - attempts.firstAttemptTime) < LOCKOUT_MS;
  if (withinWindow && attempts.count >= MAX_ATTEMPTS) {
    const remaining = Math.ceil((attempts.firstAttemptTime + LOCKOUT_MS - Date.now()) / 60000);
    return {
      statusCode: 429,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Too many failed attempts. Try again in ${remaining} minute${remaining !== 1 ? 's' : ''}.` }),
    };
  }

  let password;
  try {
    ({ password } = JSON.parse(event.body || '{}'));
  } catch (_) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Bad request' }) };
  }

  // Constant-time password comparison to prevent timing attacks
  const pwBuf       = Buffer.from(String(password  || '').padEnd(64));
  const correctBuf  = Buffer.from(String(ADMIN_PASSWORD).padEnd(64));
  const match = pwBuf.length === correctBuf.length &&
    crypto.timingSafeEqual(pwBuf, correctBuf) &&
    password === ADMIN_PASSWORD;

  if (!match) {
    const newCount = withinWindow ? attempts.count + 1 : 1;
    const newFirst = withinWindow ? attempts.firstAttemptTime : Date.now();
    try {
      await authStore.setJSON('failed-attempts', { count: newCount, firstAttemptTime: newFirst });
    } catch (_) { /* non-fatal */ }
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Incorrect password.' }),
    };
  }

  // Success — clear lockout counter
  try { await authStore.delete('failed-attempts'); } catch (_) { /* non-fatal */ }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: makeToken(TOKEN_SECRET) }),
  };
};
