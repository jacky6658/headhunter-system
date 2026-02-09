# 測試指南

## 系統狀態

✅ 專案結構建立完成
✅ Playwright 已安裝 (v1.58.2)
✅ 104 爬蟲腳本已完成
⏳ 等待測試執行

## 快速測試

### 方法 1：直接執行（推薦）

```bash
cd /Users/user/clawd/projects/headhunter
./run.sh "AI 工程師"
```

### 方法 2：npm script

```bash
cd /Users/user/clawd/projects/headhunter
npm run test
```

### 方法 3：Node 直接執行

```bash
cd /Users/user/clawd/projects/headhunter
node scripts/search_104.js "產品經理" "台北" 60000
```

## 預期結果

1. 打開 Chrome 瀏覽器（背景執行）
2. 訪問 104 搜尋頁
3. 抓取前 20 筆職缺
4. 儲存 CSV：`data/104_AI工程師_2026-02-09.csv`
5. 顯示前 3 筆預覽

## 測試檢查點

- [ ] 瀏覽器能正常啟動
- [ ] 能訪問 104 網站
- [ ] 能解析職缺資料
- [ ] CSV 檔案格式正確
- [ ] 中文顯示正常（支援 BOM）
- [ ] 沒有被 104 封鎖

## 風險控制

- ✅ 請求間隔 1-2 秒
- ✅ 限制最多 20 筆
- ✅ 使用真實瀏覽器
- ✅ 模擬真人操作

## 下一步（測試成功後）

1. [ ] 調整選擇器（如果 104 頁面結構改變）
2. [ ] 加入去重機制
3. [ ] 整合 Google Sheets
4. [ ] 包裝成 OpenClaw skill
5. [ ] 開發 CakeResume 爬蟲

## 故障排除

### 問題：找不到職缺元素
- 解法：更新選擇器（104 可能改版）

### 問題：被封 IP
- 解法：增加延遲時間、降低抓取數量

### 問題：CSV 中文亂碼
- 解法：已加 BOM 標記，用 Excel 開啟應正常
