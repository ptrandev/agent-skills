#!/usr/bin/env python3
"""Check a plain-english rewrite against the STE-derived style rules.

Usage:
    check.py <file>            # check a rewrite saved to a file
    check.py -                 # read the rewrite from stdin
    check.py <file> --no-format  # skip the "**TL;DR:**" first-line check

Word lists come from ../references/word-swaps.md, which is the single source of
truth. Findings are graded:

    ERROR  sentence over the length limit, or a broken output contract
    WARN   filler or a word with a shorter plain replacement
    CHECK  a heuristic guess worth a human look (passive, -ing, noun cluster)

Exit code is 1 if any ERROR or WARN is found, else 0. The checker is a helper,
not an authority: never break fidelity to a claim in order to silence it.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

MAX_DESCRIPTIVE_WORDS = 25
MAX_INSTRUCTION_WORDS = 20
MAX_TLDR_WORDS = 25
MAX_PARAGRAPH_SENTENCES = 6
MAX_NOUN_CLUSTER = 3

SWAPS_FILE = Path(__file__).resolve().parent.parent / "references" / "word-swaps.md"

BE_FORMS = {"is", "are", "was", "were", "be", "been", "being", "am"}
IRREGULAR_PARTICIPLES = {
    "made", "done", "given", "taken", "seen", "known", "shown", "held", "kept",
    "sent", "built", "found", "told", "written", "read", "set", "put", "run",
    "brought", "bought", "sold", "paid", "left", "lost", "met", "won", "chosen",
}
CLUSTER_STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "if", "of", "to", "in", "on", "for",
    "with", "from", "by", "at", "as", "that", "this", "these", "those", "it",
    "its", "we", "you", "they", "he", "she", "not", "no", "may", "will", "can",
    "must", "should", "is", "are", "was", "were", "be", "been", "has", "have",
    "had", "do", "does", "did", "than", "then", "when", "while", "after",
    "before", "because", "so", "only", "all", "any", "each", "more", "most",
}
DETERMINERS = {"the", "a", "an", "this", "these", "those", "its", "our", "your", "their"}
ING_TRIGGERS = {"the", "of", "for", "after", "before", "by", "without", "during"}
SENTENCE_SPLIT = re.compile(r"(?<=[.!?])[\"')\]]*\s+")
IMPERATIVE_HINT = re.compile(
    r"^(use|do|open|close|press|click|select|set|check|run|stop|start|remove|add"
    r"|install|enter|type|call|send|read|write|keep|make|go|turn|wait|see)\b",
    re.IGNORECASE,
)


def load_word_lists() -> tuple[list[tuple[str, str]], list[str]]:
    """Return (swaps, filler) parsed from references/word-swaps.md."""
    if not SWAPS_FILE.exists():
        sys.exit(f"missing word list: {SWAPS_FILE}")
    swaps: list[tuple[str, str]] = []
    filler: list[str] = []
    section = ""
    for line in SWAPS_FILE.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            section = line[3:].strip().lower()
            continue
        if not line.startswith("- "):
            continue
        item = line[2:].strip()
        if section == "swaps" and " -> " in item:
            bad, good = item.split(" -> ", 1)
            swaps.append((bad.strip(), good.strip()))
        elif section == "filler":
            filler.append(item)
    return swaps, filler


def sentences(text: str) -> list[str]:
    out: list[str] = []
    for block in text.split("\n"):
        stripped = re.sub(r"^\s*(?:[-*+]|\d+[.)])\s+", "", block).strip()
        if not stripped:
            continue
        for piece in SENTENCE_SPLIT.split(stripped):
            piece = piece.strip()
            if piece:
                out.append(piece)
    return out


def word_count(sentence: str) -> int:
    return len(re.findall(r"[A-Za-z0-9][A-Za-z0-9'’\-/%$]*", sentence))


def check_format(text: str, findings: list[tuple[str, str]]) -> None:
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        findings.append(("ERROR", "output is empty"))
        return
    first = lines[0].strip()
    if not first.startswith("**TL;DR:**"):
        findings.append(("ERROR", f'first line must start with "**TL;DR:**", got: {first[:60]!r}'))
        return
    tldr = first[len("**TL;DR:**"):].strip()
    if not tldr:
        findings.append(("ERROR", "TL;DR line has no content"))
        return
    n = word_count(tldr)
    if n > MAX_TLDR_WORDS:
        findings.append(("ERROR", f"TL;DR is {n} words, limit is {MAX_TLDR_WORDS}"))
    if len(sentences(tldr)) > 1:
        findings.append(("ERROR", "TL;DR must be one sentence"))


def check_sentences(text: str, findings: list[tuple[str, str]]) -> None:
    for sentence in sentences(text):
        if sentence.startswith("**TL;DR:**"):
            continue
        n = word_count(sentence)
        preview = sentence if len(sentence) <= 70 else sentence[:67] + "..."
        if n > MAX_DESCRIPTIVE_WORDS:
            findings.append(("ERROR", f"{n} words (limit {MAX_DESCRIPTIVE_WORDS}): {preview}"))
        elif n > MAX_INSTRUCTION_WORDS and IMPERATIVE_HINT.match(sentence):
            findings.append(
                ("ERROR", f"instruction is {n} words (limit {MAX_INSTRUCTION_WORDS}): {preview}")
            )


def check_paragraphs(text: str, findings: list[tuple[str, str]]) -> None:
    for para in re.split(r"\n\s*\n", text):
        # List items are one idea each, so they do not count toward the limit.
        prose = "\n".join(
            ln for ln in para.splitlines()
            if not re.match(r"^\s*(?:[-*+]|\d+[.)])\s+", ln)
        )
        n = len(sentences(prose))
        if n > MAX_PARAGRAPH_SENTENCES:
            head = prose.strip()[:50].replace("\n", " ")
            findings.append(
                ("CHECK", f"paragraph has {n} sentences (limit {MAX_PARAGRAPH_SENTENCES}): {head}...")
            )


def check_words(
    text: str,
    swaps: list[tuple[str, str]],
    filler: list[str],
    findings: list[tuple[str, str]],
) -> None:
    lowered = text.lower()
    for phrase in filler:
        if re.search(rf"(?<![\w-]){re.escape(phrase.lower())}(?![\w-])", lowered):
            findings.append(("WARN", f'filler: "{phrase}" — delete it'))
    for bad, good in swaps:
        if re.search(rf"(?<![\w-]){re.escape(bad.lower())}(?![\w-])", lowered):
            findings.append(("WARN", f'"{bad}" -> {good}'))


def check_heuristics(text: str, findings: list[tuple[str, str]]) -> None:
    for sentence in sentences(text):
        words = re.findall(r"[A-Za-z’'\-]+", sentence)
        lower = [w.lower() for w in words]
        for i, word in enumerate(lower[:-1]):
            nxt = lower[i + 1]
            if word in BE_FORMS and (nxt.endswith("ed") or nxt in IRREGULAR_PARTICIPLES):
                findings.append(("CHECK", f'possible passive: "{word} {nxt}" — name the actor'))
            if word in ING_TRIGGERS and nxt.endswith("ing") and len(nxt) > 5:
                findings.append(("CHECK", f'"-ing" as a noun: "{word} {nxt}" — use a simple verb'))
        # A noun cluster is a run of modifiers between a determiner and its head
        # noun, so only start counting after a determiner and reset on anything
        # that cannot be part of the cluster.
        run = -1
        for token in re.findall(r"[A-Za-z’'\-]+|[,.;:()]", sentence.lower()):
            if token in DETERMINERS:
                run = 0
            elif run < 0:
                continue
            elif not token.isalpha() or token in CLUSTER_STOPWORDS or token.endswith("ly"):
                run = -1
            else:
                run += 1
                if run == MAX_NOUN_CLUSTER + 1:
                    findings.append(
                        ("CHECK", f"possible noun cluster over {MAX_NOUN_CLUSTER} words: {sentence[:60]}")
                    )
                    break


def main(argv: list[str]) -> int:
    args = [a for a in argv[1:] if not a.startswith("--")]
    flags = {a for a in argv[1:] if a.startswith("--")}
    if len(args) != 1:
        print(__doc__)
        return 2
    text = sys.stdin.read() if args[0] == "-" else Path(args[0]).read_text(encoding="utf-8")

    swaps, filler = load_word_lists()
    findings: list[tuple[str, str]] = []
    if "--no-format" not in flags:
        check_format(text, findings)
    check_sentences(text, findings)
    check_paragraphs(text, findings)
    check_words(text, swaps, filler, findings)
    check_heuristics(text, findings)

    order = {"ERROR": 0, "WARN": 1, "CHECK": 2}
    findings.sort(key=lambda f: order[f[0]])
    seen: set[tuple[str, str]] = set()
    blocking = 0
    for level, message in findings:
        if (level, message) in seen:
            continue
        seen.add((level, message))
        print(f"{level}: {message}")
        if level in ("ERROR", "WARN"):
            blocking += 1
    if not seen:
        print("clean")
    return 1 if blocking else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
