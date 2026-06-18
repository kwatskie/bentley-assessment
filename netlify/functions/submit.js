import { getStore } from '@netlify/blobs';
import { calculateScores, computeWasCorrect, resolveRole } from './lib/scoring.js';

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response('', { status: 200 });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body;
  try { body = await request.json(); }
  catch (_) { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  const { name, role, answers, questions: clientQs } = body;

  if (!name || typeof name !== 'string' || !name.trim())
    return new Response(JSON.stringify({ error: 'Name is required' }), { status: 400 });
  if (!role || !resolveRole(role))
    return new Response(JSON.stringify({ error: 'Invalid role' }), { status: 400 });
  if (!answers || typeof answers !== 'object')
    return new Response(JSON.stringify({ error: 'Answers required' }), { status: 400 });

  const normalizedAnswers = {};
  Object.keys(answers).forEach(k => { normalizedAnswers[Number(k)] = answers[k]; });

  const scores = calculateScores(role, normalizedAnswers);
  if (!scores) return new Response(JSON.stringify({ error: 'Scoring failed' }), { status: 422 });

  const serverWasCorrect = computeWasCorrect(role, normalizedAnswers);

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

  const store = getStore('assessment-results');
  await store.setJSON(String(id), result);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
};
