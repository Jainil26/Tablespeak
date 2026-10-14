'use strict';

const { LANGUAGES, loadModels } = require('./config');

const MAX_MENU_CHARS = 6000;
const MAX_GLOSSARY_ENTRIES = 200;
const ALLOWED_TAGS = new Set(['spicy', 'sweet', 'fried', 'steamed', 'jain']);

// Unicode blocks, used to check that a reply is really written in the requested script.
const SCRIPT_RANGES = {
  Devanagari: /[ऀ-ॿ]/,
  Gujarati: /[઀-૿]/,
  Bengali: /[ঀ-৿]/,
  Tamil: /[஀-௿]/,
  Telugu: /[ఀ-౿]/,
  Kannada: /[ಀ-೿]/,
  Malayalam: /[ഀ-ൿ]/,
  Gurmukhi: /[਀-੿]/,
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const clip = (value, max) => String(value == null ? '' : value).trim().slice(0, max);

function cleanGlossary(glossary) {
  if (!Array.isArray(glossary)) return [];
  return glossary
    .slice(0, MAX_GLOSSARY_ENTRIES)
    .map((g) => ({ dish: clip(g && g.dish, 120), english: clip(g && g.english, 120), note: clip(g && g.note, 300) }))
    .filter((g) => g.dish && g.english);
}

function buildMessages({ menu, language, script, glossary }) {
  const nonLatin = script !== 'Latin';

  const languageRules = nonLatin
    ? `3. Write every section title, dish name and description in ${language}, using ONLY ${script} script. Never add English or romanised text, and never put translations in brackets. The only Latin characters allowed are digits and currency symbols in prices.
4. GLOSSARY: when a menu line matches a glossary entry (by its name or any spelling of it), set "glossary" to true. Write its dish name in ${script} script, transliterated from the entry's preferred spelling (not translated). The glossary notes are written in English: TRANSLATE each note into ${language} for the description. Never copy English notes into the output.
5. Other dishes: write the dish name transliterated into ${script} script, set "glossary" to false, and add a short plain description in ${language} (at most 18 words). Do not invent ingredients. If you are not sure what a dish is, use "" as the description.`
    : `3. Write every section title and description in ${language}.
4. GLOSSARY: when a menu line matches a glossary entry (by its name or any spelling of it), use that entry's preferred spelling as the dish name, set "glossary" to true, and base the description on the glossary note.
5. Other dishes: keep the dish name in its familiar romanised form, set "glossary" to false, and add a short plain description (at most 18 words). Do not invent ingredients. If you are not sure what a dish is, use "" as the description.`;

  const system = `You are a professional restaurant menu translator working for a single restaurant.
The menu may be in Gujarati, Hindi, English or a mix, and dish names may be romanised (for example "undhiyu").
Translate it into ${language}${nonLatin ? ` (${script} script)` : ''}.

Rules:
1. Keep the menu's structure: sections, dish order and prices exactly as given. Copy each price verbatim, including currency symbols. If a dish has no price, use "".
2. If the menu has no section headings, use one section titled "Menu" (translated into ${language}).
${languageRules}
6. Never state allergen or dietary claims unless the menu text says so.
7. "tags" may only contain: "spicy", "sweet", "fried", "steamed", "jain". Use "jain" only if the menu says so. Use [] when unsure. Tags always stay in English.
8. "original" is the menu line's dish name exactly as written, without the price.
9. Reply with ONE JSON object and nothing else: no markdown fences, no commentary.

Schema:
{"sections":[{"title":string,"items":[{"original":string,"name":string,"description":string,"price":string,"tags":string[],"glossary":boolean}]}]}`;

  const glossaryBlock = glossary.length
    ? glossary.map((g) => `- ${g.dish} => ${g.english}${g.note ? ` | ${g.note}` : ''}`).join('\n')
    : '(none)';

  const reminder = nonLatin ? `\n\nReminder: all titles and descriptions must be in ${language} (${script} script), not English.` : '';
  const user = `GLOSSARY (name => preferred spelling | note):\n${glossaryBlock}\n\nMENU:\n${menu}${reminder}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function extractJson(text) {
  const cleaned = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no json object');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalise(parsed) {
  const sections = Array.isArray(parsed && parsed.sections) ? parsed.sections : [];
  const out = sections
    .map((s) => ({
      title: clip(s && s.title, 120),
      items: (Array.isArray(s && s.items) ? s.items : [])
        .map((it) => ({
          original: clip(it && it.original, 160),
          name: clip(it && it.name, 160),
          description: clip(it && it.description, 400),
          price: clip(it && it.price, 40),
          tags: (Array.isArray(it && it.tags) ? it.tags : [])
            .map((t) => String(t).toLowerCase().trim())
            .filter((t) => ALLOWED_TAGS.has(t)),
          glossary: Boolean(it && it.glossary),
        }))
        .filter((it) => it.name),
    }))
    .filter((s) => s.items.length);
  if (!out.length) throw new Error('empty result');
  return out;
}

// True when most descriptions are NOT written in the requested script (the model answered in English).
function wrongScript(sections, script) {
  const re = SCRIPT_RANGES[script];
  if (!re) return false;
  const described = sections.flatMap((s) => s.items).filter((it) => it.description);
  if (!described.length) return false;
  const bad = described.filter((it) => !re.test(it.description)).length;
  return bad / described.length > 0.4;
}

async function callModel({ base, key, model, messages, env }) {
  const body = { model, messages, temperature: 0.2, max_tokens: 3500 };
  if (env.LLM_JSON_MODE === '1') body.response_format = { type: 'json_object' };

  const headers = { 'Content-Type': 'application/json', 'X-Title': 'Tablespeak menu translator' };
  if (key) headers.Authorization = `Bearer ${key}`;

  let res;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(55000),
    });
  } catch (err) {
    throw new HttpError(504, 'The model took too long or could not be reached. Try again, or pick another model.');
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('LLM provider error', res.status, detail.slice(0, 300));
    if (res.status === 429) {
      throw new HttpError(429, 'The model provider is rate-limiting this key. Wait a minute or pick another model.');
    }
    throw new HttpError(502, 'The model provider returned an error. Pick another model and try again.');
  }

  const data = await res.json().catch(() => null);
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  try {
    return { text, sections: normalise(extractJson(text)) };
  } catch (err) {
    console.error('Could not parse model output:', String(text).slice(0, 300));
    throw new HttpError(502, 'The model replied in a format we could not read. Try again or pick another model.');
  }
}

async function translateMenu(input, env = process.env) {
  const menu = clip(input.menu, MAX_MENU_CHARS + 1);
  if (!menu) throw new HttpError(400, 'Paste a menu to translate.');
  if (menu.length > MAX_MENU_CHARS) {
    throw new HttpError(400, `That menu is too long. Keep it under ${MAX_MENU_CHARS} characters, or translate it in parts.`);
  }

  const language = LANGUAGES.find((l) => l.name === input.language);
  if (!language) throw new HttpError(400, 'Choose a language from the list.');

  const models = loadModels(env);
  const model = models.find((m) => m.id === input.model) || models[0];

  const base = (env.LLM_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const key = env.LLM_API_KEY || '';
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(base);
  if (!key && !isLocal) throw new HttpError(500, 'The server is missing LLM_API_KEY. Add it to .env and restart.');

  const started = Date.now();
  const messages = buildMessages({
    menu,
    language: language.name,
    script: language.script,
    glossary: cleanGlossary(input.glossary),
  });

  let { text, sections } = await callModel({ base, key, model: model.id, messages, env });

  // Some models slip back into English for Indian scripts. Ask once more, firmly, if there is time.
  if (wrongScript(sections, language.script) && Date.now() - started < 25000) {
    const retryMessages = messages.concat([
      { role: 'assistant', content: String(text || '') },
      {
        role: 'user',
        content: `Most descriptions in your reply were not in ${language.name}. Return the same JSON again, but write EVERY section title, dish name and description in ${language.name} using ${language.script} script only. No English, no romanised text, no brackets.`,
      },
    ]);
    try {
      const second = await callModel({ base, key, model: model.id, messages: retryMessages, env });
      sections = second.sections;
    } catch (err) {
      /* keep the first answer */
    }
  }

  return {
    sections,
    language: language.name,
    code: language.code,
    rtl: Boolean(language.rtl),
    model: model.label,
    scriptWarning: wrongScript(sections, language.script),
  };
}

module.exports = { translateMenu, buildMessages, extractJson, normalise, wrongScript, HttpError, MAX_MENU_CHARS };
