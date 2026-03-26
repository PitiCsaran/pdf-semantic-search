@echo off
setlocal
set MODEL=LaBSE
set BASE_URL=https://huggingface.co/Xenova/%MODEL%/resolve/main
set OUT=model\Xenova\%MODEL%

echo ============================================
echo  Downloading model: %MODEL%
echo  This may take ~5-10 minutes depending on
echo  your internet connection (~470 MB total).
echo ============================================
echo.

if not exist "%OUT%\onnx" mkdir "%OUT%\onnx"

echo [1/4] Downloading config.json...
curl -L --progress-bar "%BASE_URL%/config.json" -o "%OUT%\config.json"

echo [2/4] Downloading tokenizer.json...
curl -L --progress-bar "%BASE_URL%/tokenizer.json" -o "%OUT%\tokenizer.json"

echo [3/4] Downloading tokenizer_config.json...
curl -L --progress-bar "%BASE_URL%/tokenizer_config.json" -o "%OUT%\tokenizer_config.json"

echo [4/4] Downloading model (quantized, ~118 MB)...
curl -L --progress-bar "%BASE_URL%/onnx/model_quantized.onnx" -o "%OUT%\onnx\model_quantized.onnx"

echo.
echo ============================================
echo  Download complete! Run start.bat to launch.
echo ============================================
pause
