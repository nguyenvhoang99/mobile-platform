import { appConfig } from '../config/appConfig';
import { loadCardDatasetJson, saveCardDatasetJson } from '../native/hostStorage';
import { seedCardDataset } from './dataset';
import {
  CardDataset,
  isDatasetFresh,
  parseStoredDataset,
} from './model';

async function fetchRemoteDataset(
  endpoint: string,
  now: number,
): Promise<CardDataset | null> {
  try {
    const response = await fetch(endpoint, { method: 'GET' });
    if (!response.ok) {
      return null;
    }
    const parsed = parseStoredDataset(await response.text());
    if (!parsed) {
      return null;
    }
    return { ...parsed, retrievedAt: now, source: 'remote' };
  } catch {
    return null;
  }
}

/**
 * Loads the card dataset for the mini-app.
 *
 * Renewal contract: a stored copy younger than
 * `appConfig.cards.refreshIntervalMs` is served as-is. A stale copy triggers a
 * fetch from `appConfig.cards.endpoint`; on success the fresh copy is persisted
 * and returned, on failure the stored copy keeps serving. With no endpoint
 * configured (MVP) the bundled seed is the source of truth. Everything is
 * validated through `parseStoredDataset`, never trusted raw.
 */
export async function loadCardDataset(now: number = Date.now()): Promise<CardDataset> {
  const stored = parseStoredDataset(await loadCardDatasetJson());

  if (stored && isDatasetFresh(stored, now, appConfig.cards.refreshIntervalMs)) {
    return stored;
  }

  if (appConfig.cards.endpoint) {
    const remote = await fetchRemoteDataset(appConfig.cards.endpoint, now);
    if (remote) {
      runAsync(saveCardDatasetJson(JSON.stringify(remote)));
      return remote;
    }
  }

  if (stored) {
    return stored;
  }

  const seed = seedCardDataset(now);
  runAsync(saveCardDatasetJson(JSON.stringify(seed)));
  return seed;
}

function runAsync(promise: Promise<void>): void {
  promise.catch(() => undefined);
}
