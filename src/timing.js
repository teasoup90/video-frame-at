export function lastFrameTime(duration) {
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new RangeError('Video duration must be finite and greater than zero.');
  }
  // The endpoint is outside the final frame's display interval.
  return Math.max(0, duration - Math.max(Math.min(0.001, duration / 2), duration * Number.EPSILON));
}

export function validateTime(time) {
  if (time !== 'first' && time !== 'last' &&
      (typeof time !== 'number' || !Number.isFinite(time))) {
    throw new TypeError('Time must be a finite number of seconds, "first", or "last".');
  }
}

export function clampTime(time, duration) {
  validateTime(time);
  const end = lastFrameTime(duration);
  if (time === 'last') return end;
  if (time === 'first') return 0;
  return Math.max(0, Math.min(time, end));
}

export function normalizeOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Options must be an object.');
  }
  const {
    output = 'blob', format = 'image/png', quality = 0.92,
    timeoutMs = 15000, crossOrigin = 'anonymous', signal,
  } = options;
  if (!['blob', 'canvas', 'imageBitmap'].includes(output)) {
    throw new TypeError('Output must be blob, canvas, or imageBitmap.');
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(format)) {
    throw new TypeError('Format must be image/png, image/jpeg, or image/webp.');
  }
  if (typeof quality !== 'number' || !Number.isFinite(quality) || quality < 0 || quality > 1) {
    throw new RangeError('Quality must be a finite number between 0 and 1.');
  }
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647) {
    throw new RangeError('Timeout must be between 0 (exclusive) and 2147483647 milliseconds.');
  }
  if (![null, 'anonymous', 'use-credentials'].includes(crossOrigin)) {
    throw new TypeError('crossOrigin must be anonymous, use-credentials, or null.');
  }
  if (signal !== undefined &&
      (typeof signal?.aborted !== 'boolean' || typeof signal?.addEventListener !== 'function' ||
       typeof signal?.removeEventListener !== 'function')) {
    throw new TypeError('signal must be an AbortSignal.');
  }
  return { output, format, quality, timeoutMs, crossOrigin, signal };
}
