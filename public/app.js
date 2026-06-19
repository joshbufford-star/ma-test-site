// app.js — talks to /api/ask and /api/directory (Netlify functions)
const $ = (id) => document.getElementById(id);
const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])));

/* ---------- tabs ---------- */
$("tab-ask").onclick = () => switchTab("ask");
$("tab-dir").onclick = () => switchTab("dir");
function switchTab(t) {
  const ask = t === "ask";
  $("tab-ask").classList.toggle("on", ask);
  $("tab-dir").classList.toggle("on", !ask);
  $("view-ask").classList.toggle("hidden", !ask);
  $("view-dir").classList.toggle("hidden", ask);
}

/* ---------- ask ---------- */
const EXAMPLES = [
  "What is Men's Alliance?",
  "How is the patch earned?",
  "What is rule 6?",
  "How do I give good feedback?",
  "Why are you a Christian?",
  "What is the alcohol policy?",
];
$("chips").innerHTML = EXAMPLES.map((x) => `<button class="chip">${esc(x)}</button>`).join("");
[...document.querySelectorAll("#chips .chip")].forEach((b) => {
  b.onclick = () => { $("q").value = b.textContent; runAsk(); };
});
$("askBtn").onclick = runAsk;
$("q").addEventListener("keydown", (e) => { if (e.key === "Enter") runAsk(); });

let asking = false;
async function runAsk() {
  const question = $("q").value.trim();
  if (!question || asking) return;
  asking = true; $("askBtn").disabled = true;
  $("askOut").innerHTML = `<div class="load">Searching the source documents…</div>`;
  try {
    const r = await fetch("/api/ask", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await r.json();
    if (!r.ok) { $("askOut").innerHTML = `<div class="err">${esc(data.error || "Something went wrong.")}</div>`; }
    else if (data.answered) { renderAnswer(data); }
    else { renderFallback(question); }
  } catch (e) {
    $("askOut").innerHTML = `<div class="err">Couldn't reach the assistant. Try again.</div>`;
  }
  asking = false; $("askBtn").disabled = false;
}

function renderAnswer(d) {
  const page = d.src.page ? ` · p. ${esc(d.src.page)}` : "";
  $("askOut").innerHTML = `
    <div class="card">
      <div class="ans">${esc(d.answer)}</div>
      ${d.quote ? `<div class="quote">"${esc(d.quote)}"</div>` : ""}
      <div class="cite">
        <span class="tag">${esc(d.src.doc)}</span>
        <span class="tagsub">${esc(d.src.section)}${page}</span>
      </div>
      <div class="srcwrap">
        <button class="srcbtn" id="srcToggle">View full passage</button>
        <div class="srcbody hidden" id="srcBody">${esc(d.src.text)}
          <div class="note">In production this links to the full document for complete context.</div>
        </div>
      </div>
      <div class="disc">Answers are drawn from MA source documents. Verify with your leader for official guidance.</div>
    </div>`;
  $("srcToggle").onclick = () => {
    const b = $("srcBody"); const hidden = b.classList.toggle("hidden");
    $("srcToggle").textContent = hidden ? "View full passage" : "Hide full passage";
  };
}

function renderFallback(question) {
  const mailto = `mailto:info@mensalliancetribe.com?subject=${encodeURIComponent("Tribesman question")}&body=${encodeURIComponent(question)}`;
  $("askOut").innerHTML = `
    <div class="fb">
      <div class="fbh">Sorry — I don't have that information.</div>
      <div class="fbp">That answer isn't in the current source documents. Here's where to take it next.</div>
      <div class="opts">
        <a class="opt" href="#" onclick="return false;">
          <div class="optt">Ask your regional or divisional leader</div>
          <div class="optd">Your tribe leadership can answer questions specific to your area.</div>
        </a>
        <a class="opt" href="${mailto}">
          <div class="optt">Send it to info@mensalliancetribe.com</div>
          <div class="optd">Submit your question and the team will route it to the right person.</div>
        </a>
      </div>
    </div>`;
}

/* ---------- directory ---------- */
let leaderPw = "";
$("pwBtn").onclick = unlock;
$("pw").addEventListener("keydown", (e) => { if (e.key === "Enter") unlock(); });

async function unlock() {
  const pw = $("pw").value.trim();
  if (!pw) return;
  // validate by attempting a probe search
  try {
    const r = await fetch("/api/directory", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: pw, query: "" }),
    });
    if (r.status === 401) { $("pwErr").classList.remove("hidden"); return; }
    const data = await r.json();
    leaderPw = pw;
    $("pwErr").classList.add("hidden");
    $("gate").classList.add("hidden");
    $("dirMain").classList.remove("hidden");
    if (data.total) $("dirHead").textContent = `Search ${data.total.toLocaleString()} men by callsign, name, tribe, or role`;
    $("dq").focus();
  } catch (e) { $("pwErr").textContent = "Couldn't reach the directory. Try again."; $("pwErr").classList.remove("hidden"); }
}

let dirTimer = null;
$("dq").addEventListener("input", () => {
  clearTimeout(dirTimer);
  dirTimer = setTimeout(searchDir, 180);
});

async function searchDir() {
  const q = $("dq").value.trim();
  if (q.length < 2) { $("dirRes").innerHTML = `<div class="note">Type at least 2 characters to search.</div>`; return; }
  try {
    const r = await fetch("/api/directory", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: leaderPw, query: q }),
    });
    const data = await r.json();
    const rows = data.results || [];
    if (!rows.length) { $("dirRes").innerHTML = `<div class="prow">No match in the roster.</div>`; return; }
    $("dirRes").innerHTML = rows.map((p) => `
      <div class="person">
        <div class="pcall">${esc(p.callsign || "(no callsign)")}</div>
        <div class="prow">${esc(p.name)}${p.role ? " · " + esc(p.role) : ""}</div>
        ${p.tribe ? `<div class="prow">Tribe: ${esc(p.tribe)}</div>` : ""}
        <div class="prow">${[esc(p.email), esc(p.phone)].filter(Boolean).join(" · ")}</div>
      </div>`).join("") + (rows.length >= 50 ? `<div class="note">Showing first 50 matches. Narrow your search to see more.</div>` : "");
  } catch (e) { $("dirRes").innerHTML = `<div class="err">Search failed. Try again.</div>`; }
}
