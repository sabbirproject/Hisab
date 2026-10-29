/* start.js — boot the app and register the service worker (only where it can work). */
(function () {
  function go() {
    if (!window.indexedDB) { document.getElementById('root').innerHTML = '<div style="padding:24px;font-family:sans-serif"><h2>Browser not supported</h2><p>IndexedDB is not available (private mode?). Open this page in a normal browser window.</p></div>'; return; }
    window.GD.App.boot().catch(function (e) { console.error(e); document.getElementById('root').innerHTML = '<div style="padding:24px;font-family:sans-serif"><h2>Startup error</h2><p>' + String(e && e.message || e).replace(/</g, '&lt;') + '</p></div>'; });
    var cfg = window.GD_CONFIG || {};
    if (cfg.PWA !== false && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* host without SW support: app still works online */ });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
