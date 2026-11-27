# -*- coding: utf-8 -*-
# Кадр 2.0: сборка kadr-desktop.zip после npm run build.
# Берёт site/index.html и связанные файлы сайта, добавляет ffmpeg.exe и kadr.bat.
from pathlib import Path
import shutil, subprocess, zipfile

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / 'site'
OUT = ROOT / 'desktop' / 'kadr-desktop.zip'
FFMPEG_FIXED = Path(r'C:\Users\UAQ\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.1-full_build\bin\ffmpeg.exe')

LAUNCHER = r'''@echo off
setlocal
set "APP=%~dp0index.html"
set "URL=file:///%APP:\=/%"
set "BROWSER="
for /f "tokens=2*" %%A in ('reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" /ve 2^>nul') do set "BROWSER=%%B"
if not defined BROWSER for /f "tokens=2*" %%A in ('reg query "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" /ve 2^>nul') do set "BROWSER=%%B"
if not defined BROWSER for /f "tokens=2*" %%A in ('reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" /ve 2^>nul') do set "BROWSER=%%B"
if not defined BROWSER for /f "tokens=2*" %%A in ('reg query "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" /ve 2^>nul') do set "BROWSER=%%B"
if not defined BROWSER for /f "delims=" %%I in ('where chrome.exe 2^>nul') do if not defined BROWSER set "BROWSER=%%I"
if not defined BROWSER for /f "delims=" %%I in ('where msedge.exe 2^>nul') do if not defined BROWSER set "BROWSER=%%I"
if defined BROWSER (start "" "%BROWSER%" --app="%URL%") else (start "" "%APP%")
'''

README_NO_FFMPEG = 'FFmpeg не найден при сборке. Установи его: winget install Gyan.FFmpeg, затем положи ffmpeg.exe рядом с index.html.\n'

def find_ffmpeg():
    if FFMPEG_FIXED.is_file():
        return FFMPEG_FIXED
    found = shutil.which('ffmpeg')
    if found:
        return Path(found)
    try:
        r = subprocess.run(['where', 'ffmpeg'], capture_output=True, text=True)
        for line in r.stdout.splitlines():
            if Path(line.strip()).is_file():
                return Path(line.strip())
    except Exception:
        pass
    return None

def main():
    if not (SITE / 'index.html').is_file():
        raise SystemExit('Нет site/index.html: сначала выполни npm run build')
    ffmpeg = find_ffmpeg()
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for f in sorted(SITE.rglob('*')):
            if f.is_file() and 'desktop' not in f.relative_to(SITE).parts:
                z.write(f, arcname=str(f.relative_to(SITE)))
        z.writestr('kadr.bat', LAUNCHER)
        if ffmpeg:
            z.write(ffmpeg, arcname='ffmpeg.exe')
        else:
            z.writestr('README-ffmpeg.txt', README_NO_FFMPEG)
    print('desktop zip:', OUT, 'ffmpeg:', ffmpeg or 'не найден, положена инструкция')

if __name__ == '__main__':
    main()
