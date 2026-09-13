import type { HandlerFn } from '../handler';

// Host owns push tokens; mini-app gets subscription state only.
const subs = new Map<string, boolean>(); // key: tenant:appId:userId

export function handleNotifySubscribe(): HandlerFn {
  return async (session, args) => {
    const action = (args.action as string) ?? 'subscribe';
    if (!['subscribe', 'unsubscribe', 'status'].includes(action)) {
      throw new Error('INVALID_ARGUMENT: action');
    }
    const key = `${session.tenantId}:${session.appId}:${session.userId}`;
    if (action === 'subscribe') {
      subs.set(key, true);
      return { subscribed: true };
    }
    if (action === 'unsubscribe') {
      subs.set(key, false);
      return { subscribed: false };
    }
    return { subscribed: subs.get(key) ?? false };
  };
}

export function __clearNotify(): void {
  subs.clear();
}
