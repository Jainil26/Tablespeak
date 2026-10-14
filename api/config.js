'use strict';

// Vercel serverless function: GET /api/config
const { handleConfig } = require('../lib/handlers');

module.exports = (req, res) => {
  const { status, json } = handleConfig();
  res.status(status).json(json);
};
