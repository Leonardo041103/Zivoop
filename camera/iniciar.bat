@echo off
chcp 65001 >nul
title Zivoop Camera
cd /d "%~dp0"
where python >nul 2>nul || (echo Instale o Python 3.11 em python.org e marque "Add python.exe to PATH". & pause & exit /b 1)
if not exist .venv (
  echo Preparando na primeira vez, leva alguns minutos...
  python -m venv .venv
  .venv\Scripts\python -m pip install --upgrade pip
  .venv\Scripts\pip install -r requirements.txt
)
:loop
.venv\Scripts\python zivoop_camera.py
echo O programa parou. Reiniciando em 10 segundos...
timeout /t 10 >nul
goto loop
