import crypto from 'crypto';

// SHA-256 hash of the admin password — plaintext never stored anywhere
const PASSWORD_HASH = 'fe97471f0ff634ffe46f060502624a74b2566ff82f839840664245714a711556';
const TOKEN_SECRET  = '0eea7f8455333fec31103f3e2610e560d8f9b5ca69d21fe666a2dbbf3684c1b0';
const TOKEN_TTL_MS  = 8 * 60 * 60 * 1000;

// In-memory rate limiter (per function instance; resets on cold start)
const failedAttempts = new Map();
const MAX_ATTEMPTS   = 5;
const LOCKOUT_MS     = 15 * 60 * 1000;

function makeToken() {
  const exp = Date.now() + TOKEN_TTL_MS;
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(String(exp)).digest('hex');
  return Buffer.from(JSON.stringify({ exp, sig })).toString('base64');
}

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response('', { status: 200 });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const ip  = request.headers.get('x-nf-client-connection-ip') || 'unknown';
  const now = Date.now();
  const rec = failedAttempts.get(ip) || { count: 0, firstAttemptTime: 0 };
  const withinWindow = (now - rec.firstAttemptTime) < LOCKOUT_MS;

  if (withinWindow && rec.count >= MAX_ATTEMPTS) {
    const remaining = Math.ceil((rec.firstAttemptTime + LOCKOUT_MS - now) / 60000);
    return new Response(
      JSON.stringify({ error: `Too many failed attempts. Try again in ${remaining} minute${remaining !== 1 ? 's' : ''}.` }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let password;
  try { ({ password } = await request.json()); }
  catch (_) { return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 }); }

  const submitted = crypto.createHash('sha256').update(String(password || '')).digest('hex');
  const sBuf = Buffer.from(submitted,     'hex');
  const cBuf = Buffer.from(PASSWORD_HASH, 'hex');
  const match = sBuf.length === cBuf.length && crypto.timingSafeEqual(sBuf, cBuf);

  if (!match) {
    failedAttempts.set(ip, {
      count:            withinWindow ? rec.count + 1 : 1,
      firstAttemptTime: withinWindow ? rec.firstAttemptTime : now,
    });
    return new Response(JSON.stringify({ error: 'Incorrect password.' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }

  failedAttempts.delete(ip);
  return new Response(JSON.stringify({ token: makeToken() }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
};
