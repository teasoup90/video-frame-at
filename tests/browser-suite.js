import { frameAt, firstFrame, lastFrame } from '../src/index.js';

const results = [];
function assert(condition, message) { if (!condition) throw new Error(message); }
async function check(name, action) {
  try { await action(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: `${error.name}: ${error.message}` }); }
}
async function rejects(action, expected) {
  let error;
  try { await action(); } catch (caught) { error = caught; }
  assert(error && (error.code === expected || error.name === expected), `Expected ${expected}; got ${error?.code ?? error?.name ?? 'success'}`);
}
function color(canvas, channel) {
  const pixel = canvas.getContext('2d').getImageData(16, 16, 1, 1).data;
  assert(pixel[channel] > 100 && pixel[channel] > pixel[(channel + 1) % 3] + 70 &&
    pixel[channel] > pixel[(channel + 2) % 3] + 70, `Unexpected pixel ${[...pixel]}`);
}
const source = '/tests/fixtures/colors.webm';
const canvasOptions = { output: 'canvas', timeoutMs: 5000 };
const cross = new URL(location.href).searchParams.get('cross');
await check('requestVideoFrameCallback is exercised', async () => {
  const original = HTMLVideoElement.prototype.requestVideoFrameCallback;
  assert(typeof original === 'function', 'This browser does not support video frame callbacks');
  let calls = 0;
  HTMLVideoElement.prototype.requestVideoFrameCallback = function (callback) { calls++; return original.call(this, callback); };
  try { color(await frameAt(source, 1.5, canvasOptions), 1); assert(calls > 0, 'Callback not requested'); }
  finally { HTMLVideoElement.prototype.requestVideoFrameCallback = original; }
});
await check('first frame is red', async () => color(await firstFrame(source, canvasOptions), 0));
await check('last frame is blue', async () => color(await lastFrame(source, canvasOptions), 2));
await check('negative timestamp clamps to red', async () => color(await frameAt(source, -20, canvasOptions), 0));
await check('excessive timestamp clamps to blue', async () => color(await frameAt(source, 200, canvasOptions), 2));
await check('timestamps around frame boundaries select the expected display frame', async () => {
  for (const [time, channel] of [[0.999, 0], [1.001, 1], [1.999, 1], [2.001, 2]]) {
    color(await frameAt(source, time, canvasOptions), channel);
  }
});
await check('seeked fallback decodes first, middle, and last', async () => {
  const original = HTMLVideoElement.prototype.requestVideoFrameCallback;
  HTMLVideoElement.prototype.requestVideoFrameCallback = undefined;
  try {
    color(await firstFrame(source, canvasOptions), 0);
    color(await frameAt(source, 1.5, canvasOptions), 1);
    color(await lastFrame(source, canvasOptions), 2);
  } finally { HTMLVideoElement.prototype.requestVideoFrameCallback = original; }
});
for (const format of ['image/png', 'image/jpeg', 'image/webp']) {
  await check(`${format} returns a decoded 32 by 32 image`, async () => {
    const blob = await frameAt(source, 1.5, { format, quality: 0.8 });
    assert(blob instanceof Blob && blob.type === format && blob.size > 0, 'Invalid encoded blob');
    const bitmap = await createImageBitmap(blob);
    assert(bitmap.width === 32 && bitmap.height === 32, 'Invalid dimensions');
    bitmap.close();
  });
}
await check('ImageBitmap output has expected pixels', async () => {
  const bitmap = await frameAt(source, 2.5, { output: 'imageBitmap' });
  try {
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
    canvas.getContext('2d').drawImage(bitmap, 0, 0); color(canvas, 2);
  } finally { bitmap.close(); }
});
await check('File input is decoded and object URL revoked', async () => {
  const bytes = await (await fetch(source)).blob();
  const revoke = URL.revokeObjectURL;
  let revoked = 0;
  URL.revokeObjectURL = function (url) { revoked++; return revoke.call(this, url); };
  try {
    color(await frameAt(new File([bytes], 'colors.webm', { type: 'video/webm' }), 1.5, canvasOptions), 1);
    assert(revoked === 1, 'Object URL was not revoked');
  } finally { URL.revokeObjectURL = revoke; }
});
await check('batch timestamps preserve red green blue order', async () => {
  for (const [channel, time] of [0.5, 1.5, 2.5].entries()) color(await frameAt(source, time, canvasOptions), channel);
});
await check('pre-aborted signal rejects', () => {
  const controller = new AbortController(); controller.abort();
  return rejects(() => frameAt(source, 0, { signal: controller.signal }), 'AbortError');
});
await check('abort during metadata wait rejects', async () => {
  const controller = new AbortController();
  const pending = frameAt('/stall', 0, { signal: controller.signal, timeoutMs: 3000 });
  setTimeout(() => controller.abort(), 30);
  await rejects(() => pending, 'AbortError');
});
await check('stalled metadata reaches timeout', () => rejects(() => frameAt('/stall', 0, { timeoutMs: 50 }), 'TIMEOUT'));
await check('missing frame callbacks time out after metadata', async () => {
  const original = HTMLVideoElement.prototype.requestVideoFrameCallback;
  HTMLVideoElement.prototype.requestVideoFrameCallback = () => 0;
  try { await rejects(() => frameAt(source, 1.5, { timeoutMs: 100 }), 'TIMEOUT'); }
  finally { HTMLVideoElement.prototype.requestVideoFrameCallback = original; }
});
await check('abort while awaiting a decoded frame cancels its callback', async () => {
  const request = HTMLVideoElement.prototype.requestVideoFrameCallback;
  const cancel = HTMLVideoElement.prototype.cancelVideoFrameCallback;
  const controller = new AbortController();
  let cancelled = false;
  HTMLVideoElement.prototype.requestVideoFrameCallback = () => { setTimeout(() => controller.abort(), 20); return 123; };
  HTMLVideoElement.prototype.cancelVideoFrameCallback = id => { cancelled = id === 123; };
  try {
    await rejects(() => frameAt(source, 1.5, { signal: controller.signal }), 'AbortError');
    assert(cancelled, 'Outstanding callback was not cancelled');
  } finally {
    HTMLVideoElement.prototype.requestVideoFrameCallback = request;
    HTMLVideoElement.prototype.cancelVideoFrameCallback = cancel;
  }
});
await check('invalid media returns MEDIA', () => rejects(() => frameAt('/missing.webm', 0), 'MEDIA'));
await check('cross-origin CORS-enabled video succeeds', async () => color(await frameAt(`${cross}/fixture-cors.webm`, 1.5, canvasOptions), 1));
await check('default CORS rejects a server without permission', () => rejects(() => frameAt(`${cross}/fixture-no-cors.webm`, 0), 'MEDIA'));
await check('tainted canvas has explicit CORS error for every output', async () => {
  for (const output of ['canvas', 'blob', 'imageBitmap']) {
    await rejects(() => frameAt(`${cross}/fixture-no-cors.webm`, 0, { crossOrigin: null, output }), 'CORS');
  }
});
await check('concurrent calls own independent video elements', async () => {
  const canvases = await Promise.all([0.5, 1.5, 2.5].map(time => frameAt(source, time, canvasOptions)));
  canvases.forEach((canvas, channel) => color(canvas, channel));
});
globalThis.__results = { userAgent: navigator.userAgent, results, passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length };
document.querySelector('#results').textContent = JSON.stringify(globalThis.__results, null, 2);
