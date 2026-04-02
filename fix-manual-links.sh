#!/usr/bin/env bash
set -euo pipefail

FILE="docs/guide/manual.md"

if [ ! -f "$FILE" ]; then
  echo "Missing $FILE" >&2
  exit 1
fi

echo "Before:"
grep -nE '\((\./)?(global|index)(\.md)?\)' "$FILE" || true

python3 - <<'PY'
from pathlib import Path
import re

p = Path("docs/guide/manual.md")
s = p.read_text(encoding="utf-8")

# Fix markdown links with optional leading "./" and optional ".md"
s = re.sub(r'\((?:\./)?global(?:\.md)?\)', '(../api/index)', s)
s = re.sub(r'\((?:\./)?index(?:\.md)?\)', '(/)', s)

# Also catch quoted href-style markdown/html fragments if present
s = re.sub(r'href=["\'](?:\./)?global(?:\.md)?["\']', 'href="../api/index"', s)
s = re.sub(r'href=["\'](?:\./)?index(?:\.md)?["\']', 'href="/"', s)

p.write_text(s, encoding="utf-8")
print(f"Updated {p}")
PY

echo
echo "After:"
grep -nE '\((\./)?(global|index)(\.md)?\)' "$FILE" || true
