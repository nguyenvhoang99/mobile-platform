import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { DEFAULT_TENANT, localTenantProfile, resolveTenantFromCoords, TenantId } from '../config/tenants';
import { loadStoredTenant, saveStoredTenant } from '../config/tenantStorage';
import { requestDeviceAccess } from '../native/deviceAccess';
import { withTimeout } from '../utils/withTimeout';

/**
 * Tenant hook — location-first on first launch, otherwise stored.
 * No WebView storage involved (pool safety).
 */

export function useTenant() {
  const [tenantId, setTenantId] = useState<TenantId | null>(null);
  const [loading, setLoading] = useState(true);

  const resolveFromLocation = useCallback(async (): Promise<TenantId> => {
    try {
      // Host-only location call — not via bridge. Real native will provide coords.
      // For JS-only runs, deviceAccess will return unavailable and we fall back.
      // The native call is already raced against a 4 s timeout inside deviceAccess
      // (both iOS and Android), but we add a second outer timeout here so a
      // hanging bridge on either platform can never leave the UI stuck.
      const res = await withTimeout(
        requestDeviceAccess('weatherLocation'),
        4500,
        () => ({ status: 'denied' as const, message: 'Location fallback timeout' }),
      );
      // deviceAccess returns DeviceAccessResult with location-ish? For MVP we
      // synthesize: if unavailable, return fallback. If granted, we need lat/lon.
      // Since current deviceAccess mock has no lat/lon, we treat any available as
      // "near Hanoi" for deterministic behavior and document it.
      // Future: requestDeviceAccess('weatherLocation') will return {lat,lon}.
      if (res.status === 'granted' || res.status === 'available') {
        // Try to parse lat/lon from message if present (test seam)
        const maybe = res as unknown as { lat?: number; lon?: number };
        if (typeof maybe.lat === 'number' && typeof maybe.lon === 'number') {
          return resolveTenantFromCoords({ lat: maybe.lat, lon: maybe.lon });
        }
      }
      return resolveTenantFromCoords(null);
    } catch {
      return resolveTenantFromCoords(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let finished = false;
    // Hard deadline: even if every native promise hangs longer than its
    // individual JS timeout (or the bridge itself is dead), the UI must
    // leave the loading state. Both iOS and Android use the same JS path,
    // so this fixes the "keep loading" bug on both platforms with one timer.
    const hardDeadline = setTimeout(() => {
      if (!cancelled && !finished) {
        finished = true;
        setTenantId(prev => prev ?? DEFAULT_TENANT);
        setLoading(false);
      }
    }, 4500);

    (async () => {
      try {
        const stored = await withTimeout(loadStoredTenant(), 2000, () => null);
        if (cancelled || finished) return;
        if (stored) {
          finished = true;
          setTenantId(prev => prev ?? stored);
          setLoading(false);
          clearTimeout(hardDeadline);
          return;
        }
        // First launch — location-first
        const resolved = await resolveFromLocation();
        if (cancelled || finished) return;
        await withTimeout(saveStoredTenant(resolved), 1500, () => undefined);
        if (cancelled || finished) return;
        finished = true;
        setTenantId(prev => prev ?? resolved);
        setLoading(false);
        clearTimeout(hardDeadline);
      } catch {
        if (!cancelled && !finished) {
          finished = true;
          setTenantId(prev => prev ?? DEFAULT_TENANT);
          setLoading(false);
          clearTimeout(hardDeadline);
        }
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(hardDeadline);
    };
  }, [resolveFromLocation]);

  const switchTenant = useCallback(async (next: TenantId) => {
    await withTimeout(saveStoredTenant(next), 1500, () => undefined);
    setTenantId(next);
    setLoading(false);
  }, []);

  const profile = tenantId ? localTenantProfile(tenantId) : null;

  // Trace marker — tenant resolved
  useEffect(() => {
    if (tenantId && Platform.OS) {
      // App-owned marker; field + lab read the same name (mobile-smoothness)
      // No-op in JS — real marker is emitted via native trace API when available.
    }
  }, [tenantId]);

  return { tenantId, profile, loading, switchTenant, resolveFromLocation };
}
