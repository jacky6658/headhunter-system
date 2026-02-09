#!/usr/bin/env node
/**
 * 1111 人力銀行爬蟲
 * 搜尋職缺並提取聯絡資訊
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 讀取配置
const configPath = path.join(__dirname, '../config.json');
const CONFIG = fs.existsSync(configPath) 
  ? JSON.parse(fs.readFileSync(configPath, 'utf8')).scraper || {}
  : {};

/**
 * 搜尋 1111 職缺
 */
async function search1111(options = {}) {
  const {
    keyword = 'AI 工程師',
    location = '',
    minSalary = 0,
    maxResults = CONFIG.maxResults || 20
  } = options;

  console.log(`🔍 開始搜尋 1111...`);
  console.log(`   關鍵字: ${keyword}`);
  console.log(`   地點: ${location || '不限'}`);
  console.log(`   最低薪資: ${minSalary || '不限'}`);

  const browser = await chromium.launch({ headless: CONFIG.headless !== false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  const results = [];

  try {
    // 構建搜尋 URL
    let url = `https://www.1111.com.tw/search/job?ks=${encodeURIComponent(keyword)}`;
    if (location) {
      // 1111 地區代碼需要研究
      url += `&d0=${encodeURIComponent(location)}`;
    }
    
    console.log(`📄 訪問: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 等待職缺列表載入
    console.log(`⏳ 等待職缺列表載入...`);
    await page.waitForSelector('.job_item, .joblist_item, [class*="job"]', { timeout: 15000 }).catch(() => {});

    // 提取職缺資料
    console.log(`📊 開始解析職缺...`);
    const jobsData = await page.evaluate(() => {
      const jobs = [];
      // 1111 可能的選擇器
      const selectors = [
        '.job_item',
        '.joblist_item', 
        '[class*="job-item"]',
        '.job-list-item'
      ];
      
      let jobElements = [];
      for (const selector of selectors) {
        jobElements = document.querySelectorAll(selector);
        if (jobElements.length > 0) break;
      }

      jobElements.forEach(el => {
        try {
          const titleEl = el.querySelector('a[href*="/job/"], h2, .job_name, .job-name');
          const companyEl = el.querySelector('.corp_name, .company-name, [class*="company"]');
          const salaryEl = el.querySelector('.salary, [class*="salary"]');
          const locationEl = el.querySelector('.job_area, .area, [class*="area"]');
          
          if (titleEl) {
            jobs.push({
              title: titleEl.textContent?.trim() || '',
              company: companyEl?.textContent?.trim() || '',
              salary: salaryEl?.textContent?.trim() || '面議',
              location: locationEl?.textContent?.trim() || '',
              link: titleEl.href || ''
            });
          }
        } catch (e) {}
      });

      return jobs;
    });

    console.log(`   找到 ${jobsData.length} 筆職缺`);

    // 處理職缺資料
    for (let i = 0; i < Math.min(jobsData.length, maxResults); i++) {
      const job = jobsData[i];
      
      // 薪資篩選
      if (minSalary > 0) {
        const salaryMatch = job.salary.match(/[\d,]+/);
        if (salaryMatch) {
          const salary = parseInt(salaryMatch[0].replace(/,/g, ''));
          if (salary < minSalary) continue;
        }
      }

      results.push({
        company: job.company,
        title: job.title,
        salary: job.salary,
        location: job.location,
        experience: '',
        description: '',
        link: job.link,
        updateDate: new Date().toISOString().split('T')[0],
        contactPerson: '',
        contactPhone: '',
        contactEmail: '',
        platform: '1111'
      });

      console.log(`   ✅ [${results.length}] ${job.company} - ${job.title}`);
    }

    console.log(`\n✅ 搜尋完成！共找到 ${results.length} 筆職缺`);

  } catch (err) {
    console.error(`❌ 搜尋失敗: ${err.message}`);
  } finally {
    await browser.close();
  }

  return results;
}

/**
 * 匯出 CSV
 */
function exportCSV(data, keyword) {
  const csvDir = path.join(__dirname, '../data');
  if (!fs.existsSync(csvDir)) fs.mkdirSync(csvDir, { recursive: true });
  
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `1111_${keyword.replace(/\s+/g, '_')}_${timestamp}.csv`;
  const csvPath = path.join(csvDir, filename);

  const headers = ['公司名稱', '職缺標題', '薪資範圍', '地點', '經驗要求', '工作內容', '聯絡人', '聯絡電話', '聯絡信箱', '連結', '更新日期'];
  const rows = [headers.join(',')];

  data.forEach(job => {
    const row = [
      `"${(job.company || '').replace(/"/g, '""')}"`,
      `"${(job.title || '').replace(/"/g, '""')}"`,
      `"${(job.salary || '').replace(/"/g, '""')}"`,
      `"${(job.location || '').replace(/"/g, '""')}"`,
      `"${(job.experience || '').replace(/"/g, '""')}"`,
      `"${(job.description || '').replace(/"/g, '""')}"`,
      `"${(job.contactPerson || '').replace(/"/g, '""')}"`,
      `"${(job.contactPhone || '').replace(/"/g, '""')}"`,
      `"${(job.contactEmail || '').replace(/"/g, '""')}"`,
      `"${(job.link || '').replace(/"/g, '""')}"`,
      `"${(job.updateDate || '').replace(/"/g, '""')}"`
    ];
    rows.push(row.join(','));
  });

  fs.writeFileSync(csvPath, '\uFEFF' + rows.join('\n'));
  console.log(`💾 已儲存 CSV: ${csvPath}`);
  return csvPath;
}

// CLI 模式
async function main() {
  const args = process.argv.slice(2);
  const keyword = args[0] || 'AI 工程師';
  const location = args[1] || '';
  const minSalary = args[2] ? parseInt(args[2]) : 0;

  const results = await search1111({ keyword, location, minSalary });
  
  if (results.length > 0) {
    exportCSV(results, keyword);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { search1111 };
