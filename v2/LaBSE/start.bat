@echo off
echo Starting PDF Semantic Search v2 (port 8083)...
start python -m http.server 8083
timeout /t 1 /nobreak >nul
start http://localhost:8083
