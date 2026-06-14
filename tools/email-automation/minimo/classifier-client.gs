/**
 * Thin email-classifier client (account: minimo).
 *
 * This script does NO logic. It only:
 *   1. finds unread, not-yet-processed inbox threads,
 *   2. POSTs each email to our server (/api/email/classify),
 *   3. applies the server's decision to Gmail (labels / archive / mark read).
 *
 * All intelligence (Claude, hard rules, notes, greylist, Telegram) lives in
 * the server. Telegram is NEVER called from here — the server owns it.
 *
 * Config (Script Properties): API_BASE_URL, SHARED_SECRET, ACCOUNT.
 */

var PROCESSED_LABEL = 'AI-Classificata';
var MAX_PER_RUN = 40;

function classifyInbox() {
  runClassification_(MAX_PER_RUN, false);
}

/**
 * BULK: classify the whole unread backlog. Suppresses Telegram push (bulk:true)
 * and loops in batches until drained or near the ~6-min execution limit.
 * Re-run if it stops early — processed threads are skipped via the label.
 */
function classifyAllUnread() {
  var start = Date.now();
  var total = 0;
  while (true) {
    var n = runClassification_(MAX_PER_RUN, true);
    total += n;
    Logger.log('Bulk progress: ' + total + ' classified so far');
    if (n === 0) break;
    if (Date.now() - start > 5 * 60 * 1000) {
      Logger.log('Bulk stopped near time limit at ' + total + ' — re-run to continue.');
      break;
    }
  }
  Logger.log('Bulk done. Total classified this run: ' + total);
}

function runClassification_(limit, bulk) {
  var props = PropertiesService.getScriptProperties();
  var base = props.getProperty('API_BASE_URL');
  var secret = props.getProperty('SHARED_SECRET');
  var account = props.getProperty('ACCOUNT') || 'minimo';
  if (!base || !secret) {
    Logger.log('Missing API_BASE_URL or SHARED_SECRET in Script Properties');
    return 0;
  }

  var processed = getOrCreateLabel_(PROCESSED_LABEL);
  var threads = GmailApp.search('in:inbox is:unread -label:"' + PROCESSED_LABEL + '"', 0, limit);
  var count = 0;

  threads.forEach(function (thread) {
    var msg = thread.getMessages()[thread.getMessageCount() - 1];
    var body = '';
    try { body = (msg.getPlainBody() || '').slice(0, 600); } catch (e) {}

    var res = callClassify_(base, secret, {
      account: account,
      from: msg.getFrom() || '',
      subject: msg.getSubject() || '',
      bodySnippet: body,
      messageId: msg.getId(),
      bulk: bulk === true,
    });
    if (!res) { return; } // leave unprocessed; retry next run

    applyResult_(thread, res);
    thread.addLabel(processed);
    count++;
  });
  return count;
}

function callClassify_(base, secret, payload) {
  try {
    var resp = UrlFetchApp.fetch(base.replace(/\/$/, '') + '/api/email/classify', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + secret },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    if (resp.getResponseCode() !== 200) {
      Logger.log('classify HTTP ' + resp.getResponseCode() + ': ' + resp.getContentText());
      return null;
    }
    return JSON.parse(resp.getContentText());
  } catch (e) {
    Logger.log('classify error: ' + e);
    return null;
  }
}

function applyResult_(thread, res) {
  (res.labels || []).forEach(function (name) {
    thread.addLabel(getOrCreateLabel_(name));
  });
  if (res.markRead) { thread.markRead(); }
  if (res.archive) { thread.moveToArchive(); }
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

/** Run once to install the 15-min classifier trigger. */
function installClassifierTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (tr.getHandlerFunction() === 'classifyInbox') ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('classifyInbox').timeBased().everyMinutes(15).create();
}

/** Sanity check: confirms the server is reachable & authorized. */
function testClassifyEndpoint() {
  var props = PropertiesService.getScriptProperties();
  var res = callClassify_(props.getProperty('API_BASE_URL'), props.getProperty('SHARED_SECRET'), {
    account: props.getProperty('ACCOUNT') || 'minimo',
    from: 'Test <noreply@example.com>',
    subject: 'Test classification',
    bodySnippet: 'This is a test.',
    messageId: 'test',
  });
  Logger.log(JSON.stringify(res));
}
