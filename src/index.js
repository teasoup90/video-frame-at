import { clampTime, normalizeOptions, validateTime } from './timing.js';

export class FrameExtractionError extends Error {
  constructor(code, message, cause) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'FrameExtractionError';
    this.code = code;
  }
}

function securityError(cause) {
  return new FrameExtractionError('CORS',
    'The video tainted the canvas. Use a local Blob/File or a video server with matching CORS headers.', cause);
}

export async function frameAt(source, time, options) {
  validateTime(time);
  const settings = normalizeOptions(options);
  const isBlob = typeof Blob !== 'undefined' && source instanceof Blob;
  if (!isBlob && !(typeof source === 'string' && source.trim()) &&
      !(typeof URL !== 'undefined' && source instanceof URL)) {
    throw new TypeError('Source must be a nonempty URL string, URL, Blob, or File.');
  }
  if (settings.signal?.aborted) {
    throw new DOMException('Frame extraction was aborted.', 'AbortError');
  }
  if (typeof document === 'undefined') {
    throw new FrameExtractionError('UNSUPPORTED', 'Frame extraction needs a browser document.');
  }

  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  if (settings.crossOrigin !== null) video.crossOrigin = settings.crossOrigin;
  let objectUrl;
  let callbackId;
  let active = true;
  const removers = new Set();
  const listen = (target, event, handler) => {
    target.addEventListener(event, handler);
    const remove = () => { target.removeEventListener(event, handler); removers.delete(remove); };
    removers.add(remove);
    return remove;
  };
  const waitFor = (event) => new Promise(resolve => {
    const remove = listen(video, event, () => { remove(); resolve(); });
  });
  let fail;
  const failure = new Promise((_, reject) => { fail = reject; });
  const timer = setTimeout(() => fail(new FrameExtractionError('TIMEOUT',
    `Frame extraction exceeded ${settings.timeoutMs} ms.`)), settings.timeoutMs);
  listen(video, 'error', () => fail(new FrameExtractionError('MEDIA',
    `Video could not be loaded or decoded (media code ${video.error?.code ?? 0}). Check the URL, codec, and CORS headers.`)));
  if (settings.signal) listen(settings.signal, 'abort', () => fail(
    new DOMException('Frame extraction was aborted.', 'AbortError')));

  async function capture() {
    const metadata = waitFor('loadedmetadata');
    const firstDecodedFrame = typeof video.requestVideoFrameCallback === 'function'
      ? new Promise(resolve => { callbackId = video.requestVideoFrameCallback(resolve); })
      : waitFor('loadeddata');
    objectUrl = isBlob ? URL.createObjectURL(source) : undefined;
    video.src = objectUrl ?? String(source);
    video.load();
    await metadata;
    if (!active) return;
    const target = clampTime(time, video.duration);
    await firstDecodedFrame;
    if (!active) return;
    // Seeking to the already-presented initial frame need not present a new frame.
    if (target > 0) await new Promise((resolve, reject) => {
      let sought = false;
      let presented = false;
      const hasCallback = typeof video.requestVideoFrameCallback === 'function';
      const complete = () => {
        if (sought && (!hasCallback || presented)) { remove(); resolve(); }
      };
      const remove = listen(video, 'seeked', () => { sought = true; complete(); });
      if (hasCallback) {
        const onFrame = () => {
          if (!active) return;
          if (!video.seeking && video.readyState >= 2) {
            presented = true;
            complete();
          } else {
            callbackId = video.requestVideoFrameCallback(onFrame);
          }
        };
        callbackId = video.requestVideoFrameCallback(onFrame);
      }
      try { video.currentTime = target; } catch (error) { reject(error); }
    });
    if (!active) return;
    if (typeof video.requestVideoFrameCallback !== 'function') {
      // Fallback: 'seeked'/'loadeddata' can fire before the frame is paintable in Chromium.
      if (video.readyState < 2) await waitFor('canplay');
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (!active) return;
    }
    if (!video.videoWidth || !video.videoHeight) {
      throw new FrameExtractionError('DECODE', 'The decoded video has no usable frame dimensions.');
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new FrameExtractionError('UNSUPPORTED', 'A 2D canvas context is unavailable.');
    context.drawImage(video, 0, 0);
    // Probe all outputs, including canvas and bitmap, for origin cleanliness.
    context.getImageData(0, 0, 1, 1);
    if (settings.output === 'canvas') return canvas;
    if (settings.output === 'imageBitmap') {
      if (typeof createImageBitmap !== 'function') {
        throw new FrameExtractionError('UNSUPPORTED', 'createImageBitmap is unavailable; request canvas or blob.');
      }
      const bitmap = await createImageBitmap(canvas);
      if (!active) { bitmap.close(); return; }
      return bitmap;
    }
    return new Promise((resolve, reject) => canvas.toBlob(blob => {
      if (!blob) reject(new FrameExtractionError('ENCODE', 'The browser could not encode the frame.'));
      else if (blob.type !== settings.format) reject(new FrameExtractionError('FORMAT_UNSUPPORTED',
        `The browser cannot encode ${settings.format}; it returned ${blob.type}.`));
      else resolve(blob);
    }, settings.format, settings.quality));
  }

  try {
    return await Promise.race([capture(), failure]);
  } catch (error) {
    if (error?.name === 'SecurityError') throw securityError(error);
    throw error;
  } finally {
    active = false;
    clearTimeout(timer);
    for (const remove of removers) remove();
    if (callbackId !== undefined && typeof video.cancelVideoFrameCallback === 'function') {
      video.cancelVideoFrameCallback(callbackId);
    }
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export const firstFrame = (source, options) => frameAt(source, 'first', options);
export const lastFrame = (source, options) => frameAt(source, 'last', options);
