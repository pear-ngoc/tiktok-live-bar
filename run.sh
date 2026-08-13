#!/usr/bin/env bash
# Khoi dong TicToc Live tu Terminal (macOS/Linux).
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v node >/dev/null 2>&1; then
    exec node launcher/launcher.js "$@"
fi

if [ -x "./runtime/node" ]; then
    exec ./runtime/node launcher/launcher.js "$@"
fi

echo "[LOI] Khong tim thay Node.js." >&2
echo "Hay cai Node.js 20 tro len: https://nodejs.org/" >&2
exit 1
