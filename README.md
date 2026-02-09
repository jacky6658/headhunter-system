# 獵頭自動化爬蟲系統

自動爬取 104、CakeResume 等平台的職缺和求職者資料。

## 功能

- ✅ 104 人力銀行職缺搜尋
- ✅ Brave Search API 公司資訊補充
- ✅ CSV 匯出（含公司簡介和資料來源）
- ⏳ CakeResume 爬蟲（開發中）
- ⏳ Google Sheets 自動上傳（開發中）

## 安裝

```bash
cd /Users/user/clawd/projects/headhunter
npm install
```

## 使用方式

### 1. 快速執行（推薦）

```bash
# 使用 run.sh 腳本（自動整合 Brave Search）
./run.sh "AI 工程師"                    # 基本搜尋
./run.sh "產品經理" "台北"              # 指定地點
./run.sh "數位行銷" "台北" 60000        # 指定最低薪資
```

### 2. 命令列執行

```bash
# 完整流程（104 + Brave Search + CSV）
node scripts/main.js "AI 工程師" "台北" 60000

# 只執行 104 爬蟲（不補充公司資訊）
node scripts/search_104.js "AI 工程師" "台北" 60000
```

### 3. npm script

```bash
# 測試腳本（AI 工程師 | 台北 | 60K+）
npm run test
```

### 4. OpenClaw 對話觸發（開發中）

直接對 YuQi 說：
> 「幫我找台北的 AI 工程師職缺，薪資 60K 以上」

## 輸出格式

### CSV 檔案
儲存位置：`/Users/user/clawd/projects/headhunter/data/`

檔名格式：`104_enriched_<關鍵字>_<日期>.csv`

欄位：
- 公司名稱
- 職缺標題
- 薪資範圍
- 地點
- 經驗要求
- 連結
- 更新日期
- **公司簡介**（Brave Search）
- **資料來源1-3**（含標題和連結）

## 安全機制

- ✅ 真實瀏覽器（Playwright）
- ✅ 請求間隔 1-2 秒
- ✅ 每次最多 20 筆
- ✅ 模擬真人操作

## 開發計畫

- [x] 104 爬蟲
- [x] Brave Search API 整合
- [x] 公司資訊補充
- [ ] 104 爬蟲實測
- [ ] CakeResume 爬蟲
- [ ] Google Sheets 自動上傳
- [ ] 去重機制
- [ ] OpenClaw skill 包裝

## 環境變數

系統會自動從 OpenClaw 環境讀取：
- `BRAVE_API_KEY` 或 `BRAVE_SEARCH_API_KEY` - Brave Search API 金鑰

如需停用公司資訊補充，修改 `config.json`：
```json
{
  "companyEnricher": {
    "enabled": false
  }
}
```
