import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

/**
 * OnDeviceLlm — single source of truth for the native boundary (S3).
 *
 * Host-owned on-device LLM mechanism (no mini-app path — the capability
 * broker in src/bridge is the only door for mini-apps). Result maps are
 * `Object`: the shape contract lives in `src/native/onDeviceLlm.ts`.
 *
 * Pilot status: method selectors are frozen (additive-only from here).
 * Bodies are PoC stubs returning `unavailable` until the device milestone
 * wires FoundationModels (iOS) / AICore + ML Kit GenAI (Android) behind
 * the host image picker. See docs/features/ai-extract-bill.md.
 */
export interface Spec extends TurboModule {
  getAvailability(): Promise<Object>;
  extractBill(requestJson: string): Promise<Object>;
  cancelBill(sessionId: string): Promise<void>;
}

export default TurboModuleRegistry.get<Spec>('OnDeviceLlm');
