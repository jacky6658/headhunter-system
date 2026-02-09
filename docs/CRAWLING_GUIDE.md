# 🦞 公司聯絡資訊爬取指南

> 這份筆記記錄了如何從 Google Sheet 中的公司清單，批量爬取聯絡資訊（電話、Email）的完整流程。
> 供下一個 AI 龍蝦學習使用 🦞

## 📋 情境說明

**任務**：用戶有一份 Google Sheet，內含 1000+ 家公司名稱，需要找到這些公司的聯絡方式（電話、Email）用於發送業務信件。

**挑戰**：
- 大量公司，無法手動查找
- 需要節省 API 配額
- 成功率要盡量提高

---

## 🎯 策略：三層爬取法

### 核心原則：**先免費，後付費**

```
第一層：官網直接爬（免費，成功率高）
    ↓
第二層：104公司頁面爬（免費，成功率低）
    ↓
第三層：Brave Search（付費 API，最後手段）
```

---

## 📊 實際成果數據

| 方式 | 處理數 | 找到 Email | 成功率 | API 消耗 |
|------|--------|-----------|--------|---------|
| 官網直接爬 | 135 | 57 | **42%** | 0 |
| 104 公司頁面 | 62 | 1 | 1.6% | 0 |
| Brave 搜尋 | 100 | 11 | 11% | 100 次 |

**結論**：官網直接爬成功率最高、成本最低！

---

## 🔧 實作步驟

### Step 1：分析 Sheet 結構

```javascript
// 讀取 Sheet，分析有哪些欄位
gog sheets get <SHEET_ID> "分頁名!A1:Z1" --account <EMAIL> --json
```

**重要欄位**：
- 公司名稱
- 招募平台連結（104、CakeResume）
- 其他官網

### Step 2：分類公司

```javascript
// 將公司分成三類
const companies = {
  hasWebsite: [],      // 有官網 → 第一優先
  has104Link: [],      // 有 104 連結 → 第二優先  
  noWebsiteNo104: []   // 都沒有 → 最後處理
};
```

### Step 3：官網直接爬（第一層）

```javascript
// 核心邏輯：用 Playwright 訪問官網，提取聯絡資訊
const { chromium } = require('playwright');

async function scrapeContact(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
  await page.waitForTimeout(1500);
  
  const content = await page.content();
  
  // 電話正則
  const phonePatterns = [
    /(?:電話|Tel|TEL|Phone)[：:\s]*([0-9\-\(\)\s]{8,})/gi,
    /(0[2-9][\-\s]?[0-9]{3,4}[\-\s]?[0-9]{4})/g
  ];
  
  // Email 正則
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = content.match(emailPattern) || [];
  
  // 優先選擇 info@、contact@、service@ 等信箱
  const validEmail = emails.find(e => 
    !/(example|test|png|jpg|gif|svg|css|js)/i.test(e) &&
    /(info|contact|hr|service|support|sales)/i.test(e)
  ) || emails[0];
  
  return { phone, email: validEmail };
}
```

**關鍵技巧**：
- 設定合理的 timeout（12 秒）
- 過濾無效 email（圖片、CSS 檔案名）
- 優先選擇公司信箱（info@、contact@）

### Step 4：104 公司頁面爬（第二層）

```javascript
// 直接用 Sheet 中已有的 104 連結
// 注意：104 公司頁面很少顯示公開 Email，成功率低
```

**結論**：104 公司頁面**不適合找 Email**（成功率僅 1.6%）

### Step 5：Brave Search（第三層）

```javascript
// 只對「沒官網、沒 104」的公司使用
const https = require('https');

async function braveSearch(companyName) {
  const query = `${companyName} 官網 聯絡`;
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=3`;
  
  // 過濾人力銀行網站
  const urls = results.filter(u => 
    !/(104\.com|1111\.com|518\.com|cakeresume|linkedin)/i.test(u)
  );
  
  return urls[0]; // 返回第一個有效官網
}
```

**重要**：
- 過濾人力銀行（會返回工商資料庫，沒有聯絡資訊）
- 搜尋關鍵字加上「聯絡」提高命中率
- 節省配額：每天限制 50-100 次

### Step 6：寫回 Sheet

```javascript
// 使用 gog CLI 寫入
const range = `分頁名!K${row}:L${row}`;
const values = [[phone, email]];

execSync(`gog sheets update <SHEET_ID> "${range}" --values-json '${JSON.stringify(values)}' --input USER_ENTERED --account <EMAIL>`);
```

---

## ⚠️ 注意事項

### 防封鎖機制
```javascript
// 1. 隨機延遲
await page.waitForTimeout(1500 + Math.random() * 1000);

// 2. 使用真實 User-Agent
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
});

// 3. 每次處理後間隔
await page.waitForTimeout(1000);
```

### 過濾無效 Email
```javascript
// 排除這些模式
const invalidPatterns = [
  /findit\.tier/i,      // 工商資料庫的信箱
  /sentry\.io/i,        // 錯誤追蹤服務
  /\.(png|jpg|gif)/i,   // 圖片檔名
  /domain\.com/i,       // 範例信箱
  /user@/i              // 範例信箱
];
```

### API 配額管理
- Brave 免費方案：2000 次/月
- 建議每天限制：50-100 次
- 優先處理有官網的公司（免費）

---

## 📁 檔案結構

```
headhunter-system/
├── scripts/
│   ├── main.js                    # 主程式（職缺爬蟲）
│   ├── company_enricher.js        # 聯絡資訊補充
│   ├── company_lookup.js          # 公司反查
│   ├── scrape_all_websites.js     # 批量官網爬取
│   ├── scrape_104_company.js      # 104 公司頁面爬取
│   └── brave_search_companies.js  # Brave 搜尋爬取
├── config/
│   └── templates/                 # 郵件模板
└── data/
    └── cache/                     # 去重快取
```

---

## 🎓 給下一個 AI 龍蝦的建議

1. **先問清楚 Sheet 結構**：哪些欄位已有資料？
2. **先處理有官網的公司**：免費且成功率高
3. **104 公司頁面不適合找 Email**：別浪費時間
4. **Brave API 要省著用**：優先免費方式
5. **記得過濾無效 Email**：工商資料庫、圖片檔名等
6. **結果要寫回 Sheet**：方便用戶查看和使用
7. **防封鎖很重要**：隨機延遲、真實 User-Agent

---

## 📊 成功率參考

| 公司類型 | 建議方式 | 預估成功率 |
|---------|---------|-----------|
| 有官網 | 直接爬官網 | 40-50% |
| 有 104 連結 | 跳過（不推薦）| 1-2% |
| 什麼都沒有 | Brave 搜尋 | 10-20% |

---

*最後更新：2026-02-09 by YuQi 🦞*
