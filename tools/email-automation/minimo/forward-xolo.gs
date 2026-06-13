/**
 * Auto-forward fatture / ricevute -> Xolo ingest inbox (account: minimo).
 *
 * Gmail I/O only: searches supplier invoices, forwards with PDF to Xolo,
 * labels processed threads. After each forward it POSTs to our server
 * (/api/email/invoice-forwarded), which logs to Supabase and sends the
 * Telegram notification. Telegram is NEVER called from here.
 *
 * Config (Script Properties): API_BASE_URL, SHARED_SECRET, XOLO_TARGET.
 */

var CONFIG = {
  processedLabel: 'Inoltrate-Xolo',
  fromDomains: [
    'anthropic.com', 'supabase.com', 'vercel.com', 'gamma.app', 'hetzner.com',
    'stripe.com', 'railway.app', 'railway.com', 'tolt.io', 'n8n.io',
    'apify.com', 'intercom.io', 'github.com', 'namecheap.com',
  ],
  fromAddresses: ['finance@minimo.it', 'invoice+statements@mail.anthropic.com'],
  subjectKeywords: ['invoice', 'receipt', 'fattura', 'ricevuta'],
  phrases: ['payment received'],
  excludeSubject: ['payment failed', 'unsuccessful', 'action required', 'declined',
                   'invitation', 'invited you', 'security', 'reminder'],
  skipZeroAmount: true,
  lookbackDays: 2,
  onlyWithPdf: false,
  maxThreads: 300,
};

var SUPPLIER_RULES = [
  { name: '360dialog', re: /360dialog/i }, { name: 'Google Workspace', re: /google workspace/i },
  { name: 'GitHub', re: /github/i }, { name: 'Anthropic', re: /anthropic/i },
  { name: 'Supabase', re: /supabase/i }, { name: 'Vercel', re: /vercel/i },
  { name: 'Gamma', re: /gamma/i }, { name: 'Hetzner', re: /hetzner/i },
  { name: 'Railway', re: /railway/i }, { name: 'Tolt', re: /\btolt\b/i },
  { name: 'n8n', re: /\bn8n\b/i }, { name: 'Apify', re: /apify/i },
  { name: 'Intercom', re: /intercom/i }, { name: 'Namecheap', re: /namecheap/i },
  { name: 'Linear', re: /linear/i }, { name: 'Browserbase', re: /browserbase/i },
  { name: 'Firecrawl', re: /firecrawl/i }, { name: 'Minimo', re: /from minimo|minimo #/i },
];

function forwardInvoicesToXolo() {
  var props = PropertiesService.getScriptProperties();
  var target = props.getProperty('XOLO_TARGET');
  if (!target) { Logger.log('Missing XOLO_TARGET'); return; }

  var label = getOrCreateLabel_(CONFIG.processedLabel);
  var fromQ = CONFIG.fromDomains.map(function (d) { return 'from:' + d; })
    .concat(CONFIG.fromAddresses.map(function (a) { return 'from:' + a; }));
  var kwQ = CONFIG.subjectKeywords.map(function (k) { return 'subject:' + k; })
    .concat(CONFIG.phrases.map(function (p) { return '"' + p + '"'; }));
  var query = '(' + fromQ.join(' OR ') + ') (' + kwQ.join(' OR ') + ') ' +
              'newer_than:' + CONFIG.lookbackDays + 'd -label:' + CONFIG.processedLabel;

  var threads = GmailApp.search(query, 0, CONFIG.maxThreads);
  var forwarded = 0;
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      if (CONFIG.onlyWithPdf && !hasPdf_(msg)) return;
      if (isExcluded_(msg)) return;
      var amount = extractAmount_(msg);
      var parsed = parseAmount_(amount);
      if (CONFIG.skipZeroAmount && parsed.num === 0 && /\b0\s*(usd|eur|gbp|\$|€)/i.test(amount)) return;
      try {
        msg.forward(target);
        forwarded++;
        var supplier = supplierFromMsg_(msg);
        notifyServer_(props, { supplier: supplier, subject: msg.getSubject(),
          amount: amount, amountNum: parsed.num, currency: parsed.cur });
      } catch (e) { Logger.log('Errore inoltro: ' + e); }
    });
    thread.addLabel(label);
  });
  Logger.log('Inoltrate ' + forwarded + ' email');
}

function notifyServer_(props, payload) {
  var base = props.getProperty('API_BASE_URL');
  var secret = props.getProperty('SHARED_SECRET');
  if (!base || !secret) { Logger.log('Missing API_BASE_URL/SHARED_SECRET'); return; }
  try {
    UrlFetchApp.fetch(base.replace(/\/$/, '') + '/api/email/invoice-forwarded', {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + secret },
      payload: JSON.stringify(payload), muteHttpExceptions: true,
    });
  } catch (e) { Logger.log('notifyServer error: ' + e); }
}

function isExcluded_(msg) {
  var s = (msg.getSubject() || '').toLowerCase();
  return CONFIG.excludeSubject.some(function (k) { return s.indexOf(k) !== -1; });
}
function supplierFromMsg_(msg) {
  var hay = (msg.getSubject() || '') + ' ';
  try { hay += msg.getPlainBody() || ''; } catch (e) {}
  for (var i = 0; i < SUPPLIER_RULES.length; i++) {
    if (SUPPLIER_RULES[i].re.test(hay)) return SUPPLIER_RULES[i].name;
  }
  return supplierFromEmail_(msg.getFrom());
}
function extractAmount_(msg) {
  var b = ''; try { b = msg.getPlainBody() || ''; } catch (e) {}
  var t = (msg.getSubject() || '') + '\n' + b;
  var m = t.match(/(?:€|\$|EUR|USD|GBP)\s?\d[\d.,]*\d|\d[\d.,]*\d\s?(?:€|\$|EUR|USD|GBP)/i);
  if (m) return m[0].trim();
  m = t.match(/(?:€|\$|EUR|USD|GBP)\s?\d[\d.,]*|\d[\d.,]*\s?(?:€|\$|EUR|USD|GBP)/i);
  return m ? m[0].trim() : '';
}
function parseAmount_(a) {
  if (!a) return { num: 0, cur: '' };
  var c = '';
  if (/€|EUR/i.test(a)) c = 'EUR'; else if (/\$|USD/i.test(a)) c = 'USD'; else if (/£|GBP/i.test(a)) c = 'GBP';
  var n = a.replace(/[€$£]|EUR|USD|GBP/gi, '').trim();
  if (/,\d{2}$/.test(n)) n = n.replace(/\./g, '').replace(',', '.'); else n = n.replace(/,/g, '');
  var num = parseFloat(n);
  return { num: isNaN(num) ? 0 : num, cur: c };
}
function supplierFromEmail_(from) {
  var m = from.match(/@([^>\s]+)/); if (!m) return from;
  var h = m[1].toLowerCase().replace(/^.*\.(?=[^.]+\.[^.]+$)/, '');
  return h.split('.')[0];
}
function hasPdf_(msg) {
  return msg.getAttachments().some(function (a) {
    return /\.pdf$/i.test(a.getName()) || a.getContentType() === 'application/pdf';
  });
}
/** Run once. De-duplicates: deletes existing forward triggers before recreating. */
function installForwardTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (tr.getHandlerFunction() === 'forwardInvoicesToXolo') ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('forwardInvoicesToXolo').timeBased().everyMinutes(30).create();
}
