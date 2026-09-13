/**
 * Race a promise against a timer. If the promise hangs (native bridge never
 * resolves — the iOS location bug) the timer wins and we settle with a
 * fallback value instead of keeping the UI in "Đang xác định khu vực…" forever.
 *
 * Both platforms use this: iOS and Android share the same JS layer, so one fix
 * covers both.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>(resolve => {
    timer = setTimeout(() => resolve(onTimeout()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Same but for void/nullable promises where the fallback is to resolve with that value.
 * Used for fire-and-forget storage writes.
 */
export function withTimeoutVoid(promise: Promise<unknown>, ms: number): Promise<void> {
  return withTimeout(
    promise.then(() => undefined),
    ms,
    () => undefined,
  );
}
