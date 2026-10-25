#!/usr/bin/env python3
"""Lightweight structural checks for the five READMEs, CHANGELOGs and guides.

Run from the repository root: python3 .github/scripts/check_docs.py
Exits with status 1 and prints every problem found.
"""
import collections
import os
import re
import sys
import unicodedata

LANGS = ["en", "fr", "de", "es", "zh"]
README = {"en": "README.md", "fr": "README.fr.md", "de": "README.de.md", "es": "README.es-ES.md", "zh": "README.zh-CN.md"}
CHANGELOG = {"en": "CHANGELOG.md", "fr": "CHANGELOG.fr.md", "de": "CHANGELOG.de.md", "es": "CHANGELOG.es-ES.md", "zh": "CHANGELOG.zh-CN.md"}
# Projects that must stay credited in every README.
CREDITS = [
    "github.com/louislam/dockge", "github.com/crossly/Dockge-Enhanced", "github.com/hamphh/dockge",
    "github.com/Lorwell/dockge", "github.com/darthrater78/dockge", "github.com/caronc/apprise-api",
    "github.com/amir20/dozzle", "github.com/c0m4r/kula", "github.com/DeepSpace2/PlugNPiN",
    "github.com/Aerya/PowerWatch", "restic.net", "github.com/aquasecurity/trivy", "github.com/nicotsx/zerobyte",
]
ENTRY = re.compile(r"^\*\*(\d{4}-\d{2}-\d{2}) — ")
UNRELEASED = re.compile(r"\b(Unreleased|À paraître|Noch nicht veröffentlicht|Pendiente de publicación)\b|尚未发布")

errors = []


def err(path, msg):
    errors.append(f"{path}: {msg}")


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def slug(heading):
    s = heading.strip().lower()
    s = "".join(c for c in s if c in " -_" or unicodedata.category(c)[0] in "LN")
    return s.replace(" ", "-")


def strip_code(text):
    return re.sub(r"```.*?```", "", text, flags=re.S)


def check_links(path, text):
    base = os.path.dirname(path)
    anchors = {slug(h) for h in re.findall(r"(?m)^#{1,6} (.+)$", strip_code(text))}
    body = strip_code(text)
    targets = re.findall(r"\]\(([^)\s]+)\)", body) + re.findall(r'(?:src|href)="([^"]+)"', body)
    for t in targets:
        if re.match(r"^[a-z]+:", t) or t.startswith("//"):
            continue
        file_part, _, frag = t.partition("#")
        if not file_part:
            if frag and frag not in anchors:
                err(path, f"anchor #{frag} not found")
            continue
        target = os.path.normpath(os.path.join(base, file_part))
        if not os.path.exists(target):
            err(path, f"broken link {t}")


def check_balanced(path, text):
    if text.count("```") % 2:
        err(path, "odd number of ``` fences")
    for tag in ("details", "table", "summary"):
        opened = len(re.findall(rf"<{tag}[\s>]", text))
        closed = text.count(f"</{tag}>")
        if opened != closed:
            err(path, f"<{tag}> opened {opened} times, closed {closed} times")


def section(lines, start):
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines))
    return lines[start:end]


def check_readme(lang):
    path = README[lang]
    text = read(path)
    lines = text.split("\n")
    check_balanced(path, text)
    check_links(path, text)
    for other in LANGS:
        if other != lang and README[other] not in text:
            err(path, f"no link to {README[other]}")
    for credit in CREDITS:
        if credit not in text:
            err(path, f"missing credit {credit}")
    h2 = [i for i, l in enumerate(lines) if l.startswith("## ")]
    if len(h2) < 4:
        err(path, "expected Features, Latest updates and Feature catalogue sections")
        return {}
    latest, catalogue = h2[1], h2[2]
    # Latest updates: a collapsible block whose first sub-heading is a month.
    lat = section(lines, latest)
    if "<details>" not in lat[:4]:
        err(path, "Latest updates must start with a <details> block")
    months = [l for l in lat if l.startswith("### ")]
    if not months:
        err(path, "Latest updates has no month heading")
    # Feature catalogue: only category headings with bullet lists, nothing before the first category.
    cat = section(lines, catalogue)
    first = next((i for i, l in enumerate(cat) if l.startswith("### ")), None)
    if first is None:
        err(path, "Feature catalogue has no category")
        return {}
    stray = [l for l in cat[1:first] if l.strip() and not l.startswith(("<details>", "<summary>", "</summary>"))]
    if stray:
        err(path, f"content before the first catalogue category: {stray[0][:60]}")
    seen = collections.Counter()
    for l in cat[first:]:
        if not l.strip() or l.startswith(("### ", "</details>", "---")):
            continue
        if not l.startswith("- "):
            err(path, f"catalogue line is not a bullet: {l[:60]}")
        else:
            seen[l.strip().lower()] += 1
    for bullet, n in seen.items():
        if n > 1:
            err(path, f"duplicate catalogue bullet: {bullet[:60]}")
    return {
        "h2": len(h2),
        "categories": sum(1 for l in cat if l.startswith("### ")),
        "bullets": sum(seen.values()),
        "months": len(months),
        "screens": len(set(re.findall(r"screens/[\w.-]+", text))),
        "env": len(re.findall(r"(?m)^\| `[A-Z_]+`", text)),
    }


def check_changelog(lang):
    path = CHANGELOG[lang]
    text = read(path)
    check_balanced(path, text)
    check_links(path, text)
    if "\\n" in text:
        err(path, "literal \\n found")
    if UNRELEASED.search(text):
        err(path, "unreleased marker found: list only changes merged into main")
    dates = []
    for i, line in enumerate(text.split("\n"), 1):
        if line.startswith("**") and re.match(r"^\*\*\d", line):
            m = ENTRY.match(line)
            if not m:
                err(path, f"line {i}: entry must start with **YYYY-MM-DD — ")
                continue
            dates.append(m.group(1))
    for i in range(1, len(dates)):
        if dates[i] > dates[i - 1]:
            err(path, f"entry {dates[i]} is placed after {dates[i - 1]}: keep newest first")
    return collections.Counter(dates)


def compare(kind, values):
    ref = values["en"]
    for lang in LANGS[1:]:
        if values[lang] != ref:
            err(kind[lang], f"differs from {kind['en']}: {values[lang]} vs {ref}")


def main():
    os.chdir(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    compare(README, {lang: check_readme(lang) for lang in LANGS})
    counts = {lang: check_changelog(lang) for lang in LANGS}
    for lang in LANGS[1:]:
        diff = {d: (counts[lang][d], counts["en"][d]) for d in set(counts["en"]) | set(counts[lang]) if counts[lang][d] != counts["en"][d]}
        for d, (got, want) in sorted(diff.items(), reverse=True):
            err(CHANGELOG[lang], f"{d}: {got} entries, {CHANGELOG['en']} has {want}")
    for path in sorted(os.listdir("docs")):
        if path.endswith(".md"):
            text = read(os.path.join("docs", path))
            check_balanced(os.path.join("docs", path), text)
            check_links(os.path.join("docs", path), text)
    if errors:
        print("\n".join(errors))
        print(f"\n{len(errors)} documentation problem(s) found.")
        return 1
    print("Documentation checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
