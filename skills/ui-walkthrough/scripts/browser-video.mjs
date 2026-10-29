#!/usr/bin/env node
/**
 * Browser page video for /ui-walkthrough.
 *
 * Scope: the browser page only. This script never captures the desktop, never captures a
 * window outside the browser, and never requests an audio track or a microphone. It has no
 * display-media or screen-share path. Every encode runs on a canvas fed by a decoded video
 * element.
 *
 * Modes:
 *   route      print the video driver for this host, with the reason
 *   probe      print the MediaRecorder MIME support of the resolved Chromium (exit 1: no MP4)
 *   transcode  decode a recorded WebM in the browser, re-encode it as H.264 MP4
 *   validate   play one media file to its end and measure size, duration, motion, black frames
 *   smoke      record a synthetic local page, transcode it, validate both files
 *
 * The input file is never deleted, never renamed, and never overwritten. Every output path is
 * reserved exclusively before it is written, so an existing file is never replaced, and the
 * smoke claims a new directory atomically. A complete but rejected MP4 is kept for diagnosis.
 * The local server serves only files registered under an alias, never by their names. Renaming a
 * WebM does not convert it, so every produced MP4 is checked for an ftyp signature and an
 * H.264 sample entry.
 *
 * Every mode prints one JSON object on stdout, including `{ok: false, reason}` when a run fails.
 * A failed gate or run exits 1 and keeps the source. An unknown mode exits 2.
 *
 * Contract and reporting rules: ../browser-video.md
 */

import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';

/* ------------------------------------------------------------------ constants */

export const MP4_CANDIDATES = [
  'video/mp4;codecs=avc1.42001E',
  'video/mp4;codecs="avc1.42001E"',
  'video/mp4;codecs=avc1.4D401F',
  'video/mp4',
];

export const WEBM_CANDIDATES = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'];

/** Thresholds every validated recording must pass. Each one has a named failure reason. */
export const DEFAULT_GATES = {
  minDurationSeconds: 3,
  maxDurationSeconds: 3600,
  minAdvanceFraction: 0.6,
  minNonblackFraction: 0.5,
  minFrameLuminance: 2,
  minMovingFramePairFraction: 0.5,
  maxBlackFrames: 0,
};

const SMOKE_VIEWPORT = { width: 1280, height: 720 };
const SMOKE_CAPTURE_MS = 9000;
const SMOKE_CLICK_OFFSETS_MS = [2200, 4700, 7000];

const MIME_BY_EXTENSION = {
  '.html': 'text/html; charset=utf-8',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
};

const HARNESS_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><title>ui-walkthrough media harness</title>
<style>html,body{margin:0;height:100%;background:#101427;color:#eef3ff;
font-family:system-ui,sans-serif}p{padding:16px;font-size:18px}</style></head>
<body><p id="status">Media harness page. No external resources.</p></body></html>`;

/**
 * Synthetic page for the capability smoke. It animates continuously so frame-to-frame
 * change is real, it prints large text so a reader can judge legibility, and it counts
 * clicks in the DOM so an interaction can be proved outside the video.
 */
const SMOKE_PAGE_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><title>ui-walkthrough capability smoke</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;background:#17203c;color:#f4f7ff;
  font-family:system-ui,-apple-system,sans-serif}
canvas{position:absolute;inset:0;width:100%;height:100%}
#panel{position:absolute;left:48px;top:48px;padding:24px 30px;border-radius:14px;
  background:rgba(10,16,38,.74)}
h1{margin:0 0 14px;font-size:30px;letter-spacing:.2px}
#counter{font-size:72px;font-weight:700;line-height:1;margin:10px 0 16px}
button{font:700 20px system-ui,sans-serif;padding:13px 22px;border:0;border-radius:9px;
  background:#7eb3ff;color:#06102a;cursor:pointer}
</style></head>
<body>
<canvas id="stage"></canvas>
<div id="panel">
  <h1>ui-walkthrough capability smoke</h1>
  <div>palette: <span id="palette">Ember</span></div>
  <div id="counter">0</div>
  <button id="palette-button">Change the palette</button>
</div>
<script>
(function () {
  var palettes = [
    { name: 'Ember', base: '#2a1a16', band: '#ff8a4c', ink: '#ffd9a8' },
    { name: 'Lagoon', base: '#13282c', band: '#39d0bd', ink: '#bdf6ee' },
    { name: 'Violet', base: '#201a38', band: '#9b7bff', ink: '#e3d7ff' }
  ];
  var index = 0;
  var canvas = document.getElementById('stage');
  var ctx = canvas.getContext('2d', { alpha: false });
  var counter = document.getElementById('counter');
  var paletteLabel = document.getElementById('palette');
  var startedAt = performance.now();
  var frames = 0;

  function size() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  size();
  window.addEventListener('resize', size);

  document.getElementById('palette-button').addEventListener('click', function () {
    index = (index + 1) % palettes.length;
    window.__capture.clicks += 1;
    window.__capture.paletteName = palettes[index].name;
    counter.textContent = String(window.__capture.clicks);
    paletteLabel.textContent = palettes[index].name;
  });

  function draw(now) {
    var seconds = (now - startedAt) / 1000;
    var palette = palettes[index];
    var width = canvas.width;
    var height = canvas.height;
    ctx.fillStyle = palette.base;
    ctx.fillRect(0, 0, width, height);
    for (var i = 0; i < 5; i += 1) {
      var offset = ((seconds * 150 + i * 260) % (width + 440)) - 220;
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = palette.band;
      ctx.beginPath();
      ctx.moveTo(offset, height);
      ctx.lineTo(offset + 150, height);
      ctx.lineTo(offset + 330, 0);
      ctx.lineTo(offset + 180, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = palette.ink;
    ctx.font = '700 86px system-ui, sans-serif';
    ctx.fillText(seconds.toFixed(1) + ' s', width - 360, height - 72);
    frames += 1;
    window.__capture.frames = frames;
    window.__capture.elapsedSeconds = Number(seconds.toFixed(3));
    requestAnimationFrame(draw);
  }

  window.__capture = {
    ready: true,
    clicks: 0,
    paletteName: palettes[0].name,
    frames: 0,
    elapsedSeconds: 0
  };
  requestAnimationFrame(draw);
})();
</script>
</body></html>`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* -------------------------------------------------------------- pure functions */

/**
 * Pick the video driver for a host. The deep probe belongs to each driver's own file:
 * OpenCap login, quota, and the live-session lock are opencap.md's, and MediaRecorder
 * support is the `probe` mode's. This decides which of the two to read, and nothing else.
 */
