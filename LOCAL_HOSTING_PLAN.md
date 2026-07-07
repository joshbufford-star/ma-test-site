# Local Hosting Plan (filed for later — do not build yet)

**Goal:** move the Barbarian Bot off Netlify + the Anthropic API onto a cloud
VM we control, so per-question token cost goes to zero and the corpus/roster
never leave a machine we administer.

**When to pull the trigger:** don't. Not until one of these is true —
(a) API spend is consistently above ~$75–100/mo (below that, a capable VM
costs more than the tokens it saves), (b) question volume is high enough that
rate limits pinch real users, or (c) a data-control decision requires PII off
third-party processors. Until then this file just waits.

## Target architecture
One VM (Hetzner / DigitalOcean / Lightsail class, 8–16 GB RAM; add a small
GPU tier only if answer latency on CPU proves unacceptable). Docker Compose,
three containers:

1. **API app** (Node or FastAPI) — ports today's `ask.js` / `directory.js`
   logic nearly line-for-line: FAQ layer, easter eggs, logging, rate limit,
   and auth are all plain code with no Netlify dependency.
2. **Embeddings + retrieval** — replace TF-IDF with local embeddings
   (e.g. `nomic-embed-text` or `bge-small` via Ollama/sentence-transformers).
   Precompute vectors for the corpus at deploy; at 210 passages (even 10x
   that) cosine top-k in memory is instant — **no vector database needed**.
   This is the biggest quality win: retrieval catches meaning, not keywords.
3. **Open-weight model** via Ollama or vLLM — a quantized 8–14B instruct
   model (Llama 3.1 8B / Qwen 2.5 14B class) handles "answer from these
   passages with a verbatim quote" well. CPU-only inference runs ~5–15
   tokens/sec (usable but slow); a small GPU makes it feel like the API.

The frontend stays exactly as it is — it already talks to two JSON endpoints,
so it can stay on Netlify (static hosting is free) pointed at the VM's API,
which is also precisely the split the future widget embed needs.

## Roster / PII handling
`roster.json` and the corpus live only on the VM's encrypted disk, same
never-in-bulk search rules as today. Firewall to 443 only; automatic security
updates; nightly encrypted backup to a bucket we own. Leader credentials
could move from the Google Sheet to the VM too, but keeping the Sheet is fine
— it's the management UI Josh already uses. Net PII posture improves: no
model provider, no Netlify bundle, one machine to reason about.

## Migration steps and rough effort
1. Provision VM, harden, Docker Compose skeleton — **half a day**
2. Port the two functions to a small API app (mostly copy/paste) — **half a day**
3. Embedding pipeline + swap retrieval, verify against current answers — **1 day**
4. Stand up local model, tune the answer-envelope prompt for it, side-by-side
   quality check against Sonnet on ~50 real logged questions — **1–2 days**
5. Cut over DNS, keep Netlify build as instant rollback — **half a day**

**Total: roughly 3–4 focused days**, plus the honest cost: we become the ops
team (patching, monitoring, disk space, model updates). That ongoing burden,
not the build, is the real price.

## Intermediate option worth considering first
Local embeddings can be adopted **without leaving Netlify** (precomputed
vectors ship in the function bundle; the embedding of the incoming question
is the only new work). That captures most of the retrieval quality win while
keeping Anthropic for answer quality and zero ops. Cheapest path to better
answers; revisit full migration only when the spend or policy trigger fires.
