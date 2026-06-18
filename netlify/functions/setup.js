import crypto from 'crypto';
import { getConfig, saveConfig } from './lib/config.js';

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response('', { status: 200 });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const existing = await getConfig();
  if (existing) {
    return new Response(
      JSON.stringify({ error: 'Already configured. Use your existing password to log in.' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let password;
  try { ({ password } = await request.json()); }
  catch (_) { return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 }); }

  if (!password || password.length < 8) {
    return new Response(
      JSON.stringify({ error: 'Password must be at least 8 characters.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const passwordHash = crypto.createHash('sha256').update(String(password)).digest('hex');
  const tokenSecret  = crypto.randomBytes(48).toString('hex');
  await saveConfig({ passwordHash, tokenSecret });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
};
