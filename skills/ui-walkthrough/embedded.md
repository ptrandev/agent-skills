# Embedded mode

Owned by this file, read when the invocation carries `--embedded`: the return shape, the fields
the caller must not synthesize, and the contract with each calling skill.

With `--embedded`, post nothing and **return** to the caller:

```
{ blockers: [...], mediums: [...], nits: [...],
  images: [{surface, viewport, state, url}], neutralNotes: [...],
  video: {url, sessionId, viewport, surfaces, surfacesUnreached, beats, jumps, truncated} | null,
  coverage: {surfacesWalked, surfacesTotal, dropped, personas, viewports,
             componentsCovered, componentsTotal, componentsUncovered:[{file, why, lastRung}]},
  markdown: "<ready-to-paste evidence section>" }
```

**`video` is this skill's to produce, not the caller's.** Recording starts *after* the headed
browser exists, is logged in, is sized at 1440×900, and the matrix and detectors have already run,
facts only this skill holds. A caller wrapping its own `record start` around the delegated call
records the wrong window at the wrong size, with the login in frame and the matrix instead of the
journey. `video` is `null` whenever `CAN_VIDEO` was 0, with the reason in `neutralNotes`. The
`markdown` block already embeds the link when there is one.

**`video.viewport` is always `desktop`, and it does not describe the run's coverage.** Read
`coverage.viewports` for that. A caller that renders the video link without the coverage block
implies a desktop-only walkthrough.

**`coverage.componentsUncovered` is normally empty.** A non-empty one means the PR changed a
component that no screenshot shows. The caller reads that as an evidence gap it must close before
claiming the change is covered, never as a completed walkthrough with a caveat.

**`video.surfaces` equals `coverage.surfacesWalked` on every healthy run**, because the journey
covers all of them. `video.surfacesUnreached` is normally empty. A non-empty one means a surface
never rendered. The caller reads that as a defect, never as a shortened video.

- **`/review-pr` Phase 6**: call it instead of hand-rolling a walkthrough. `/review-pr` owns the
  verdict, because it can `APPROVE` and this skill cannot. It merges `blockers` into its own findings, which
  is exactly its documented "live-confirmed defect is the highest-confidence tier" rule. Its
  `stack-lifecycle.md` stays the source of truth that [stack.md](stack.md) reads. On a **local**
  `/review-pr` run this returns a `video`, so its review body must carry `coverage` beside the
  link. Its usual home is a headless routine, where `video` is `null`.
- **`/full-send` Phase 8**: call it in author mode for evidence, replacing the desktop-only
  screenshot pass. It already reads `dev-credentials.md` and already posts a comment. This returns
  a richer, multi-viewport `markdown` block for it.
- **Single writer:** the caller posts. Embedded mode never writes to GitHub, so
  "only-verified-posts" stays enforced in one place.
