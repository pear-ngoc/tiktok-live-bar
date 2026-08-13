@echo off
setlocal EnableExtensions
chcp 65001 >nul

set "ROOT=%~dp0"
set "PROJECT_DIR=%ROOT%UnityProject"
set "OUTPUT_EXE=%ROOT%Build\Windows\TicToc_Live.exe"
set "LOG_FILE=%ROOT%build_log_windows.txt"
set "PROJECT_VERSION="

for /f "tokens=2 delims=:" %%v in ('findstr /b "m_EditorVersion:" "%PROJECT_DIR%\ProjectSettings\ProjectVersion.txt" 2^>nul') do for /f "tokens=*" %%w in ("%%v") do set "PROJECT_VERSION=%%w"

if not defined PROJECT_VERSION (
    echo [LOI] Khong doc duoc phien ban Unity tu ProjectVersion.txt.
    goto :failed
)

set "UNITY_EXE="
if defined UNITY_PATH if exist "%UNITY_PATH%" set "UNITY_EXE=%UNITY_PATH%"
if not defined UNITY_EXE set "UNITY_EXE=C:\Program Files\Unity\Hub\Editor\%PROJECT_VERSION%\Editor\Unity.exe"
if not exist "%UNITY_EXE%" (
    echo [LOI] Chua cai dung Unity %PROJECT_VERSION%.
    echo Hay cai phien ban nay bang Unity Hub, hoac tro den editor bang bien moi truong:
    echo   set "UNITY_PATH=C:\duong\dan\toi\Unity.exe"
    echo   build.bat
    goto :failed
)

echo =======================================
echo     BUILD TIC TOC LIVE ^(Windows x64^)
echo =======================================
echo Unity: %PROJECT_VERSION%
echo Output: %OUTPUT_EXE%
echo.

"%UNITY_EXE%" -quit -batchmode -projectPath "%PROJECT_DIR%" -executeMethod TikTokLiveGame.Editor.BuildScript.BuildWindows64 -logFile "%LOG_FILE%"
set "BUILD_RESULT=%ERRORLEVEL%"

if not "%BUILD_RESULT%"=="0" (
    echo [LOI] Unity build that bai ^(ma loi %BUILD_RESULT%^).
    echo Xem log: %LOG_FILE%
    goto :failed
)

if not exist "%OUTPUT_EXE%" (
    echo [LOI] Unity khong tao file %OUTPUT_EXE%.
    echo Xem log: %LOG_FILE%
    goto :failed
)

echo.
echo Build thanh cong: %OUTPUT_EXE%
pause
exit /b 0

:failed
echo.
pause
exit /b 1
