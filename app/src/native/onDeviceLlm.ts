import type {Spec as OnDeviceLlmSpec} from './specs/NativeOnDeviceLlm';
import OnDeviceLlmModule from './specs/NativeOnDeviceLlm';
import { withTimeout } from '../utils/withTimeout';

export type LlmAvailabilityStatus =
  | 'available'
  | 'downloading'
  | 'downloadable'
  | 'needs_setup'
  | 'unavailable';

export type LlmAvailability = {
  status: LlmAvailabilityStatus;
  message: string;
  model?: string;
};

export type BillExtractionResult = {
  status: 'extracted' | 'unavailable' | 'cancelled' | 'error' | 'timeout';
  message: string;
  extraction?: unknown; // BillExtraction shape — validated by src/bridge/handlers/aiExtractBill.ts
  sessionId?: string;
};

const nativeLlm = OnDeviceLlmModule as OnDeviceLlmSpec | null;

async function asLlmAvailability(promise: Promise<Object>): Promise<LlmAvailability> {
  const raw = (await promise) as unknown as Partial<LlmAvailability>;
  const status = raw.status;
  if (
    status !== 'available' &&
    status !== 'downloading' &&
    status !== 'downloadable' &&
    status !== 'needs_setup' &&
    status !== 'unavailable'
  ) {
    return { status: 'unavailable', message: 'Unexpected availability response from the host.' };
  }
  return {
    status,
    message: typeof raw.message === 'string' ? raw.message : '',
    ...(typeof raw.model === 'string' ? { model: raw.model } : {}),
  };
}

/**
 * Host-only. No WebView, injected SDK, or mini-app package can import this
 * module. Mini-app access goes through the `ai.extract_bill` bridge
 * capability (G1 declaration + G2 consent + quota + audit) — never here.
 */
const unavailable = (feature: string): BillExtractionResult => ({
  status: 'unavailable',
  message: `${feature} is not available in this build.`,
});

// Native promises must never hang the JS thread (see deviceAccess.ts — the
// stuck "Đang xác định khu vực…" bug). Bill extraction runs on-device LLM
// inference; the deadline is provisional until device-lab baselines land.
const EXTRACT_BILL_TIMEOUT_MS = 30_000;

export async function getLlmAvailability(): Promise<LlmAvailability> {
  if (!nativeLlm) {
    return { status: 'unavailable', message: 'On-device LLM module is not present in this build.' };
  }
  return withTimeout(asLlmAvailability(nativeLlm.getAvailability()), 2000, (): LlmAvailability => ({
    status: 'unavailable',
    message: 'Availability check timed out.',
  }));
}

export async function extractBillWithLlm(args: {
  locale: 'vi' | 'en';
  idempotencyKey: string;
  hint?: string;
}): Promise<BillExtractionResult> {
  if (!nativeLlm) {
    return unavailable('Bill extraction');
  }
  if (args.locale !== 'vi' && args.locale !== 'en') {
    return { status: 'error', message: 'Invalid locale.' };
  }
  const requestJson = JSON.stringify({
    v: 1,
    locale: args.locale,
    idempotencyKey: args.idempotencyKey,
    ...(args.hint === undefined ? {} : { hint: args.hint.slice(0, 280) }),
  });
  try {
    const raw = (await withTimeout<unknown>(
      nativeLlm.extractBill(requestJson),
      EXTRACT_BILL_TIMEOUT_MS,
      () => null,
    )) as unknown as { status?: unknown; message?: unknown; extraction?: unknown; sessionId?: unknown } | null;
    if (raw === null) {
      return { status: 'timeout', message: 'Bill extraction timed out. Your screenshot was kept.' };
    }
    if (raw.status === 'extracted') {
      return {
        status: 'extracted',
        message: typeof raw.message === 'string' ? raw.message : '',
        extraction: raw.extraction,
        sessionId: typeof raw.sessionId === 'string' ? raw.sessionId : undefined,
      };
    }
    if (raw.status === 'cancelled') {
      return { status: 'cancelled', message: 'Bill extraction was cancelled.' };
    }
    return {
      status: 'unavailable',
      message: typeof raw.message === 'string' ? raw.message : 'Bill extraction is unavailable.',
    };
  } catch {
    // Never leak native error strings (may carry paths/tokens).
    return { status: 'error', message: 'Bill extraction failed.' };
  }
}

export async function cancelBillExtraction(sessionId: string): Promise<void> {
  if (!nativeLlm) return;
  try {
    await nativeLlm.cancelBill(sessionId);
  } catch {
    // Cancel is idempotent — a failed cancel still means "stop listening".
  }
}
