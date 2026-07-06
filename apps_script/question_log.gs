/**
 * Barbarian Bot — question log endpoint + weekly review digest.
 *
 * Setup (one time, ~5 minutes):
 * 1. Create a Google Sheet (any name). Copy its ID from the URL
 *    (the long string between /d/ and /edit) into SHEET_ID below.
 * 2. In the Sheet: Extensions → Apps Script. Paste this whole file.
 * 3. Invent a long random string for TOKEN below (this same string goes in
 *    the Netlify env var QUESTION_LOG_TOKEN).
 * 4. Deploy → New deployment → type "Web app" → execute as Me →
 *    access "Anyone". Copy the web app URL into the Netlify env var
 *    QUESTION_LOG_URL. Redeploy the site.
 * 5. In Apps Script: Triggers (clock icon) → Add trigger → weeklyDigest →
 *    time-driven → week timer → pick a day/hour. First run will ask for
 *    Gmail + Sheets permissions.
 *
 * Weekly flow: fill the Answer column in the Review Queue tab and set
 * Status to "approved", then paste the Q&A into faqs.json using the README
 * template. Any non-blank Status stops a row from appearing in later digests.
 */

var SHEET_ID = "1_sP8sHKHhn8cgSBKMv6vyzvHdLwC5l031qoWK-MXeko";
var TOKEN = "1_sP8sHKHhn8cgSBKMv6vyzvHdLwC5l031qoWK-MXeko";
var DIGEST_TO = "sheepdog@mensalliancetribe.com";

var ALL_TAB = "All Questions";
var QUEUE_TAB = "Review Queue";

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) return jsonOut({ ok: false, error: "bad token" });
    var q = String(body.question || "").slice(0, 500);
    var outcome = String(body.outcome || "").slice(0, 40);
    if (!q) return jsonOut({ ok: false, error: "no question" });

    var ss = SpreadsheetApp.openById(SHEET_ID);
    var ts = new Date();
    getTab(ss, ALL_TAB, ["Timestamp", "Question", "Outcome"]).appendRow([ts, q, outcome]);
    if (outcome === "unanswered") {
      getTab(ss, QUEUE_TAB, ["Timestamp", "Question", "Answer", "Status"]).appendRow([ts, q, "", ""]);
    }
    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function getTab(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Weekly time-trigger: drafts a Gmail listing the week's open questions. */
function weeklyDigest() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(QUEUE_TAB);
  if (!sh || sh.getLastRow() < 2) return;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  var weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  var open = rows.filter(function (r) {
    return r[0] && new Date(r[0]).getTime() >= weekAgo && !String(r[3]).trim();
  });
  if (!open.length) return;

  var tz = Session.getScriptTimeZone();
  var lines = open.map(function (r, i) {
    return (i + 1) + ". [" + Utilities.formatDate(new Date(r[0]), tz, "MM/dd") + "] " + r[1];
  });
  var body =
    "Unanswered Barbarian Bot questions from the past week:\n\n" +
    lines.join("\n") +
    "\n\nFill the Answer column and set Status to approved, then paste the " +
    "approved Q&A into faqs.json using the README template.\n\n" +
    ss.getUrl();
  GmailApp.createDraft(
    DIGEST_TO,
    "Barbarian Bot: " + open.length + " unanswered question(s) this week",
    body
  );
}
