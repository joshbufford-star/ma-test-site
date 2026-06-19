# Men's Alliance Source Assistant — Netlify Test Site

Two tools in one site:
- **Ask the Guide** — answers tribesman questions using ONLY the uploaded MA source docs, with citations. Never touches the internet.
- **Tribesman Directory** — leader-password-gated lookup by callsign, name, tribe, or role.

## How it's built (why it's safe-ish for a test)
- The roster (10,090 men, with phones/emails) lives **only inside the server function**, never in the public site files. The browser never downloads the full roster. A search returns at most 50 matches, and only after the leader password is checked **on the server**.
- The Anthropic API key lives in a **server environment variable**, never in the browser.

> Still: a shared password is not real authentication. For anything beyond testing, move to per-leader logins. Don't share the site URL widely while real contact data is loaded.

## What you must set before it works
Two environment variables in Netlify (Site settings → Environment variables):

| Key | Value |
|-----|-------|
| `ANTHROPIC_API_KEY` | your Anthropic API key (required for Ask the Guide) |
| `LEADER_PASSWORD` | the shared leader password for the directory (required; pick your own) |

Optional:
| `CLAUDE_MODEL` | model id, defaults to `claude-sonnet-4-6`. Use `claude-haiku-4-5-20251001` to cut cost. |

## Deploy — easiest path (Netlify CLI)
From inside this folder:
```
npm install -g netlify-cli
netlify login
netlify deploy --prod
```
When prompted, set publish dir to `public` and functions dir to `netlify/functions` (the included `netlify.toml` already does this). Then add the env vars in the Netlify dashboard and redeploy.

## Deploy — durable path (Git)
1. Put this folder in a new GitHub repo.
2. Netlify → Add new site → Import from Git → pick the repo.
3. Build command: leave blank. Publish directory: `public`. Functions: auto-detected from `netlify.toml`.
4. Add the env vars above. Deploy.

## Note on Netlify "drag-and-drop"
Drag-and-drop (Netlify Drop) deploys static files but does **not** build the serverless functions. Use the CLI or Git path above so `ask` and `directory` work.

## Files
```
netlify.toml                 site + function config
public/index.html            UI
public/app.js                UI logic (calls /api/ask, /api/directory)
netlify/functions/ask.js     retrieval + Anthropic call (server-side)
netlify/functions/directory.js  password-gated roster search (server-side)
netlify/functions/corpus.json   indexed source passages (210)
netlify/functions/roster.json   roster (10,090) — server-only, never public
```

## Updating the source docs or roster later
Replace `corpus.json` / `roster.json` and redeploy. (In a fuller build these get an admin upload screen + real embeddings so retrieval catches meaning, not just keywords.)
