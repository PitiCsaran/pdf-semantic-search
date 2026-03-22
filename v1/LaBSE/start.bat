@echo off
echo ============================================
echo  PDF Semantic Search - LaBSE
echo  http://localhost:8081
echo  Press Ctrl+C to stop the server.
echo ============================================
echo.
start "" "http://localhost:8081"
python -m http.server 8081
pause
