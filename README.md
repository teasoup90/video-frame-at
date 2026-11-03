# video-frame-at

Extract video frames at a given time in seconds, or grab the first or last frame, right in the browser. Supports PNG/JPEG/WebP Blob, Canvas, and ImageBitmap output. Ships as ESM with TypeScript declarations and zero runtime dependencies. Local File/Blob inputs are never uploaded.

The current version is **0.1.0, a local draft that has not been published to npm**.

## Installation and local development

Place the library alongside your application, then install it from the application directory using its local path:

```sh
npm install ../video-frame-at
```

This example assumes the library directory is named `video-frame-at`. In this delivery, the directory is named `lib`, so use `npm install ../lib` instead. You can also import `./src/index.js` directly in a browser module without a build step or installing dependencies.

From the library directory, run:

```sh
npm test
npm run test:browser
npm run demo
```

Development commands require Node.js 22 or later. The `demo` command prints a URL bound to the local machine. Open it in your browser and select a video. Do not open the demo using `file://`.

## Three examples

These examples run in browser modules or frontend build tools that support ESM. Add an `<input type="file" accept="video/*">` to the page; once the user selects a file, access it through `input.files[0]`.

### Extract a frame at a specific time

```js
import { frameAt, firstFrame } from 'video-frame-at';

const input = document.querySelector('input[type="file"]');
input.addEventListener('change', async () => {
  const file = input.files[0];
  if (!file) return;
  try {
    const blob = await frameAt(file, 2.5, {
      format: 'image/jpeg',
      quality: 0.9,
    });
    const canvas = await firstFrame(file, { output: 'canvas' });
    document.body.append(canvas);
    console.log(blob.type, blob.size);
  } catch (error) {
    console.error(error);
  }
});
```

### Extract the last frame

```js
import { lastFrame } from 'video-frame-at';

const input = document.querySelector('input[type="file"]');
input.addEventListener('change', async () => {
  const file = input.files[0];
  if (!file) return;
  try {
    const bitmap = await lastFrame(file, { output: 'imageBitmap' });
    console.log(bitmap.width, bitmap.height);
    // Release the bitmap when finished; you can draw it to your own canvas first.
    bitmap.close();
  } catch (error) {
    console.error(error);
  }
});
```

### Extract frames at multiple times

```js
import { frameAt } from 'video-frame-at';

const input = document.querySelector('input[type="file"]');
input.addEventListener('change', async () => {
  const file = input.files[0];
  if (!file) return;
  const controller = new AbortController();
  try {
    const frames = [];
    for (const seconds of [0, 1.5, 3]) {
      frames.push(await frameAt(file, seconds, {
        format: 'image/webp',
        quality: 0.85,
        signal: controller.signal,
      }));
    }
    console.log(frames);
  } catch (error) {
    console.error(error);
  }
});
```

The batch example runs sequentially to keep decoder and memory usage under control. Each call creates and releases its own video element; there is currently no batch API that reuses a decoder. To cancel, call `controller.abort()` from your application.

## API

`frameAt(source, time, options?)`, `firstFrame(source, options?)`, and `lastFrame(source, options?)` all return a Promise.

- `source`: A File, Blob, URL instance, or nonempty URL string. Relative URLs are resolved against the current page URL.
- `time`: A finite number of seconds, or `'first'` / `'last'`. Negative values are clamped to 0; values beyond the duration are clamped to the last-frame time.
- `output`: `'blob'` (default), `'canvas'`, or `'imageBitmap'`.
- `format`: `'image/png'` (default), `'image/jpeg'`, or `'image/webp'`. Applies only to Blob output. If the browser does not support the requested encoding, the library throws an error rather than silently returning a different format.
- `quality`: A number from 0 to 1, defaulting to 0.92. Affects only lossy JPEG/WebP encoding; PNG ignores it. The value is validated for all output modes.
- `timeoutMs`: Timeout for the entire operation in milliseconds. Defaults to 15000; valid range: `(0, 2147483647]`.
- `signal`: An AbortSignal. Supports cancellation before or during the operation.
- `crossOrigin`: Defaults to `'anonymous'`; also accepts `'use-credentials'` or `null`. Remote video servers must return matching CORS permissions. Setting this to `null` disables CORS request mode but does not bypass canvas security restrictions.

