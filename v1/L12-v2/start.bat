@echo off
echo ============================================
echo  PDF Semantic Search - multilingual-MiniLM
echo  http://localhost:8080
echo  Press Ctrl+C to stop the server.
echo ============================================
echo.
start "" "http://localhost:8080"
python -m http.server 8080
pause
