const assert = require('assert'); const { create } = require('../tools/gas-mock');
const B = create(); B.ctx.setup(); const OS = B.ownerSecret(); assert(OS, 'owner secret logged');
const adm = (a, p) => B.post(Object.assign({ action: a, ownerSecret: OS }, p));
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
// admin
ok(B.post({ action: 'admin.check', ownerSecret: 'wrong' }).code === 'auth', 'bad owner secret rejected');
const w1 = adm('admin.workspace.create', { name: 'Home' }).data.workspaceId, w2 = adm('admin.workspace.create', { name: 'Office' }).data.workspaceId;
const k1 = adm('admin.key.create', { workspaceId: w1, label: 'Family', role: 'editor' }).data;
const k1v = adm('admin.key.create', { workspaceId: w1, label: 'Kid', role: 'viewer' }).data;
const k2 = adm('admin.key.create', { workspaceId: w2, label: 'Team', role: 'editor' }).data;
ok(/^GDX-[0-9A-F]{8}(-[0-9A-F]{8}){3}$/.test(k1.secret), 'key format');
ok(!JSON.stringify(B.sheets.AccessKeys.rows).includes(k1.secret), 'secret not stored in sheet');
ok(!JSON.stringify(adm('admin.overview').data).includes('keyHash'), 'hash not exposed');
// auth
ok(B.post({ action: 'auth.verify', key: 'GDX-00000000-00000000-00000000-00000000' }).code === 'auth', 'invalid key');
ok(B.post({ action: 'auth.verify', key: 'junk' }).code === 'auth', 'junk key');
const v = B.post({ action: 'auth.verify', key: k1.secret }).data; ok(v.workspace.id === w1 && v.role === 'editor', 'verify ok');
// sync: create
const tx = { id: 'tx_1', type: 'expense', amount: 250.5, categoryId: 'cat_exp_food', accountId: 'acc_cash', date: '2026-10-28', description: '=HYPERLINK("x")', createdAt: 1, updatedAt: 2 };
let r = B.post({ action: 'sync', key: k1.secret, cursor: 0, ops: [{ opId: 'op1', entity: 'transactions', recId: 'tx_1', baseV: 0, data: tx }] }).data;
ok(r.results[0].status === 'applied' && r.results[0].record.v === 1, 'create applied');
ok(B.sheets.Transactions.rows[1][9] === "'=HYPERLINK(\"x\")" || String(B.sheets.Transactions.rows[1].join('|')).includes("'=HYPERLINK"), 'formula injection neutralised');
// idempotent retry
r = B.post({ action: 'sync', key: k1.secret, cursor: 0, ops: [{ opId: 'op1', entity: 'transactions', recId: 'tx_1', baseV: 0, data: tx }] }).data;
ok(r.results[0].status === 'duplicate' && B.sheets.Transactions.rows.length === 2, 'retry creates no duplicate');
// second device pulls
const pull = B.post({ action: 'sync', key: k1.secret, cursor: 0, ops: [] }).data;
ok(pull.changes.transactions.length === 1 && pull.changes.transactions[0].amount === 250.5 && pull.cursor >= 1, 'device B receives record');
ok(B.post({ action: 'sync', key: k1.secret, cursor: pull.cursor, ops: [] }).data.changes.transactions.length === 0, 'nothing new after cursor');
// update + conflict
r = B.post({ action: 'sync', key: k1.secret, cursor: 0, ops: [{ opId: 'op2', entity: 'transactions', recId: 'tx_1', baseV: 1, data: Object.assign({}, tx, { amount: 300 }) }] }).data;
ok(r.results[0].status === 'applied' && r.results[0].record.v === 2, 'update applied');
r = B.post({ action: 'sync', key: k1.secret, cursor: 0, ops: [{ opId: 'op3', entity: 'transactions', recId: 'tx_1', baseV: 1, data: Object.assign({}, tx, { amount: 999 }) }] }).data;
ok(r.results[0].status === 'conflict' && r.results[0].record.amount === 300, 'stale update flagged as conflict');
// exists (same deterministic id from another device)
r = B.post({ action: 'sync', key: k1.secret, cursor: 0, ops: [{ opId: 'op4', entity: 'categories', recId: 'cat_exp_food', baseV: 0, data: { id: 'cat_exp_food', name: 'Food', type: 'expense' } }, { opId: 'op5', entity: 'categories', recId: 'cat_exp_food', baseV: 0, data: { id: 'cat_exp_food', name: 'Food', type: 'expense' } }] }).data;
ok(r.results[0].status === 'applied' && r.results[1].status === 'exists', 'deterministic id -> exists');
// delete
r = B.post({ action: 'sync', key: k1.secret, cursor: 0, ops: [{ opId: 'op6', entity: 'transactions', recId: 'tx_1', baseV: 2, data: Object.assign({}, tx, { deleted: true, deletedAt: 5 }) }] }).data;
ok(r.results[0].status === 'applied', 'delete applied');
ok(B.post({ action: 'sync', key: k1.secret, cursor: 0, ops: [] }).data.changes.transactions[0].deleted === true, 'tombstone synced');
// workspace isolation
const other = B.post({ action: 'sync', key: k2.secret, cursor: 0, ops: [{ opId: 'o9', entity: 'transactions', recId: 'tx_1', baseV: 0, data: Object.assign({}, tx, { amount: 1 }) }] }).data;
ok(other.results[0].status === 'applied', 'same id in other workspace is independent');
ok(B.post({ action: 'sync', key: k1.secret, cursor: 0, ops: [] }).data.changes.transactions.every((t) => t.amount !== 1), 'workspace A never sees workspace B data');
ok(B.post({ action: 'export', key: k2.secret }).data.data.transactions.length === 1, 'export scoped to workspace');
// viewer
r = B.post({ action: 'sync', key: k1v.secret, cursor: 0, ops: [{ opId: 'v1', entity: 'transactions', recId: 'tx_9', baseV: 0, data: Object.assign({}, tx, { id: 'tx_9' }) }] }).data;
ok(r.results[0].status === 'failed' && r.workspace.role === 'viewer', 'viewer cannot write');
ok(B.post({ action: 'file.upload', key: k1v.secret, name: 'a.png', data: 'AAAA' }).code === 'forbidden', 'viewer cannot upload');
// validation
r = B.post({ action: 'sync', key: k1.secret, cursor: 0, ops: [{ opId: 'bad1', entity: 'transactions', recId: 'tx_b', baseV: 0, data: { id: 'tx_b', amount: -5 } }, { opId: 'bad2', entity: 'nope', recId: 'x', data: { id: 'x' } }, { opId: 'bad3', entity: 'transactions', recId: 'tx_c', baseV: 0, data: { id: 'DIFF', amount: 1 } }] }).data;
ok(r.results.every((x) => x.status === 'failed'), 'invalid ops rejected');
// files
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]), Buffer.alloc(40)]).toString('base64');
const up = B.post({ action: 'file.upload', key: k1.secret, kind: 'receipt', name: 'r.png', mime: 'image/png', data: png });
ok(up.ok && up.data.fileId, 'png upload');
ok(B.post({ action: 'file.upload', key: k1.secret, name: 'x.exe', data: Buffer.from('MZ....').toString('base64') }).code === 'invalid', 'non-image rejected');
ok(B.post({ action: 'file.get', key: k1.secret, fileId: up.data.fileId }).data.mime === 'image/png', 'file readable by own workspace');
ok(B.post({ action: 'file.get', key: k2.secret, fileId: up.data.fileId }).code === 'forbidden', 'file blocked for other workspace');
// revoke / disable / expiry / rotate
adm('admin.key.update', { keyId: k1v.keyId, status: 'disabled' }); ok(B.post({ action: 'auth.verify', key: k1v.secret }).code === 'auth', 'disabled key rejected immediately');
adm('admin.key.update', { keyId: k1v.keyId, status: 'active' }); ok(B.post({ action: 'auth.verify', key: k1v.secret }).ok, 're-enabled');
adm('admin.key.update', { keyId: k1v.keyId, expiresAt: '2000-01-01' }); ok(B.post({ action: 'auth.verify', key: k1v.secret }).code === 'auth', 'expired key rejected');
const rot = adm('admin.key.rotate', { keyId: k2.keyId }).data; ok(B.post({ action: 'auth.verify', key: k2.secret }).code === 'auth' && B.post({ action: 'auth.verify', key: rot.secret }).ok, 'rotate swaps secret');
B.post({ action: 'auth.verify', key: k1.secret }); adm('admin.key.update', { keyId: k1.keyId, status: 'revoked' });
ok(B.post({ action: 'sync', key: k1.secret, cursor: 0, ops: [] }).code === 'auth', 'revoked key blocked');
ok(adm('admin.key.update', { keyId: k1.keyId, status: 'active' }).ok === false, 'revoked cannot be re-enabled');
// backup / restore / wipe
const k3 = adm('admin.key.create', { workspaceId: w1, label: 'New', role: 'editor' }).data;
B.post({ action: 'sync', key: k3.secret, cursor: 0, ops: [{ opId: 'p1', entity: 'transactions', recId: 'tx_keep', baseV: 0, data: { id: 'tx_keep', type: 'income', amount: 10, date: '2026-10-01' } }] });
const bk = adm('admin.backup', { workspaceId: w1 }).data; ok(bk.counts.transactions === 1, 'backup counts live records only');
ok(adm('admin.backup.list', { workspaceId: w1 }).data.backups.length === 1, 'backup listed');
ok(adm('admin.workspace.wipe', { workspaceId: w1, confirm: 'wrong' }).ok === false, 'wipe needs name');
ok(adm('admin.workspace.wipe', { workspaceId: w1, confirm: 'Home' }).data.deleted >= 1, 'wipe');
let after = B.post({ action: 'export', key: k3.secret }).data.data; ok(after.transactions.length === 0, 'wiped');
ok(adm('admin.restore', { workspaceId: w1, fileId: bk.fileId }).data.restored >= 1, 'restore');
after = B.post({ action: 'export', key: k3.secret }).data.data; ok(after.transactions.length === 1 && after.transactions[0].id === 'tx_keep', 'restored record back');
ok(adm('admin.restore', { workspaceId: w2, fileId: bk.fileId }).ok === false, 'cannot restore backup into another workspace');
// pagination
const many = []; for (let i = 0; i < 50; i++) many.push({ opId: 'm' + i, entity: 'transactions', recId: 'tm_' + i, baseV: 0, data: { id: 'tm_' + i, type: 'expense', amount: i, date: '2026-10-02' } });
for (let b = 0; b < 8; b++) B.post({ action: 'sync', key: k3.secret, cursor: 0, ops: many.map((o) => Object.assign({}, o, { opId: o.opId + '_' + b, recId: o.recId + '_' + b, data: Object.assign({}, o.data, { id: o.recId + '_' + b }) })) });
let cur = 0, got = 0, calls = 0, more = true; while (more && calls < 20) { const x = B.post({ action: 'sync', key: k3.secret, cursor: cur, ops: [] }).data; got += x.changes.transactions.length; cur = x.cursor; more = x.more; calls++; }
ok(got >= 400 && calls >= 2, 'paged pull returns all (' + got + ' in ' + calls + ' calls)');
ok(!JSON.stringify(B.sheets.AuditLog.rows).includes(k1.secret) && !JSON.stringify(B.sheets.AuditLog.rows).includes(OS), 'secrets never in audit log');
console.log('backend OK — ' + n + ' checks passed');