export function selectDriver({ platform, hasOpencap, noVideo }) {
  if (noVideo) return { driver: 'none', reason: '--no-video was passed' };
  if (platform === 'darwin') {
    if (hasOpencap) {
      return { driver: 'opencap', reason: 'macOS with the opencap binary on PATH' };
    }
    return { driver: 'none', reason: 'macOS without the opencap binary on PATH' };
  }
  if (platform === 'win32') {
    return { driver: 'browser', reason: 'Windows records the browser page through Playwright' };
  }
  return { driver: 'none', reason: `no recording driver for platform ${platform}` };
}

/** First supported MP4 type, or null. A null result is an unsupported-codec outcome. */
export function chooseMp4Mime(supported, candidates = MP4_CANDIDATES) {
  if (!Array.isArray(supported)) return null;
  for (const candidate of candidates) {
    if (supported.includes(candidate)) return candidate;
  }
  return null;
}

/** Read a container signature from the first bytes of a file. */
export function classifyContainer(head) {
  const bytes = Buffer.isBuffer(head) ? head : Buffer.from(head ?? []);
  const ftypBox = bytes.subarray(4, 8).toString('latin1');
  return {
    headHex: bytes.subarray(0, 16).toString('hex'),
    ftypBox,
    majorBrand: bytes.subarray(8, 12).toString('latin1'),
    isMp4: ftypBox === 'ftyp',
    isMatroskaOrWebm:
      bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3,
  };
}

/**
 * Name the video codec of an MP4 from its sample entry and configuration box. An `avc1` or
 * `avc3` entry without its `avcC` box is not proof of H.264, so it reports null.
 */
export function detectVideoCodec(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  const has = (fourcc) => buffer.includes(Buffer.from(fourcc, 'latin1'));
  if (has('avcC') && (has('avc1') || has('avc3'))) return 'h264';
  if (has('hvcC') && (has('hvc1') || has('hev1'))) return 'hevc';
  if (has('vpcC') && has('vp09')) return 'vp9';
  if (has('av1C') && has('av01')) return 'av1';
  return null;
}

/** Judge one encode: it must reach the end of its source and produce an H.264 MP4. */
export function judgeTranscode(result, output) {
  if (!result || !result.ok) {
    return { pass: false, reasons: [result?.reason ?? 'the encode did not run'] };
  }
  const reasons = [];
  if (!result.sourceReachedEnd) {
    reasons.push(
      `the encode stopped at ${result.sourceEndTime} seconds, before the source ended at ${result.sourceDuration} seconds`,
    );
  }
  if (!output?.isMp4) {
    reasons.push(`encoder output had no MP4 ftyp signature (head ${output?.headHex})`);
  } else if (output.videoCodec !== 'h264') {
    reasons.push(`encoder output carried ${output.videoCodec ?? 'unrecognized'} video, not H.264`);
  }
  return { pass: reasons.length === 0, reasons };
}

/**
 * Create a file that must not exist yet. An existing path fails with EEXIST, so no earlier
 * recording, frame, or report is ever replaced.
 */
export async function reserveOutput(filePath) {
  try {
    return await fs.open(filePath, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(
        `refusing to overwrite ${filePath}: every output is reserved exclusively, so pass a new path`,
      );
    }
    throw error;
  }
}

/**
 * Create a directory that must not exist yet. The final `mkdir` is not recursive, so it is
 * atomic: of two runs that name the same directory, exactly one wins and the other fails.
 */
export async function claimNewDirectory(dirPath) {
  await fs.mkdir(path.dirname(dirPath), { recursive: true });
  try {
    await fs.mkdir(dirPath);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(
        `refusing to reuse ${dirPath}: every run claims a new directory, so pass a new path`,
      );
    }
    throw error;
  }
  return dirPath;
}

export async function writeExclusive(filePath, bytes) {
  const handle = await reserveOutput(filePath);
  try {
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
  return filePath;
}

/**
 * Judge a playback measurement. Returns every failed gate, so one call names every defect.
 * `expect` carries the recorded width and height plus any gate override.
 */
export function judgeValidation(validation, expect = {}) {
  const gates = { ...DEFAULT_GATES, ...expect };
  const reasons = [];
  if (!validation) return { pass: false, reasons: ['validation did not run'] };
  if (validation.error) return { pass: false, reasons: [validation.error] };

  if (typeof gates.width === 'number' && typeof gates.height === 'number') {
    if (validation.videoWidth !== gates.width || validation.videoHeight !== gates.height) {
      reasons.push(
        `dimensions were ${validation.videoWidth}x${validation.videoHeight}, expected ${gates.width}x${gates.height}`,
      );
    }
  }

  const duration = validation.durationSeconds;
  const durationOk =
    typeof duration === 'number' &&
    duration >= gates.minDurationSeconds &&
    duration <= gates.maxDurationSeconds;
  if (!durationOk) {
    reasons.push(
      `duration was ${String(duration)} seconds, expected ${gates.minDurationSeconds} to ${gates.maxDurationSeconds}`,
    );
  }

  if (typeof gates.expectedDurationSeconds === 'number') {
    const tolerance = gates.durationToleranceSeconds ?? 1;
    if (!(Math.abs(duration - gates.expectedDurationSeconds) <= tolerance)) {
      reasons.push(
        `duration was ${String(duration)} seconds, expected ${gates.expectedDurationSeconds} within ${tolerance}`,
      );
    }
  }

  const playback = validation.playback ?? {};
  const frames = validation.frames ?? {};
  // A playback that stopped at --max-ms can still advance 60% of the clip, so the end itself
  // is a gate.
  if (playback.reachedEnd !== true) {
    reasons.push(`playback did not reach the end (stopped at ${playback.endCurrentTime} seconds)`);
  }
  const advanceFloor = durationOk ? duration * gates.minAdvanceFraction : 1;
  if (!(playback.currentTimeAdvancedSeconds >= advanceFloor)) {
    reasons.push(
      `currentTime advanced only ${playback.currentTimeAdvancedSeconds} seconds, needed ${Number(advanceFloor.toFixed(3))}`,
    );
  }
  if (!(frames.sampleMeanNonblackFraction >= gates.minNonblackFraction)) {
    reasons.push(`mean non-black pixel fraction was ${frames.sampleMeanNonblackFraction}`);
  }
  if (!(frames.sampleMinMeanLuminance > gates.minFrameLuminance)) {
    reasons.push(`one sampled frame was close to black (${frames.sampleMinMeanLuminance})`);
  }
  // A product journey holds still between beats, so it passes a per-beat count instead of
  // the fraction, which fits only the continuously animated smoke page.
  if (typeof gates.minMovingFramePairs === 'number') {
    if (!(frames.movingFramePairs >= gates.minMovingFramePairs)) {
      reasons.push(
        `only ${frames.movingFramePairs} frame pairs changed, expected at least ${gates.minMovingFramePairs} (one per beat)`,
      );
    }
  } else if (!(frames.movingFramePairFraction >= gates.minMovingFramePairFraction)) {
    reasons.push(
      `only ${frames.movingFramePairFraction} of frame pairs changed, which looks like a slideshow`,
    );
  }
  if (!(frames.blackFrameCount <= gates.maxBlackFrames)) {
    reasons.push(`${frames.blackFrameCount} decoded frames were black`);
  }
  return { pass: reasons.length === 0, reasons };
}

/** Anchors to resolve Playwright from, most specific first. */
export function playwrightAnchors({ from, env, cwd, home }) {
  const anchors = [];
  for (const value of [from, env, cwd, home]) {
    if (!value) continue;
    const anchor = path.basename(value) === 'package.json' ? value : path.join(value, 'package.json');
    if (!anchors.includes(anchor)) anchors.push(anchor);
  }
  return anchors;
}

export function parseRange(header, size) {
  if (typeof header !== 'string') return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return null;
  let start;
  let end;
  if (rawStart === '') {
    const length = Number(rawEnd);
    if (!Number.isFinite(length) || length <= 0) return null;
    start = Math.max(0, size - length);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

export function parseArgs(argv) {
  const [mode, ...rest] = argv;
  const options = {};
  const flags = new Set();
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith('--')) continue;
    const name = token.slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags.add(name);
      continue;
    }
    options[name] = next;
    i += 1;
  }
  return { mode: mode ?? 'route', options, flags };
}

