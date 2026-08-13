@echo off
setlocal EnableExtensions
chcp 65001 >nul

set "ROOT=%~dp0"
set "LAUNCHER=%ROOT%launcher\launcher.js"

echo =======================================
echo     KHOI DONG TIC TOC LIVE
echo =======================================
echo.

if not exist "%LAUNCHER%" (
    echo [LOI] Khong tim thay launcher\launcher.js.
    echo Hay giai nen lai goi release hoac clone lai repository.
    goto :failed
)

where node >nul 2>&1
if errorlevel 1 (
    if exist "%ROOT%runtime\node.exe" (
        "%ROOT%runtime\node.exe" "%LAUNCHER%" %*
        goto :finished
    )
    echo [LOI] Khong tim thay Node.js.
    echo Hay cai Node.js 20 tro len: https://nodejs.org/
    goto :failed
)

node "%LAUNCHER%" %*
goto :finished

:finished
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" goto :failed
exit /b 0

:failed
echo.
pause
exit /b 1
