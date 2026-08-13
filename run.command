#!/bin/bash
# Khoi dong TicToc Live tren macOS: Bridge + Game + Control Panel.
# Nhan doi (double-click) file nay, hoac chay trong Terminal: ./run.command

cd "$(dirname "$0")" || exit 1

echo "======================================="
echo "    KHOI DONG TIC TOC LIVE"
echo "======================================="
echo

if command -v node >/dev/null 2>&1; then
    exec node launcher/launcher.js "$@"
fi

if [ -x "./runtime/node" ]; then
    exec ./runtime/node launcher/launcher.js "$@"
fi

echo "[LOI] Khong tim thay Node.js."
echo "Hay cai Node.js 20 tro len: https://nodejs.org/"
echo
echo "Nhan Enter de dong cua so nay..."
read -r
exit 1
