/** Bound the complete operation, including response bodies, even if a transport ignores abort. */
export const withHomeserverTimeout = async <T>(
  operation: (signal: AbortSignal) => Promise<T>,
  outerSignal?: AbortSignal,
  timeoutMs = 8000
): Promise<T> => {
  const controller = new AbortController();
  let rejectAbort!: (error: DOMException) => void;
  const interrupted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const abort = () => {
    controller.abort();
    rejectAbort(new DOMException('Request canceled', 'AbortError'));
  };
  outerSignal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    rejectAbort(new DOMException('Homeserver did not respond in time', 'TimeoutError'));
    controller.abort();
  }, timeoutMs);
  if (outerSignal?.aborted) abort();
  try {
    // Observe cancellation before invoking the operation; a synchronous throw is safe too.
    return await Promise.race([
      interrupted,
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new DOMException('Request canceled', 'AbortError');
        return operation(controller.signal);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener('abort', abort);
  }
};
