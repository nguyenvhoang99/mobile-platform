/**
 * Register all bridge handlers — single place that wires capability → handler.
 * R1: this list must match policy/capabilities.yaml (checked in conformance.sh).
 */

import { registerHandler } from './handler';
import { handleStorageKv } from './handlers/storageKv';
import { handleNetRequest } from './handlers/netRequest';
import { handleScanner } from './handlers/scanner';
import { handleLocationCurrent } from './handlers/locationCurrent';
import { handleCryptoSign } from './handlers/cryptoSign';
import { handleNotifySubscribe } from './handlers/notifySubscribe';

export function registerAllHandlers(egressHosts: readonly string[] = []): void {
  registerHandler('storage.kv', handleStorageKv());
  registerHandler('net.request', handleNetRequest(egressHosts));
  registerHandler('scanner.scan', handleScanner());
  registerHandler('location.current', handleLocationCurrent());
  registerHandler('crypto.sign', handleCryptoSign());
  registerHandler('notify.subscribe', handleNotifySubscribe());
}
