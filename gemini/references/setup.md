# One-time setup (API-key only)

Run this once per machine. After it, both the auth probe and the `gemini` calls
work under Claude Code's non-interactive Bash tool, with no rate caps beyond
your API tier.

**1. Get an API key (enable billing for high limits).**
Create a key at https://aistudio.google.com/apikey. The free API tier is itself
rate-limited; for unlimited-style pay-as-you-go usage, enable billing on the
key's Google Cloud project.

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

If you previously logged in with OAuth, you can also delete
`~/.gemini/oauth_creds.json` so it can't be selected by mistake (optional).

**3. Put the key where every shell sees it: `~/.zshenv`, NOT `~/.zshrc`.**
`~/.zshrc` is only sourced for interactive shells; the Bash tool runs
non-interactive shells, which source `~/.zshenv`. Add:

```bash
export GEMINI_API_KEY="your-key-here"
```

If a key is currently exported in `~/.zshrc`, move that line to `~/.zshenv` so
there's a single source of truth. Also remove any stale `GEMINI_API_KEY` in a
`.env` the CLI auto-loads (`~/.gemini/.env` or a project `.env`). An expired key
there can shadow the good one.

**4. Verify (fresh shell):**

```bash
echo "key set: ${GEMINI_API_KEY:+yes}"   # should print "key set: yes"
gemini -m gemini-pro-latest -p "Reply with exactly one word: OK" < /dev/null
```

A clean `OK` confirms the skill is ready.