function numberOption(options, name, fallback) {
  if (options[name] === undefined) return fallback;
  const value = Number(options[name]);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number`);
  return value;
}

/* ----------------------------------------------------------- Playwright loader */

async function resolvePlaywright(from) {
  const anchors = playwrightAnchors({
    from,
    env: process.env.UIW_PLAYWRIGHT_FROM,
    cwd: process.cwd(),
    home: os.homedir(),
  });
  const tried = [];
  for (const anchor of anchors) {
    const requireFromAnchor = createRequire(pathToFileURL(anchor));
    for (const name of ['playwright', 'playwright-core']) {
      try {
        const resolvedFrom = requireFromAnchor.resolve(name);
        return { playwright: requireFromAnchor(name), resolvedFrom };
      } catch (error) {
        tried.push(`${anchor} -> ${name}: ${error.message}`);
      }
    }
  }
  throw new Error(
    'Playwright is not resolvable, so no browser video is available. Pass --playwright-from ' +
      '<dir with playwright in node_modules> or set UIW_PLAYWRIGHT_FROM. Do not install it. ' +
      `Attempts: ${tried.join(' | ')}`,
  );
}

async function launchChromium(playwright, options) {
  const launchOptions = { headless: true, chromiumSandbox: true };
  if (options['executable-path']) launchOptions.executablePath = options['executable-path'];
  try {
    return await playwright.chromium.launch(launchOptions);
  } catch (error) {
    throw new Error(
      'Chromium did not launch, so no browser video is available. Point PLAYWRIGHT_BROWSERS_PATH ' +
        'at an existing Playwright browser cache, or pass --executable-path. Do not install a ' +
        `browser. Cause: ${error.message}`,
    );
  }
}

/* ---------------------------------------------------------------- local server */

/**
 * Name a media file by its role, so a URL never carries the file's own name. Playwright names
 * a recording `page@<hash>.webm`, and a name filter that rejected the `@` turned every request
 * for it into a 404, which the video element reported as media error code 4.
 */
export function mediaAlias(role, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension !== '.webm' && extension !== '.mp4') {
    throw new Error(`${path.basename(filePath)} is not a .webm or .mp4 file`);
  }
  return `${role}${extension}`;
}

/** Serve the two inline pages, and only the media files registered under an alias. */
export function resolveRoute(pathname, media) {
  if (pathname === '/harness.html') {
    return { inline: HARNESS_HTML, type: MIME_BY_EXTENSION['.html'] };
  }
  if (pathname === '/smoke.html') {
    return { inline: SMOKE_PAGE_HTML, type: MIME_BY_EXTENSION['.html'] };
  }
  if (media && pathname.startsWith('/media/')) {
    const file = media.get(pathname.slice('/media/'.length));
    if (file) return { file };
  }
  return null;
}

export async function handleRequest(req, res, media) {
  const notFound = () => {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  };
  try {
    const route = resolveRoute(new URL(req.url, 'http://127.0.0.1').pathname, media);
    if (!route) return notFound();
    if (route.inline) {
      res.writeHead(200, {
        'content-type': route.type,
        'content-length': Buffer.byteLength(route.inline),
        'cache-control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : route.inline);
      return;
    }

    const stat = await fs.stat(route.file);
    const type =
      MIME_BY_EXTENSION[path.extname(route.file).toLowerCase()] ?? 'application/octet-stream';
    const range = parseRange(req.headers.range, stat.size);

    if (range) {
      res.writeHead(206, {
        'content-type': type,
        'accept-ranges': 'bytes',
        'content-length': range.end - range.start + 1,
        'content-range': `bytes ${range.start}-${range.end}/${stat.size}`,
        'cache-control': 'no-store',
      });
      if (req.method === 'HEAD') return res.end();
      createReadStream(route.file, { start: range.start, end: range.end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      'content-type': type,
      'accept-ranges': 'bytes',
      'content-length': stat.size,
      'cache-control': 'no-store',
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(route.file).pipe(res);
  } catch {
    notFound();
  }
}

/** `media` maps an alias to an absolute path. A caller can register more files later. */
async function startServer(media = new Map()) {
  const server = createServer((req, res) => {
    void handleRequest(req, res, media);
  });
  server.on('clientError', (_error, socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError);
      resolve();
    });
  });
  const { port } = server.address();
  return { server, port, media, origin: `http://127.0.0.1:${port}` };
}

async function stopServer(server) {
  if (!server) return;
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(() => resolve()));
}

/* ----------------------------------------------------- in-page helpers (string) */

