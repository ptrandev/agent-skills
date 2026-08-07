#!/usr/bin/env python3
"""Persist lastSync = now for this repo, arming the 24h cooldown.

Usage: cursor.py <owner/repo of the CURRENT repo, may be empty>
Reads  /tmp/phillip_sync_plan.json for the slug the run planned against.
Writes ~/.claude/skills/phillip/.sync-state.json
"""
import json, os, sys, datetime

cur = sys.argv[1] if len(sys.argv) > 1 else ""
try: plan = json.load(open("/tmp/phillip_sync_plan.json"))
except Exception: plan = {}
slug = plan.get("slug")
if not slug: raise SystemExit(0)
if cur and cur != slug:   # concurrency guard: plan belongs to another repo -> don't touch its cursor
    print("phillip-sync: cursor skip (state for", slug, "but repo is", cur + ")"); raise SystemExit(0)
p = os.path.expanduser("~/.claude/skills/phillip/.sync-state.json")
state = {}
if os.path.exists(p):
    try: state = json.load(open(p))
    except Exception: state = {}
state.setdefault(slug, {})["lastSync"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")  # preserve any sibling keys
os.makedirs(os.path.dirname(p), exist_ok=True)
# Atomic write (temp + os.replace): an interrupted or concurrent cross-repo write can't
# truncate/corrupt the cursor JSON; the replace is atomic on the same filesystem.
_tmp = p + ".tmp"
json.dump(state, open(_tmp, "w"), indent=2)
os.replace(_tmp, p)
print("phillip-sync: cursor updated ->", slug, state[slug]["lastSync"])
