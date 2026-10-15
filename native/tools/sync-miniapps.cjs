// Owner: Mobile Platform. Remove when signed package import replaces bundled staging.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const source = path.resolve(process.argv[2] || path.join(root, '../../mini-apps/split-bill'));
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json')));
if (!['split-bill', 'manage-expense'].includes(manifest.id)) throw Error('Unsupported bundled app');
const expense = manifest.id === 'manage-expense';
const branch = cp.execFileSync('git', ['-C', source, 'branch', '--show-current'], { encoding: 'utf8' }).trim();
if (branch !== (expense ? 'feat/manage-expense-revamp' : 'feat/expense-first-ux')) throw Error('Unexpected source branch');
const stage = fs.mkdtempSync('/private/tmp/miniapp-import-');
if (expense) {
  for (const file of ['scripts', 'host', 'src', 'tsconfig.json', 'manifest.json']) fs.cpSync(path.join(source, file), path.join(stage, file), { recursive: true });
  fs.symlinkSync(path.join(source, 'node_modules'), path.join(stage, 'node_modules'), 'dir');
  cp.execFileSync(process.execPath, [path.join(stage, 'scripts/build-host.mjs')], { cwd: stage, stdio: 'pipe', env: { PATH: process.env.PATH } });
} else {
  for (const file of ['build.mjs', 'src', 'vendor']) fs.cpSync(path.join(source, file), path.join(stage, file), { recursive: true });
  cp.execFileSync(process.execPath, [path.join(stage, 'build.mjs')], { cwd: stage, stdio: 'pipe', env: { PATH: process.env.PATH } });
}
const expected = expense ? ['ai.extract_expenses', 'notifications.schedule_digest', 'storage.kv'] : ['net.request', 'scanner.scan', 'storage.kv'];
if (JSON.stringify(manifest.capabilities.map(c => c.name).sort()) !== JSON.stringify(expected) || manifest.rootRoute !== '/' || manifest.capabilities.some(c => c.version !== 1) || (expense && JSON.stringify(manifest.routes) !== '["/"]')) throw Error('Unexpected manifest authority');
const output = expense ? path.join(stage, 'dist-host') : stage;
const target = path.join(root, 'native/shared/miniapps', manifest.id); fs.mkdirSync(target, { recursive: true });
const assets = {
  'index.html': fs.readFileSync(path.join(output, 'index.html'), 'utf8').replace(/<script src="(?:\.\/|\/)host\.js"><\/script>/g, '').replace('<head>', '<head>\n<script src="/host.js"></script>'),
  'bundle.js': fs.readFileSync(path.join(output, 'bundle.js')),
  'host.js': fs.readFileSync(path.join(root, 'native/miniapp-host.js')),
  'manifest.json': JSON.stringify(manifest, null, 2) + '\n',
};
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const files = Object.fromEntries(Object.entries(assets).map(([name, bytes]) => [name, sha(bytes)]));
for (const [name, bytes] of Object.entries(assets)) fs.writeFileSync(path.join(target, name), bytes);
fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ appId: manifest.id, branch, commit: cp.execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceIncludesWorkingTree: true, sharedPlatformContract: 'host-bridge v1', files }, null, 2) + '\n');
const sharedClient = path.join(path.dirname(source), 'shared-platform/packages/host-bridge/core/index.js');
const fixtureDir = path.join(root, 'native/tests/fixtures');
fs.mkdirSync(fixtureDir, { recursive: true });
const clientBytes = fs.readFileSync(sharedClient);
fs.writeFileSync(path.join(fixtureDir, 'shared-platform-host-bridge.mjs'), clientBytes);
fs.writeFileSync(path.join(fixtureDir, 'shared-platform-provenance.json'), JSON.stringify({ source: 'shared-platform/packages/host-bridge/core/index.js', sha256: sha(clientBytes), usage: 'Test-only snapshot of workspace host-bridge v1; not bundled in product' }, null, 2) + '\n');
fs.rmSync(stage, { recursive: true });
console.log(`Imported ${manifest.id}; source repositories unchanged.`);
