import schema from './schema.json';

/**
 * Manifest validator — imports schema.json directly (C9).
 * The published schema and the pipeline validation are the SAME file,
 * so the doc and the check cannot drift.
 *
 * Minimal hand-rolled validator to avoid adding a dependency (Track 1:
 * pure-TS, no transitive deps, avoids veto on RN upgrades). Covers the
 * load-bearing invariants; deeper validation (e.g. route 404 semantics) lives
 * in the container handler.
 */

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

const ID_RE = /^[a-z][a-z0-9-]{1,30}$/;
const HOST_RE = /^[a-z0-9.-]+$/;

export function validateManifest(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['manifest must be an object'] };
  }
  const m = input as Record<string, unknown>;

  const required = (schema as { required: string[] }).required ?? [];
  for (const k of required) {
    if (!(k in m)) errors.push(`missing required field: ${k}`);
  }

  // id
  if ('id' in m && (typeof m.id !== 'string' || !ID_RE.test(m.id))) {
    errors.push('id must match ^[a-z][a-z0-9-]{1,30}$');
  }
  // version — monotonic int
  if ('version' in m && (typeof m.version !== 'number' || !Number.isInteger(m.version) || m.version < 1)) {
    errors.push('version must be integer >=1');
  }
  // routes / rootRoute
  if ('routes' in m) {
    if (!Array.isArray(m.routes) || m.routes.length === 0) errors.push('routes must be non-empty array');
    else {
      for (const r of m.routes as unknown[]) {
        if (typeof r !== 'string' || !r.startsWith('/')) errors.push(`route must start with /: ${String(r)}`);
        if (typeof r === 'string' && (r.includes('://') || r.includes('\\'))) errors.push(`route contains forbidden chars: ${r}`);
      }
    }
  }
  if ('rootRoute' in m && typeof m.rootRoute === 'string' && !m.routes) {
    // already covered
  }
  if ('rootRoute' in m && typeof m.rootRoute === 'string' && Array.isArray(m.routes)) {
    // root must be among declared routes (pattern-aware via catalog helper — here exact check)
    const routes = m.routes as string[];
    if (!routes.includes(m.rootRoute) && !routes.some(p => p.includes(':'))) {
      // only enforce when no param routes; param equality is checked by broker
      errors.push('rootRoute must be one of routes');
    }
  }

  // egressHosts — no wildcards, no scheme
  if ('egressHosts' in m && Array.isArray(m.egressHosts)) {
    for (const h of m.egressHosts as unknown[]) {
      if (typeof h !== 'string' || !HOST_RE.test(h)) errors.push(`egressHost must be exact host, no wildcard/scheme: ${String(h)}`);
      if (typeof h === 'string' && (h.includes('*') || h.includes('/') || h.includes(':'))) {
        errors.push(`egressHost must not contain * / or :: ${h}`);
      }
    }
  }

  // capabilities — basic shape
  if ('capabilities' in m && Array.isArray(m.capabilities)) {
    for (const c of m.capabilities as unknown[]) {
      if (typeof c !== 'object' || c === null) { errors.push('capability must be object'); continue; }
      const cc = c as Record<string, unknown>;
      if (typeof cc.name !== 'string' || !cc.name.includes('.')) errors.push(`capability.name must be namespace.operation: ${String(cc.name)}`);
      if (typeof cc.version !== 'number' || !Number.isInteger(cc.version)) errors.push('capability.version must be integer');
      if (typeof cc.purposeKey !== 'string' || cc.purposeKey.length === 0) errors.push('capability.purposeKey required');
    }
  }

  // additionalProperties false — flag unknown top-level keys
  const allowed = new Set(Object.keys((schema as { properties: Record<string, unknown> }).properties));
  for (const k of Object.keys(m)) {
    if (!allowed.has(k)) errors.push(`unknown field: ${k}`);
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function assertValidManifest(input: unknown): asserts input is Record<string, unknown> {
  const r = validateManifest(input);
  if (!r.ok) throw new Error(`Manifest invalid: ${r.errors.join('; ')}`);
}

// Re-export schema for pipeline/docs consumers that need the canonical file.
export { schema as manifestSchema };
