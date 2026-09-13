import { reviewPackage } from '../review';
import { signPackage } from '../../manifest/signer';

function makeSigned(manifest: Record<string, unknown>) {
  return signPackage(manifest as Record<string, unknown>);
}

describe('review pipeline (local, mobile-only)', () => {
  const baseManifest = {
    id: 'weather',
    name: 'Weather',
    shortName: 'Weather',
    version: 1,
    routes: ['/', '/detail/:id'],
    rootRoute: '/',
    publicEntrypoints: [],
    crossAppLinks: [],
    trackingEvents: [],
    capabilities: [{ name: 'storage.kv', version: 1, purposeKey: 'store_prefs' }],
    egressHosts: ['api.weather.local'],
  };

  it('passes a clean package', () => {
    const signed = makeSigned(baseManifest);
    const report = reviewPackage({
      signedPackage: signed,
      archiveEntries: [{ path: 'index.html', size: 1000, compressedSize: 400 }],
      bundleSource: "bridge.call('storage.kv', {op:'get'})",
    });
    expect(report.ok).toBe(true);
  });

  it('rejects undeclared capability', () => {
    const signed = makeSigned(baseManifest);
    const report = reviewPackage({
      signedPackage: signed,
      archiveEntries: [{ path: 'index.html', size: 1000, compressedSize: 400 }],
      bundleSource: "bridge.call('scanner.scan', {})",
    });
    expect(report.ok).toBe(false);
    expect(report.checks.find(c => c.id === 'declared_vs_actual')?.ok).toBe(false);
  });

  it('rejects wildcard host', () => {
    const bad = { ...baseManifest, egressHosts: ['*.example.com'] };
    const signed = makeSigned(bad);
    const report = reviewPackage({
      signedPackage: signed,
      archiveEntries: [{ path: 'index.html', size: 1000, compressedSize: 400 }],
      bundleSource: '',
    });
    expect(report.checks.find(c => c.id === 'egress_no_wildcard')?.ok).toBe(false);
  });

  it('rejects path traversal', () => {
    const signed = makeSigned(baseManifest);
    const report = reviewPackage({
      signedPackage: signed,
      archiveEntries: [{ path: '../evil.js', size: 100, compressedSize: 50 }],
      bundleSource: '',
    });
    expect(report.checks.find(c => c.id === 'archive_safety')?.ok).toBe(false);
  });

  it('rejects tampered signature', () => {
    const signed = makeSigned(baseManifest);
    signed.storeSignature = 'bad';
    const report = reviewPackage({
      signedPackage: signed,
      archiveEntries: [{ path: 'index.html', size: 100, compressedSize: 400 }],
      bundleSource: '',
    });
    expect(report.checks.find(c => c.id === 'signatures')?.ok).toBe(false);
  });
});
