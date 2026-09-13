import { NativeModules, Platform, Vibration } from 'react-native';

/**
 * Haptic facade — the ONLY place that may call vibration/haptics.
 * Direct `Vibration.vibrate` or `Haptics.*` elsewhere fails CI.
 *
 * Taxonomy mirrors `.claude/skills/mobile-haptics/SKILL.md`:
 * - selection: reversible choice (enter edit mode)
 * - successLight: entity created (pin)
 * - removal: entity destroyed (unpin/remove) — slightly heavier
 * - warning/error: rarely used, gated
 *
 * Callers never pass duration/style — they declare intent and the facade
 * maps to the platform's curated waveform. Intensity is not a parameter.
 */

type NativeHaptics = {
  selectionChanged?: () => void;
  impactLight?: () => void;
  impactMedium?: () => void;
  impactHeavy?: () => void;
  notificationSuccess?: () => void;
  notificationWarning?: () => void;
  notificationError?: () => void;
};

const nativeHaptics = NativeModules.Haptics as NativeHaptics | undefined;
const shellHaptics = NativeModules.NativeShellControls as NativeHaptics | undefined;

function tryNative(fn?: () => void): boolean {
  if (fn) {
    try {
      fn();
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Light selection — long-press to enter edit mode, moving focus.
 * 8ms on Android; iOS selectionChanged.
 * Fires at most once per gesture.
 */
export function signalSelection(): void {
  if (tryNative(nativeHaptics?.selectionChanged) || tryNative(shellHaptics?.selectionChanged)) return;
  if (Platform.OS === 'android') Vibration.vibrate(8);
  // iOS without native module has no safe fallback — silence is correct.
}

/**
 * Success light — entity created (pin category/mini-app). 10ms.
 * Paired with scale 0.96→1, 100ms feedback. This is the common pin haptic.
 */
export function signalSuccessLight(): void {
  if (tryNative(nativeHaptics?.impactLight) || tryNative(nativeHaptics?.notificationSuccess)) return;
  if (Platform.OS === 'android') Vibration.vibrate(10);
}

/**
 * Removal — entity destroyed (unpin/remove). 20ms, medium.
 * Slightly heavier than creation so destruction feels deliberate.
 */
export function signalRemoval(): void {
  if (tryNative(nativeHaptics?.impactMedium)) return;
  if (Platform.OS === 'android') Vibration.vibrate(20);
}

/**
 * Warning — destructive prompt about to show.
 */
export function signalWarning(): void {
  if (tryNative(nativeHaptics?.notificationWarning)) return;
  if (Platform.OS === 'android') Vibration.vibrate([10, 30, 10]);
}

/**
 * Error — action failed due to system constraint.
 */
export function signalError(): void {
  if (tryNative(nativeHaptics?.notificationError)) return;
  if (Platform.OS === 'android') Vibration.vibrate([10, 30, 20]);
}

/**
 * Heavy impact — reserved, almost never used.
 */
export function signalHeavyImpact(): void {
  if (tryNative(nativeHaptics?.impactHeavy)) return;
  if (Platform.OS === 'android') Vibration.vibrate(30);
}
