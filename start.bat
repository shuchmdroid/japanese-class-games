@echo off
cd /d "%~dp0"
set WC_OPEN=1
echo Starting 単語カードメーカー (Word Card Maker)...
echo (このウィンドウを閉じるとアプリが停止します / Close this window to stop.)
node server.mjs
