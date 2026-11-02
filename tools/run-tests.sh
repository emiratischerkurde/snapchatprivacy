#!/bin/bash
# Fuehrt tests/logic.test.js aus - in Chrome headless, ohne Node.js.
#
# Warum dieser Umweg: Der Test ist fuer JavaScriptCore geschrieben (globale
# `load`/`print`). Auf vielen Macs ist das jsc-Binary aber nicht vorhanden,
# und Node ist es oft auch nicht - Chrome dagegen praktisch immer, weil man
# es fuer die Extension ohnehin braucht.
#
# Der Trick: Die Stubs (window/document/getComputedStyle) muessen LOKAL zum
# Testcode bleiben, damit die geladenen content/*.js sie sehen statt der
# echten Browser-Globals. Deshalb laeuft der Test in einer Funktion, und
# jedes `load('x')` wird zu einem DIREKTEN `eval(...)` - direktes eval sieht
# den umgebenden Funktionsscope, indirektes nicht.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

# Ergebnis anhand der Schlusszeile bewerten. Noetig, weil der Test selbst
# keinen Exitcode setzt - ohne diese Pruefung meldet ein Lauf mit
# fehlgeschlagenen Tests faelschlich Erfolg.
bewerten() {
  local ausgabe
  ausgabe="$(cat)"
  printf '%s\n' "$ausgabe"
  case "$ausgabe" in
    *'ALLE TESTS BESTANDEN'*) return 0 ;;
    *) return 1 ;;
  esac
}

# Falls ein jsc da ist: das ist der direktere Weg.
JSC="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"
if [ -x "$JSC" ]; then
  cd "$ROOT"
  ergebnis=0
  "$JSC" tests/logic.test.js | bewerten || ergebnis=$?
  exit "$ergebnis"
fi

if [ ! -x "$CHROME" ]; then
  echo "Weder jsc noch Chrome gefunden. Chrome-Pfad ueber CHROME=... setzen." >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

ROOT="$ROOT" OUT="$WORK/runner.html" python3 - <<'PY'
import json, os, pathlib, re

root = pathlib.Path(os.environ["ROOT"])
sources = ["content/config.js", "content/dom.js", "content/scanner.js", "content/deleter.js"]
src_map = {p: (root / p).read_text(encoding="utf-8") for p in sources}
test_src = (root / "tests/logic.test.js").read_text(encoding="utf-8")

test_src, n = re.subn(
    r"load\(\s*['\"]([^'\"]+)['\"]\s*\)",
    lambda m: "eval(__SRC[%s])" % json.dumps(m.group(1)),
    test_src,
)
missing = [p for p in re.findall(r'__SRC\["([^"]+)"\]', test_src) if p not in src_map]
if missing:
    raise SystemExit(f"Test laedt unbekannte Datei(en): {missing}")
if n != len(sources):
    raise SystemExit(f"{n} load()-Aufrufe ersetzt, erwartet {len(sources)}")

html = """<!doctype html><meta charset="utf-8"><title>SCDC Tests</title><pre id="out"></pre>
<script>
var __SRC = %s;
var __LINES = [];
function __print(s) { __LINES.push(String(s)); }
try {
  new Function('__SRC', 'print', %s)(__SRC, __print);
} catch (e) {
  __print('AUSNAHME: ' + (e && e.stack ? e.stack : e));
}
document.getElementById('out').textContent = __LINES.join('\\n');
</script>
""" % (json.dumps(src_map), json.dumps(test_src))

pathlib.Path(os.environ["OUT"]).write_text(html, encoding="utf-8")
PY

"$CHROME" --headless --disable-gpu --no-sandbox --virtual-time-budget=5000 \
  --dump-dom "file://$WORK/runner.html" 2>/dev/null |
  python3 -c '
import html, re, sys
d = sys.stdin.read()
m = re.search(r"<pre id=\"out\">(.*?)</pre>", d, re.S)
if not m:
    print("Testausgabe nicht gefunden - Chrome lieferte:\n" + d[:2000], file=sys.stderr)
    sys.exit(2)
out = html.unescape(m.group(1))
print(out)
sys.exit(0 if "ALLE TESTS BESTANDEN" in out else 1)
'