The returned canvas preserves the video's original pixel dimensions. On completion, cancellation, or failure, the library releases the video, internal object URLs, event listeners, and timers. The caller owns the returned Canvas/Blob and should call `close()` on an ImageBitmap when finished.

Invalid arguments throw TypeError/RangeError; cancellation throws a DOMException with `name === 'AbortError'`. Possible `code` values for `FrameExtractionError` are:

| code | Meaning |
| --- | --- |
| `MEDIA` | The video could not be loaded or decoded, possibly because the server denied CORS access |
| `CORS` | The video tainted the canvas, preventing safe pixel access or export |
| `TIMEOUT` | Loading, decoding, seeking, or output encoding timed out |
| `DECODE` | The video has no usable frame dimensions |
| `ENCODE` | The browser failed to encode the image |
| `FORMAT_UNSUPPORTED` | The browser did not provide the requested image encoding |
| `UNSUPPORTED` | The browser document, 2D canvas, or bitmap API is unavailable |

When media fails to load, browsers generally cannot reliably distinguish network, CORS, and codec errors, so the `MEDIA` message suggests checking each of these causes.

## Browser support and precision

Designed for modern Chrome, Edge, Firefox, and Safari with HTMLVideoElement, Canvas `toBlob`, ESM, and Blob URL support. When available, `requestVideoFrameCallback` waits for a decoded frame; otherwise, the library uses `loadeddata` / `seeked`, then waits for `canplay` if needed and two animation frames before drawing. For the initial frame at zero seconds, it waits directly for the first decoded frame rather than relying on a repeated seek to zero to trigger a new presentation. ImageBitmap output also requires `createImageBitmap`. The core implementation does not require Node.js, but it cannot decode video in Node.js or a Worker.

Tested in headless Chromium 147, Google Chrome 156, Firefox 148, and WebKit 26.4 (Playwright builds), using the WebM/VP9 test fixture and MP4/H.264 (Main with AAC audio, and High) clips. Tests cover both the frame callback path and the `seeked` fallback with the frame callback method disabled.

Known testing limits:

- WebKit was tested through Playwright's Linux build, which only approximates Safari. Real Safari on macOS or iOS has not been tested.
- Mobile browsers and Microsoft Edge have not been tested.
- The `seeked` fallback (used only when `requestVideoFrameCallback` is unavailable) waits for animation frames. In a background tab, browsers pause animation frames, so the fallback rejects with `TIMEOUT` instead of returning a frame.

API references: [requestVideoFrameCallback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback), [seeked](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/seeked_event), and [canvas CORS restrictions](https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image).

The library seeks to the requested time using `currentTime` and returns the display frame selected by the browser at that time, without rounding to a fixed frame rate. Video frames occupy discrete intervals, and the browser, container index, time precision, and decoder can affect frame selection at boundaries. This is not a WebCodecs-based frame indexer and does not guarantee exact frame-number accuracy across all formats.

Seeking directly to `duration` cannot reliably retrieve the last frame: the endpoint lies outside the last frame's display interval, and some browsers may enter the ended state or provide no readable frame. The library uses `duration - min(0.001, duration / 2)` and ensures that the floating-point result is less than duration. For videos with a final frame displayed for less than 1 millisecond, edit lists, or gaps at the end of the container, this strategy cannot guarantee the last encoded sample.

## Limitations

- Requires a finite duration greater than zero. Live streams, infinite durations, and videos without valid metadata are not supported.
- Supports only containers and codecs available in the browser. Does not include a transcoder or bypass DRM.
- Local files are not uploaded. For URL inputs, the browser requests the video from its server. Remote servers should support byte-range requests for seeking to work properly.
- All output modes report an explicit error if the canvas is tainted. With the default anonymous CORS mode, videos without cross-origin permission may fail earlier with `MEDIA`.
- High-resolution video can use substantial memory; every call preserves the original resolution. Background tabs may throttle frame callbacks. Increase the timeout and bring the page to the foreground if needed.
- JPEG does not preserve transparency. Output color, HDR, rotation, and pixel aspect ratio depend on the browser's video rendering and canvas implementation.

## License

MIT. Copyright (c) 2026 teasoup90.

## Related

If you just need to grab frames without writing code, try [Video Frame Extractor](https://videoframeextract.com/) - it runs entirely in your browser.
