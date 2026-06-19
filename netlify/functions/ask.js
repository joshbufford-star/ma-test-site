// netlify/functions/ask.js
// Grounded Q&A over MA source documents. Retrieval runs here; the model
// only ever sees the retrieved passages. The API key stays server-side.
const corpus = require("./corpus.json");

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

const STOP = new Set("the a an and or of to in is are be as at it for on with that this we you our your i he his him not but if so what how why who when do does can may her they them their from will would should us was were has have had about into more most".split(" "));
const stem = (w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) ? w.slice(0, -1) : w;
const terms = (s) => (s.toLowerCase().match(/[a-z0-9']+/g) || [])
  .filter((w) => (w.length > 2 || /^\d+$/.test(w)) && !STOP.has(w)).map(stem);

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
  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server is missing ANTHROPIC_API_KEY. Set it in Netlify site settings." }) };
  }
  let question = "";
  try { question = (JSON.parse(event.body || "{}").question || "").trim(); } catch (e) {}
  if (!question) return { statusCode: 400, body: JSON.stringify({ error: "No question provided." }) };

  const sources = retrieve(question, 8);
  if (!sources.length) return { statusCode: 200, body: JSON.stringify({ answered: false }) };

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
      return { statusCode: 502, body: JSON.stringify({ error: "Model call failed", detail: t.slice(0, 300) }) };
    }
    const data = await res.json();
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
    let parsed;
    try { parsed = JSON.parse(clean); } catch (e) { return { statusCode: 200, body: JSON.stringify({ answered: false }) }; }
    const src = sources.find((s) => s.id === parsed.source_id) || sources[0];
    const payload = parsed.answered
      ? { answered: true, answer: parsed.answer, quote: parsed.quote, src: { doc: src.doc, section: src.section, page: src.page, text: src.text } }
      : { answered: false };
    return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: "Could not reach the assistant." }) };
  }
};