/** Declared as a string because these run in the browser, not in Node. */
const PAGE_HELPERS = `
  function waitForEvent(target, name, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var done = false;
      function cleanup() {
        done = true;
        clearTimeout(timer);
        target.removeEventListener(name, onEvent);
        target.removeEventListener('error', onError);
      }
      var timer = setTimeout(function () {
        if (done) return;
        cleanup();
        reject(new Error('timeout after ' + timeoutMs + ' ms waiting for ' + name));
      }, timeoutMs);
      function onEvent() { if (done) return; cleanup(); resolve(name); }
      function onError() {
        if (done) return;
        var media = target.error;
        cleanup();
        reject(new Error('media error code ' + (media ? media.code : 'unknown')));
      }
      target.addEventListener(name, onEvent);
      target.addEventListener('error', onError);
    });
  }

  function nextFrame() {
    return new Promise(function (resolve) { requestAnimationFrame(function () { resolve(); }); });
  }

  function makeVideo(url) {
    var video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.defaultMuted = true;
    video.loop = false;
    video.autoplay = false;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    return video;
  }

  function makeSampler(width, height) {
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    return {
      canvas: canvas,
      ctx: ctx,
      measure: function (source) {
        ctx.drawImage(source, 0, 0, width, height);
        var data = ctx.getImageData(0, 0, width, height).data;
        var count = width * height;
        var luma = new Float32Array(count);
        var sum = 0;
        var nonblack = 0;
        for (var i = 0, p = 0; p < count; i += 4, p += 1) {
          var value = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          luma[p] = value;
          sum += value;
          if (value > 16) nonblack += 1;
        }
        return { luma: luma, mean: sum / count, nonblackFraction: nonblack / count };
      }
    };
  }

  function compareFrames(current, previous) {
    var total = 0;
    var changed = 0;
    for (var i = 0; i < current.length; i += 1) {
      var delta = Math.abs(current[i] - previous[i]);
      total += delta;
      if (delta > 8) changed += 1;
    }
    return { meanAbsDiff: total / current.length, changedPixelFraction: changed / current.length };
  }
`;

/* ----------------------------------------------------------------- probe step */

async function probeMediaRecorder(browser, origin) {
  const context = await browser.newContext({ viewport: SMOKE_VIEWPORT });
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/harness.html`, { waitUntil: 'load' });
    return await page.evaluate(
      ({ mp4, webm }) => {
        if (typeof MediaRecorder === 'undefined') {
          return { available: false, types: {}, mp4Supported: [], webmSupported: [] };
        }
        const types = {};
        for (const type of mp4.concat(webm)) types[type] = MediaRecorder.isTypeSupported(type);
        return {
          available: true,
          types,
          mp4Supported: mp4.filter((type) => types[type]),
          webmSupported: webm.filter((type) => types[type]),
          secureContext: window.isSecureContext,
        };
      },
      { mp4: MP4_CANDIDATES, webm: WEBM_CANDIDATES },
    );
  } finally {
    await context.close();
  }
}

/* ------------------------------------------------------------- MP4 conversion */

async function transcodeInBrowser(browser, origin, sourceName, mimeType, maxMs) {
  const context = await browser.newContext({ viewport: SMOKE_VIEWPORT });
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/harness.html`, { waitUntil: 'load' });
    page.setDefaultTimeout(180000);

    return await page.evaluate(
      new Function(
        'args',
        `${PAGE_HELPERS}
        return (async function () {
          var log = [];
          var video = makeVideo(args.url);
          await waitForEvent(video, 'loadedmetadata', 20000);
          await waitForEvent(video, 'canplay', 20000);

          var width = video.videoWidth;
          var height = video.videoHeight;
          if (!width || !height) {
            return { ok: false, reason: 'the source video reported no dimensions', log: log };
          }

          var canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          var ctx = canvas.getContext('2d', { alpha: false });
          ctx.fillStyle = '#101427';
          ctx.fillRect(0, 0, width, height);
          var sampler = makeSampler(48, 27);

          // Move off frame zero, then draw until a decoded, non-black frame exists.
          // The encoder must never start on an empty or black canvas.
          try {
            video.currentTime = 0.1;
            await waitForEvent(video, 'seeked', 8000);
          } catch (error) {
            log.push('start seek skipped: ' + error.message);
          }

          var warmupFrames = 0;
          var firstLuma = 0;
          for (var attempt = 0; attempt < 240; attempt += 1) {
            ctx.drawImage(video, 0, 0, width, height);
            warmupFrames += 1;
            firstLuma = sampler.measure(canvas).mean;
            if (firstLuma > 6) break;
            await nextFrame();
          }
          if (firstLuma <= 6) {
            return { ok: false, reason: 'no non-black source frame before encoding', log: log };
          }

          var stream = canvas.captureStream(30);
          if (stream.getAudioTracks().length !== 0) {
            stream.getTracks().forEach(function (track) { track.stop(); });
            return { ok: false, reason: 'the capture stream carried an audio track', log: log };
          }

          var recorder = new MediaRecorder(stream, {
            mimeType: args.mimeType,
            videoBitsPerSecond: 4000000
          });
          var chunks = [];
          recorder.ondataavailable = function (event) {
            if (event.data && event.data.size > 0) chunks.push(event.data);
          };
          var recorderError = null;
          recorder.onerror = function (event) {
            recorderError = String((event && event.error) || 'MediaRecorder error');
          };
          var stopped = new Promise(function (resolve) {
            recorder.onstop = function () { resolve(); };
          });

          recorder.start(250);
          var startedAt = performance.now();
          try {
            await video.play();
          } catch (error) {
            log.push('play rejected: ' + error.message);
          }

          var framesDrawn = 0;
          var lumaSamples = [];
          await new Promise(function (resolve) {
            function step() {
              ctx.drawImage(video, 0, 0, width, height);
              framesDrawn += 1;
              if (framesDrawn % 15 === 0) {
                lumaSamples.push(Number(sampler.measure(canvas).mean.toFixed(2)));
              }
              var elapsed = performance.now() - startedAt;
              if (video.ended || elapsed > args.maxMs) { resolve(); return; }
              requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
          });

          var drawSeconds = (performance.now() - startedAt) / 1000;
          var sourceEndTime = video.currentTime;
          var sourceDuration = video.duration;
          var videoEnded = video.ended;
          video.pause();

          // Let the encoder flush the tail frames before the stop request.
          await new Promise(function (resolve) { setTimeout(resolve, 500); });
          recorder.stop();
          await stopped;
          stream.getTracks().forEach(function (track) { track.stop(); });

          if (recorderError) return { ok: false, reason: recorderError, log: log };

          var blob = new Blob(chunks, { type: args.mimeType });
          if (blob.size === 0) {
            return { ok: false, reason: 'encoder produced zero bytes', log: log };
          }

          var base64 = await new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onerror = function () { reject(new Error('blob read failed')); };
            reader.onload = function () {
              var text = String(reader.result);
              var comma = text.indexOf(',');
              resolve(comma >= 0 ? text.slice(comma + 1) : '');
            };
            reader.readAsDataURL(blob);
          });

          return {
            ok: true,
            base64: base64,
            byteLength: blob.size,
            mimeType: args.mimeType,
            width: width,
            height: height,
            framesDrawn: framesDrawn,
            drawSeconds: Number(drawSeconds.toFixed(3)),
            sourceEndTime: isFinite(sourceEndTime) ? Number(sourceEndTime.toFixed(3)) : null,
            sourceDuration: isFinite(sourceDuration) ? Number(sourceDuration.toFixed(3)) : null,
            sourceReachedEnd: videoEnded,
            firstFrameLuma: Number(firstLuma.toFixed(2)),
            warmupFrames: warmupFrames,
            lumaSamples: lumaSamples,
            log: log
          };
        })();`,
      ),
      { url: `${origin}/media/${encodeURIComponent(sourceName)}`, mimeType, maxMs },
    );
  } finally {
    await context.close();
  }
}

