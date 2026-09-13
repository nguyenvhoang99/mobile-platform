import { findMiniApp, MiniAppManifest, miniAppCatalog } from './catalog';
import { TenantId, TENANTS } from '../config/tenants';

/**
 * Tenant-aware catalog — global appIds, per-tenant listing.
 * The single-binary, multi-province model filters a shared catalog by tenant.
 */

export function catalogForTenant(tenantId: TenantId): readonly MiniAppManifest[] {
  const meta = TENANTS[tenantId] ?? TENANTS['vn-fallback'];
  const order = new Map(meta.featuredAppIds.map((id, idx) => [id, idx]));
  // Include only featured ids that exist; preserve tenant order.
  const listed = miniAppCatalog.filter(m => order.has(m.id));
  return [...listed].sort((a, b) => (order.get(a.id)! - order.get(b.id)!));
}

export function findMiniAppForTenant(appId: string, tenantId: TenantId): MiniAppManifest | undefined {
  const cat = catalogForTenant(tenantId);
  return cat.find(m => m.id === appId) ?? findMiniApp(appId);
}
