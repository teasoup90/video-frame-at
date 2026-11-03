import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webm': 'video/webm' };
export async function startServer() {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/stall') return;
      let path = decodeURIComponent(url.pathname);
      if (path === '/fixture-cors.webm') {
        response.setHeader('Access-Control-Allow-Origin', '*');
        path = '/tests/fixtures/colors.webm';
      }
      if (path === '/fixture-no-cors.webm') path = '/tests/fixtures/colors.webm';
      const file = resolve(root, `.${path === '/' ? '/demo/index.html' : path}`);
      if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) {
        response.writeHead(403).end(); return;
      }
      const data = await readFile(file);
      const headers = { 'Content-Type': types[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
      const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      if (range) {
        const start = Number(range[1]);
        const end = range[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
        if (start > end || start >= data.length) {
          response.writeHead(416, { 'Content-Range': `bytes */${data.length}` }).end(); return;
        }
        response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': end - start + 1 });
        response.end(data.subarray(start, end + 1));
      } else {
        response.writeHead(200, { ...headers, 'Content-Length': data.length });
        response.end(data);
      }
    } catch {
      response.writeHead(404).end('File not found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { origin } = await startServer();
  console.log(`Demo: ${origin}/demo/index.html`);
}
