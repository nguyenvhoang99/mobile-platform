import { NativeModules, Platform, StatusBar, Vibration } from 'react-native';

import { ShellPalette } from '../config/palette';

type NativeShellControls = {
  setSystemBars?: (appearance: 'light' | 'dark') => void;
  selectionChanged?: () => void;
};

/**
 * All host-native touch points pass through this small facade. It is not a
 * mini-app capability and it does not expose authority to WebViews. A future
 * TurboModule can implement `NativeShellControls` without changing screens.
 */
const controls = NativeModules.NativeShellControls as
  | NativeShellControls
  | undefined;

export function applyShellChrome(palette: ShellPalette): void {
  const appearance =
    palette.statusBarStyle === 'light-content' ? 'light' : 'dark';

  StatusBar.setBarStyle(palette.statusBarStyle, true);
  if (Platform.OS === 'android') {
    StatusBar.setBackgroundColor('transparent', true);
    StatusBar.setTranslucent(true);
  }

  controls?.setSystemBars?.(appearance);
}

export function signalNavigationSelection(): void {
  if (controls?.selectionChanged) {
    controls.selectionChanged();
    return;
  }

  // Android's system vibration is an intentionally small fallback while the
  // native haptics TurboModule is not yet present. iOS has no safe equivalent.
  if (Platform.OS === 'android') {
    Vibration.vibrate(8);
  }
}
