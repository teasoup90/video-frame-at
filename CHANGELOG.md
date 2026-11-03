# Changelog

## 0.1.0 - 2026-11-03

Initial release.

- Extract a frame by time, or the first or last frame, from a File, Blob, or URL in the browser.
- Output as PNG, JPEG, or WebP Blob, HTMLCanvasElement, or ImageBitmap.
- Timeouts, AbortSignal support, and explicit `MEDIA`, `CORS`, `TIMEOUT`, `DECODE`, `ENCODE`, `FORMAT_UNSUPPORTED`, and `UNSUPPORTED` errors.
- The `seeked` fallback waits for a paintable frame before drawing, fixing intermittent blank or stale frames in Chromium when `requestVideoFrameCallback` is unavailable. In a background tab this fallback rejects with `TIMEOUT`.
- Tested in Chromium, Chrome, Firefox, and WebKit (Playwright), including MP4/H.264. Real Safari, mobile browsers, and Edge are not yet tested.
