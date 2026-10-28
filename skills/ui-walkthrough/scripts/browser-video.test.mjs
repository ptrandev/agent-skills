/**
 * Tests for the decisions browser-video.mjs makes without a browser.
 *
 * Run: node --test skills/ui-walkthrough/scripts/
 *
 * These cover platform routing, the unsupported-codec path, the missing-tool path, the
 * container and H.264 checks, the encode verdict, exclusive outputs, and every validation
 * gate. The browser-dependent paths are covered by `browser-video.mjs smoke`, which needs a
 * real Chromium.
 */

import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_GATES,
  MP4_CANDIDATES,
  WEBM_CANDIDATES,
  chooseMp4Mime,
  claimNewDirectory,
  classifyContainer,
  detectVideoCodec,
  handleRequest,
  judgeTranscode,
  judgeValidation,
  mediaAlias,
  parseArgs,
  parseRange,
  playwrightAnchors,
  resolveRoute,
  selectDriver,
  writeExclusive,
} from './browser-video.mjs';

/** The name Playwright gave the recording in the failed smoke run. */
const PLAYWRIGHT_WEBM = 'page@33addb4a5403338ecc5d4e8dd89cccc8.webm';

async function withTempDir(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'browser-video-test-'));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** A response object that the real request handler can write and pipe into. */
class CapturedResponse extends Writable {
  constructor() {
    super();
    this.statusCode = null;
    this.headers = {};
    this.chunks = [];
    this.finished = new Promise((resolve) => this.on('finish', resolve));
  }

  writeHead(statusCode, headers) {
    this.statusCode = statusCode;
    this.headers = headers;
    return this;
  }

  _write(chunk, _encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }

  body() {
    return Buffer.concat(this.chunks).toString('latin1');
  }
}

