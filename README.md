# Tablespeak: menu translator for restaurants

Paste a restaurant menu, pick a language, get a printable translation. Dishes in the restaurant's **glossary** keep the exact spelling and description the owner chose, instead of whatever a generic translator guesses.

Built with open-weight models (Llama, Qwen, Gemma) through any OpenAI-compatible API. No framework, no dependencies, no build step.

## Run it

You need Node 18 or newer and one API key from a provider that hosts open-weight models (OpenRouter has free models).

```bash
cp .env.example .env     # then paste your key into .env
npm start                # http://localhost:3000
```

## Deploy free on Vercel

1. Push this folder to a GitHub repo.
2. Import the repo in Vercel. No framework preset, no build command.
3. Add `LLM_API_KEY` (and optionally `LLM_BASE_URL`) under Environment Variables, then deploy.

The key stays on the server, so visitors never see it.

## Why open models matter here

- **Swap models in one line.** Edit `lib/config.js` or set `LLM_MODELS`. Compare Llama, Qwen and Gemma on the same menu.
- **Near-zero cost.** Free tiers and cheap per-token pricing mean a small restaurant pays almost nothing.
- **Fully private when needed.** Point `LLM_BASE_URL` at `http://localhost:11434/v1` and run Ollama on a stronger machine. Same code, nothing leaves the building.
- **Customizable.** The glossary and prompt (`lib/translate.js`) are yours to change, and open weights can be fine-tuned later.

## Project layout

```
public/index.html   the whole front end (HTML, CSS, JS)
public/glossary.txt starter glossary of Gujarati dishes
lib/translate.js    prompt, model call, JSON parsing and cleanup
lib/config.js       languages and model list
lib/handlers.js     request handling and a simple rate limit
api/                Vercel serverless functions
server.js           local dev server (no dependencies)
```

## Notes

- Model ids on free tiers change often. If a model errors, check the provider's model list and update `lib/config.js`.
- Output is AI-generated. The page tells readers to check ingredients and allergens before printing.
- Rate limit is in-memory and best-effort. Set a spending cap on your API key if you make the site public.
