// Retreat Showdown vote collector.
// Paste into the retreat sheet: Extensions → Apps Script. Deploy → New deployment → Web app,
// Execute as: Me, Who has access: Anyone. Copy the /exec URL into config.js.

var SHEET_NAME = 'Votes';
var HEADERS = ['vote_id', 'timestamp', 'voter', 'left_id', 'left_label', 'right_id', 'right_label',
               'winner_id', 'winner_label', 'loser_id', 'loser_label', 'matchup_number', 'device'];

function votesSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function findRow_(sh, voteId) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === String(voteId)) return i + 2;
  }
  return 0;
}

// Listing IDs are long numbers; the leading apostrophe keeps Sheets from rounding them.
function text_(v) { return "'" + String(v || ''); }

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var d = JSON.parse(e.postData.contents);
    var sh = votesSheet_();
    if (d.action === 'vote') {
      if (findRow_(sh, d.vote_id)) return json_({ ok: true, duplicate: true });
      sh.appendRow([
        d.vote_id, new Date(), String(d.voter || '').slice(0, 40),
        text_(d.left_id), d.left_label, text_(d.right_id), d.right_label,
        text_(d.winner_id), d.winner_label, text_(d.loser_id), d.loser_label,
        Number(d.n) || '', /Mobi/.test(d.ua || '') ? 'phone' : 'computer'
      ]);
      return json_({ ok: true });
    }
    if (d.action === 'undo') {
      var row = findRow_(sh, d.vote_id);
      if (row) sh.deleteRow(row);
      return json_({ ok: true, removed: !!row });
    }
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Returns one voter's past picks so they can continue on another device.
function doGet(e) {
  var voter = String((e.parameter && e.parameter.voter) || '').trim().toLowerCase();
  var sh = votesSheet_();
  var last = sh.getLastRow();
  var votes = [];
  if (voter && last >= 2) {
    var rows = sh.getRange(2, 1, last - 1, HEADERS.length).getDisplayValues();
    rows.forEach(function (r) {
      if (String(r[2]).trim().toLowerCase() === voter) {
        votes.push({ vote_id: r[0], left: r[3], right: r[5], winner: r[7] });
      }
    });
  }
  return json_({ ok: true, votes: votes });
}
