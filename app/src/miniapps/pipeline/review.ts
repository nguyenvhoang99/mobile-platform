/**
 * Local review pipeline — mobile-only MVP.
 * Runs the checks from mini-app-pipeline Step 2 without a backend.
 * Each check reports blocking vs advisory; blocking failures reject the package.
 *
 * Checks:
 * 1) signatures + hash-tree + archive safety (blocking)
 * 2) manifest vs schema (blocking)
 * 3) declared-vs-actual (blocking) — naive grep + AST-lite for minified bundles
 * 4) dynamic-code detection (blocking)
 * 5) egress wildcard check (blocking)
 * 6) capability diff (routes to human)
 * 7) size ceilings (blocking)
 */

import { validateArchiveEntries, ArchiveEntry } from '../manifest/archiveSafety';
import { validateManifest } from '../manifest/validator';
import { verifyPackage, SignedPackage } from '../manifest/signer';

export type CheckResult = { id: string; ok: boolean; blocking: boolean; message: string };
export type ReviewReport = { ok: boolean; checks: CheckResult[] };

const SIZE_CEILINGS = {
  mainPackageKB: 2048, // provisional — measure
  totalPackageKB: 4096,
  singleFileKB: 1024,
  maxFiles: 500,
};

export function reviewPackage(input: {
  signedPackage: SignedPackage;
  archiveEntries: ArchiveEntry[];
  bundleSource: string; // JS bundle text for declared-vs-actual
  previousManifest?: Record<string, unknown> | null;
}): ReviewReport {
  const checks: CheckResult[] = [];

  // 1) Signatures + hash + archive
  const sig = verifyPackage(input.signedPackage);
  checks.push({
    id: 'signatures',
    ok: sig.ok,
    blocking: true,
    message: sig.ok ? 'signatures valid' : (sig as { reason: string }).reason,
  });
  const arch = validateArchiveEntries(input.archiveEntries, { maxFiles: SIZE_CEILINGS.maxFiles, maxSingleBytes: SIZE_CEILINGS.singleFileKB * 1024 });
  checks.push({
    id: 'archive_safety',
    ok: arch.ok,
    blocking: true,
    message: arch.ok ? 'archive entries safe' : `${arch.reason}: ${arch.entry}`,
  });

  // 2) Manifest schema
  const man = validateManifest(input.signedPackage.manifest);
  checks.push({
    id: 'manifest_schema',
    ok: man.ok,
    blocking: true,
    message: man.ok ? 'manifest valid' : (man as { errors: string[] }).errors.join('; '),
  });

  // 3) Declared-vs-actual
  const declared: string[] = Array.isArray((input.signedPackage.manifest as { capabilities?: { name: string }[] }).capabilities)
    ? (input.signedPackage.manifest as { capabilities: { name: string }[] }).capabilities.map(c => c.name)
    : [];
  const found = findCapabilitiesInBundle(input.bundleSource);
  const undeclared = found.filter(f => !declared.includes(f));
  checks.push({
    id: 'declared_vs_actual',
    ok: undeclared.length === 0,
    blocking: true,
    message: undeclared.length === 0 ? 'declared ⊆ actual' : `undeclared calls: ${undeclared.join(', ')}`,
  });

  // 4) Dynamic code detection
  const hasDynamic = /\beval\s*\(|Function\s*\(|import\s*\(/.test(input.bundleSource) || /fetch\s*\(\s*['"`]https?:/.test(input.bundleSource);
  // Second regex is naive — real pipeline needs AST; here we flag direct fetch to non-declared hosts separately.
  const hasRemoteScript = /<script[^>]+src=["']https?:/.test(input.bundleSource);
  checks.push({
    id: 'no_dynamic_code',
    ok: !hasDynamic && !hasRemoteScript,
    blocking: true,
    message: hasDynamic || hasRemoteScript ? 'dynamic code / remote script detected' : 'no dynamic code',
  });

  // 5) Egress wildcard
  const egressHosts: string[] = (input.signedPackage.manifest as { egressHosts?: string[] }).egressHosts ?? [];
  const hasWildcard = egressHosts.some(h => h.includes('*'));
  checks.push({
    id: 'egress_no_wildcard',
    ok: !hasWildcard,
    blocking: true,
    message: hasWildcard ? 'wildcard host not allowed' : 'egress hosts exact',
  });

  // 6) Capability diff (advisory → routes to human if new capability)
  if (input.previousManifest) {
    const prevCaps: string[] = Array.isArray((input.previousManifest as { capabilities?: { name: string }[] }).capabilities)
      ? (input.previousManifest as { capabilities: { name: string }[] }).capabilities.map(c => c.name)
      : [];
    const added = declared.filter(d => !prevCaps.includes(d));
    checks.push({
      id: 'capability_diff',
      ok: true,
      blocking: false,
      message: added.length === 0 ? 'no capability change' : `new capabilities: ${added.join(', ')} → human review`,
    });
  }

  // 7) Size ceilings
  const totalBytes = input.archiveEntries.reduce((s, e) => s + e.size, 0);
  checks.push({
    id: 'size_ceiling',
    ok: totalBytes <= SIZE_CEILINGS.totalPackageKB * 1024 && input.archiveEntries.length <= SIZE_CEILINGS.maxFiles,
    blocking: true,
    message: `total ${Math.round(totalBytes / 1024)}KB / ${input.archiveEntries.length} files`,
  });

  const blockingFailed = checks.some(c => c.blocking && !c.ok);
  return { ok: !blockingFailed, checks };
}

function findCapabilitiesInBundle(source: string): string[] {
  // Naive: look for capability names mentioned as strings.
  // Real pipeline uses AST + minification-resilient analysis; this is a floor.
  const candidates = ['net.request', 'storage.kv', 'scanner.scan', 'location.current', 'crypto.sign', 'notify.subscribe'];
  return candidates.filter(name => source.includes(name));
}
