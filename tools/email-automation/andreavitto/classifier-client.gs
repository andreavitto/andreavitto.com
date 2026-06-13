/**
 * Thin email-classifier client (account: andreavitto).
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
  var props = PropertiesService.getScriptProperties();
  var base = props.getProperty('API_BASE_URL');
  var secret = props.getProperty('SHARED_SECRET');
  var account = props.getProperty('ACCOUNT') || 'andreavitto';
  if (!base || !secret) {
    Logger.log('Missing API_BASE_URL or SHARED_SECRET in Script Properties');
    return;
  }

  var processed = getOrCreateLabel_(PROCESSED_LABEL);
  var threads = GmailApp.search('in:inbox is:unread -label:"' + PROCESSED_LABEL + '"', 0, MAX_PER_RUN);

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
    });
    if (!res) { return; } // leave unprocessed; retry next run

    applyResult_(thread, res);
    thread.addLabel(processed);
  });
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

/** Run once to install the 15-min trigger. */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (tr.getHandlerFunction() === 'classifyInbox') ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('classifyInbox').timeBased().everyMinutes(15).create();
}

/** Sanity check: confirms the server is reachable & authorized. */
function testClassifyEndpoint() {
  var props = PropertiesService.getScriptProperties();
  var res = callClassify_(props.getProperty('API_BASE_URL'), props.getProperty('SHARED_SECRET'), {
    account: props.getProperty('ACCOUNT') || 'andreavitto',
    from: 'Test <noreply@example.com>',
    subject: 'Test classification',
    bodySnippet: 'This is a test.',
    messageId: 'test',
  });
  Logger.log(JSON.stringify(res));
}
