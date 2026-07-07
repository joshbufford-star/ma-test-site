// netlify/functions/directory.js
// Login-gated tribesman lookup. The roster (PII) lives ONLY here in the
// function bundle, never in the public site, and is never returned in bulk.
//
// Auth: per-leader callsign|password rows from a Google Sheet, served by an
// Apps Script endpoint (see apps_script/leader_credentials.gs) and cached
// here for 5 minutes. Gate only — no per-user tracking of any kind. Falls
// back to the shared LEADER_PASSWORD env var until the sheet is configured.
const roster = require("./roster.json");

const CACHE_TTL_MS = 5 * 60 * 1000;
let credCache = { leaders: null, at: 0 };

async function getLeaders() {
  if (credCache.leaders && Date.now() - credCache.at < CACHE_TTL_MS) return credCache.leaders;
  try {
    const res = await fetch(process.env.LEADER_CREDS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: process.env.LEADER_CREDS_TOKEN || "" }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    if (data && data.ok && Array.isArray(data.leaders)) {
      credCache = { leaders: data.leaders, at: Date.now() };
      return data.leaders;
    }
  } catch (e) {}
  return credCache.leaders; // sheet unreachable: stale cache beats a lockout
}

// true = valid login, false = rejected, null = server not configured,
// "unavailable" = creds sheet configured but unreachable with no cache.
// The shared-password fallback applies ONLY when no creds sheet is
// configured — a slow or failing sheet must never downgrade auth.
async function authenticate(body) {
  if (process.env.LEADER_CREDS_URL) {
    const leaders = await getLeaders();
    if (!leaders) return "unavailable";
    const cs = (body.callsign || "").trim().toLowerCase();
    const pw = (body.password || "").trim();
    if (!cs || !pw) return false;
    return leaders.some((l) => String(l.callsign).trim().toLowerCase() === cs && String(l.password) === pw);
  }
  const shared = (process.env.LEADER_PASSWORD || "").trim();
  if (!shared) return null;
  return (body.password || "").trim() === shared;
}

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
  const q = (body.query || "").trim().toLowerCase();

  const auth = await authenticate(body);
  if (auth === null) return { statusCode: 500, body: JSON.stringify({ error: "Directory not configured: set LEADER_CREDS_URL or LEADER_PASSWORD in Netlify." }) };
  if (auth === "unavailable") return { statusCode: 503, body: JSON.stringify({ error: "The directory is waking up — try again in a few seconds." }) };
  if (auth !== true) return { statusCode: 401, body: JSON.stringify({ error: "Invalid leader login." }) };
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
    birthdate: h.p.b || "", patchClass: h.p.pc || "",
  }));
  return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ results, total: roster.length }) };
};
