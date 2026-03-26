@echo off
echo Starting PDF Semantic Search v2 (port 8082)...
start python -m http.server 8082
timeout /t 1 /nobreak >nul
start http://localhost:8082
