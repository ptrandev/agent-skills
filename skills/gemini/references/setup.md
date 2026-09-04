# One-time setup (API-key only)

Run this once per machine.

**1. Get an API key (enable billing for high limits).**
Create a key at https://aistudio.google.com/apikey. Enable billing on the key's
Google Cloud project for pay-as-you-go usage, because the free API tier is
rate-limited.

**2. Tell the CLI to use API-key auth (not OAuth).**

```bash
python3 - <<'PY'
import json, os
p = os.path.expanduser("~/.gemini/settings.json")
d = json.load(open(p)) if os.path.exists(p) else {}
d.setdefault("security", {}).setdefault("auth", {})["selectedType"] = "gemini-api-key"
json.dump(d, open(p, "w"), indent=2)
print("selectedType ->", d["security"]["auth"]["selectedType"])
PY
```

**Optional.** Delete `~/.gemini/oauth_creds.json` after a previous OAuth login,
so the CLI cannot select it by mistake.

**3. Put the key where every shell sees it: `~/.zshenv`, NOT `~/.zshrc`.**
`~/.zshrc` is only sourced for interactive shells. The Bash tool runs
non-interactive shells, which source `~/.zshenv`. Add:

```bash
export GEMINI_API_KEY="your-key-here"
```

Move the export line to `~/.zshenv` when a key is currently exported in
`~/.zshrc`, so there is a single source of truth. Remove any stale
`GEMINI_API_KEY` in a `.env` the CLI auto-loads (`~/.gemini/.env` or a project
`.env`), because an expired key there shadows the good one.

**4. Verify (fresh shell):**

```bash
echo "key set: ${GEMINI_API_KEY:+yes}"   # should print "key set: yes"
gemini -m gemini-pro-latest -p "Reply with exactly one word: OK" < /dev/null
```

A clean `OK` confirms the skill is ready.
