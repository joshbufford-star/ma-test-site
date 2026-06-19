// netlify/functions/directory.js
// Password-gated tribesman lookup. The roster (PII) lives ONLY here in the
// function bundle, never in the public site, and is never returned in bulk.
const roster = require("./roster.json");

const LEADER_PASSWORD = process.env.LEADER_PASSWORD || "";

function fmtPhone(p) {
  if (!p) return "";
  const d = ("" + p).replace(/[^\d]/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === "1") return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return p;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (e) {}
  const pw = (body.password || "").trim();
  const q = (body.query || "").trim().toLowerCase();

  if (!LEADER_PASSWORD) return { statusCode: 500, body: JSON.stringify({ error: "Directory not configured: set LEADER_PASSWORD in Netlify." }) };
  if (pw !== LEADER_PASSWORD) return { statusCode: 401, body: JSON.stringify({ error: "Invalid leader password." }) };
  if (q.length < 2) return { statusCode: 200, body: JSON.stringify({ results: [] }) };

  const hits = [];
  for (const p of roster) {
    const call = (p.c || "").toLowerCase();
    const blob = `${p.c || ""} ${p.n || ""} ${p.t || ""} ${p.r || ""} ${p.e || ""}`.toLowerCase();
    if (blob.includes(q)) {
      let rank = 2;
      if (call.startsWith(q)) rank = 0; else if (call.includes(q)) rank = 1;
      hits.push({ p, rank });
      if (hits.length > 400) break;
    }
  }
  hits.sort((a, b) => a.rank - b.rank || (a.p.c || a.p.n).localeCompare(b.p.c || b.p.n));
  const results = hits.slice(0, 50).map((h) => ({
    callsign: h.p.c || "", name: h.p.n || "", role: h.p.r || "",
    tribe: h.p.t || "", email: h.p.e || "", phone: fmtPhone(h.p.p),
  }));
  return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ results, total: roster.length }) };
};
