#!/bin/bash
# 獵頭系統啟動腳本 v2.0
# 用法: ./run.sh "關鍵字" "地點" [最低薪資] [最大筆數]
# 範例: ./run.sh "AI 工程師" "台北" 50000 20

cd "$(dirname "$0")"

# 預設值
KEYWORD="${1:-AI 工程師}"
LOCATION="${2:-}"
MIN_SALARY="${3:-0}"
MAX_RESULTS="${4:-20}"

echo "🦞 啟動獵頭系統..."
echo "   關鍵字: $KEYWORD"
echo "   地點: ${LOCATION:-不限}"
echo "   最低薪資: ${MIN_SALARY:-不限}"
echo "   最大筆數: $MAX_RESULTS"
echo ""

node scripts/main.js "$KEYWORD" "$LOCATION" "$MIN_SALARY" "$MAX_RESULTS"
