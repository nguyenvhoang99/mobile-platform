// Owner: Mobile Platform. Remove when bundled content is sourced from signed config.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'app/node_modules/typescript'));
const yaml = require(path.join(root, 'app/node_modules/yaml'));
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
const from = p => require(path.join(root, 'app/src', p));
const config = from('config/appConfig.ts').appConfig;
const trackingSource = ts.createSourceFile('trackingService.ts', fs.readFileSync(path.join(root, 'app/src/tracking/trackingService.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
let declarations; let sessionRenew;
function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(trackingSource) === 'hostEvents') declarations = node.initializer.getText(trackingSource); if (ts.isVariableDeclaration(node) && node.name.getText(trackingSource) === 'SESSION_RENEW_MS') sessionRenew = node.initializer.getText(trackingSource); ts.forEachChild(node, visit); }
visit(trackingSource);
if (!declarations) throw Error('Missing host event declarations');
const declarationCode = ts.transpileModule('const declarations = ' + declarations + '; module.exports = declarations;', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const declarationModule = { exports: {} };
new Function('module', declarationCode)(declarationModule);
const data = {
  schemaVersion: 1,
  config: { tracking: { ...config.tracking, sessionRenewMs: new Function("return " + sessionRenew)() }, notification: config.notification, cards: config.cards },
  hostEvents: declarationModule.exports,
  apps: from('miniapps/catalog.ts').miniAppCatalog,
  tenants: Object.values(from('config/tenants.ts').TENANTS).map(({ paletteOverrides, ...t }) => ({...t, accent: paletteOverrides.primary || '#3B5BDB'})),
  categories: from('home/homeModel.ts').homeCategoryCatalog,
  cards: from('cards/dataset.ts').seedCardDataset(0).cards,
  slots: from('miniapps/sample/model.ts').initialSampleSlots,
  capabilities: yaml.parse(fs.readFileSync(path.join(root, 'policy/capabilities.yaml'), 'utf8')).capabilities,
};
for (const appId of ['split-bill', 'manage-expense']) {
  const file = path.join(root, `native/shared/miniapps/${appId}/manifest.json`);
  if (!fs.existsSync(file)) { if (appId === 'split-bill') throw Error('Missing Split Bill package'); continue; }
  const app = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.apps = [...data.apps.filter(x => x.id !== appId), { ...app, icon: 'receipt', resourceEndpoint: `bundle://${appId}` }];
  data.tenants = data.tenants.map(t => ({ ...t, featuredAppIds: [...new Set([...t.featuredAppIds, appId])] }));
  data.categories = data.categories.map(c => c.id === 'other' ? { ...c, miniAppIds: [...new Set([...c.miniAppIds, appId])] } : c);
}
const output = JSON.stringify(data, null, 2) + '\n';
const target = path.join(root, 'native/shared/platform.json');
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8') !== output) throw Error('Native content stale: run node native/tools/export-data.cjs');
} else fs.writeFileSync(target, output);
console.log(`Native content: ${data.apps.length} apps, ${data.cards.length} cards, ${data.slots.length} slots, ${data.capabilities.length} capabilities`);
