'use strict';

// Languages shown in the dropdown. `script` tells the model which writing system to use.
const LANGUAGES = [
  { name: 'English', code: 'en', script: 'Latin' },
  { name: 'Hindi', code: 'hi', script: 'Devanagari' },
  { name: 'Gujarati', code: 'gu', script: 'Gujarati' },
  { name: 'Marathi', code: 'mr', script: 'Devanagari' },
  { name: 'Bengali', code: 'bn', script: 'Bengali' },
  { name: 'Tamil', code: 'ta', script: 'Tamil' },
  { name: 'Telugu', code: 'te', script: 'Telugu' },
  { name: 'Kannada', code: 'kn', script: 'Kannada' },
  { name: 'Malayalam', code: 'ml', script: 'Malayalam' },
  { name: 'Punjabi', code: 'pa', script: 'Gurmukhi' },
];

// Open-weight models, addressed by the provider's model id (OpenRouter-style ids by default).
// Ids change over time: check https://openrouter.ai/models and edit this list,
// or override it without touching code:  LLM_MODELS="id=Label,id2=Label 2"
const DEFAULT_MODELS = [
  { id: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B' },
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
  { id: 'google/gemma-3-27b-it', label: 'Gemma 3 27B' },
];

function loadModels(env = process.env) {
  const raw = (env.LLM_MODELS || '').trim();
  if (!raw) return DEFAULT_MODELS;
  const parsed = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const i = part.indexOf('=');
      const id = (i === -1 ? part : part.slice(0, i)).trim();
      const label = (i === -1 ? part : part.slice(i + 1)).trim();
      return { id, label };
    })
    .filter((m) => m.id);
  return parsed.length ? parsed : DEFAULT_MODELS;
}

module.exports = { LANGUAGES, loadModels };
