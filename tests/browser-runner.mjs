import { spawn } from 'node:child_process';
import { access, mkdir, rm, readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer } from '../scripts/serve.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const candidates = [process.env.BROWSER_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
let executable;
for (const candidate of candidates) { try { await access(candidate); executable = candidate; break; } catch {} }
if (!executable) throw new Error('No existing Chrome/Edge found. Set BROWSER_PATH to an installed executable.');
const work = resolve(root, '.browser-work');
if (!work.startsWith(resolve(root) + sep)) throw new Error('Temporary directory must stay inside the library.');
await mkdir(resolve(work, 'temp'), { recursive: true });
const primary = await startServer();
const cross = await startServer();
let browser;
let socket;
try {
  browser = spawn(executable, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${resolve(work, 'profile')}`,
    `--crash-dumps-dir=${resolve(work, 'crashes')}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--disable-breakpad', '--disable-crash-reporter', '--disable-extensions',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true,
    env: { ...process.env, TEMP: resolve(work, 'temp'), TMP: resolve(work, 'temp') } });
  let launchError;
  browser.on('error', error => { launchError = error; });
  browser.stderr.resume();
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (launchError) throw launchError;
    try { port = Number((await readFile(resolve(work, 'profile/DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch {}
    if (browser.exitCode !== null) throw new Error(`Browser exited ${browser.exitCode}`);
    await delay(100);
  }
  if (!port) throw new Error('Browser debugging endpoint did not start.');
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const tab = tabs.find(item => item.type === 'page');
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id); pending.delete(message.id); clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const request = ++id;
    const timer = setTimeout(() => { pending.delete(request); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(request, { resolve, reject, timer }); socket.send(JSON.stringify({ id: request, method, params }));
  });
  await send('Page.navigate', { url: `${primary.origin}/tests/browser.html?cross=${encodeURIComponent(cross.origin)}` });
  let report;
  for (let attempt = 0; attempt < 160; attempt++) {
    const result = await send('Runtime.evaluate', { expression: 'globalThis.__results', returnByValue: true });
    if (result.result.value) { report = result.result.value; break; }
    await delay(500);
  }
  if (!report) throw new Error('Browser suite exceeded 80 seconds.');
  await send('Page.navigate', { url: `${primary.origin}/demo/index.html` });
  let demoReady = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    const result = await send('Runtime.evaluate', { expression: '!!document.querySelector("#file")', returnByValue: true });
    if (result.result.value) { demoReady = true; break; }
    await delay(100);
  }
  if (!demoReady) throw new Error('Demo page did not load.');
  const document = await send('DOM.getDocument');
  const input = await send('DOM.querySelector', { nodeId: document.root.nodeId, selector: '#file' });
  await send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [resolve(root, 'tests/fixtures/colors.webm')] });
  await send('Runtime.evaluate', { expression: 'document.querySelector("#seconds").value = "1.5"; document.querySelector("#form").requestSubmit();' });
  let demoPassed = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await send('Runtime.evaluate', { expression: `(() => {
      const image = document.querySelector('#preview');
      return !!image && !image.hidden && image.complete && image.naturalWidth === 32 &&
        !document.querySelector('#download').hidden && document.querySelector('#status').textContent.includes('image/png');
    })()`, returnByValue: true });
    if (result.result.value) { demoPassed = true; break; }
    await delay(100);
  }
  report.results.push({ name: 'demo selects a local file, extracts PNG, and offers a download', passed: demoPassed });
  report.passed += Number(demoPassed); report.failed += Number(!demoPassed);
  console.log(report.userAgent);
  for (const result of report.results) console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}${result.error ? `: ${result.error}` : ''}`);
  console.log(`Browser tests: ${report.passed} passed, ${report.failed} failed`);
  if (report.failed) process.exitCode = 1;
  await send('Browser.close');
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) {
    await Promise.race([new Promise(resolve => browser.once('exit', resolve)), delay(3000)]);
    if (browser.exitCode === null) { browser.kill(); await delay(1000); }
  }
  for (const { server } of [primary, cross]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await rm(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
