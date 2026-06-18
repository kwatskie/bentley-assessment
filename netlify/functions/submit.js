'use strict';
const { getStore } = require('@netlify/blobs');
const { calculateScores, computeWasCorrect, resolveRole, VALID_ROLES } = require('./lib/scoring');

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (_) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { name, role, answers, questions: clientQs } = body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Name is required' }) };
  }
  if (!role || !resolveRole(role)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid role' }) };
  }
  if (!answers || typeof answers !== 'object') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Answers required' }) };
  }

  // Coerce string keys ("0","1"...) from JSON to numbers
  const normalizedAnswers = {};
  Object.keys(answers).forEach(k => { normalizedAnswers[Number(k)] = answers[k]; });

  // Server-side scoring — client-supplied scores are ignored
  const scores = calculateScores(role, normalizedAnswers);
  if (!scores) {
    return { statusCode: 422, body: JSON.stringify({ error: 'Scoring failed' }) };
  }

  // Server re-computes wasCorrect for every question
  const serverWasCorrect = computeWasCorrect(role, normalizedAnswers);

  // Keep display data from client (text, options) but override all scoring fields
  const questions = Array.isArray(clientQs)
    ? clientQs.map((q, i) => ({
        section:    String(q.section    || ''),
        text:       String(q.text       || ''),
        type:       String(q.type       || ''),
        answer:     normalizedAnswers[i],
        options:    Array.isArray(q.options) ? q.options.map(String) : null,
        trait:      q.trait ? String(q.trait) : null,
        wasCorrect: serverWasCorrect[i] !== undefined ? serverWasCorrect[i] : null,
      }))
    : [];

  const id = Date.now();
  const result = {
    id,
    name:  String(name).trim().slice(0, 100),
    role:  String(role),
    date:  new Date().toISOString().split('T')[0],
    time:  new Date().toTimeString().slice(0, 5),
    scores,
    answers: normalizedAnswers,
    questions,
  };

  const store = getStore({ name: 'assessment-results', context });
  await store.setJSON(String(id), result);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true }),
  };
};
