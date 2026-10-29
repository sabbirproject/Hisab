/* GD Expense Tracker — Owner administration (Secret Keys, workspaces, Drive backups).
   The owner secret is kept in memory only (never saved in the browser) and is sent with every admin request.
   All real authorization happens on the server (backend/Code.gs). */
(function () {
  'use strict';
  var GD = window.GD, App = GD.App, U = GD.U, P = GD.Prefs, esc = U.esc, ic = App.ic, ACT = App.act, S = App.sub;
  var st = { data: null, audit: null, backups: {}, busy: false, view: null };

  function adm(action, payload) {
    return GD.API.call(action, Object.assign({ ownerSecret: App.ownerSecret }, payload || {}), 40000).catch(function (e) {
      if (e.code === 'auth') { App.ownerSecret = ''; st.data = null; }
      throw e;
    });
  }
  function when(ms) { return ms ? new Date(ms).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }
  function head(inner) { return '<div class="pagehead"><a class="back" href="#/settings" aria-label="Back">' + ic('left') + '</a><h1>Owner administration</h1></div>' + inner; }
  function repaint() { if (st.view && document.body.contains(st.view)) S.owner(st.view, []); }

  function unlockForm() {
    var url = P.get('serverUrl') || (window.GD_CONFIG && window.GD_CONFIG.APPS_SCRIPT_URL) || '';
    return head('<div class="card"><h3>' + ic('key') + ' Owner sign-in</h3>' +
      '<p class="small muted">Enter the <b>owner secret</b> shown once in the Apps Script execution log when you ran <code>setup()</code>. It is never stored in this browser and never put in the page source. Hiding this screen is not security — the server checks the secret on every request.</p>' +
      '<form id="ownform"><label class="f" for="o_url">Apps Script Web App URL</label><input class="in" id="o_url" type="url" inputmode="url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(url) + '">' +
      '<label class="f" for="o_sec">Owner secret</label><input class="in" id="o_sec" type="password" autocomplete="off" spellcheck="false">' +
      '<div class="err" id="o_err" role="alert"></div><div class="btnrow"><button class="btn" type="submit">Unlock</button></div></form></div>');
  }

  S.owner = function (view) {
    st.view = view;
    if (!App.ownerSecret) {
      view.innerHTML = unlockForm();
      view.querySelector('#ownform').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var url = view.querySelector('#o_url').value.trim(), sec = view.querySelector('#o_sec').value.trim(), er = view.querySelector('#o_err'), btn = ev.target.querySelector('button');
        if (!/^https:\/\/script\.google\.com\/(macros\/s\/|a\/)/.test(url)) { er.textContent = 'Enter the Web App URL that ends with /exec.'; return; }
        if (!sec) { er.textContent = 'Enter the owner secret.'; return; }
        er.textContent = ''; btn.disabled = true; btn.textContent = 'Checking…';
        var prev = P.get('serverUrl'); P.set('serverUrl', url); App.ownerSecret = sec;
        adm('admin.check').then(function () { return load(); }).then(repaint).catch(function (e) {
          App.ownerSecret = ''; P.set('serverUrl', prev || ''); btn.disabled = false; btn.textContent = 'Unlock'; er.textContent = e.message;
        });
      });
      return;
    }
    if (!st.data) { view.innerHTML = head('<div class="skeleton" style="height:120px"></div>'); load().then(repaint).catch(function (e) { App.toast(e.message, 'bad'); App.ownerSecret = ''; repaint(); }); return; }
    var ws = st.data.workspaces;
    view.innerHTML = head(
      '<div class="notice warn"><b>Careful:</b> anyone who has a Secret Key gets the access of that key. Share keys privately (not in public posts) and revoke any key you no longer trust. Keys are stored on the server only as hashes — a lost key cannot be viewed again, only rotated.</div>' +
      '<div class="btnrow"><button class="btn" data-act="ow-ws-new">' + ic('plus') + ' New workspace</button><button class="btn sec" data-act="ow-refresh">Refresh</button><button class="btn sec" data-act="ow-audit">Audit log</button><button class="btn sec" data-act="ow-lock">Lock</button></div>' +
      (ws.length ? ws.map(wsCard).join('') : '<div class="card"><div class="empty">No workspace yet. Create one (for example “Home” or “Office”), then create a Secret Key for it.</div></div>') +
      (st.audit ? auditCard() : ''));
  };

  function wsCard(w) {
    return '<div class="card"><h3>' + esc(w.name) + '</h3><p class="small muted">ID ' + esc(w.id) + ' · created ' + when(w.createdAt) + ' · last sync ' + when(w.lastSyncAt) + ' · ' + w.changes + ' changes</p>' +
      '<ul class="list">' + (w.keys.map(function (k) { return keyRow(k); }).join('') || '<li class="empty">No keys yet.</li>') + '</ul>' +
      '<div class="btnrow"><button class="btn" data-act="ow-key-new" data-id="' + esc(w.id) + '">' + ic('key') + ' New key</button>' +
      '<button class="btn sec" data-act="ow-ws-rename" data-id="' + esc(w.id) + '">Rename</button>' +
      '<button class="btn sec" data-act="ow-backup" data-id="' + esc(w.id) + '">Backup to Drive</button>' +
      '<button class="btn sec" data-act="ow-restore" data-id="' + esc(w.id) + '">Restore…</button>' +
      '<button class="btn danger" data-act="ow-wipe" data-id="' + esc(w.id) + '">Delete all records…</button></div></div>';
  }
  function keyRow(k) {
    var expired = k.expiresAt && k.expiresAt < Date.now(), status = expired && k.status === 'active' ? 'expired' : k.status;
    var live = k.status !== 'revoked';
    return '<li class="item"><div class="ico">' + ic('key') + '</div><div class="body"><div class="t">' + esc(k.label) + ' <span class="tag">' + esc(k.role) + '</span> <span class="tag">' + esc(status) + '</span></div>' +
      '<div class="s">' + esc(k.keyId) + ' · created ' + when(k.createdAt) + ' · last used ' + when(k.lastUsedAt) + (k.expiresAt ? ' · expires ' + when(k.expiresAt) : '') + '</div>' +
      (live ? '<div class="btnrow">' +
        (k.status === 'active' ? '<button class="btn sec sm" data-act="ow-key-set" data-id="' + esc(k.keyId) + '" data-status="disabled">Disable</button>' : '<button class="btn sec sm" data-act="ow-key-set" data-id="' + esc(k.keyId) + '" data-status="active">Enable</button>') +
        '<button class="btn sec sm" data-act="ow-key-rotate" data-id="' + esc(k.keyId) + '">Rotate</button>' +
        '<button class="btn sec sm" data-act="ow-key-exp" data-id="' + esc(k.keyId) + '">Expiry</button>' +
        '<button class="btn danger sm" data-act="ow-key-set" data-id="' + esc(k.keyId) + '" data-status="revoked">Revoke</button></div>' : '') + '</div></li>';
  }
  function auditCard() {
    return '<div class="card"><h3>Audit log (latest)</h3><ul class="list">' + (st.audit.map(function (a) { return '<li class="item"><div class="body"><div class="t">' + esc(a.action) + '</div><div class="s">' + when(a.time) + ' · ' + esc(a.ws || '—') + ' · ' + esc(a.key || '') + (a.detail ? ' · ' + esc(a.detail) : '') + '</div></div></li>'; }).join('') || '<li class="empty">Empty.</li>') + '</ul></div>';
  }
  function load() { return adm('admin.overview').then(function (r) { st.data = r; }); }
  function wsById(id) { return st.data.workspaces.filter(function (w) { return w.id === id; })[0]; }
  function run(p, okMsg) {
    if (st.busy) return Promise.resolve(); st.busy = true;
    return p.then(function (r) { if (okMsg) App.toast(okMsg); return load().then(function () { return r; }); }).catch(function (e) { App.toast(e.message, 'bad', 6000); }).then(function (r) { st.busy = false; repaint(); return r; });
  }

  function showSecret(title, secret, note) {
    App.dialog('<h3>' + esc(title) + '</h3><div class="notice warn">This key is shown <b>only once</b>. Copy it now and send it privately. Anyone holding it gets this access.</div>' +
      '<input class="in mono" id="sk" readonly value="' + esc(secret) + '" aria-label="Secret key"><p class="small muted">' + esc(note || '') + '</p>' +
      '<div class="btnrow"><button class="btn" id="skc">Copy key</button><button class="btn sec" data-dclose>Done</button></div>', function (d) {
      d.querySelector('#sk').addEventListener('focus', function (e) { e.target.select(); });
      d.querySelector('#skc').onclick = function () { var i = d.querySelector('#sk'); i.select(); (navigator.clipboard ? navigator.clipboard.writeText(secret) : Promise.reject()).then(function () { App.toast('Copied'); }, function () { try { document.execCommand('copy'); App.toast('Copied'); } catch (e) { App.toast('Select the text and copy it manually.', 'warn'); } }); };
    });
  }
  function prompt1(title, label, value, okLabel, type) {
    return new Promise(function (res) {
      var done = false;
      App.dialog('<h3>' + esc(title) + '</h3><label class="f" for="p1">' + esc(label) + '</label><input class="in" id="p1" type="' + (type || 'text') + '" maxlength="60" value="' + esc(value || '') + '"><div class="btnrow"><button class="btn sec" data-dclose>Cancel</button><button class="btn" id="p1ok">' + esc(okLabel || 'OK') + '</button></div>', function (d, api) {
        d.querySelector('#p1ok').onclick = function () { done = true; var v = d.querySelector('#p1').value.trim(); api.close(); res(v); };
        d.addEventListener('close', function () { if (!done) res(null); });
      });
    });
  }

  ACT['ow-lock'] = function () { App.ownerSecret = ''; st.data = null; st.audit = null; repaint(); };
  ACT['ow-refresh'] = function () { run(Promise.resolve(), 'Refreshed'); };
  ACT['ow-audit'] = function () { run(adm('admin.audit', { limit: 60 }).then(function (r) { st.audit = r.entries; })); };
  ACT['ow-ws-new'] = function () { prompt1('New workspace', 'Name (e.g. Home, Office, Team)', '', 'Create').then(function (n) { if (n) run(adm('admin.workspace.create', { name: n }), 'Workspace created'); }); };
  ACT['ow-ws-rename'] = function (el) { var w = wsById(el.dataset.id); prompt1('Rename workspace', 'New name', w.name, 'Save').then(function (n) { if (n) run(adm('admin.workspace.rename', { workspaceId: w.id, name: n }), 'Renamed'); }); };
  ACT['ow-key-new'] = function (el) {
    var w = wsById(el.dataset.id);
    App.dialog('<h3>New Secret Key — ' + esc(w.name) + '</h3><label class="f" for="k_l">Label (who is it for?)</label><input class="in" id="k_l" maxlength="40" placeholder="Family, Office, Team…">' +
      '<label class="f" for="k_r">Access</label><select class="in" id="k_r"><option value="editor">Editor — can add, edit, delete</option><option value="viewer">Viewer — read only</option></select>' +
      '<label class="f" for="k_e">Expiry date (optional)</label><input class="in" id="k_e" type="date"><div class="err" id="k_err" role="alert"></div>' +
      '<div class="btnrow"><button class="btn sec" data-dclose>Cancel</button><button class="btn" id="k_ok">Generate key</button></div>', function (d, api) {
      d.querySelector('#k_ok').onclick = function () {
        var label = d.querySelector('#k_l').value.trim();
        if (!label) { d.querySelector('#k_err').textContent = 'Give the key a label.'; return; }
        api.close();
        run(adm('admin.key.create', { workspaceId: w.id, label: label, role: d.querySelector('#k_r').value, expiresAt: d.querySelector('#k_e').value }), 'Key created').then(function (r) { if (r) showSecret('Secret Key for “' + label + '”', r.secret, 'Workspace: ' + w.name + ' · Access: ' + r.role); });
      };
    });
  };
  ACT['ow-key-set'] = function (el) {
    var st2 = el.dataset.status, id = el.dataset.id;
    var go = function () { run(adm('admin.key.update', { keyId: id, status: st2 }), st2 === 'revoked' ? 'Key revoked' : 'Key updated'); };
    if (st2 === 'revoked') App.confirm('Revoke this key?', '<p>It stops working immediately on every device and cannot be re-enabled.</p>', 'Revoke', true).then(function (ok) { if (ok) go(); }); else go();
  };
  ACT['ow-key-rotate'] = function (el) {
    App.confirm('Rotate this key?', '<p>A new secret is generated and the old one stops working immediately. Everyone using it must enter the new one.</p>', 'Rotate', true).then(function (ok) {
      if (ok) run(adm('admin.key.rotate', { keyId: el.dataset.id })).then(function (r) { if (r) showSecret('New secret for this key', r.secret, 'The old secret no longer works.'); });
    });
  };
  ACT['ow-key-exp'] = function (el) { prompt1('Key expiry', 'Expiry date (leave empty for none)', '', 'Save', 'date').then(function (v) { if (v !== null) run(adm('admin.key.update', { keyId: el.dataset.id, expiresAt: v }), 'Expiry saved'); }); };
  ACT['ow-backup'] = function (el) { run(adm('admin.backup', { workspaceId: el.dataset.id }), 'Backup saved in your private Google Drive folder'); };
  ACT['ow-restore'] = function (el) {
    var w = wsById(el.dataset.id);
    adm('admin.backup.list', { workspaceId: w.id }).then(function (r) {
      if (!r.backups.length) return App.toast('No backups found for this workspace.', 'warn');
      App.dialog('<h3>Restore — ' + esc(w.name) + '</h3><p class="small muted">Records from the backup are merged in (same ids are overwritten). Records added later are kept.</p><label class="f" for="rs">Backup</label><select class="in" id="rs">' + r.backups.map(function (b) { return '<option value="' + esc(b.fileId) + '">' + esc(b.name) + ' (' + Math.round(b.size / 1024) + ' KB)</option>'; }).join('') + '</select><div class="btnrow"><button class="btn sec" data-dclose>Cancel</button><button class="btn" id="rsok">Restore</button></div>', function (d, api) {
        d.querySelector('#rsok').onclick = function () { var id = d.querySelector('#rs').value; api.close(); run(adm('admin.restore', { workspaceId: w.id, fileId: id }), 'Restored').then(function (x) { if (x) App.toast(x.restored + ' records restored'); }); };
      });
    }).catch(function (e) { App.toast(e.message, 'bad'); });
  };
  ACT['ow-wipe'] = function (el) {
    var w = wsById(el.dataset.id);
    App.dialog('<h3>Delete all records of “' + esc(w.name) + '”?</h3><div class="notice warn">Every transaction, account, category and budget in this workspace is deleted on all devices at their next sync. Make a backup first. This cannot be undone from the app.</div><label class="f" for="wp">Type the workspace name to confirm</label><input class="in" id="wp" autocomplete="off"><div class="btnrow"><button class="btn sec" data-dclose>Cancel</button><button class="btn danger" id="wpok">Delete everything</button></div>', function (d, api) {
      d.querySelector('#wpok').onclick = function () { var c = d.querySelector('#wp').value; api.close(); run(adm('admin.workspace.wipe', { workspaceId: w.id, confirm: c }), 'Records deleted'); };
    });
  };
})();
