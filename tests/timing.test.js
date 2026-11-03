import test from 'node:test';
import assert from 'node:assert/strict';
import { clampTime, lastFrameTime, normalizeOptions, validateTime } from '../src/timing.js';
import { frameAt } from '../src/index.js';

test('keeps a timestamp inside the video', () => assert.equal(clampTime(1.25, 10), 1.25));
test('clamps negative seconds to zero', () => assert.equal(clampTime(-2, 10), 0));
test('clamps excessive seconds below the endpoint', () => assert.equal(clampTime(99, 10), 9.999));
test('duration itself selects the final display interval', () => assert.equal(clampTime(10, 10), 9.999));
test('first selects zero', () => assert.equal(clampTime('first', 10), 0));
test('last selects duration minus one millisecond', () => assert.equal(clampTime('last', 10), 9.999));
test('very short clips still have a nonnegative interior time', () => assert.equal(lastFrameTime(0.0004), 0.0002));
test('large durations still produce a representably smaller time', () => assert.ok(lastFrameTime(1e16) < 1e16));
for (const value of [0, -1, Infinity, NaN, '10']) {
  test(`rejects invalid duration ${String(value)}`, () => assert.throws(() => lastFrameTime(value), RangeError));
}
for (const [label, value] of [['NaN', NaN], ['infinity', Infinity], ['string', '2'], ['null', null], ['undefined', undefined]]) {
  test(`rejects invalid time ${label}`, () => assert.throws(() => validateTime(value), TypeError));
}
test('default options choose PNG blob', () => assert.deepEqual(normalizeOptions(), {
  output: 'blob', format: 'image/png', quality: 0.92, timeoutMs: 15000, crossOrigin: 'anonymous', signal: undefined,
}));
for (const format of ['image/png', 'image/jpeg', 'image/webp']) {
  test(`accepts ${format}`, () => assert.equal(normalizeOptions({ format }).format, format));
}
test('rejects unsupported format', () => assert.throws(() => normalizeOptions({ format: 'image/gif' }), TypeError));
test('quality includes both endpoints', () => {
  for (const quality of [0, 0.5, 1]) assert.equal(normalizeOptions({ quality }).quality, quality);
});
test('rejects invalid quality values', () => {
  for (const quality of [-0.1, 1.1, NaN, Infinity, '0.5', null]) {
    assert.throws(() => normalizeOptions({ quality }), RangeError);
  }
});
test('accepts canvas and bitmap outputs', () => {
  for (const output of ['canvas', 'imageBitmap']) assert.equal(normalizeOptions({ output }).output, output);
});
test('rejects unknown output', () => assert.throws(() => normalizeOptions({ output: 'buffer' }), TypeError));
test('rejects invalid timeouts', () => {
  for (const timeoutMs of [0, -1, Infinity, NaN, '100', 2147483648]) {
    assert.throws(() => normalizeOptions({ timeoutMs }), RangeError);
  }
});
test('accepts supported CORS modes', () => {
  for (const crossOrigin of [null, 'anonymous', 'use-credentials']) {
    assert.equal(normalizeOptions({ crossOrigin }).crossOrigin, crossOrigin);
  }
});
test('rejects unknown CORS modes', () => assert.throws(() => normalizeOptions({ crossOrigin: 'cors' }), TypeError));
test('rejects malformed options', () => {
  for (const options of [null, [], 42]) assert.throws(() => normalizeOptions(options), TypeError);
});
test('rejects malformed signals', () => assert.throws(() => normalizeOptions({ signal: {} }), TypeError));
test('accepts an actual abort signal', () => {
  const { signal } = new AbortController();
  assert.equal(normalizeOptions({ signal }).signal, signal);
});
test('validates sources before needing a DOM', async () => {
  for (const source of ['', ' ', null, 42, {}]) await assert.rejects(frameAt(source, 0), TypeError);
});
test('pre-aborted calls reject with AbortError', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(frameAt('clip.webm', 0, { signal: controller.signal }), { name: 'AbortError' });
});
test('Node can import the module but extraction needs a browser', async () => {
  await assert.rejects(frameAt('clip.webm', 0), { code: 'UNSUPPORTED' });
});
