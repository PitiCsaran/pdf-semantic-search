@echo off
echo ============================================================
echo  Downloading Tesseract OCR language data (English + Thai)
echo  This is required for OCR on scanned PDF pages.
echo  Total download: ~11 MB
echo ============================================================
echo.

if not exist tessdata mkdir tessdata

echo Downloading English language data...
powershell -Command "Invoke-WebRequest -Uri 'https://github.com/naptha/tessdata/raw/gh-pages/4.0.0/eng.traineddata.gz' -OutFile 'tessdata\eng.traineddata.gz'"
if errorlevel 1 (
  echo ERROR: Failed to download English language data.
  pause
  exit /b 1
)
powershell -Command "& { Add-Type -AssemblyName System.IO.Compression.FileSystem; $src = [System.IO.File]::OpenRead('tessdata\eng.traineddata.gz'); $dst = [System.IO.File]::Create('tessdata\eng.traineddata'); $gz = New-Object System.IO.Compression.GZipStream($src, [System.IO.Compression.CompressionMode]::Decompress); $gz.CopyTo($dst); $gz.Close(); $dst.Close(); $src.Close() }"
del tessdata\eng.traineddata.gz
echo English data ready.

echo.
echo Downloading Thai language data...
powershell -Command "Invoke-WebRequest -Uri 'https://github.com/naptha/tessdata/raw/gh-pages/4.0.0/tha.traineddata.gz' -OutFile 'tessdata\tha.traineddata.gz'"
if errorlevel 1 (
  echo ERROR: Failed to download Thai language data.
  pause
  exit /b 1
)
powershell -Command "& { Add-Type -AssemblyName System.IO.Compression.FileSystem; $src = [System.IO.File]::OpenRead('tessdata\tha.traineddata.gz'); $dst = [System.IO.File]::Create('tessdata\tha.traineddata'); $gz = New-Object System.IO.Compression.GZipStream($src, [System.IO.Compression.CompressionMode]::Decompress); $gz.CopyTo($dst); $dst.Close(); $src.Close() }"
del tessdata\tha.traineddata.gz
echo Thai data ready.

echo.
echo ============================================================
echo  Done! OCR language data installed in tessdata\
echo  You can now use Generate Excel on scanned PDFs.
echo ============================================================
pause
