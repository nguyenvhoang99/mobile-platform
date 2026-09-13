import { NativeModules } from 'react-native';
import { DEFAULT_TENANT, TenantId, TENANT_IDS } from './tenants';
import { withTimeout } from '../utils/withTimeout';

/**
 * Tenant persistence — host-secure where available, JS fallback elsewhere.
 *
 * Key design: storage is per-device, not per-user, because tenant is chosen
 * before auth on first launch (P9: one door, provenance). The value is small
 * (one string) and versioned so we can migrate if the profile shape changes.
 *
 * Native host may expose HostStorage.loadTenant / saveTenant; we fall back to
 * an in-memory store for tests / JS-only runs. Never store tenant in
 * WebView storage — pooled WebViews must never carry tenant residue (B1).
 */

type NativeTenantStorage = {
  loadTenant?: () => Promise<string | null>;
  saveTenant?: (tenantId: string) => Promise<void>;
};

const native = NativeModules.HostStorage as NativeTenantStorage | undefined;

let fallbackTenant: TenantId | null = null;

function isTenantId(v: string | null | undefined): v is TenantId {
  return !!v && (TENANT_IDS as readonly string[]).includes(v);
}

const STORAGE_TIMEOUT_MS = 1500;

export async function loadStoredTenant(): Promise<TenantId | null> {
  let raw: string | null = null;
  try {
    const load = native?.loadTenant ? native.loadTenant() : Promise.resolve(fallbackTenant);
    raw = await withTimeout(load, STORAGE_TIMEOUT_MS, () => fallbackTenant);
  } catch {
    raw = fallbackTenant;
  }
  if (isTenantId(raw)) return raw;
  if (isTenantId(fallbackTenant)) return fallbackTenant;
  return null;
}

export async function saveStoredTenant(tenantId: TenantId): Promise<void> {
  if (!isTenantId(tenantId)) throw new Error(`Invalid tenantId: ${tenantId}`);
  fallbackTenant = tenantId;
  try {
    const save = native?.saveTenant ? native.saveTenant(tenantId) : Promise.resolve();
    await withTimeout(save, STORAGE_TIMEOUT_MS, () => undefined);
  } catch {
    // fallback already set
  }
}

export function clearFallbackTenant(): void {
  fallbackTenant = null;
}

// For tests — inspect fallback without native.
export function __getFallbackTenant(): TenantId | null {
  return fallbackTenant;
}

export { DEFAULT_TENANT };
