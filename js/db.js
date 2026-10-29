/* GD Expense Tracker — tiny IndexedDB wrapper with in-memory fallback */
(function () {
  'use strict';
  var GD = (window.GD = window.GD || {});
  var STORES = ['transactions', 'accounts', 'categories', 'transfers', 'budgets', 'recurring', 'outbox', 'meta', 'blobs'];
  var kp = function (s) { return s === 'meta' ? 'k' : 'id'; };

  function memHandle(name) {
    var m = {}; STORES.forEach(function (s) { m[s] = new Map(); });
    return {
      memory: true, name: name,
      get: function (s, k) { return Promise.resolve(m[s].get(k)); },
      put: function (s, o) { m[s].set(o[kp(s)], o); return Promise.resolve(); },
      putMany: function (s, a) { a.forEach(function (o) { m[s].set(o[kp(s)], o); }); return Promise.resolve(); },
      del: function (s, k) { m[s].delete(k); return Promise.resolve(); },
      all: function (s) { return Promise.resolve(Array.from(m[s].values())); },
      clear: function (s) { m[s].clear(); return Promise.resolve(); },
      close: function () {}
    };
  }

  function wrap(db, name) {
    var os = function (s, mode) { return db.transaction(s, mode).objectStore(s); };
    var p = function (r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); };
    return {
      memory: false, name: name,
      get: function (s, k) { return p(os(s, 'readonly').get(k)); },
      put: function (s, o) { return p(os(s, 'readwrite').put(o)); },
      putMany: function (s, a) {
        return new Promise(function (res, rej) {
          var t = db.transaction(s, 'readwrite'), st = t.objectStore(s);
          a.forEach(function (o) { st.put(o); });
          t.oncomplete = function () { res(); }; t.onerror = function () { rej(t.error); };
        });
      },
      del: function (s, k) { return p(os(s, 'readwrite').delete(k)); },
      all: function (s) { return p(os(s, 'readonly').getAll()); },
      clear: function (s) { return p(os(s, 'readwrite').clear()); },
      close: function () { try { db.close(); } catch (e) {} }
    };
  }

  function open(name) {
    return new Promise(function (resolve) {
      if (!window.indexedDB) return resolve(memHandle(name));
      var req;
      try { req = indexedDB.open(name, 1); } catch (e) { return resolve(memHandle(name)); }
      req.onupgradeneeded = function () {
        var db = req.result;
        STORES.forEach(function (s) { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: kp(s) }); });
      };
      req.onsuccess = function () { resolve(wrap(req.result, name)); };
      req.onerror = function () { resolve(memHandle(name)); };
      req.onblocked = function () { resolve(memHandle(name)); };
    });
  }
  function drop(name) {
    return new Promise(function (res) {
      try { var r = indexedDB.deleteDatabase(name); r.onsuccess = r.onerror = r.onblocked = function () { res(); }; } catch (e) { res(); }
    });
  }
  GD.DB = { open: open, drop: drop, STORES: STORES };
})();
