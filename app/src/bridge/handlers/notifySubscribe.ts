import type { HandlerFn } from '../handler';

// No native adapter with the required scope/consent contract exists yet.
export function handleNotifySubscribe(): HandlerFn {
  return async (_session, args) => {
    if (Object.keys(args).some(key => !['action'].includes(key))) throw new Error('INVALID_ARGUMENT: unknown field');
    if (args.action !== undefined && !['subscribe', 'unsubscribe', 'status'].includes(args.action as string)) throw new Error('INVALID_ARGUMENT: action');
    throw new Error('UNAVAILABLE: native capability adapter missing');
  };
}

export function __clearNotify(): void {}
