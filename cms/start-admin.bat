@echo off
rem Local admin: http://127.0.0.1:8000/admin/  (close this window to stop it)
cd /d "%~dp0"
set DJANGO_LOCAL=1
if exist ".venv\site" set PYTHONPATH=%~dp0.venv\site
rem «Опубликовать» needs Node.js to rebuild the pages. Without a system Node, an Electron app can stand in for it.
where node >nul 2>nul
if errorlevel 1 if not defined SITE_NODE_BINARY if exist "%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe" set SITE_NODE_BINARY=%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe
if exist ".venv\Scripts\python.exe" (set PY=.venv\Scripts\python.exe) else (set PY=python)
%PY% manage.py migrate --no-input
if errorlevel 1 goto failed
%PY% manage.py sync_page_texts
if errorlevel 1 goto failed
start "" http://127.0.0.1:8000/admin/
%PY% manage.py runserver 127.0.0.1:8000
goto end
:failed
echo Failed to prepare the admin. See the error above.
:end
pause
