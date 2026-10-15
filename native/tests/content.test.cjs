const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '../..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'native/shared/platform.json'), 'utf8'));
const yaml = require(path.join(root, 'app/node_modules/yaml'));
test('native content exactly matches current RN source and policy', () => {
  execFileSync(process.execPath, [path.join(root, 'native/tools/export-data.cjs'), '--check']);
  assert.deepEqual(data.capabilities, yaml.parse(fs.readFileSync(path.join(root, 'policy/capabilities.yaml'), 'utf8')).capabilities);
});
test('catalog, route targets and tenant references are complete', () => {
  assert.equal(data.apps.length, 10); assert.equal(data.cards.length, 12); assert.equal(data.slots.length, 7);
  const appIds = new Set(data.apps.map(x => x.id));
  for (const tenant of data.tenants) for (const id of tenant.featuredAppIds) assert.ok(appIds.has(id));
  for (const app of data.apps) for (const link of app.crossAppLinks) {
    const target = data.apps.find(x => x.id === link.targetAppId);
    assert.ok(target.publicEntrypoints.some(e => e.name === link.targetEntrypoint && e.allowedSources.includes(app.id)));
  }
});
test('journal limits come from canonical budget rows', () => {
  const policy = fs.readFileSync(path.join(root, 'policy/budgets.md'), 'utf8');
  const bytes = name => {
    const row = policy.split('\n').find(line => line.startsWith('| ' + name + ' |'));
    const match = row.match(/\|\s*(\d+)\s*(KB|MB)/);
    return Number(match[1]) * (match[2] === 'MB' ? 1024 * 1024 : 1024);
  };
  assert.equal(data.config.tracking.maxEventBytes, bytes('Single event, uncompressed'));
  assert.equal(data.config.tracking.maxQueueBytes, bytes('Durable on-device journal'));
});
test('native sources have no RN dependency or raw authority-free JS interface', () => {
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  for (const file of [...walk(path.join(root, 'ios/Sources')), ...walk(path.join(root, 'android/app/src/main/java'))].filter(f => /\.(swift|kt)$/.test(f))) {
    const code = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(code, /import React|com\.facebook\.react|addJavascriptInterface|Intent\.parseUri|evaluateJavaScript|new WebView/, file);
  }
});

// Regression: XCTest can inject a framework search path that masks broken app packaging.
// Set NATIVE_IOS_APP to the built .app to verify the actual Mach-O dependencies outside XCTest.
const builtApp = process.env.NATIVE_IOS_APP;
test('built iOS host resolves its bundled framework without test-runner paths', { skip: !builtApp }, () => {
  const executables = ['MobileNative', 'MobileNative.debug.dylib'].map(name => path.join(builtApp, name)).filter(fs.existsSync);
  assert.ok(executables.length);
  const dependencyChain = [];
  for (const executable of executables) {
    const dependencies = execFileSync('/usr/bin/otool', ['-L', executable], { encoding: 'utf8' });
    dependencyChain.push(dependencies);
    assert.doesNotMatch(dependencies, /\/Library\/Frameworks\/PlatformCore/);
  }
  assert.match(dependencyChain.join("\n"), /@rpath\/PlatformCore\.framework\/PlatformCore/);
  assert.ok(fs.existsSync(path.join(builtApp, 'Frameworks/PlatformCore.framework/PlatformCore')));
  const framework = execFileSync('/usr/bin/otool', ['-D', path.join(builtApp, 'Frameworks/PlatformCore.framework/PlatformCore')], { encoding: 'utf8' });
  assert.match(framework, /@rpath\/PlatformCore\.framework\/PlatformCore/);
});

test('Test is a private bundled screen in Khác for every tenant', () => {
  const app = data.apps.find(a => a.id === 'test');
  assert.equal(app.name, 'Test');
  assert.deepEqual(app.capabilities, []); assert.deepEqual(app.publicEntrypoints, []);
  assert.deepEqual(app.crossAppLinks, []);
  assert.deepEqual(data.categories.find(c => c.id === 'other').miniAppIds, ['test', 'split-bill', 'manage-expense']);
  for (const tenant of data.tenants) assert.ok(tenant.featuredAppIds.includes('test'));
  const model = fs.readFileSync(path.join(root, 'android/app/src/debug/assets/add.bin'));
  assert.equal(require('crypto').createHash('sha256').update(model).digest('hex'), '038f8d317c07b094e3b7d0c7aba60a3d9e441eb4188c8515920108b963c3873d');
  assert.equal(model.subarray(4,8).toString(), 'TFL3');
});
