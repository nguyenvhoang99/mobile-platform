/* Host transport compatible with shared-platform host-bridge v1. */
(function () {
  'use strict';
  if (window.MiniAppBridge) return;
  var expense = location.hostname === 'manage-expense' || location.hostname === 'manage-expense.miniapp.platform.local';
  var caps = Object.freeze(expense ? {
    'storage.kv': Object.freeze({ ops: Object.freeze(['get', 'set', 'delete']) }),
    'ai.extract_expenses': Object.freeze({ ops: Object.freeze(['extract']) }),
    'notifications.schedule_digest': Object.freeze({ ops: Object.freeze(['schedule']) })
  } : {
    'storage.kv': Object.freeze({ ops: Object.freeze(['get', 'set', 'delete']) }),
    'scanner.scan': Object.freeze({ ops: Object.freeze(['scan']) }),
    'net.request': Object.freeze({ ops: Object.freeze(['request']) })
  });
  var port, pending = new Map(), sequence = 0;
  function fail(code) { return { ok: false, error: code, data: null }; }
  var connected;
  var ready = new Promise(function (resolve) { connected = resolve; });
  window.addEventListener('message', function (event) {
    if (event.data !== 'miniapp-port-v1' || !event.ports[0] || port) return;
    port = event.ports[0];
    port.onmessage = function (event) {
      var reply;
      try { reply = JSON.parse(event.data); } catch (_) { return; }
      var item = pending.get(reply.id);
      if (item) { clearTimeout(item.timer); pending.delete(reply.id); item.resolve(reply); }
    };
    port.start(); connected();
  });
  var request = function (envelope) {
    if (!envelope || typeof envelope !== 'object') return Promise.resolve(fail('INVALID_ARGUMENT'));
    if (!envelope.id) envelope = Object.assign({}, envelope, { id: 'host-' + (++sequence) });
    var wire;
    try { wire = JSON.stringify(envelope); } catch (_) { return Promise.resolve(fail('INVALID_ARGUMENT')); }
    var ios = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.miniapp;
    if (ios) return ios.postMessage(wire).catch(function () { return fail('UNAVAILABLE'); });
    return new Promise(function (resolve) {
      var expired = false;
      var timer = setTimeout(function () { expired = true; pending.delete(envelope.id); resolve(fail('TIMEOUT')); }, envelope.capability === 'ai.extract_expenses' ? 125000 : 65000);
      ready.then(function () {
        if (expired) return;
        if (pending.has(envelope.id)) { clearTimeout(timer); resolve(fail('INVALID_ARGUMENT')); return; }
        pending.set(envelope.id, { resolve: resolve, timer: timer });
        try { port.postMessage(wire); } catch (_) { clearTimeout(timer); pending.delete(envelope.id); resolve(fail('UNAVAILABLE')); }
      });
    });
  };
  Object.defineProperty(window, '__MINIAPP_CAPS__', { value: caps });
  Object.defineProperty(window, '__MINIAPP_RUNTIME__', { value: Object.freeze({ kind: 'host-webview', protocolVersion: 1 }) });
  Object.defineProperty(window, 'MiniAppBridge', { value: Object.freeze({ request: request }) });
  // WKWebView has no public switch for DOM persistence. Disable those page APIs
  // and use a fresh nonpersistent WKWebsiteDataStore per instance as defence in depth.
  ['localStorage', 'sessionStorage', 'indexedDB', 'caches', 'openDatabase'].forEach(function (key) {
    try { Object.defineProperty(window, key, { get: function () { throw new Error('Use host storage.kv'); } }); } catch (_) {}
  });
  try { Object.defineProperty(document, 'cookie', { get: function () { return ''; }, set: function () {} }); } catch (_) {}
})();