/* ----------------------------------------------------------------- validation */

async function validateByPlayback(browser, origin, fileName, wantFrame, maxMs = 600000) {
  const context = await browser.newContext({ viewport: SMOKE_VIEWPORT });
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/harness.html`, { waitUntil: 'load' });
    page.setDefaultTimeout(180000);

    return await page.evaluate(
      new Function(
        'args',
        `${PAGE_HELPERS}
        return (async function () {
          var notes = [];
          var video = makeVideo(args.url);
          await waitForEvent(video, 'loadedmetadata', 20000);

          var width = video.videoWidth;
          var height = video.videoHeight;
          var durationRaw = video.duration;
          var duration = durationRaw;
          var durationSource = 'metadata';

          // A live-written WebM can report Infinity. Seek far past the end to force the
          // real duration, then return to the start.
          if (!isFinite(duration) || duration <= 0) {
            notes.push('duration from metadata was ' + String(durationRaw));
            try {
              video.currentTime = 1e7;
              await Promise.race([
                waitForEvent(video, 'seeked', 10000).catch(function (e) { return e; }),
                waitForEvent(video, 'durationchange', 10000).catch(function (e) { return e; })
              ]);
              if (isFinite(video.duration) && video.duration > 0) {
                duration = video.duration;
                durationSource = 'seek-probe-duration';
              } else if (isFinite(video.currentTime) && video.currentTime > 0) {
                duration = video.currentTime;
                durationSource = 'seek-probe-currentTime';
              }
              video.currentTime = 0;
              await waitForEvent(video, 'seeked', 10000).catch(function (e) {
                notes.push('rewind after seek probe: ' + e.message);
              });
            } catch (error) {
              notes.push('seek probe failed: ' + error.message);
              durationSource = 'unresolved';
            }
          }

          var sampler = makeSampler(160, 90);
          var fullCanvas = document.createElement('canvas');
          fullCanvas.width = width;
          fullCanvas.height = height;
          var fullCtx = fullCanvas.getContext('2d', { alpha: false });

          var samples = [];
          var frameDiffs = [];
          var previousLuma = null;
          var framesDrawn = 0;
          var maxCurrentTime = 0;
          var representativeDataUrl = null;
          var representativeAt = null;

          try {
            await video.play();
          } catch (error) {
            notes.push('play rejected: ' + error.message);
          }

          var startedAt = performance.now();
          var startCurrentTime = video.currentTime;
          var nextSampleAt = 0;
          var previousDecodedCount = -1;
          var blackFrameCount = 0;
          var minimumFrameLuminance = Infinity;

          await new Promise(function (resolve) {
            function step() {
              var elapsed = performance.now() - startedAt;
              var decodedCount = video.getVideoPlaybackQuality().totalVideoFrames;
              if (decodedCount === previousDecodedCount && !video.ended && elapsed <= args.maxMs) {
                requestAnimationFrame(step);
                return;
              }
              previousDecodedCount = decodedCount;
              var measured = sampler.measure(video);
              if (measured.mean <= 2) blackFrameCount += 1;
              minimumFrameLuminance = Math.min(minimumFrameLuminance, measured.mean);
              framesDrawn += 1;
              if (video.currentTime > maxCurrentTime) maxCurrentTime = video.currentTime;

              if (previousLuma) frameDiffs.push(compareFrames(measured.luma, previousLuma));
              previousLuma = measured.luma;

              if (elapsed >= nextSampleAt) {
                samples.push({
                  atPlaybackMs: Math.round(elapsed),
                  currentTime: Number(video.currentTime.toFixed(3)),
                  meanLuminance: Number(measured.mean.toFixed(2)),
                  nonblackFraction: Number(measured.nonblackFraction.toFixed(4))
                });
                nextSampleAt = elapsed + 900;
                if (args.wantFrame && samples.length === 4) {
                  fullCtx.drawImage(video, 0, 0, fullCanvas.width, fullCanvas.height);
                  representativeDataUrl = fullCanvas.toDataURL('image/png');
                  representativeAt = Number(video.currentTime.toFixed(3));
                }
              }

              if (video.ended || elapsed > args.maxMs) { resolve(); return; }
              requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
          });

          var playbackSeconds = (performance.now() - startedAt) / 1000;
          var endCurrentTime = video.currentTime;
          var reachedEnd = video.ended;
          video.pause();

          if (args.wantFrame && !representativeDataUrl) {
            fullCtx.drawImage(video, 0, 0, fullCanvas.width, fullCanvas.height);
            representativeDataUrl = fullCanvas.toDataURL('image/png');
            representativeAt = Number(video.currentTime.toFixed(3));
            notes.push('representative frame taken from the last decoded frame');
          }

          var meanLumaSum = 0;
          var nonblackSum = 0;
          var minMeanLuma = Infinity;
          for (var i = 0; i < samples.length; i += 1) {
            meanLumaSum += samples[i].meanLuminance;
            nonblackSum += samples[i].nonblackFraction;
            if (samples[i].meanLuminance < minMeanLuma) minMeanLuma = samples[i].meanLuminance;
          }

          var diffSum = 0;
          var maxDiff = 0;
          var movingFrames = 0;
          var identicalFrames = 0;
          var changedPixelSum = 0;
          for (var j = 0; j < frameDiffs.length; j += 1) {
            var d = frameDiffs[j].meanAbsDiff;
            diffSum += d;
            changedPixelSum += frameDiffs[j].changedPixelFraction;
            if (d > maxDiff) maxDiff = d;
            if (d > 0.4) movingFrames += 1;
            if (d < 0.01) identicalFrames += 1;
          }
          var diffCount = frameDiffs.length || 1;

          return {
            url: args.url,
            videoWidth: width,
            videoHeight: height,
            durationRaw: isFinite(durationRaw) ? Number(durationRaw.toFixed(3)) : String(durationRaw),
            durationSeconds: isFinite(duration) ? Number(duration.toFixed(3)) : null,
            durationSource: durationSource,
            playback: {
              playbackSeconds: Number(playbackSeconds.toFixed(3)),
              framesDrawn: framesDrawn,
              startCurrentTime: Number(startCurrentTime.toFixed(3)),
              endCurrentTime: Number(endCurrentTime.toFixed(3)),
              maxCurrentTime: Number(maxCurrentTime.toFixed(3)),
              currentTimeAdvancedSeconds: Number((maxCurrentTime - startCurrentTime).toFixed(3)),
              reachedEnd: reachedEnd
            },
            frames: {
              blackFrameCount: blackFrameCount,
              minimumFrameMeanLuminance: Number(minimumFrameLuminance.toFixed(2)),
              sampleCount: samples.length,
              samples: samples,
              sampleMeanLuminance: samples.length ? Number((meanLumaSum / samples.length).toFixed(2)) : null,
              sampleMinMeanLuminance: samples.length ? Number(minMeanLuma.toFixed(2)) : null,
              sampleMeanNonblackFraction: samples.length ? Number((nonblackSum / samples.length).toFixed(4)) : null,
              comparedFramePairs: frameDiffs.length,
              meanFrameAbsDiff: Number((diffSum / diffCount).toFixed(3)),
              maxFrameAbsDiff: Number(maxDiff.toFixed(3)),
              meanChangedPixelFraction: Number((changedPixelSum / diffCount).toFixed(4)),
              movingFramePairs: movingFrames,
              movingFramePairFraction: Number((movingFrames / diffCount).toFixed(4)),
              nearIdenticalFramePairs: identicalFrames
            },
            representativeFrame: representativeDataUrl
              ? { atCurrentTime: representativeAt, dataUrl: representativeDataUrl }
              : null,
            notes: notes
          };
        })();`,
      ),
      { url: `${origin}/media/${encodeURIComponent(fileName)}`, maxMs, wantFrame: Boolean(wantFrame) },
    );
  } finally {
    await context.close();
  }
}

/* ------------------------------------------------------------- file inspection */

async function inspectFile(filePath) {
  const stat = await fs.stat(filePath);
  const handle = await fs.open(filePath, 'r');
  let head;
  try {
    const buffer = Buffer.alloc(32);
    const { bytesRead } = await handle.read(buffer, 0, 32, 0);
    head = buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
  const bytes = await fs.readFile(filePath);
  const container = classifyContainer(head);
  return {
    file: path.basename(filePath),
    path: filePath,
    byteLength: stat.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    ...container,
    videoCodec: container.isMp4 ? detectVideoCodec(bytes) : null,
  };
}

/** Move the representative frame out of the measurement, so the JSON report stays small. */
function takeRepresentativeFrame(validation) {
  const representative = validation?.representativeFrame;
  if (!representative?.dataUrl) return null;
  const base64 = representative.dataUrl.split(',')[1] ?? '';
  delete representative.dataUrl;
  return Buffer.from(base64, 'base64');
}

/* ------------------------------------------------------------- synthetic smoke */

async function recordSyntheticPage(browser, origin, outDir) {
  const context = await browser.newContext({
    viewport: SMOKE_VIEWPORT,
    recordVideo: { dir: outDir, size: SMOKE_VIEWPORT },
  });
  context.setDefaultTimeout(60000);

  const pageErrors = [];
  const externalRequests = [];
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('requestfailed', (request) => pageErrors.push(`requestfailed ${request.url()}`));
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(origin) && !url.startsWith('data:')) externalRequests.push(url);
  });

  await page.goto(`${origin}/smoke.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__capture && window.__capture.ready === true);

  const startedAt = performance.now();
  const interactions = [];
  for (const offset of SMOKE_CLICK_OFFSETS_MS) {
    const wait = offset - (performance.now() - startedAt);
    if (wait > 0) await sleep(wait);
    const expected = interactions.length + 1;
    await page.click('#palette-button');
    await page.waitForFunction(
      (want) => Number(document.getElementById('counter').textContent.trim()) === want,
      expected,
    );
    const counterText = (await page.textContent('#counter')).trim();
    const state = await page.evaluate(() => ({ ...window.__capture }));
    if (Number(counterText) !== expected || state.clicks !== expected) {
      throw new Error(
        `DOM counter mismatch after click ${expected}: counter="${counterText}" state=${state.clicks}`,
      );
    }
    interactions.push({
      clickIndex: expected,
      atMsFromCaptureStart: Math.round(performance.now() - startedAt),
      domCounterText: counterText,
      paletteName: state.paletteName,
      pageFramesDrawn: state.frames,
    });
    if (expected === 1) {
      await writeExclusive(path.join(outDir, 'smoke-interaction.png'), await page.screenshot());
    }
  }

  const remaining = SMOKE_CAPTURE_MS - (performance.now() - startedAt);
  if (remaining > 0) await sleep(remaining);

  const finalCounterText = (await page.textContent('#counter')).trim();
  const captureSeconds = (performance.now() - startedAt) / 1000;
  const video = page.video();
  if (!video) throw new Error('Playwright did not attach a video to the page');

  await page.close();
  await context.close();

  // Keep the recording where Playwright finalized it. The smoke directory starts empty, so
  // no rename and no delete is needed.
  const webmPath = await video.path();

  return {
    viewport: SMOKE_VIEWPORT,
    targetSeconds: SMOKE_CAPTURE_MS / 1000,
    actualSeconds: Number(captureSeconds.toFixed(3)),
    clicksPerformed: interactions.length,
    finalDomCounter: finalCounterText,
    interactions,
    externalRequests,
    pageErrors,
    webmPath,
  };
}

