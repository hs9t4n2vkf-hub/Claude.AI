#!/usr/bin/env node
/*
 * Vertical 3D reel renderer.
 *
 *   node render.js sheet  reels/<name>                    labeled contact sheet  -> build/<name>/sheet.png
 *   node render.js stills reels/<name> 2 8 14             full-res PNGs          -> build/<name>/still-<t>s.png
 *   node render.js reels/<name> --draft --from 20 --to 26 small fast draft       -> build/<name>-draft.mp4
 *   node render.js reels/<name>                           final video            -> build/<name>.mp4
 *
 * Options:  --from <s> --to <s>   time range (video modes)
 *           --duration <s>        override the scene's duration
 *           --fps <n>             frame rate (default 30, draft 15)
 *           --workers <n>         parallel browser tabs (scene must be a pure function of t)
 *           --count <n>           number of frames on the contact sheet (default 12)
 *
 * A reel is reels/<name>/scene.js, an ES module that either exports
 * `renderFrame(t)` or assigns `window.renderFrame`. It may export `duration`
 * (seconds, default 10) and `ready` (a promise to await before the first frame).
 * `import * as THREE from 'three'` and `'three/addons/...'` work out of the box.
 * If reels/<name>/audio.(mp3|wav|m4a|aac) exists it is muxed into the video (else voiceover.wav, if present).
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');

const ROOT = __dirname;
const FULL = { width: 1080, height: 1920 };
const DRAFT = { width: 540, height: 960 };

// ---------- args ----------
function parseArgs(argv) {
  const opts = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--draft') opts.draft = true;
    else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
    else opts.positional.push(a);
  }
  return opts;
}

function usage(msg) {
  if (msg) console.error('Error: ' + msg + '\n');
  console.error(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 20).map(l => l.replace(/^ \*? ?/, '')).join('\n'));
  process.exit(1);
}

// ---------- chrome ----------
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) throw new Error('Google Chrome not found. Install it or set CHROME_PATH.');
  return found;
}

// ---------- static server ----------
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
  '.hdr': 'application/octet-stream', '.ktx2': 'image/ktx2', '.wasm': 'application/wasm',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.css': 'text/css',
};

function harnessHtml(sceneUrl, cfg) {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;overflow:hidden;background:#000}canvas{display:block}</style>
<script type="importmap">
{ "imports": {
  "three": "/node_modules/three/build/three.module.js",
  "three/addons/": "/node_modules/three/examples/jsm/"
} }
</script>
<script>window.REEL = ${JSON.stringify(cfg)};</script>
</head><body>
<script type="module">
  try {
    const mod = await import(${JSON.stringify(sceneUrl)});
    if (mod.ready) await mod.ready;
    if (typeof mod.renderFrame === 'function') window.renderFrame = mod.renderFrame;
    if (typeof window.renderFrame !== 'function') throw new Error('scene.js must export renderFrame(t) or set window.renderFrame');
    window.__duration = typeof mod.duration === 'number' ? mod.duration : (window.REEL_DURATION ?? null);
    window.__ready = true;
  } catch (e) {
    window.__error = String(e && e.stack || e);
  }
</script>
</body></html>`;
}

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (url.pathname === '/__reel') {
      const cfg = JSON.parse(url.searchParams.get('cfg'));
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      return res.end(harnessHtml(url.searchParams.get('scene'), cfg));
    }
    const file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': st.size, 'Cache-Control': 'no-store',
      });
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// ---------- browser / pages ----------
async function launch() {
  return puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: [
      '--no-sandbox', '--hide-scrollbars', '--mute-audio',
      '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      ...(process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(' ') : []),
    ],
  });
}

async function openReel(browser, port, reelDir, size, extra = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', m => { const t = m.text(); logs.push(t); if (/GL Driver Message|GPU stall/.test(t)) return; if (m.type() === 'error' || m.type() === 'warn') console.error('[scene] ' + t); });
  page.on('pageerror', e => console.error('[scene error] ' + e.message));
  const sceneUrl = '/' + path.relative(ROOT, path.join(reelDir, 'scene.js')).split(path.sep).join('/');
  const cfg = { width: size.width, height: size.height, ...extra };
  await page.goto(`http://127.0.0.1:${port}/__reel?scene=${encodeURIComponent(sceneUrl)}&cfg=${encodeURIComponent(JSON.stringify(cfg))}`);
  await page.waitForFunction('window.__ready || window.__error', { timeout: 60000 });
  const err = await page.evaluate('window.__error');
  if (err) throw new Error('Scene failed to load:\n' + err);
  const duration = await page.evaluate('window.__duration');
  return { page, duration };
}

async function grab(page, t) {
  await page.evaluate(async t => { await window.renderFrame(t); }, t);
  // wait one animation frame so the WebGL canvas has been composited
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));
  return page.screenshot({ type: 'png', optimizeForSpeed: true, captureBeyondViewport: false });
}

// ---------- ffmpeg ----------
function findAudio(reelDir) {
  for (const ext of ['mp3', 'wav', 'm4a', 'aac']) {
    const p = path.join(reelDir, 'audio.' + ext);
    if (fs.existsSync(p)) return p;
  }
  const vo = path.join(reelDir, 'voiceover.wav'); // from bucket-shared/tts.py, used until a mixed audio.* exists
  return fs.existsSync(vo) ? vo : null;
}

function startFfmpeg(out, fps, draft, audio, from, len) {
  const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(fps), '-i', '-'];
  if (audio) args.push('-ss', String(from), '-t', String(len), '-i', audio);
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(fps));
  if (draft) args.push('-preset', 'ultrafast', '-crf', '28');
  else args.push('-preset', 'slow', '-crf', '16', '-profile:v', 'high');
  if (audio) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
  args.push('-movflags', '+faststart', out);
  const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exited with ' + c))));
  ff.on('error', e => { throw new Error('Could not start ffmpeg: ' + e.message); });
  return { ff, done };
}

function writeFrame(ff, buf) {
  return new Promise((res, rej) => ff.stdin.write(buf, e => e ? rej(e) : res()));
}

// ---------- modes ----------
function fmtTime(t) { return (Math.round(t * 100) / 100).toString(); }

async function renderVideo(ctx, opts) {
  const { browser, port, reelDir, name } = ctx;
  const draft = !!opts.draft;
  const size = draft ? DRAFT : FULL;
  const fps = Number(opts.fps) || (draft ? 15 : 30);
  const workers = Math.max(1, Number(opts.workers) || 1);

  // Each worker gets its own browser: background tabs don't fire requestAnimationFrame.
  const extraBrowsers = await Promise.all(Array.from({ length: workers - 1 }, launch));
  ctx.cleanup.push(...extraBrowsers.map(b => () => b.close()));
  const pages = await Promise.all([browser, ...extraBrowsers].map(b => openReel(b, port, reelDir, size, { fps, draft })));
  const duration = Number(opts.duration) || pages[0].duration || 10;
  const from = Math.max(0, Number(opts.from) || 0);
  const to = Math.min(duration, opts.to != null ? Number(opts.to) : duration);
  if (!(to > from)) usage(`empty time range ${from}..${to} (scene duration ${duration}s)`);
  const frames = Math.round((to - from) * fps);

  fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
  const partial = opts.from != null || opts.to != null;
  const suffix = (draft ? '-draft' : '') + (partial ? `-${fmtTime(from)}-${fmtTime(to)}` : '');
  const out = path.join(ROOT, 'build', `${name}${suffix}.mp4`);
  const audio = findAudio(reelDir);
  const { ff, done } = startFfmpeg(out, fps, draft, audio, from, to - from);

  console.log(`Rendering ${name}: ${fmtTime(from)}s -> ${fmtTime(to)}s, ${frames} frames @ ${fps}fps, ${size.width}x${size.height}${draft ? ' (draft)' : ''}${workers > 1 ? `, ${workers} workers` : ''}`);
  const start = Date.now();
  // Workers render frames in parallel; frames are written to ffmpeg strictly in order.
  const pending = new Map();
  let next = 0, written = 0;
  let flushing = Promise.resolve();
  const flush = () => (flushing = flushing.then(async () => {
    while (pending.has(written)) {
      const buf = pending.get(written); pending.delete(written);
      await writeFrame(ff, buf);
      written++;
      if (process.stdout.isTTY) {
        const el = (Date.now() - start) / 1000;
        process.stdout.write(`\r  frame ${written}/${frames}  ${(written / el).toFixed(1)} fps  ETA ${Math.round((frames - written) / (written / el))}s   `);
      }
    }
  }));
  await Promise.all(pages.map(async ({ page }) => {
    while (true) {
      const i = next++;
      if (i >= frames) return;
      // keep memory bounded: wait (without busy-looping) until the writer catches up
      while (i - written > workers * 4) await new Promise(r => setTimeout(r, 5));
      pending.set(i, await grab(page, from + i / fps));
      flush();
    }
  }));
  await flush();
  ff.stdin.end();
  await done;
  if (process.stdout.isTTY) process.stdout.write('\n');
  console.log(`Done in ${((Date.now() - start) / 1000).toFixed(1)}s -> ${path.relative(process.cwd(), out)}`);
  return out;
}

async function renderStills(ctx, opts, times) {
  const { browser, port, reelDir, name } = ctx;
  if (!times.length) usage('stills needs at least one time, e.g. node render.js stills reels/foo 2 8 14');
  const { page } = await openReel(browser, port, reelDir, FULL, { fps: 30, draft: false });
  const dir = path.join(ROOT, 'build', name);
  fs.mkdirSync(dir, { recursive: true });
  for (const t of times.map(Number)) {
    const out = path.join(dir, `still-${fmtTime(t)}s.png`);
    fs.writeFileSync(out, await grab(page, t));
    console.log(path.relative(process.cwd(), out));
  }
}

async function renderSheet(ctx, opts) {
  const { browser, port, reelDir, name } = ctx;
  const { page, duration: d } = await openReel(browser, port, reelDir, DRAFT, { fps: 30, draft: true });
  const duration = Number(opts.duration) || d || 10;
  const count = Number(opts.count) || 12;
  const cols = count <= 4 ? count : count <= 9 ? 3 : count <= 16 ? 4 : 6;
  const shots = [];
  for (let i = 0; i < count; i++) {
    // evenly spaced, centred in each slot so we never land exactly on the last frame
    const t = Math.round(((i + 0.5) / count) * duration * 30) / 30;
    shots.push({ t, src: 'data:image/png;base64,' + (await grab(page, t)).toString('base64') });
  }
  const cellW = 270, cellH = 480;
  const sheet = await browser.newPage();
  const rows = Math.ceil(count / cols);
  await sheet.setViewport({ width: cols * (cellW + 12) + 12, height: rows * (cellH + 40) + 64, deviceScaleFactor: 2 });
  await sheet.setContent(`<!doctype html><html><body style="margin:0;background:#16161a;font:600 15px system-ui,sans-serif;color:#eee">
    <div style="padding:14px 12px 4px;font-size:18px">${name} &middot; ${duration}s &middot; ${count} frames</div>
    <div style="display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:12px;padding:12px">
    ${shots.map((s, i) => `<div><img src="${s.src}" style="width:${cellW}px;height:${cellH}px;display:block;border-radius:6px">
      <div style="padding:5px 2px;color:#aaa">#${i + 1} &nbsp; <span style="color:#fff">${s.t.toFixed(2)}s</span></div></div>`).join('')}
    </div></body></html>`);
  await sheet.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
  const dir = path.join(ROOT, 'build', name);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'sheet.png');
  await sheet.screenshot({ path: out, fullPage: true });
  console.log(path.relative(process.cwd(), out));
}

// ---------- main ----------
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let mode = 'video';
  const pos = [...opts.positional];
  if (pos[0] === 'sheet' || pos[0] === 'stills') mode = pos.shift();
  const reelArg = pos.shift();
  if (!reelArg) usage();
  const reelDir = path.resolve(reelArg);
  if (!fs.existsSync(path.join(reelDir, 'scene.js'))) usage(`no scene.js in ${reelArg}`);
  if (!reelDir.startsWith(ROOT)) usage('reel must live inside this project folder');
  const name = path.basename(reelDir);

  const server = await startServer();
  const browser = await launch();
  const ctx = { browser, port: server.address().port, reelDir, name, cleanup: [] };
  try {
    if (mode === 'sheet') await renderSheet(ctx, opts);
    else if (mode === 'stills') await renderStills(ctx, opts, pos);
    else await renderVideo(ctx, opts);
  } finally {
    await Promise.all(ctx.cleanup.map(f => f()));
    await browser.close();
    server.close();
  }
}

main().catch(e => { console.error(e.stack || e); process.exit(1); });
