#!/usr/bin/env python3
"""Cooldown + SINCE window for phillip-sync.

Usage: plan.py <owner/repo>
Reads  ~/.claude/skills/phillip/.sync-state.json
Writes /tmp/phillip_sync_plan.json  {slug, cooldown, lastHuman, since}

SINCE = max(cursor.lastSync, now-30d); cold start (no cursor) -> now-30d.
The slug is written into the plan file too, so step 7 can read it back.
"""
import json, os, sys, datetime

slug = sys.argv[1] if len(sys.argv) > 1 else ""
if not slug:
    print("phillip-sync: no slug -> skipping"); raise SystemExit(0)
p = os.path.expanduser("~/.claude/skills/phillip/.sync-state.json")
now = datetime.datetime.now(datetime.timezone.utc)
state = {}
if os.path.exists(p):
    try: state = json.load(open(p))
    except Exception: state = {}
last = (state.get(slug) or {}).get("lastSync")
cooldown = False
floor = now - datetime.timedelta(days=30)
since = floor
if last:
    try:
        lt = datetime.datetime.fromisoformat(last.replace("Z", "+00:00"))
        if (now - lt).total_seconds() < 24 * 3600:
            cooldown = True
        since = max(lt, floor)
    except Exception:
        pass
out = {
    "slug": slug,
    "cooldown": cooldown,
    "lastHuman": last or "never",
    "since": since.strftime("%Y-%m-%dT%H:%M:%SZ"),
}
json.dump(out, open("/tmp/phillip_sync_plan.json", "w"))
print("cooldown" if cooldown else "go", "| since", out["since"], "| last", out["lastHuman"])
