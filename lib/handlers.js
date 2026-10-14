'use strict';

const { LANGUAGES, loadModels } = require('./config');
const { translateMenu, HttpError } = require('./translate');

// Best-effort, in-memory limiter: protects your free API quota from casual abuse.
// (On serverless hosts it resets when the function instance recycles.)
const hits = new Map();
function allow(ip, limit = 20, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}

async function handleTranslate(body, ip) {
  if (!allow(ip)) {
    return { status: 429, json: { error: 'Too many requests. Wait a few minutes and try again.' } };
  }
  try {
    return { status: 200, json: await translateMenu(body || {}) };
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status, json: { error: err.message } };
    console.error(err);
    return { status: 500, json: { error: 'Something went wrong on the server.' } };
  }
}

function handleConfig() {
  return { status: 200, json: { models: loadModels().map((m) => ({ id: m.id, label: m.label })), languages: LANGUAGES } };
}

module.exports = { handleTranslate, handleConfig };