async function request(url, media, headers = {}) {
  const res = new CapturedResponse();
  await handleRequest({ url, method: 'GET', headers }, res, media);
  await res.finished;
  return res;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** A measurement that passes every gate, used as the base for each failure case. */
function passingValidation(overrides = {}) {
  return {
    videoWidth: 1280,
    videoHeight: 720,
    durationSeconds: 10,
    durationSource: 'metadata',
    playback: { currentTimeAdvancedSeconds: 10, reachedEnd: true },
    frames: {
      blackFrameCount: 0,
      sampleMeanNonblackFraction: 0.9189,
      sampleMinMeanLuminance: 44.44,
      movingFramePairFraction: 0.7037,
    },
    ...overrides,
  };
}

const EXPECT_720P = { width: 1280, height: 720, minDurationSeconds: 7, maxDurationSeconds: 16 };

/* -------------------------------------------------------------------- routing */

test('routing: macOS with opencap installed uses the opencap driver', () => {
  const result = selectDriver({ platform: 'darwin', hasOpencap: true, noVideo: false });
  assert.equal(result.driver, 'opencap');
});

test('routing: macOS without opencap records nothing and names the missing tool', () => {
  const result = selectDriver({ platform: 'darwin', hasOpencap: false, noVideo: false });
  assert.equal(result.driver, 'none');
  assert.match(result.reason, /opencap binary/);
});

test('routing: Windows uses the browser driver whether or not opencap is present', () => {
  for (const hasOpencap of [true, false]) {
    const result = selectDriver({ platform: 'win32', hasOpencap, noVideo: false });
    assert.equal(result.driver, 'browser');
  }
});

test('routing: an unsupported platform records nothing and names the platform', () => {
  const result = selectDriver({ platform: 'linux', hasOpencap: false, noVideo: false });
  assert.equal(result.driver, 'none');
  assert.match(result.reason, /linux/);
});

test('routing: --no-video wins on every platform', () => {
  for (const platform of ['darwin', 'win32', 'linux']) {
    const result = selectDriver({ platform, hasOpencap: true, noVideo: true });
    assert.equal(result.driver, 'none');
    assert.match(result.reason, /--no-video/);
  }
});

/* ------------------------------------------------------------ codec selection */

test('codec: the first supported MP4 candidate wins, in candidate order', () => {
  const supported = ['video/mp4', 'video/mp4;codecs=avc1.4D401F'];
  assert.equal(chooseMp4Mime(supported), 'video/mp4;codecs=avc1.4D401F');
});

test('codec: a WebM-only build reports no MP4 type rather than guessing one', () => {
  assert.equal(chooseMp4Mime(WEBM_CANDIDATES), null);
});

test('codec: absent or malformed support data reports no MP4 type', () => {
  assert.equal(chooseMp4Mime(undefined), null);
  assert.equal(chooseMp4Mime(null), null);
  assert.equal(chooseMp4Mime('video/mp4'), null);
  assert.equal(chooseMp4Mime([]), null);
});

test('codec: every candidate is an MP4 type, so a fallback can never select WebM', () => {
  for (const candidate of MP4_CANDIDATES) assert.match(candidate, /^video\/mp4/);
});

/* --------------------------------------------------------- container identity */

test('container: an MP4 head is recognized by its ftyp box', () => {
  const head = Buffer.from('000000246674797069736f6d00000200', 'hex');
  const result = classifyContainer(head);
  assert.equal(result.isMp4, true);
  assert.equal(result.ftypBox, 'ftyp');
  assert.equal(result.majorBrand, 'isom');
  assert.equal(result.isMatroskaOrWebm, false);
});

test('container: a WebM renamed to .mp4 is still reported as WebM', () => {
  const head = Buffer.from('1a45dfa39f4286810142f7810142f281', 'hex');
  const result = classifyContainer(head);
  assert.equal(result.isMp4, false);
  assert.equal(result.isMatroskaOrWebm, true);
});

test('container: a truncated or empty head is neither format', () => {
  for (const head of [Buffer.alloc(0), Buffer.from([0x00, 0x01])]) {
    const result = classifyContainer(head);
    assert.equal(result.isMp4, false);
    assert.equal(result.isMatroskaOrWebm, false);
  }
});

/** An MP4-shaped byte run that carries the named sample entry and configuration box. */
function mp4With(...fourccs) {
  return Buffer.concat([
    Buffer.from('000000246674797069736f6d00000200', 'hex'),
    Buffer.from(`moov....stsd....${fourccs.join('....')}....`, 'latin1'),
  ]);
}

test('codec: an avc1 sample entry with its avcC box is H.264', () => {
  assert.equal(detectVideoCodec(mp4With('avc1', 'avcC')), 'h264');
  assert.equal(detectVideoCodec(mp4With('avc3', 'avcC')), 'h264');
});

test('codec: an avc1 entry without avcC is not proof of H.264', () => {
  assert.equal(detectVideoCodec(mp4With('avc1')), null);
});

test('codec: VP9 and HEVC in an MP4 are named, not mistaken for H.264', () => {
  assert.equal(detectVideoCodec(mp4With('vp09', 'vpcC')), 'vp9');
  assert.equal(detectVideoCodec(mp4With('hvc1', 'hvcC')), 'hevc');
  assert.equal(detectVideoCodec(Buffer.alloc(0)), null);
});

/* -------------------------------------------------------------- encode verdict */

const H264_OUTPUT = { isMp4: true, videoCodec: 'h264', headHex: '000000246674797069736f6d00000200' };

function finishedEncode(overrides = {}) {
  return { ok: true, sourceReachedEnd: true, sourceEndTime: 10, sourceDuration: 10, ...overrides };
}

test('encode: a full-length H.264 MP4 passes', () => {
  assert.deepEqual(judgeTranscode(finishedEncode(), H264_OUTPUT), { pass: true, reasons: [] });
});

test('encode: an encode that stopped before the source ended fails', () => {
  const checks = judgeTranscode(finishedEncode({ sourceReachedEnd: false, sourceEndTime: 4 }), H264_OUTPUT);
  assert.equal(checks.pass, false);
  assert.match(checks.reasons.join(' '), /stopped at 4 seconds, before the source ended at 10 seconds/);
});

test('encode: a WebM renamed to .mp4 fails on the missing ftyp box', () => {
  const webm = { isMp4: false, videoCodec: null, headHex: '1a45dfa39f4286810142f7810142f281' };
  const checks = judgeTranscode(finishedEncode(), webm);
  assert.equal(checks.pass, false);
  assert.match(checks.reasons.join(' '), /no MP4 ftyp signature/);
});

test('encode: an MP4 that carries VP9 fails as not H.264', () => {
  const checks = judgeTranscode(finishedEncode(), { ...H264_OUTPUT, videoCodec: 'vp9' });
  assert.equal(checks.pass, false);
  assert.match(checks.reasons.join(' '), /carried vp9 video, not H\.264/);
});

test('encode: a failed or absent encode never passes', () => {
  assert.deepEqual(judgeTranscode({ ok: false, reason: 'encoder produced zero bytes' }, null), {
    pass: false,
    reasons: ['encoder produced zero bytes'],
  });
  assert.equal(judgeTranscode(null, null).pass, false);
});

/* ------------------------------------------------------------ exclusive outputs */

test('outputs: an existing file is refused and keeps its bytes', async () => {
  await withTempDir(async (dir) => {
    const existing = path.join(dir, 'journey.mp4');
    await writeFile(existing, 'original');
    await assert.rejects(writeExclusive(existing, Buffer.from('replacement')), /refusing to overwrite/);
    assert.equal(await readFile(existing, 'utf8'), 'original');
  });
});

test('outputs: a new path is written in full', async () => {
  await withTempDir(async (dir) => {
    const fresh = path.join(dir, 'frame.png');
    assert.equal(await writeExclusive(fresh, Buffer.from('frame')), fresh);
    assert.equal(await readFile(fresh, 'utf8'), 'frame');
  });
});

test('outputs: a run claims a new directory, and an earlier run directory is refused intact', async () => {
  await withTempDir(async (dir) => {
    const earlier = path.join(dir, 'smoke-earlier');
    await claimNewDirectory(earlier);
    await writeFile(path.join(earlier, 'smoke-interaction.png'), 'earlier evidence');
    await assert.rejects(claimNewDirectory(earlier), /refusing to reuse/);
    assert.deepEqual(await readdir(earlier), ['smoke-interaction.png']);
    assert.equal(await readFile(path.join(earlier, 'smoke-interaction.png'), 'utf8'), 'earlier evidence');
  });
});

test('outputs: of two concurrent claims on one directory, exactly one wins', async () => {
  await withTempDir(async (dir) => {
    const target = path.join(dir, 'nested', 'smoke-run');
    const results = await Promise.allSettled([claimNewDirectory(target), claimNewDirectory(target)]);
    assert.deepEqual(results.map((result) => result.status).sort(), ['fulfilled', 'rejected']);
  });
});

/* ------------------------------------------------------------- media serving */

test('media: a Playwright recording name maps to a fixed alias', () => {
  assert.equal(mediaAlias('source', path.join('C:', 'run', PLAYWRIGHT_WEBM)), 'source.webm');
  assert.equal(mediaAlias('clip', path.join('C:', 'run', 'JOURNEY.MP4')), 'clip.mp4');
  assert.throws(() => mediaAlias('clip', 'journey.mkv'), /not a \.webm or \.mp4 file/);
});

test('media: only registered aliases resolve, never a raw name or a traversal', () => {
  const file = path.join('C:', 'run', PLAYWRIGHT_WEBM);
  const media = new Map([['source.webm', file]]);
  assert.deepEqual(resolveRoute('/media/source.webm', media), { file });
  assert.equal(resolveRoute(`/media/${encodeURIComponent(PLAYWRIGHT_WEBM)}`, media), null);
  assert.equal(resolveRoute('/media/../source.webm', media), null);
  assert.equal(resolveRoute('/media/other.webm', media), null);
  assert.equal(resolveRoute('/harness.html', media).type, 'text/html; charset=utf-8');
});

test('media: the handler serves a page@<hash>.webm recording in full and by range', async () => {
  await withTempDir(async (dir) => {
    const recording = path.join(dir, PLAYWRIGHT_WEBM);
    await writeFile(recording, 'webm-bytes-0123456789');
    const media = new Map([[mediaAlias('source', recording), recording]]);

    const full = await request('/media/source.webm', media);
    assert.equal(full.statusCode, 200);
    assert.equal(full.headers['content-type'], 'video/webm');
    assert.equal(full.body(), 'webm-bytes-0123456789');

    const partial = await request('/media/source.webm', media, { range: 'bytes=5-9' });
    assert.equal(partial.statusCode, 206);
    assert.equal(partial.headers['content-range'], 'bytes 5-9/21');
    assert.equal(partial.body(), 'bytes');
  });
});

test('media: the handler answers 404 for an unregistered file in the same directory', async () => {
  await withTempDir(async (dir) => {
    const recording = path.join(dir, PLAYWRIGHT_WEBM);
    await writeFile(recording, 'webm-bytes');
    await writeFile(path.join(dir, 'private.webm'), 'not registered');
    const media = new Map([['source.webm', recording]]);
    const response = await request('/media/private.webm', media);
    assert.equal(response.statusCode, 404);
    assert.equal(response.body(), 'not found');
  });
});

/* -------------------------------------------------------------- playback gates */

test('gates: the verified passing measurement passes', () => {
  const checks = judgeValidation(passingValidation(), EXPECT_720P);
  assert.deepEqual(checks, { pass: true, reasons: [] });
});

test('gates: a black decoded frame fails and says so', () => {
  const validation = passingValidation();
  validation.frames.blackFrameCount = 3;
  const checks = judgeValidation(validation, EXPECT_720P);
  assert.equal(checks.pass, false);
  assert.match(checks.reasons.join(' '), /3 decoded frames were black/);
});

test('gates: a still recording fails as a slideshow', () => {
  const validation = passingValidation();
  validation.frames.movingFramePairFraction = 0.02;
  const checks = judgeValidation(validation, EXPECT_720P);
  assert.equal(checks.pass, false);
  assert.match(checks.reasons.join(' '), /slideshow/);
});

test('gates: the wrong frame size fails and names both sizes', () => {
  const validation = passingValidation({ videoWidth: 800, videoHeight: 600 });
  const checks = judgeValidation(validation, EXPECT_720P);
  assert.equal(checks.pass, false);
  assert.match(checks.reasons.join(' '), /800x600, expected 1280x720/);
});

test('gates: a duration outside the window fails', () => {
  for (const durationSeconds of [1.2, 400]) {
    const checks = judgeValidation(passingValidation({ durationSeconds }), EXPECT_720P);
    assert.equal(checks.pass, false);
    assert.match(checks.reasons.join(' '), /duration was/);
  }
});

test('gates: an unresolved duration fails rather than passing on a null', () => {
  const checks = judgeValidation(passingValidation({ durationSeconds: null }), EXPECT_720P);
  assert.equal(checks.pass, false);
  assert.match(checks.reasons.join(' '), /duration was null/);
});

test('gates: a product journey passes on one changed frame pair per beat', () => {
  const validation = passingValidation();
  validation.frames.movingFramePairFraction = 0.08;
  validation.frames.movingFramePairs = 12;
  const checks = judgeValidation(validation, { ...EXPECT_720P, minMovingFramePairs: 9 });
  assert.deepEqual(checks, { pass: true, reasons: [] });
});

test('gates: a product journey with fewer changed pairs than beats fails', () => {
  const validation = passingValidation();
  validation.frames.movingFramePairs = 2;
  const checks = judgeValidation(validation, { ...EXPECT_720P, minMovingFramePairs: 9 });
  assert.equal(checks.pass, false);
  assert.match(checks.reasons.join(' '), /only 2 frame pairs changed, expected at least 9/);
});

test('gates: a playback that stopped before the end fails even past the advance floor', () => {
  for (const reachedEnd of [false, undefined]) {
    const validation = passingValidation({
      playback: { currentTimeAdvancedSeconds: 7, reachedEnd, endCurrentTime: 7 },
    });
    const checks = judgeValidation(validation, EXPECT_720P);
    assert.equal(checks.pass, false);
    assert.match(checks.reasons.join(' '), /playback did not reach the end/);
  }
});

test('gates: an MP4 within 1 second of its WebM passes the duration match', () => {
  const checks = judgeValidation(passingValidation({ durationSeconds: 9.941 }), {
    ...EXPECT_720P,
    expectedDurationSeconds: 10,
  });
  assert.deepEqual(checks, { pass: true, reasons: [] });
});

test('gates: an MP4 more than 1 second from its WebM fails the duration match', () => {
  const checks = judgeValidation(passingValidation({ durationSeconds: 8.5 }), {
    ...EXPECT_720P,
    expectedDurationSeconds: 10,
  });
  assert.equal(checks.pass, false);
  assert.match(checks.reasons.join(' '), /expected 10 within 1/);
});

test('gates: a recording that stalls early fails on currentTime advance', () => {
  const validation = passingValidation();
  validation.playback.currentTimeAdvancedSeconds = 1.5;
  const checks = judgeValidation(validation, EXPECT_720P);
  assert.equal(checks.pass, false);
  assert.match(checks.reasons.join(' '), /currentTime advanced only 1\.5 seconds, needed 6/);
});

test('gates: a mostly black frame fails on the non-black fraction', () => {
  const validation = passingValidation();
  validation.frames.sampleMeanNonblackFraction = 0.11;
  const checks = judgeValidation(validation, EXPECT_720P);
  assert.equal(checks.pass, false);
  assert.match(checks.reasons.join(' '), /non-black pixel fraction was 0\.11/);
});

test('gates: several failures are all reported in one call', () => {
  const validation = passingValidation({ videoWidth: 640, videoHeight: 480 });
  validation.frames.blackFrameCount = 1;
  validation.frames.movingFramePairFraction = 0;
  const checks = judgeValidation(validation, EXPECT_720P);
  assert.equal(checks.pass, false);
  assert.equal(checks.reasons.length, 3);
});

test('gates: a validation that did not run never passes', () => {
  assert.equal(judgeValidation(null, EXPECT_720P).pass, false);
  assert.equal(judgeValidation(undefined, EXPECT_720P).pass, false);
  const errored = judgeValidation({ error: 'media error code 4' }, EXPECT_720P);
  assert.equal(errored.pass, false);
  assert.deepEqual(errored.reasons, ['media error code 4']);
});

test('gates: the size check is skipped when no size is expected', () => {
  const checks = judgeValidation(passingValidation({ videoWidth: 640, videoHeight: 360 }), {});
  assert.deepEqual(checks, { pass: true, reasons: [] });
});

test('gates: the defaults accept any duration from 3 seconds to one hour', () => {
  assert.equal(DEFAULT_GATES.minDurationSeconds, 3);
  assert.equal(DEFAULT_GATES.maxDurationSeconds, 3600);
  assert.equal(DEFAULT_GATES.maxBlackFrames, 0);
});

/* ------------------------------------------------------- missing-tool handling */

test('missing tool: the anchor list is ordered, deduplicated, and package.json shaped', () => {
  const anchors = playwrightAnchors({
    from: path.join('C:', 'repo', 'web'),
    env: path.join('C:', 'repo', 'web', 'package.json'),
    cwd: path.join('C:', 'elsewhere'),
    home: path.join('C:', 'elsewhere'),
  });
  assert.deepEqual(anchors, [
    path.join('C:', 'repo', 'web', 'package.json'),
    path.join('C:', 'elsewhere', 'package.json'),
  ]);
});

test('missing tool: an empty anchor set yields no anchors rather than a bad path', () => {
  assert.deepEqual(playwrightAnchors({}), []);
});

test('missing tool: an unresolvable Playwright names the fix and forbids installing it', async () => {
  const source = await readFile(path.join(HERE, 'browser-video.mjs'), 'utf8');
  assert.match(source, /Playwright is not resolvable/);
  assert.match(source, /--playwright-from/);
  assert.match(source, /Do not install it/);
});

/* --------------------------------------------------------------- scope guards */

test('scope: the script has no desktop, window, or audio capture path', async () => {
  const source = await readFile(path.join(HERE, 'browser-video.mjs'), 'utf8');
  for (const forbidden of [
    'getDisplayMedia',
    'getUserMedia',
    'audioBitsPerSecond',
    'desktopCapture',
    '--auto-select-desktop-capture-source',
  ]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} must not appear`);
  }
  assert.match(source, /getAudioTracks\(\)\.length !== 0/);
});

test('scope: the source file is never deleted or renamed by a transcode', async () => {
  const source = await readFile(path.join(HERE, 'browser-video.mjs'), 'utf8');
  assert.match(source, /--out must differ from --in/);
  assert.match(source, /The WebM recording is kept/);
});

test('scope: the only removals are an incomplete reservation and an unwritten frame', async () => {
  const source = await readFile(path.join(HERE, 'browser-video.mjs'), 'utf8');
  const removals = source.match(/fs\.(rm|unlink|rename)\(/g) ?? [];
  assert.equal(removals.length, 2, `expected 2 guarded removals, found ${removals.length}`);
  assert.match(source, /if \(!keepOutput\) await fs\.rm\(output/);
  assert.match(source, /if \(frameReservation && !frameWritten\) await fs\.rm\(framePath/);
});

/* -------------------------------------------------------------- range requests */

test('range: an explicit byte range is clamped to the file size', () => {
  assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=900-5000', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=10-', 1000), { start: 10, end: 999 });
});

test('range: a suffix range reads the tail', () => {
  assert.deepEqual(parseRange('bytes=-200', 1000), { start: 800, end: 999 });
});

test('range: a malformed or out-of-bounds range falls back to the whole file', () => {
  for (const header of [undefined, '', 'bytes=', 'bytes=-', 'items=0-5', 'bytes=500-100', 'bytes=1000-']) {
    assert.equal(parseRange(header, 1000), null);
  }
});

/* ------------------------------------------------------------- argument parsing */

test('arguments: a bare mode parses with no options', () => {
  assert.deepEqual(parseArgs(['probe']), { mode: 'probe', options: {}, flags: new Set() });
});

test('arguments: no mode defaults to route', () => {
  assert.equal(parseArgs([]).mode, 'route');
});

test('arguments: values and valueless flags are kept apart', () => {
  const parsed = parseArgs(['transcode', '--in', 'a.webm', '--no-video', '--out', 'a.mp4']);
  assert.equal(parsed.mode, 'transcode');
  assert.deepEqual(parsed.options, { in: 'a.webm', out: 'a.mp4' });
  assert.equal(parsed.flags.has('no-video'), true);
});
