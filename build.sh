#!/usr/bin/env bash
# Build the TicToc Live Unity player on macOS.
# Usage:
#   ./build.sh            # build macOS (Universal) -> Build/macOS/TicToc_Live.app
#   ./build.sh macos      # same as above
#   ./build.sh windows    # build Windows x64    -> Build/Windows/TicToc_Live.exe
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$ROOT/UnityProject"
VERSION_FILE="$PROJECT_DIR/ProjectSettings/ProjectVersion.txt"

TARGET="${1:-macos}"
case "$TARGET" in
    macos|mac|osx)
        TARGET="macos"
        EXECUTE_METHOD="TikTokLiveGame.Editor.BuildScript.BuildMacOS"
        LOG_FILE="$ROOT/build_log_macos.txt"
        EXPECTED_OUTPUT="$ROOT/Build/macOS/TicToc_Live.app"
        ;;
    windows|win|win64)
        TARGET="windows"
        EXECUTE_METHOD="TikTokLiveGame.Editor.BuildScript.BuildWindows64"
        LOG_FILE="$ROOT/build_log_windows.txt"
        EXPECTED_OUTPUT="$ROOT/Build/Windows/TicToc_Live.exe"
        ;;
    *)
        echo "[LOI] Target khong hop le: $TARGET (dung 'macos' hoac 'windows')." >&2
        exit 2
        ;;
esac

if [[ ! -f "$VERSION_FILE" ]]; then
    echo "[LOI] Khong tim thay $VERSION_FILE." >&2
    exit 1
fi

PROJECT_VERSION="$(sed -n 's/^m_EditorVersion:[[:space:]]*//p' "$VERSION_FILE" | head -n 1 | tr -d '\r')"
if [[ -z "$PROJECT_VERSION" ]]; then
    echo "[LOI] Khong doc duoc phien ban Unity tu ProjectVersion.txt." >&2
    exit 1
fi

find_unity() {
    if [[ -n "${UNITY_PATH:-}" && -x "$UNITY_PATH" ]]; then
        printf '%s\n' "$UNITY_PATH"
        return 0
    fi
    local candidates=(
        "/Applications/Unity/Hub/Editor/$PROJECT_VERSION/Unity.app/Contents/MacOS/Unity"
        "$HOME/Applications/Unity/Hub/Editor/$PROJECT_VERSION/Unity.app/Contents/MacOS/Unity"
        "/Applications/Unity/Unity.app/Contents/MacOS/Unity"
    )
    for candidate in "${candidates[@]}"; do
        if [[ -x "$candidate" ]]; then
            printf '%s\n' "$candidate"
            return 0
        fi
    done
    return 1
}

if ! UNITY_BIN="$(find_unity)"; then
    echo "[LOI] Khong tim thay Unity $PROJECT_VERSION." >&2
    echo "Cai phien ban nay bang Unity Hub, hoac tro den editor bang bien moi truong:" >&2
    echo "  UNITY_PATH=\"/duong/dan/toi/Unity\" ./build.sh $TARGET" >&2
    exit 1
fi

echo "======================================="
echo "    BUILD TIC TOC LIVE ($TARGET)"
echo "======================================="
echo "Unity:  $PROJECT_VERSION"
echo "Editor: $UNITY_BIN"
echo "Log:    $LOG_FILE"
echo

if ! "$UNITY_BIN" \
    -quit -batchmode \
    -projectPath "$PROJECT_DIR" \
    -executeMethod "$EXECUTE_METHOD" \
    -logFile "$LOG_FILE"; then
    echo "[LOI] Unity build that bai. Xem log: $LOG_FILE" >&2
    tail -n 40 "$LOG_FILE" >&2 || true
    exit 1
fi

if [[ ! -e "$EXPECTED_OUTPUT" ]]; then
    echo "[LOI] Unity ket thuc nhung khong tao ra $EXPECTED_OUTPUT." >&2
    echo "Xem log: $LOG_FILE" >&2
    exit 1
fi

echo
echo "Build thanh cong: $EXPECTED_OUTPUT"
if [[ "$TARGET" == "macos" ]]; then
    BINARY="$EXPECTED_OUTPUT/Contents/MacOS/TicToc_Live"
    if [[ -x "$BINARY" ]] && command -v lipo >/dev/null 2>&1; then
        echo "Kien truc: $(lipo -info "$BINARY" 2>/dev/null || file "$BINARY")"
    fi
fi
