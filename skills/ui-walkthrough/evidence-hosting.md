# Publishing screenshots so a teammate's browser can load them

Phase 7 selects the repository-approved evidence destination before it uploads a file.

## PointsGPT: Linear comments

When `$OWNER/$NAME` is `Atllas-Inc/pointsgpt`, read the checkout's `AGENTS.md` Evidence section.
It owns the allowed destinations. **Never create or push an evidence Git ref for PointsGPT.**

Upload screenshots with Linear's `fileUpload` flow. Do not call `attachmentCreate` for a new
screenshot. Group related screenshots in contextual issue comments instead of the Resources list.
Each comment must state what the group proves. Put a visible caption before each Markdown image.
Start each caption with before, after, or mockup. Then name the environment, viewport, and theme.
Use this shape:

```markdown
**After | local fixture preview | 390 px | dark**
![Account screen after the change](https://uploads.linear.app/...)
```

Include the walkthrough marker from Phase 2 in the Linear comment. On a rerun, query the related
issue comments for that marker before uploading. Apply the same skip rules as Phase 2.

After each comment mutation, read the comment back and compare its body with the intended Markdown.
Open every embedded asset URL and verify the returned image bytes. Keep upload receipts so a rerun
reuses an asset with the same path and SHA-256 hash.

During migration, remove only a redundant screenshot Resource link after the comment readback and
all image checks pass. Never delete the uploaded asset. Never delete another person's comment.
Preserve unrelated Resources and discussion. Markdown and report files can remain Resources.

OpenCap remains the only video host. Put its share link in the contextual Linear comment. Stop here
for PointsGPT. The GitHub route below does not apply.

## GitHub comments

For other repositories, `gh` cannot upload an image. The screenshots need a URL that renders inside
a GitHub comment on a **private** repo. **Verified experimentally (2026-07-30, private repo, spike
PR):**

| Path | Renders for a viewer? | Notes |
|---|---|---|
| `github.com/<o>/<r>/raw/<sha>/<p>` | **yes** | PRIMARY. Authorized by the viewer's github.com session cookie. Confirmed to render even when the commit is reachable **only from a custom ref**, with no branch pointing at it. |
| `github.com/<o>/<r>/blob/<sha>/<p>?raw=true` | yes | equivalent; no advantage. |
| `raw.githubusercontent.com/...` | **no** | needs an `Authorization: token` header a browser never sends, so it 404s on private repos. |
| any external host | **no** | GitHub camo-proxies it; camo is unauthenticated, so it 404s. |

GitHub does **not** camo-rewrite `github.com`-hosted URLs (confirmed by reading `body_html` back:
the `<img src>` came through verbatim), which is what makes this work at all.

**To read `body_html` back you MUST send the HTML media type.** It is absent from the default JSON
representation, so `gh api <comment> --jq '.body_html'` returns an **empty string**, which looks
exactly like "the images were stripped" and invites a panicked re-post:

```bash
gh api -H "Accept: application/vnd.github.full+json" \
  "repos/$OWNER/$NAME/issues/comments/$ID" --jq '.body_html' > body.html
grep -c 'camo.githubusercontent' body.html          # expect 0
grep -o 'src="[^"]*"' body.html | head              # expect your raw/<commit>/ URLs, verbatim
```

**The assets must live in the PR's own repo.** It is the viewer's read access to *that* repo that
authorizes the image, so a separate assets repo, even one you own, 404s for everyone else.

