// End-to-end: real browser + real client code + real backend code (Code.gs run on a mock of Apps Script services).
const { chromium } = require('playwright'); const assert = require('assert'); const { create } = require('../tools/gas-mock');
const B = create(); B.ctx.setup(); const OS = B.ownerSecret();
const URL = 'http://localhost:8099/', EXEC = 'https://script.google.com/macros/s/TESTDEPLOY/exec';
let checks = 0; const ok = (c, m) => { assert(c, m); checks++; console.log('  ✓ ' + m); };
const apiLog = [];
async function ctxWithBackend(browser, name) {
  const c = await browser.newContext({ viewport: { width: 390, height: 820 }, acceptDownloads: true });
  await c.route(EXEC, async (route) => { const body = route.request().postData(); apiLog.push({ who: name, body }); await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(B.post(body)).replace(/^/, '') }); });
  const p = await c.newPage(); const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message)); p.errs = errs;
  return { c, p };
}
async function addTx(p, type, amt, desc) {
  await p.goto(URL + '#/add'); await p.waitForSelector('#f_amt');
  await p.click('[data-act="ttype"][data-v="' + type + '"]'); await p.fill('#f_amt', String(amt)); await p.fill('#f_desc', desc);
  const cat = await p.$$eval('#f_cat option', (o) => o.map((x) => x.value)); await p.selectOption('#f_cat', cat[0]);
  await p.click('#b_save'); await p.waitForTimeout(500);
}
(async () => {
  const browser = await chromium.launch();
  console.log('PERSONAL MODE');
  const A = await ctxWithBackend(browser, 'personal'); const p = A.p;
  await p.goto(URL); await p.waitForSelector('[data-act="w-personal"]'); await p.click('[data-act="w-personal"]'); await p.waitForTimeout(600);
  ok(await p.locator('body').innerText().then((t) => /Personal|Local/i.test(t)), 'personal mode indicator visible');
  await addTx(p, 'income', 50000, 'Salary October'); await addTx(p, 'expense', 1250.5, 'Groceries');
  await p.goto(URL + '#/home'); await p.waitForTimeout(500);
  const home = await p.locator('body').innerText();
  ok(/50,000/.test(home), 'dashboard shows income ₹50,000'); ok(/1,250\.50/.test(home), 'dashboard shows expense ₹1,250.50'); ok(/48,749\.50/.test(home), 'balance = 48,749.50');
  await p.goto(URL + '#/tx'); await p.waitForTimeout(400);
  const tx = await p.locator('body').innerText(); ok(/Groceries/.test(tx) && /Salary October/.test(tx), 'transactions listed');
  await p.goto(URL + '#/reports'); await p.waitForTimeout(500); ok((await p.locator('body').innerText()).length > 200, 'reports render');
  await p.goto(URL + '#/settings/backup'); await p.waitForTimeout(300);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-act="bk-json"]')]);
  const fs = require('fs'); const path = await dl.path(); const bk = JSON.parse(fs.readFileSync(path, 'utf8'));
  ok(bk.format === 'gd-expense-tracker-backup' && bk.data.transactions.length === 2, 'JSON backup has 2 transactions');
  ok(apiLog.filter((x) => x.who === 'personal').length === 0, 'Personal Mode made ZERO backend requests');
  ok(A.p.errs.length === 0, 'no console errors (personal) ' + JSON.stringify(A.p.errs));
  // offline reload keeps data
  await A.c.setOffline(true); await p.goto(URL + '#/tx'); await p.waitForTimeout(500); ok(/Groceries/.test(await p.locator('body').innerText()), 'data available offline after reload');
  await A.c.close();

  console.log('OWNER + SHARED MODE');
  const O = await ctxWithBackend(browser, 'owner'); const po = O.p;
  await po.goto(URL); await po.click('[data-act="w-personal"]'); await po.waitForTimeout(500); await po.goto(URL + '#/settings/owner'); await po.waitForSelector('#ownform');
  await po.fill('#o_url', EXEC); await po.fill('#o_sec', 'WRONG'); await po.click('#ownform button'); await po.waitForTimeout(500);
  ok(/not correct/i.test(await po.locator('#o_err').innerText()), 'wrong owner secret rejected in UI');
  await po.fill('#o_sec', OS); await po.click('#ownform button'); await po.waitForSelector('[data-act="ow-ws-new"]');
  ok(true, 'owner unlocked');
  await po.click('[data-act="ow-ws-new"]'); await po.fill('#p1', 'Home'); await po.click('#p1ok'); await po.waitForSelector('[data-act="ow-key-new"]');
  await po.click('[data-act="ow-key-new"]'); await po.fill('#k_l', 'Family'); await po.click('#k_ok'); await po.waitForSelector('#sk');
  const secret = await po.inputValue('#sk'); ok(/^GDX-/.test(secret), 'secret key generated & shown once: ' + secret.slice(0, 8) + '…');
  await po.click('[data-dclose]');
  ok(!(await po.evaluate(() => JSON.stringify(localStorage) + document.cookie)).includes(OS), 'owner secret not persisted in browser');

  const D1 = await ctxWithBackend(browser, 'device1'); const d1 = D1.p;
  await d1.goto(URL); await d1.fill('#jurl', EXEC); await d1.fill('#jkey', 'GDX-BAD00000-00000000-00000000-00000000'); await d1.click('#jgo'); await d1.waitForTimeout(800);
  ok(/not valid|revoked|expired/i.test(await d1.locator('body').innerText()), 'invalid key shows error, no silent fallback');
  await d1.fill('#jkey', secret); await d1.click('#jgo'); await d1.waitForTimeout(1500);
  ok(/Home/.test(await d1.locator('body').innerText()), 'joined workspace "Home"');
  await addTx(d1, 'expense', 777, 'Shared lunch'); await d1.waitForTimeout(2500);
  ok(B.sheets.Transactions.rows.length >= 2 && JSON.stringify(B.sheets.Transactions.rows).includes('Shared lunch'), 'transaction reached Google Sheet');

  const D2 = await ctxWithBackend(browser, 'device2'); const d2 = D2.p;
  await d2.goto(URL); await d2.fill('#jurl', EXEC); await d2.fill('#jkey', secret); await d2.click('#jgo'); await d2.waitForTimeout(3000);
  await d2.goto(URL + '#/tx'); await d2.waitForTimeout(800);
  ok(/Shared lunch/.test(await d2.locator('body').innerText()), 'device 2 receives device 1 transaction after sync');
  // offline queue on device 2, no duplicates after reconnect
  await D2.c.setOffline(true); await addTx(d2, 'income', 100, 'Offline entry'); await d2.waitForTimeout(500);
  const before = B.sheets.Transactions.rows.length; await D2.c.setOffline(false); await d2.evaluate(() => window.dispatchEvent(new Event('online'))); await d2.waitForTimeout(3500);
  const rows = B.sheets.Transactions.rows.filter((r) => JSON.stringify(r).includes('Offline entry')).length;
  ok(rows === 1 && B.sheets.Transactions.rows.length === before + 1, 'offline entry synced exactly once after reconnect');
  // device 1 pulls it
  await d1.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await d1.goto(URL + '#/tx'); await d1.waitForTimeout(3000);
  ok(/Offline entry/.test(await d1.locator('body').innerText()), 'device 1 receives offline entry');
  // revoke -> device blocked
  await po.goto(URL + '#/home'); await po.goto(URL + '#/settings/owner'); await po.waitForSelector('[data-act="ow-key-set"][data-status="revoked"]');
  await po.click('[data-act="ow-key-set"][data-status="revoked"]'); await po.click('[data-r="1"]'); await po.waitForTimeout(800);
  const r = B.post({ action: 'sync', key: secret, cursor: 0, ops: [] }); ok(r.code === 'auth', 'revoked key blocked on server');
  await d2.goto(URL + '#/home'); await d2.evaluate(() => window.dispatchEvent(new Event('online'))); await d2.waitForTimeout(2500);
  ok(/key|revoked|invalid|locked/i.test(await d2.locator('body').innerText()), 'device UI reports the key problem (no fake sync success)');
  for (const [n, x] of [['owner', O], ['dev1', D1], ['dev2', D2]]) ok(x.p.errs.filter((e) => !/Failed to load resource|net::ERR/.test(e)).length === 0, 'no JS errors (' + n + ') ' + JSON.stringify(x.p.errs.slice(0, 2)));
  await browser.close(); console.log('\nE2E OK — ' + checks + ' checks');
})().catch((e) => { console.error('E2E FAIL:', e.message); process.exit(1); });
