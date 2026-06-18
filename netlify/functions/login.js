import crypto from 'crypto';
import { getStore } from '@netlify/blobs';
import { getConfig } from './lib/config.js';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 15 * 60 * 1000;
const TOKEN_TTL_MS =  8 * 60 * 60 * 1000;

function makeToken(secret) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const sig = crypto.createHmac('sha256', secret).update(String(exp)).digest('hex');
  return Buffer.from(JSON.stringify({ exp, sig })).toString('base64');
}

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response('', { status: 200 });

  const config = await getConfig();

  if (request.method === 'GET') {
    return new Response(JSON.stringify({ configured: !!config }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  if (!config) {
    return new Response(JSON.stringify({ error: 'not_configured' }), {
      status: 503, headers: { 'Content-Type': 'application/json' }
    });
  }

  const authStore = getStore('auth-state');
  let attempts = { count: 0, firstAttemptTime: 0 };
  try {
    const stored = await authStore.get('failed-attempts', { type: 'json' });
    if (stored) attempts = stored;
  } catch (_) {}

  const withinWindow = (Date.now() - attempts.firstAttemptTime) < LOCKOUT_MS;
  if (withinWindow && attempts.count >= MAX_ATTEMPTS) {
    const remaining = Math.ceil((attempts.firstAttemptTime + LOCKOUT_MS - Date.now()) / 60000);
    return new Response(
      JSON.stringify({ error: `Too many failed attempts. Try again in ${remaining} minute${remaining !== 1 ? 's' : ''}.` }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let password;
  try { ({ password } = await request.json()); }
  catch (_) { return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 }); }

  const submittedHash = crypto.createHash('sha256').update(String(password || '')).digest('hex');
  const submittedBuf  = Buffer.from(submittedHash, 'hex');
  const storedBuf     = Buffer.from(config.passwordHash, 'hex');
  const match = submittedBuf.length === storedBuf.length &&
    crypto.timingSafeEqual(submittedBuf, storedBuf);

  if (!match) {
    const newCount = withinWindow ? attempts.count + 1 : 1;
    const newFirst = withinWindow ? attempts.firstAttemptTime : Date.now();
    try { await authStore.setJSON('failed-attempts', { count: newCount, firstAttemptTime: newFirst }); } catch (_) {}
    return new Response(JSON.stringify({ error: 'Incorrect password.' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }

  try { await authStore.delete('failed-attempts'); } catch (_) {}

  return new Response(JSON.stringify({ token: makeToken(config.tokenSecret) }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
};
