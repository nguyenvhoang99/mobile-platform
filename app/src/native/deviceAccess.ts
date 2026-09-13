import type {Spec as DeviceAccessSpec} from './specs/NativeDeviceAccess';
import DeviceAccessModule from './specs/NativeDeviceAccess';

export type DeviceAccessKind =
  | 'network'
  | 'biometric'
  | 'weatherLocation'
  | 'voiceCommand';

export type DeviceAccessStatus =
  | 'available'
  | 'offline'
  | 'granted'
  | 'authenticated'
  | 'recognized'
  | 'denied'
  | 'denied_permanently'
  | 'unavailable'
  | 'cancelled'
  | 'error';

export type DeviceAccessResult = {
  status: DeviceAccessStatus;
  message: string;
  transcript?: string;
  networkType?: 'wifi' | 'cellular' | 'roaming' | 'constrained' | 'unknown';
};

const nativeDeviceAccess = DeviceAccessModule as DeviceAccessSpec | null;

// The spec returns untyped result maps; the shape contract is
// `DeviceAccessResult`, enforced by native construction on both platforms.
async function asDeviceResult(
  promise: Promise<Object>,
): Promise<DeviceAccessResult> {
  return (await promise) as unknown as DeviceAccessResult;
}

const unavailable = (feature: string): DeviceAccessResult => ({
  status: 'unavailable',
  message: `${feature} is not available in this build.`,
});

/**
 * These calls are host-only. No WebView, injected SDK, or mini-app package can
 * import this module. A future bridge handler must apply its own declared
 * capability, review, consent, origin, quota, and audit checks before it can
 * ask the host to use any result from this module.
 */
import { withTimeout } from '../utils/withTimeout';

// Native promises must never hang the JS thread forever. iOS location was the
// observed bug: the authorization delegate never fired and the promise never
// settled, leaving the UI stuck on "Đang xác định khu vực…". Every native
// call is raced against a timer so both iOS and Android fall back deterministically.
const NATIVE_TIMEOUT_MS: Record<DeviceAccessKind, number> = {
  network: 1500,
  biometric: 30000, // user interaction; let the system UI drive
  weatherLocation: 4000, // 4 s matches the native-side 4 s deadline
  voiceCommand: 15000,
};

function deviceTimeoutResult(kind: DeviceAccessKind): DeviceAccessResult {
  if (kind === 'weatherLocation') {
    return { status: 'denied', message: 'Location request timed out.' };
  }
  return unavailable(`${kind} timed out`);
}

export async function requestDeviceAccess(
  kind: DeviceAccessKind,
): Promise<DeviceAccessResult> {
  if (!nativeDeviceAccess) {
    return unavailable('Device access');
  }

  const nativePromise = (() => {
    switch (kind) {
      case 'network':
        return asDeviceResult(nativeDeviceAccess.getNetworkStatus());
      case 'biometric':
        return asDeviceResult(
          nativeDeviceAccess.authenticate(
            'Confirm your identity to sign in to the host.',
          ),
        );
      case 'weatherLocation':
        return asDeviceResult(nativeDeviceAccess.requestWeatherLocation());
      case 'voiceCommand':
        return asDeviceResult(nativeDeviceAccess.startVoiceCommand());
    }
  })();

  return withTimeout(nativePromise, NATIVE_TIMEOUT_MS[kind], () =>
    deviceTimeoutResult(kind),
  );
}
