'use strict';

// Vercel serverless function: POST /api/translate
const { handleTranslate } = require('../lib/handlers');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (err) {
      return res.status(400).json({ error: 'Send valid JSON.' });
    }
  }
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const { status, json } = await handleTranslate(body, ip);
  res.status(status).json(json);
};
