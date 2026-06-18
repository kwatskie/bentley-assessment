'use strict';
const crypto = require('crypto');
const { getConfig, saveConfig } = require('./lib/config');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const existing = await getConfig();
  if (existing) {
    return {
      statusCode: 409,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Already configured. Use your existing password to log in.' }),
    };
  }

  let password;
  try { ({ password } = JSON.parse(event.body || '{}')); }
  catch (_) { return { statusCode: 400, body: JSON.stringify({ error: 'Bad request' }) }; }

  if (!password || password.length < 8) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Password must be at least 8 characters.' }),
    };
  }

  const passwordHash = crypto.createHash('sha256').update(String(password)).digest('hex');
  const tokenSecret  = crypto.randomBytes(48).toString('hex');
  await saveConfig({ passwordHash, tokenSecret });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true }),
  };
};
