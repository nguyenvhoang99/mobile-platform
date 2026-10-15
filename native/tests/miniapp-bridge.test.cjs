const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const bootstrap = fs.readFileSync(path.join(root, 'native/miniapp-host.js'), 'utf8');
function environment(ios) {
  let listener; const timers = [];
  const window = { addEventListener(_, fn) { listener=fn }, ...(ios ? { webkit: { messageHandlers: { miniapp: { postMessage: ios } } } } : {}) };
  const context = vm.createContext({ location: {hostname: 'split-bill'}, window, document: {}, Map, Promise, Object, Error, JSON, setTimeout(fn) { timers.push(fn); return timers.length }, clearTimeout() {} });
  vm.runInContext(bootstrap, context);
  return { window, context, timers, connect(port) { listener({ data:'miniapp-port-v1', ports:[port] }) } };
}
test('bundled assets are pinned, host-only, and import provenance exists', () => {
  const dir = path.join(root, 'native/shared/miniapps/split-bill');
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'package.json')));
  assert.equal(index.branch, 'feat/expense-first-ux');
  for (const [name, hash] of Object.entries(index.files)) {
    const bytes=fs.readFileSync(path.join(dir,name));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),hash);
    assert.notEqual(crypto.createHash('sha256').update(Buffer.concat([bytes,Buffer.from('tamper')])).digest('hex'),hash);
  }
  const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
  assert.ok(html.indexOf('src="/host.js"') < html.indexOf('src="./bundle.js"'));
  assert.doesNotMatch(html.replace(/<!--[\s\S]*?-->/g,''),/http-equiv=["']Content-Security-Policy/i);
  assert.equal(fs.readFileSync(path.join(dir,'host.js'),'utf8'), bootstrap);
  assert.ok(!fs.existsSync(path.join(dir,'bundle.web.js')));
  assert.doesNotMatch(fs.readFileSync(path.join(dir,'bundle.js'),'utf8'), /SUPABASE_ANON_KEY|localStorage\.|navigator\.mediaDevices\.getUserMedia/);
});
test('iOS transport is compatible with shared-platform adapters and frozen handshake', async () => {
  const calls=[];
  const e=environment(async raw => { const call=JSON.parse(raw); calls.push(call); return {ok:true,data:call.args.op==='get'?{value:'fixture'}:null} });
  vm.runInContext(bootstrap,e.context); // Served host.js is safe after WK document-start injection.
  assert.ok(Object.isFrozen(e.window.__MINIAPP_CAPS__['storage.kv'].ops));
  assert.throws(()=>e.window.localStorage);
  const shared=await import(pathToFileURL(path.join(__dirname,'fixtures/shared-platform-host-bridge.mjs')));
  const client=shared.createHostCapabilityClientFromGlobal(e.window);
  const kv=shared.createHostKvBridge(client);
  assert.deepEqual(await kv.get('draft'),{found:true,value:'fixture'});
  await kv.set('draft','saved');
  assert.equal(calls[1].operation,'kv'); assert.equal(calls[1].args.op,'set');
  await assert.rejects(client.request('identity.auth','signIn'),/UNSUPPORTED|does not expose/);
  assert.ok(!Object.hasOwn(calls[0],'appId'));
});
test('Android MessagePort transports replies exactly once', async () => {
  const e=environment(); const messages=[];
  const port={start(){},postMessage(raw){messages.push(JSON.parse(raw))}};
  e.connect(port);
  const pending=e.window.MiniAppBridge.request({id:'fixture',capability:'storage.kv',operation:'kv',version:1,args:{op:'get',key:'draft'}});
  await Promise.resolve();
  assert.equal(messages.length,1);
  port.onmessage({data:JSON.stringify({id:'fixture',ok:true,data:{value:'saved'}})});
  assert.equal((await pending).data.value,'saved');
  port.onmessage({data:JSON.stringify({id:'fixture',ok:false,error:'TIMEOUT'})});
});
test('timed-out Android calls never dispatch after a late connection', async () => {
  const e=environment(); let dispatched=false;
  const promise=e.window.MiniAppBridge.request({id:'late',capability:'storage.kv',operation:'kv',version:1,args:{op:'set',key:'draft',value:'stale'}});
  e.timers[0](); assert.equal((await promise).error,'TIMEOUT');
  e.connect({start(){},postMessage(){dispatched=true}}); await Promise.resolve();
  assert.equal(dispatched,false);
});
test('one native factory per platform; header CSP and scoped native transport', () => {
  const swift=fs.readFileSync(path.join(root,'ios/Sources/PlatformApp/MiniAppWebView.swift'),'utf8');
  const kotlin=fs.readFileSync(path.join(root,'android/app/src/main/java/com/miniappplatform/nativehost/MiniAppWebView.kt'),'utf8');
  const walk = dir => fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry => entry.isDirectory() ? walk(path.join(dir,entry.name)) : [path.join(dir,entry.name)]);
  const swiftSources=walk(path.join(root,'ios/Sources')).filter(f=>f.endsWith('.swift')).map(f=>fs.readFileSync(f,'utf8')).join('\n');
  const kotlinSources=walk(path.join(root,'android/app/src/main/java')).filter(f=>f.endsWith('.kt')).map(f=>fs.readFileSync(f,'utf8')).join('\n');
  assert.equal((swiftSources.match(/\bWKWebView\(/g)||[]).length,1);
  assert.equal((kotlinSources.match(/\bWebView\(/g)||[]).length,1);
  assert.equal((kotlin.match(/web = WebView\(activity\)/g)||[]).length,1);
  assert.match(swift,/securityOrigin\.host == appId/); assert.match(swift,/frameInfo\.isMainFrame/);
  assert.match(swift,/Content-Security-Policy/); assert.match(kotlin,/Content-Security-Policy/);
  assert.match(kotlin,/postWebMessage\(WebMessage\("miniapp-port-v1".*Uri\.parse\(ORIGIN\)/);
  assert.doesNotMatch(kotlin,/addJavascriptInterface|Intent\.parseUri/);
});