Push them to a **detached custom ref**, not a branch: invisible in the branch list, outside branch
protection, never in the PR diff, and not fetched by a default `git fetch` (so nobody's clone grows).

**One ref per PR head, flat namespace**: `refs/ui-walkthrough/pr-<n>-<head-sha>`. Each run's ref is
independent, so older heads' screenshots stay reachable without chaining anything.

Two rules here are load-bearing, both learned by testing:

- **Flat, hyphenated, never `pr-<n>/<sha>`.** A nested form collides with any existing
  `refs/ui-walkthrough/pr-<n>` ref as a git **directory/file conflict**, and the push is rejected.
- **No parent commit.** An earlier design parented each run on the previous ref value to keep old
  images reachable. A per-head ref achieves that with no parent, no `read-tree` of a remote object,
  and one less failure mode.

`GIT_INDEX_FILE` keeps the user's real index and working tree untouched, which invariant 9 requires
because this can run against a dirty clone.

```bash
ASSET_REF="refs/ui-walkthrough/pr-$PR-$HEAD_SHA"
export GIT_INDEX_FILE="$SCRATCH/idx-$NAME-$PR"; rm -f "$GIT_INDEX_FILE"
git -C "$WORKDIR" read-tree --empty
for f in "$SHOTS"/*.png; do
  BLOB=$(git -C "$WORKDIR" hash-object -w "$f") || { echo "hash-object failed"; break; }
  git -C "$WORKDIR" update-index --add --cacheinfo "100644,$BLOB,$(basename "$f")"
done
TREE=$(git -C "$WORKDIR" write-tree)
COMMIT=$(git -C "$WORKDIR" commit-tree "$TREE" -m "ui-walkthrough evidence: PR #$PR @ $HEAD_SHA")
unset GIT_INDEX_FILE

# Rung 1: clean detached ref.
if git -C "$WORKDIR" push origin "$COMMIT:$ASSET_REF"; then
  PUBLISHED=1
else
  # Rung 2: see the ladder below.
  ASSET_BRANCH="refs/heads/claude/ui-walkthrough-pr-$PR-$HEAD_SHA"   # flat leaf → no dir/file conflict
  git -C "$WORKDIR" push origin "$COMMIT:$ASSET_BRANCH" && PUBLISHED=1 \
    || { echo "PUBLISH FAILED"; PUBLISHED=0; }   # → ladder rung 3
fi
echo "https://github.com/$OWNER/$NAME/raw/$COMMIT/01-agents-desktop.png"  # ref-agnostic, keyed on $COMMIT
```

**Check the push's exit status explicitly. Never grep its output, never test the URL.** A rejected
push still transfers its objects, so the blob *is* fetchable by SHA while the ref was never created.
Both a `raw.githubusercontent` fetch (200, exact byte count) and an output grep for `->` reported
success against a push that had actually been rejected. Only the exit code told the truth.

Verify after publishing: `git ls-remote origin "$ASSET_REF"` returns the commit.

## Fallback ladder (degrade, never block)

1. Detached-ref push succeeds -> inline embeds. Primary. Works locally and off-proxy (invisible ref,
   not fetched by default, so **no clone growth**).
2. **Detached-ref push rejected** (cloud git proxies allowlist only `refs/heads/*` and 403 a custom
   ref at the transport, verified 2026-07-30) -> retry as a `claude/`-prefixed **branch**
   (`refs/heads/claude/ui-walkthrough-pr-<n>-<sha>`), which the proxy allows. Same commit, same embed
   URL. TRADE-OFF: a real branch *is* fetched by default clones, so it adds modest, permanent,
   shared clone growth, the accepted price of autonomous inline embedding on a private repo. CI is
   unaffected here (agents-portal workflows filter push to `master`/`proj-**` + code paths).
3. **No push access at all** (read-only, or a fork PR whose base you cannot push) -> post the findings
   with **no inline images**, note the local artifact directory, and say plainly that attaching images
   was not possible. Findings still land.
4. Local + author mode only, optional: drive a real browser to attach images to the comment box with
   your logged-in session. Produces native `user-attachments` URLs but needs cookies, so it cannot run
   in a routine. Never the default.

## Pruning

`refs/ui-walkthrough/*` is not fetched by default so clones stay lean, but the server-side repo does
grow. Prune closed PRs' refs periodically: `git ls-remote origin 'refs/ui-walkthrough/*'` then
`git push origin --delete <ref>`. Deleting a ref breaks the images in that PR's older comments, so
only prune closed or merged PRs.
