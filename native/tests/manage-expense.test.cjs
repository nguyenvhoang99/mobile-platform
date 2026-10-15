const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
test('Manage Expense assets are verified and catalogued with minimal grants', () => {
 const dir = path.join(root, 'native/shared/miniapps/manage-expense');
 const index = JSON.parse(fs.readFileSync(path.join(dir, 'package.json')));
 assert.equal(index.appId, 'manage-expense'); assert.equal(index.branch, 'feat/manage-expense-revamp');
 assert.deepEqual(Object.keys(index.files).sort(), ['bundle.js','host.js','index.html','manifest.json']);
 for (const [file, hash] of Object.entries(index.files)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, file))).digest('hex'), hash);
 const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json')));
 assert.deepEqual(manifest.capabilities.map(c=>c.name), ['storage.kv','ai.extract_expenses','notifications.schedule_digest']); assert.deepEqual(manifest.routes, ['/']); assert.deepEqual(manifest.egressHosts, []);
 const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8'); assert.ok(html.indexOf('host.js') < html.indexOf('bundle.js'));
 const catalog = JSON.parse(fs.readFileSync(path.join(root,'native/shared/platform.json')));
 assert.equal(catalog.apps.filter(a=>a.id==='manage-expense').length,1);
 for(const tenant of catalog.tenants) assert.ok(tenant.featuredAppIds.includes('manage-expense'));
});
test('expense handshake never advertises Split Bill scanner/network grants', () => {
 const window = { addEventListener() {} }; const context = vm.createContext({window, location:{hostname:'manage-expense'}, document:{}, Map,Promise,Object,Error,JSON,setTimeout,clearTimeout});
 vm.runInContext(fs.readFileSync(path.join(root,'native/miniapp-host.js'),'utf8'),context);
 assert.deepEqual(Object.keys(window.__MINIAPP_CAPS__),['storage.kv','ai.extract_expenses','notifications.schedule_digest']); assert.ok(Object.isFrozen(window.__MINIAPP_CAPS__));
});
