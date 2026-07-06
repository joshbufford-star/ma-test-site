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
| `QUESTION_LOG_URL` | Apps Script web app URL for the anonymous question log (see below). Logging is skipped if unset. |
| `QUESTION_LOG_TOKEN` | shared secret matching the TOKEN in the Apps Script. |

## Question log + weekly review
Every question asked is logged anonymously (timestamp, question text, and
outcome — faq / egg / answered / unanswered / error; no IP, no user) to a
Google Sheet via a lightweight Apps Script web app. Unanswered questions also
land in a "Review Queue" tab, and a weekly trigger drafts a Gmail listing the
week's open ones. Setup steps are at the top of
[`apps_script/question_log.gs`](apps_script/question_log.gs). Weekly flow:
fill the Answer column, set Status to `approved`, and paste the Q&A into
`faqs.json` using the template above.

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

## Adding a FAQ
Curated answers live in `netlify/functions/faqs.json` and are checked BEFORE
retrieval — a hit returns the fixed answer verbatim and never calls the model.
To add one, paste this template into the array and edit it (then redeploy):

```json
{
  "id": "short-unique-slug",
  "question": "The question exactly as you want it cited?",
  "answer": "The approved answer, returned word-for-word. Use \n\n between paragraphs.",
  "aliases": [
    "other ways men phrase it",
    "add one alias per common phrasing"
  ]
}
```

Matching is fuzzy word overlap on `question` + `aliases` (word order,
punctuation, capitalization, and filler words don't matter). If a real
question isn't matching, add its phrasing as an alias. Keep aliases specific —
a one-word alias like "cost" will intercept every question containing that
word.

## Easter eggs
Playful answers live in `netlify/functions/easter_eggs.json` and match the
same fuzzy way as FAQs (on `triggers[]`), but render as a Barbarian Ambassador
card with no citation or disclaimer. FAQs win over eggs if both match. Add or
remove entries by editing the file and redeploying:

```json
{
  "id": "short-unique-slug",
  "triggers": ["ways men might ask it", "one per phrasing"],
  "answer": "The playful answer."
}
```

An entry with `"compute": "most_common_callsign"` fills `{callsign}`,
`{count}`, and `{total}` in its answer live from the roster.

## Updating the source docs or roster later
- Corpus: replace `corpus.json` and redeploy.
- Roster: export a fresh ContactsList users CSV plus the tribes-entries CSV
  (columns `id`, `title`), then run
  `python3 scripts/build_roster.py "/path/to/users.csv" "/path/to/tribes.csv"`
  and redeploy. Phone comes from the `phoneNumber` column (the man's own
  number, not `emergencyPhoneNumber`); tribe names resolve from the tribes CSV;
  birthdate and patch class are included when present.
