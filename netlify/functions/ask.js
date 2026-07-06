// netlify/functions/ask.js
// Grounded Q&A over MA source documents. Retrieval runs here; the model
// only ever sees the retrieved passages. The API key stays server-side.
const corpus = require("./corpus.json");
const faqs = require("./faqs.json");
const eggs = require("./easter_eggs.json");

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

const STOP = new Set("the a an and or of to in is are be as at it for on with that this we you our your i he his him not but if so what how why who when do does can may her they them their from will would should us was were has have had about into more most".split(" "));
const stem = (w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) ? w.slice(0, -1) : w;
const terms = (s) => (s.toLowerCase().match(/[a-z0-9']+/g) || [])
  .filter((w) => (w.length > 2 || /^\d+$/.test(w)) && !STOP.has(w)).map(stem);

// Curated FAQ layer: fuzzy-match the question against faqs.json BEFORE
// retrieval. A hit returns the fixed approved answer and never calls the
// model. Apostrophes are stripped so "what's"/"whats" and "men's"/"mens"
// compare equal. "men's alliance" appears in nearly every question, so those
// tokens carry no signal and are ignored while both sides still have real
// words left.
const mterms = (s) => terms(String(s).replace(/[''']/g, ""));
const BRAND = new Set(["men", "mens", "ma", "alliance"]);
const dice = (a, b) => {
  let inter = 0; a.forEach((t) => { if (b.has(t)) inter++; });
  return (2 * inter) / (a.size + b.size);
};
const normPhrase = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function matchEntries(question, entries, candidatesOf) {
  const qFull = new Set(mterms(question));
  if (!qFull.size) {
    // question is all stopwords ("who are you?") — exact phrase match only
    const qn = normPhrase(question);
    for (const entry of entries) {
      for (const cand of candidatesOf(entry)) if (normPhrase(cand) === qn) return entry;
    }
    return null;
  }
  const qCore = new Set([...qFull].filter((t) => !BRAND.has(t)));
  let best = null, bestScore = 0;
  for (const entry of entries) {
    for (const cand of candidatesOf(entry)) {
      const cFull = new Set(mterms(cand));
      if (!cFull.size) continue;
      const cCore = new Set([...cFull].filter((t) => !BRAND.has(t)));
      let score;
      if (qCore.size && cCore.size) {
        score = dice(qCore, cCore);
        // every content word of the candidate present in the question
        if (cCore.size >= 3 && [...cCore].every((t) => qCore.has(t))) score = Math.max(score, 0.9);
      } else {
        // one side is only brand words: require a near-exact full match
        score = dice(qFull, cFull) >= 0.9 ? dice(qFull, cFull) : 0;
      }
      if (score > bestScore) { bestScore = score; best = entry; }
    }
  }
  return bestScore >= 0.72 ? best : null;
}
const matchFaq = (q) => matchEntries(q, faqs, (f) => [f.question, ...(f.aliases || [])]);
const matchEgg = (q) => matchEntries(q, eggs, (e) => e.triggers || []);

// Easter eggs marked "compute" are filled in live from the roster.
function eggAnswer(egg) {
  if (egg.compute === "most_common_callsign") {
    const roster = require("./roster.json");
    const counts = {};
    for (const p of roster) {
      const c = (p.c || "").replace(/[^a-zA-Z0-9 .\-!]/g, "").trim().toLowerCase();
      if (c) counts[c] = (counts[c] || 0) + 1;
    }
    let top = "", n = 0;
    for (const c in counts) if (counts[c] > n) { n = counts[c]; top = c; }
    const display = roster.find((p) => (p.c || "").replace(/[^a-zA-Z0-9 .\-!]/g, "").trim().toLowerCase() === top);
    return egg.answer
      .replace("{callsign}", (display ? display.c.replace(/[^a-zA-Z0-9 .\-!]/g, "").trim() : top))
      .replace("{count}", n)
      .replace("{total}", roster.length.toLocaleString("en-US"));
  }
  return egg.answer;
}

// Anonymous question log: timestamp + question + outcome only (no IP, no
// user). POSTs to an Apps Script web app (see apps_script/question_log.gs).
// Short timeout + swallowed errors so a slow or dead log endpoint can never
// break an answer. No-op unless QUESTION_LOG_URL is configured.
async function logQuestion(question, outcome) {
  const url = process.env.QUESTION_LOG_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: process.env.QUESTION_LOG_TOKEN || "", question, outcome }),
      signal: AbortSignal.timeout(1500),
    });
  } catch (e) {}
}

function retrieve(q, k = 8) {
  const qt = terms(q); if (!qt.length) return [];
  const qset = new Set(qt);
  const df = {};
  corpus.forEach((c) => { new Set(terms(c.text)).forEach((t) => (df[t] = (df[t] || 0) + 1)); });
  const N = corpus.length;
  const scored = corpus.map((c) => {
    const tt = terms(c.text); const tf = {};
    tt.forEach((t) => (tf[t] = (tf[t] || 0) + 1));
    let s = 0;
    qset.forEach((t) => { if (tf[t]) { const idf = Math.log(1 + N / (df[t] || 1)); s += (tf[t] / tt.length) * idf * 10 + idf; } });
    const sec = terms(c.section);
    qset.forEach((t) => { if (sec.includes(t)) s += 2; });
    return { c, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, k);
  return scored.map((x) => x.c);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  let question = "";
  try { question = (JSON.parse(event.body || "{}").question || "").trim(); } catch (e) {}
  if (!question) return { statusCode: 400, body: JSON.stringify({ error: "No question provided." }) };

  // FAQ and easter-egg hits never touch the model, so they work even
  // without an API key. Official FAQ copy wins over eggs on any overlap.
  const faq = matchFaq(question);
  if (faq) {
    await logQuestion(question, "faq");
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        answered: true, faq: true, answer: faq.answer,
        src: { doc: "Men's Alliance FAQs", section: faq.question },
      }),
    };
  }
  const egg = matchEgg(question);
  if (egg) {
    await logQuestion(question, "egg");
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answered: true, egg: true, answer: eggAnswer(egg) }),
    };
  }

  const sources = retrieve(question, 8);
  if (!sources.length) {
    await logQuestion(question, "unanswered");
    return { statusCode: 200, body: JSON.stringify({ answered: false }) };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server is missing ANTHROPIC_API_KEY. Set it in Netlify site settings." }) };
  }

  const srcText = sources.map((s) =>
    `[SOURCE ${s.id}] DOC: ${s.doc} | SECTION: ${s.section}${s.page ? ` | PAGE: ${s.page}` : ""}\n${s.text}`
  ).join("\n\n");

  const sys = `You are the Men's Alliance source assistant. You answer questions for tribesmen using ONLY the SOURCES provided below. These are Men's Alliance ministry documents.

RULES:
- Use ONLY the SOURCES. Never use outside knowledge or the internet.
- If the SOURCES do not clearly and directly answer the question, set "answered" to false. Do not guess or stretch.
- Keep the answer plain and direct, 1-4 sentences, faithful to the source wording.
- Pick the ONE source that best supports your answer for the citation.
- "quote" must be copied verbatim from that one source, 40 words or fewer.
- Respond with ONLY a JSON object, no markdown, no preamble:
{"answered": boolean, "answer": string, "quote": string, "source_id": number}

SOURCES:
${srcText}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        messages: [{ role: "user", content: `${sys}\n\nQUESTION: ${question}` }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      await logQuestion(question, "error");
      return { statusCode: 502, body: JSON.stringify({ error: "Model call failed", detail: t.slice(0, 300) }) };
    }
    const data = await res.json();
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
    let parsed;
    try { parsed = JSON.parse(clean); } catch (e) {
      await logQuestion(question, "unanswered");
      return { statusCode: 200, body: JSON.stringify({ answered: false }) };
    }
    const src = sources.find((s) => s.id === parsed.source_id) || sources[0];
    const payload = parsed.answered
      ? { answered: true, answer: parsed.answer, quote: parsed.quote, src: { doc: src.doc, section: src.section, page: src.page, text: src.text } }
      : { answered: false };
    await logQuestion(question, parsed.answered ? "answered" : "unanswered");
    return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) };
  } catch (e) {
    await logQuestion(question, "error");
    return { statusCode: 502, body: JSON.stringify({ error: "Could not reach the assistant." }) };
  }
};
