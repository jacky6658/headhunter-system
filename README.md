# 獵頭自動化爬蟲系統

自動爬取 104、CakeResume 等平台的職缺和求職者資料。

## 功能

- ✅ 104 人力銀行職缺搜尋
- ✅ CSV 匯出
- ⏳ CakeResume 爬蟲（開發中）
- ⏳ Google Sheets 自動上傳（開發中）
- ⏳ Google Search API 整合（開發中）

## 安裝

```bash
cd /Users/user/clawd/projects/headhunter
npm install
```

## 使用方式

### 1. 命令列執行

```bash
# 基本搜尋（預設：AI 工程師）
node scripts/search_104.js

# 指定關鍵字
node scripts/search_104.js "產品經理"

# 指定關鍵字 + 地點
node scripts/search_104.js "數位行銷" "台北"

# 指定關鍵字 + 地點 + 最低薪資
node scripts/search_104.js "AI 工程師" "台北" 60000
```

### 2. npm script

```bash
# 測試腳本（AI 工程師 | 台北 | 60K+）
npm run test
```

### 3. OpenClaw 對話觸發（開發中）

直接對 YuQi 說：
> 「幫我找台北的 AI 工程師職缺，薪資 60K 以上」

## 輸出格式

### CSV 檔案
儲存位置：`/Users/user/clawd/projects/headhunter/data/`

檔名格式：`104_<關鍵字>_<日期>.csv`

欄位：
- 公司名稱
- 職缺標題
- 薪資範圍
- 地點
- 經驗要求
- 連結
- 更新日期

## 安全機制

- ✅ 真實瀏覽器（Playwright）
- ✅ 請求間隔 1-2 秒
- ✅ 每次最多 20 筆
- ✅ 模擬真人操作

## 開發計畫

- [ ] 104 爬蟲測試
- [ ] CakeResume 爬蟲
- [ ] Google Search API 整合
- [ ] Google Sheets 自動上傳
- [ ] 去重機制
- [ ] OpenClaw skill 包裝
