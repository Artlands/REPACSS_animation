// Frame-accurate capture of index.html via headless Chrome -> ffmpeg.
//   node render.mjs stills 1.5,30,62        -> build/stills/*.png
//   node render.mjs video [from] [to]       -> build/REPACSS_photons_to_tokens.mp4 (or a partial preview)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const FPS = 30, ROOT = path.dirname(new URL(import.meta.url).pathname);
const [mode = 'stills', a1, a2] = process.argv.slice(2);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav', '.jpg': 'image/jpeg' };

const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'],
});
const page = await browser.newPage();
page.on('console', m => m.type() === 'error' && console.error('[page]', m.text()));
page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto(`http://localhost:${port}/index.html`);
await page.waitForFunction('window.ready === true', { timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
const total = await page.evaluate('window.total');
const shot = (t, opts) => page.evaluate(t => window.renderAt(t), t).then(() => page.screenshot(opts));

if (mode === 'zcheck') {
  const tl = await page.evaluate('window.timeline');
  for (const sc of tl.scenes) {
    const ts = [.5, ...sc.sentences.map(x => x.start + 1.5), sc.dur - .6].map(x => sc.start + x);
    const all = new Map();
    for (const t of ts) for (const line of await page.evaluate(t => window.zcheckAt(t), t)) all.set(line.replace(/^\d+× /, '').replace(/ @.*/, ''), line + `  t=${t.toFixed(1)}`);
    console.log(`== ${sc.id}: ${all.size} overlapping face groups`); for (const l of all.values()) console.log('  ' + l);
  }
} else if (mode === 'stills') {
  fs.mkdirSync(path.join(ROOT, 'build/stills'), { recursive: true });
  for (const t of (a1 || '1').split(',').map(Number)) {
    const out = path.join(ROOT, `build/stills/t${t.toFixed(1).padStart(6, '0')}.png`);
    await shot(t, { path: out }); console.log(out);
  }
} else {
  const from = +(a1 ?? 0), to = +(a2 ?? total), partial = a1 !== undefined;
  const out = path.join(ROOT, partial ? `build/preview_${from}-${to}.mp4` : 'build/REPACSS_photons_to_tokens_nomusic.mp4');
  const args = ['-y', '-f', 'image2pipe', '-framerate', FPS, '-c:v', 'mjpeg', '-i', '-',
    '-ss', from, '-t', to - from, '-i', 'build/narration.wav'];
  if (!partial) args.push('-i', 'build/captions.srt', '-map', '0:v', '-map', '1:a', '-map', '2:s', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng');
  args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out);
  const ff = spawn('ffmpeg', args.map(String), { cwd: ROOT, stdio: ['pipe', 'ignore', 'inherit'] });
  const n = Math.round((to - from) * FPS), t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const buf = await shot(from + i / FPS, { type: 'jpeg', quality: 95, optimizeForSpeed: true });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`frame ${i}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); console.log(out);
}
await browser.close(); server.close();