/* ------------------------------------------------------------------- CLI modes */

const SCOPE =
  'Browser page capture only. No desktop capture, no window capture outside the browser, no audio.';

function print(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function hasOpencapBinary() {
  const paths = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const names = process.platform === 'win32' ? ['opencap.exe', 'opencap.cmd'] : ['opencap'];
  for (const dir of paths) {
    for (const name of names) {
      try {
        await fs.access(path.join(dir, name));
        return true;
      } catch {
        /* keep looking */
      }
    }
  }
  return false;
}

async function modeRoute(options, flags) {
  const selection = selectDriver({
    platform: process.platform,
    hasOpencap: await hasOpencapBinary(),
    noVideo: flags.has('no-video'),
  });
  print({
    mode: 'route',
    platform: process.platform,
    node: process.version,
    scope: SCOPE,
    ...selection,
  });
}

async function modeProbe(options) {
  const { playwright, resolvedFrom } = await resolvePlaywright(options['playwright-from']);
  const server = await startServer();
  let browser = null;
  try {
    browser = await launchChromium(playwright, options);
    const mediaRecorder = await probeMediaRecorder(browser, server.origin);
    const mp4Mime = chooseMp4Mime(mediaRecorder.mp4Supported);
    print({
      mode: 'probe',
      scope: SCOPE,
      platform: process.platform,
      chromiumVersion: browser.version(),
      chromiumExecutable: playwright.chromium.executablePath(),
      playwrightResolvedFrom: resolvedFrom,
      mediaRecorder,
      mp4Mime,
      mp4Supported: Boolean(mp4Mime),
      reason: mp4Mime
        ? null
        : 'MediaRecorder in this Chromium build reports no video/mp4 support, so this host cannot produce an MP4.',
    });
    if (!mp4Mime) process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopServer(server.server);
  }
}

async function modeTranscode(options) {
  const input = options.in;
  if (!input) throw new Error('--in <recorded .webm> is required');
  const source = path.resolve(input);
  const sourceAlias = mediaAlias('source', source);
  const sourceInfo = await inspectFile(source);
  const output = path.resolve(options.out ?? source.replace(/\.webm$/i, '.mp4'));
  if (path.resolve(output) === source) throw new Error('--out must differ from --in');

  // Reserve the output before any browser work, so a taken path fails fast. The one file this
  // script ever removes is this reservation, and only while it holds no complete encoder
  // output. A complete but rejected MP4 stays on disk for diagnosis.
  const reservation = await reserveOutput(output);
  let reservationOpen = true;
  let keepOutput = false;
  let server = null;
  let browser = null;
  try {
    const { playwright, resolvedFrom } = await resolvePlaywright(options['playwright-from']);
    server = await startServer(new Map([[sourceAlias, source]]));
    browser = await launchChromium(playwright, options);
    const mediaRecorder = await probeMediaRecorder(browser, server.origin);
    const mimeType = options.mime ?? chooseMp4Mime(mediaRecorder.mp4Supported);

    if (!mimeType) {
      print({
        mode: 'transcode',
        scope: SCOPE,
        produced: false,
        reason:
          'MediaRecorder in this Chromium build reports no video/mp4 support, so no MP4 was written. ' +
          'The WebM recording is kept. No encoder was installed and no file was renamed.',
        candidatesTested: MP4_CANDIDATES,
        chromiumVersion: browser.version(),
        playwrightResolvedFrom: resolvedFrom,
        source: sourceInfo,
      });
      process.exitCode = 1;
      return;
    }

    const result = await transcodeInBrowser(
      browser,
      server.origin,
      sourceAlias,
      mimeType,
      numberOption(options, 'max-ms', 600000),
    );

    let outputInfo = null;
    if (result.ok) {
      await reservation.writeFile(Buffer.from(result.base64, 'base64'));
      delete result.base64;
      await reservation.close();
      reservationOpen = false;
      keepOutput = true;
      outputInfo = await inspectFile(output);
    }
    const encode = judgeTranscode(result, outputInfo);

    if (!encode.pass) {
      const kept = outputInfo
        ? `The rejected MP4 is kept at ${output} for diagnosis. Never publish it.`
        : 'No encoder output was written.';
      print({
        mode: 'transcode',
        scope: SCOPE,
        produced: false,
        reason: `${encode.reasons.join('; ')}. The WebM recording is kept. ${kept}`,
        mimeType,
        log: result.log,
        source: sourceInfo,
        rejectedOutput: outputInfo,
      });
      process.exitCode = 1;
      return;
    }

    print({
      mode: 'transcode',
      scope: SCOPE,
      produced: true,
      method:
        'decoded the recorded WebM in a video element, drew the frames to a canvas at real time, ' +
        'encoded canvas.captureStream(30) with MediaRecorder',
      mimeType,
      chromiumVersion: browser.version(),
      playwrightResolvedFrom: resolvedFrom,
      framesDrawn: result.framesDrawn,
      encodeSeconds: result.drawSeconds,
      sourceEndTime: result.sourceEndTime,
      sourceReachedEnd: result.sourceReachedEnd,
      firstFrameLuma: result.firstFrameLuma,
      warmupFrames: result.warmupFrames,
      log: result.log,
      source: sourceInfo,
      output: outputInfo,
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await stopServer(server.server);
    if (reservationOpen) await reservation.close();
    if (!keepOutput) await fs.rm(output, { force: true });
  }
}

async function modeValidate(options) {
  const target = options.file;
  if (!target) throw new Error('--file <media file> is required');
  const file = path.resolve(target);
  const clipAlias = mediaAlias('clip', file);
  const fileInfo = await inspectFile(file);

  // Reserve the frame path before playback, so a taken path fails before the long work.
  const framePath = options.frame ? path.resolve(options.frame) : null;
  const frameReservation = framePath ? await reserveOutput(framePath) : null;
  let frameWritten = false;
  let server = null;
  let browser = null;
  try {
    const { playwright, resolvedFrom } = await resolvePlaywright(options['playwright-from']);
    server = await startServer(new Map([[clipAlias, file]]));
    browser = await launchChromium(playwright, options);
    const validation = await validateByPlayback(
      browser,
      server.origin,
      clipAlias,
      Boolean(framePath),
      numberOption(options, 'max-ms', 600000),
    );
    const frameBytes = takeRepresentativeFrame(validation);
    if (frameReservation && frameBytes) {
      await frameReservation.writeFile(frameBytes);
      frameWritten = true;
    }
    const representativeFrame = frameWritten ? framePath : null;

    const expect = {};
    if (options['expect-width'] !== undefined) expect.width = numberOption(options, 'expect-width');
    if (options['expect-height'] !== undefined) {
      expect.height = numberOption(options, 'expect-height');
    }
    if (options['min-duration'] !== undefined) {
      expect.minDurationSeconds = numberOption(options, 'min-duration');
    }
    if (options['max-duration'] !== undefined) {
      expect.maxDurationSeconds = numberOption(options, 'max-duration');
    }
    if (options['min-moving-pairs'] !== undefined) {
      expect.minMovingFramePairs = numberOption(options, 'min-moving-pairs');
    }
    if (options['expect-duration'] !== undefined) {
      expect.expectedDurationSeconds = numberOption(options, 'expect-duration');
    }
    if (options['duration-tolerance'] !== undefined) {
      expect.durationToleranceSeconds = numberOption(options, 'duration-tolerance');
    }
    const checks = judgeValidation(validation, expect);

    print({
      mode: 'validate',
      scope: SCOPE,
      chromiumVersion: browser.version(),
      playwrightResolvedFrom: resolvedFrom,
      file: fileInfo,
      gates: { ...DEFAULT_GATES, ...expect },
      validation,
      representativeFrame,
      checks,
    });
    if (!checks.pass) process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await stopServer(server.server);
    if (frameReservation) await frameReservation.close();
    if (frameReservation && !frameWritten) await fs.rm(framePath, { force: true });
  }
}

async function modeSmoke(options) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(
    options['out-dir'] ?? path.join(process.cwd(), `browser-video-smoke-${stamp}`),
  );
  await claimNewDirectory(outDir);

  const { playwright, resolvedFrom } = await resolvePlaywright(options['playwright-from']);
  const server = await startServer();
  let browser = null;
  try {
    browser = await launchChromium(playwright, options);
    const mediaRecorder = await probeMediaRecorder(browser, server.origin);
    const capture = await recordSyntheticPage(browser, server.origin, outDir);
    const webmInfo = await inspectFile(capture.webmPath);

    const expect = {
      width: SMOKE_VIEWPORT.width,
      height: SMOKE_VIEWPORT.height,
      minDurationSeconds: 7,
      maxDurationSeconds: 16,
    };
    const webmAlias = mediaAlias('smoke-source', capture.webmPath);
    server.media.set(webmAlias, capture.webmPath);
    const webmValidation = await validateByPlayback(browser, server.origin, webmAlias, true);
    const frameBytes = takeRepresentativeFrame(webmValidation);
    const framePath = frameBytes
      ? await writeExclusive(path.join(outDir, 'smoke-playback-frame.png'), frameBytes)
      : null;
    const webmChecks = judgeValidation(webmValidation, expect);

    const mimeType = chooseMp4Mime(mediaRecorder.mp4Supported);
    let mp4 = {
      produced: false,
      reason:
        'MediaRecorder in this Chromium build reports no video/mp4 support, so no MP4 was written. ' +
        'The WebM recording is kept.',
      candidatesTested: MP4_CANDIDATES,
    };
    let mp4Validation = null;
    let mp4Checks = null;

    if (mimeType) {
      const mp4Path = path.join(outDir, 'smoke.mp4');
      const result = await transcodeInBrowser(browser, server.origin, webmAlias, mimeType, 120000);
      if (!result.ok) {
        mp4 = { produced: false, reason: result.reason, mimeType, log: result.log };
      } else {
        await writeExclusive(mp4Path, Buffer.from(result.base64, 'base64'));
        delete result.base64;
        const mp4Info = await inspectFile(mp4Path);
        const encode = judgeTranscode(result, mp4Info);
        if (!encode.pass) {
          mp4 = {
            produced: false,
            reason: `${encode.reasons.join('; ')}. The rejected MP4 is kept for diagnosis.`,
            mimeType,
            rejectedOutput: mp4Info,
          };
        } else {
          mp4 = { produced: true, mimeType, framesDrawn: result.framesDrawn, file: mp4Info };
          const mp4Alias = mediaAlias('smoke-output', mp4Path);
          server.media.set(mp4Alias, mp4Path);
          mp4Validation = await validateByPlayback(browser, server.origin, mp4Alias, false);
          mp4Checks = judgeValidation(mp4Validation, {
            ...expect,
            expectedDurationSeconds: webmValidation.durationSeconds,
          });
        }
      }
    }

    const interactionsVerifiedInDom =
      capture.clicksPerformed >= 2 && Number(capture.finalDomCounter) === capture.clicksPerformed;

    print({
      mode: 'smoke',
      meaning:
        'A capability smoke on a synthetic page. It proves this host can record and encode. ' +
        'It is not product validation and it is never posted as walkthrough evidence.',
      scope: SCOPE,
      audio: 'None. No audio track, no microphone, and no system audio were requested.',
      content: 'A synthetic local page generated by this script. No product, customer, or credential data.',
      environment: {
        platform: process.platform,
        osRelease: os.release(),
        node: process.version,
        playwrightResolvedFrom: resolvedFrom,
        chromiumVersion: browser.version(),
        chromiumExecutable: playwright.chromium.executablePath(),
        headless: true,
      },
      outDir,
      capture,
      mediaRecorder,
      webm: { file: webmInfo, validation: webmValidation, checks: webmChecks },
      mp4: { ...mp4, validation: mp4Validation, checks: mp4Checks },
      representativeFrame: framePath,
      verdict: {
        interactionsVerifiedInDom,
        webmRecorded: webmChecks.pass,
        mp4Produced: Boolean(mp4.produced),
        mp4Valid: mp4Checks ? mp4Checks.pass : null,
        format: mp4.produced ? 'webm + mp4 (browser transcoded)' : 'webm only',
      },
    });

    // The Windows route delivers MP4, so a host that cannot produce a valid one fails the smoke.
    if (!interactionsVerifiedInDom || !webmChecks.pass || !mp4Checks?.pass) {
      process.exitCode = 1;
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopServer(server.server);
  }
}

const MODES = {
  route: modeRoute,
  probe: modeProbe,
  transcode: modeTranscode,
  validate: modeValidate,
  smoke: modeSmoke,
};

async function main() {
  const { mode, options, flags } = parseArgs(process.argv.slice(2));
  const run = MODES[mode];
  if (!run) {
    process.stderr.write(`unknown mode "${mode}". Modes: ${Object.keys(MODES).join(', ')}\n`);
    process.exitCode = 2;
    return;
  }
  try {
    await run(options, flags);
  } catch (error) {
    // Keep stdout one JSON object on every path, so a caller always has a reason to quote.
    print({ mode, ok: false, scope: SCOPE, reason: error?.message ?? String(error) });
    throw error;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const selfPath = fileURLToPath(import.meta.url);
const isMain =
  process.platform === 'win32'
    ? invokedPath.toLowerCase() === selfPath.toLowerCase()
    : invokedPath === selfPath;

if (isMain) {
  main().catch((error) => {
    process.stderr.write(`browser-video failed: ${error && error.stack ? error.stack : error}\n`);
    process.exitCode = 1;
  });
}
