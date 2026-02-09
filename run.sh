#!/bin/bash
# 獵頭爬蟲執行腳本

set -e

PROJECT_DIR="/Users/user/clawd/projects/headhunter"
cd "$PROJECT_DIR"

# 顯示幫助
if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
  echo "獵頭爬蟲使用說明"
  echo ""
  echo "用法："
  echo "  ./run.sh <關鍵字> [地點] [最低薪資]"
  echo ""
  echo "範例："
  echo "  ./run.sh \"AI 工程師\""
  echo "  ./run.sh \"產品經理\" \"台北\""
  echo "  ./run.sh \"數位行銷\" \"台北\" 60000"
  echo ""
  exit 0
fi

# 執行搜尋
echo "🚀 開始執行 104 爬蟲..."
echo ""

node scripts/search_104.js "$@"

echo ""
echo "✅ 完成！檔案已儲存在 data/ 目錄"
echo ""
echo "📂 查看結果："
echo "   ls -lh data/*.csv"
