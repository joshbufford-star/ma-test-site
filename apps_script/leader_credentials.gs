/**
 * Barbarian Bot — per-leader directory credentials endpoint.
 *
 * Setup (one time, ~5 minutes):
 * 1. Create a Google Sheet with header row: callsign | password | active
 *    One row per leader. Leave "active" blank (or TRUE/yes/x) for active;
 *    put FALSE or no to disable a leader without deleting the row.
 * 2. Copy the Sheet ID from the URL into SHEET_ID below.
 * 3. In the Sheet: Extensions → Apps Script. Paste this whole file.
 * 4. Invent a long random string for TOKEN below (this same string goes in
 *    the Netlify env var LEADER_CREDS_TOKEN).
 * 5. Deploy → New deployment → type "Web app" → execute as Me →
 *    access "Anyone". Copy the web app URL into the Netlify env var
 *    LEADER_CREDS_URL. Redeploy the site.
 *
 * The site caches this list for 5 minutes, so edits here take effect within
 * about 5 minutes without a redeploy. Only active rows are ever returned,
 * and only to callers presenting the token.
 */

var SHEET_ID = "PASTE_SHEET_ID_HERE";
var TOKEN = "PASTE_A_LONG_RANDOM_STRING_HERE";
var TAB = ""; // optional tab name; blank = first tab

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) return jsonOut({ ok: false, error: "bad token" });

    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sh = (TAB && ss.getSheetByName(TAB)) || ss.getSheets()[0];
    var values = sh.getDataRange().getValues();
    if (values.length < 2) return jsonOut({ ok: true, leaders: [] });

    var headers = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var ci = headers.indexOf("callsign");
    var pi = headers.indexOf("password");
    var ai = headers.indexOf("active");
    if (ci === -1 || pi === -1) return jsonOut({ ok: false, error: "need callsign and password columns" });

    var leaders = [];
    for (var i = 1; i < values.length; i++) {
      var cs = String(values[i][ci] || "").trim();
      var pw = String(values[i][pi] || "").trim();
      if (!cs || !pw) continue;
      if (ai !== -1) {
        var a = String(values[i][ai] || "").trim().toLowerCase();
        if (a && a !== "true" && a !== "yes" && a !== "1" && a !== "x") continue;
      }
      leaders.push({ callsign: cs, password: pw });
    }
    return jsonOut({ ok: true, leaders: leaders });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
