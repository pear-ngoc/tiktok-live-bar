# Build và phát hành desktop

Tài liệu này mô tả luồng build có thể lặp lại cho Windows x64 và macOS Universal,
cách launcher hoạt động, cùng các bước xác minh trước khi tạo GitHub Release.

## Ma trận nền tảng

| Nền tảng | Unity target | Output | Provider mặc định |
|---|---|---|---|
| Windows 10/11 x64 | `StandaloneWindows64` | `Build/Windows/TicToc_Live.exe` | `tikfinity` |
| macOS Apple Silicon + Intel | `StandaloneOSX` Universal | `Build/macOS/TicToc_Live.app` | `tiktok` |

Dùng đúng Unity ghi trong `UnityProject/ProjectSettings/ProjectVersion.txt` và cài
build support module cho target cần tạo. Build macOS phải chạy trên máy Mac khi
build cục bộ; CI dùng `game-ci/unity-builder` với license Unity trong repository secrets.

## Build cục bộ

Windows PowerShell hoặc Command Prompt:

```bat
build.bat
```

macOS Terminal:

```bash
./build.sh macos
```

`build.sh windows` cũng hỗ trợ Windows cross-target nếu Unity Editor trên máy có
module tương ứng. Nếu Unity không ở vị trí mặc định, đặt `UNITY_PATH` trỏ thẳng
tới executable của Editor trước khi chạy script.

Build script luôn xóa output cũ của đúng target, dùng Mono, stripping mức Low,
LZ4HC và dừng với exit code khác 0 khi Unity không tạo đủ output mong đợi.

## Xác minh output Unity

```bash
node scripts/verify-build.js windows
node scripts/verify-build.js macos
```

Verifier Windows kiểm tra EXE, thư mục `_Data`, `UnityPlayer.dll` và runtime
`MonoBleedingEdge`. Verifier macOS kiểm tra bundle, executable bit, Mach-O và đủ
hai kiến trúc `arm64` + `x86_64`.

## Tạo gói phân phối

Cài dependency theo lockfile trước; package chứa `node_modules` để người dùng
release không cần tải dependency ở lần chạy đầu:

```bash
cd TikTokBridge
npm ci
cd ..

node scripts/package-windows.js --version vX.Y.Z
node scripts/package-macos.js --version vX.Y.Z
```

Thêm `--skip-zip` để chỉ tạo cây thư mục trong `dist/`. Thêm
`--with-node auto` để nhúng Node của máy build; trong release chính thức nên trỏ
`--with-node` tới runtime đúng OS/architecture của artifact.

Package loại trừ `.env`, `.env.local`, `logs` và `.DS_Store`; vẫn giữ các file
`.env.example`. Không đưa credential hoặc cấu hình cá nhân vào ZIP.

## Launcher runtime

Ba entry point `run.bat`, `run.command` và `run.sh` cùng gọi
`launcher/launcher.js`. Launcher thực hiện theo thứ tự:

1. Kiểm tra Node.js 20+ và cấu trúc package.
2. Đọc `.env`, kiểm tra `/api/health`, và tái sử dụng đúng Bridge của dự án nếu đã chạy.
3. Nếu cổng bị một dịch vụ khác chiếm, dừng an toàn và không kill process ngoài.
4. Cài dependency khi thiếu, khởi động Bridge, chờ health check tối đa 30 giây.
5. Mở Control Panel và game, truyền `--bridge-url` cho game khi dùng host/port tùy chỉnh.

Log chẩn đoán nằm ở `logs/launcher.log` và `logs/bridge.log`. Launcher chỉ dừng
Bridge do chính nó tạo. Các tùy chọn hữu ích:

```bash
./run.sh --no-game
./run.sh --no-browser
node launcher/launcher.js --help
```

## Kiểm thử trước release

```bash
cd TikTokBridge
npm test
```

Security smoke cần một Bridge đang chạy:

```bash
# Terminal 1
cd TikTokBridge && npm start

# Terminal 2
cd TikTokBridge && npm run security:smoke
```

Ngoài ra kiểm tra syntax launcher POSIX:

```bash
bash -n build.sh run.sh
zsh -n run.command
```

CI tại `.github/workflows/build.yml` chạy test Bridge, security smoke, build và
verify cả hai target, package artifact, rồi phát hành khi push tag `v*`. Job macOS
chỉ ký/notarize khi toàn bộ Apple secrets đã cấu hình; nếu thiếu, artifact macOS
được phát hành unsigned và người dùng phải mở qua Gatekeeper theo hướng dẫn.

## Checklist release

- `npm test` và `npm run security:smoke` đều xanh.
- Cả hai lệnh `verify-build.js` đều xanh trên output mới.
- ZIP không chứa `.env`, log, credential hoặc asset cá nhân ngoài phạm vi phát hành.
- Thử launcher từ thư mục giải nén sạch trên từng OS.
- Kiểm tra Control Panel báo đúng provider và game đọc được `DJ_MUSIC`, `DJ_VIDEO`, `LiveAssets`.
- Với bản ký macOS, chạy thêm `codesign --verify`, notarization và stapling trước khi upload.
