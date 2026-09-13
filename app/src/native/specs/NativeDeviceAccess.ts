import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

/**
 * DeviceAccess — single source of truth for the native boundary (S3).
 * Result maps are `Object`: the shape contract lives in
 * `src/native/deviceAccess.ts` (`DeviceAccessResult`).
 */
export interface Spec extends TurboModule {
  getNetworkStatus(): Promise<Object>;
  authenticate(reason: string): Promise<Object>;
  requestWeatherLocation(): Promise<Object>;
  startVoiceCommand(): Promise<Object>;
}

export default TurboModuleRegistry.get<Spec>('DeviceAccess');
