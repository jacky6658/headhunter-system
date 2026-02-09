#!/usr/bin/env node
/**
 * Cake.me（原 CakeResume）人力銀行爬蟲
 * 使用 Playwright 提取頁面中的 JSON 資料
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
  headless: true,
  slowMo: 500,
  timeout: 60000,
  maxResults: 20
};

/**
 * 搜尋 Cake.me 職缺
 */
async function searchCake(params = {}) {
  const { keyword = 'AI 工程師', location = '台北市', minSalary = 0 } = params;
  
  console.log(`🔍 開始搜尋 Cake.me...`);
  console.log(`   關鍵字: ${keyword}`);
  console.log(`   地點: ${location || '不限'}`);
  console.log(`   最低薪資: ${minSalary || '不限'}`);
  
  const browser = await chromium.launch({
    headless: CONFIG.headless,
    slowMo: CONFIG.slowMo
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  const page = await context.newPage();
  const results = [];
  
  try {
    // 1. 訪問 Cake.me 搜尋頁
    const searchUrl = `https://www.cake.me/jobs/${encodeURIComponent(keyword)}?location=${encodeURIComponent(location)}`;
    console.log(`📄 訪問: ${searchUrl}`);
    
    await page.goto(searchUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.timeout 
    });
    await page.waitForTimeout(5000); // 等待 JS 渲染
    
    // 2. 從頁面中提取 JSON 資料
    console.log(`📊 提取職缺資料...`);
    
    const jobsData = await page.evaluate(() => {
      try {
        // 找到 __NEXT_DATA__ script 標籤
        const dataScript = document.querySelector('script#__NEXT_DATA__');
        if (!dataScript) {
          console.error('未找到 __NEXT_DATA__');
          return [];
        }
        
        // 解析 JSON
        const data = JSON.parse(dataScript.textContent);
        
        // 從正確路徑提取職缺資料
        const jobs = data?.props?.pageProps?.initialState?.jobSearch?.entityByPathId || {};
        
        // 轉換為陣列
        return Object.values(jobs);
      } catch (err) {
        console.error('JSON 解析失敗:', err.message);
        return [];
      }
    });
    
    if (jobsData.length === 0) {
      console.log('❌ 未找到職缺資料');
      await browser.close();
      return results;
    }
    
    console.log(`   找到 ${jobsData.length} 筆職缺`);
    
    // 3. 處理職缺資料
    let count = 0;
    for (let i = 0; i < jobsData.length && count < CONFIG.maxResults; i++) {
      const job = jobsData[i];
      
      // 提取並清理資料
      const company = job.page?.name || '';
      const title = job.title || '';
      const description = (job.description || '').replace(/\s+/g, ' ').trim().substring(0, 300);
      const link = job.page?.path && job.path 
        ? `https://www.cake.me/companies/${job.page.path}/jobs/${job.path}`
        : '';
      
      // 薪資
      let salary = '面議';
      if (job.salary && job.salary.min) {
        const { min, max, currency, type } = job.salary;
        const typeMap = {
          per_month: '月',
          per_year: '年',
          per_hour: '時',
          per_day: '日'
        };
        const unit = typeMap[type] || '月';
        
        if (max && min !== max) {
          salary = `${min}-${max} ${currency}/${unit}`;
        } else {
          salary = `${min}+ ${currency}/${unit}`;
        }
      }
      
      // 地點（取第一個，優先使用中文）
      let location = '';
      if (job.locationsWithLocale && job.locationsWithLocale.length > 0) {
        const zhLocation = job.locationsWithLocale.find(l => l['zh-TW']);
        location = zhLocation ? zhLocation['zh-TW'] : job.locationsWithLocale[0].en || job.locationsWithLocale[0];
      } else if (job.locations && job.locations.length > 0) {
        location = job.locations[0];
      }
      
      // 經驗要求
      const seniorityMap = {
        entry_level: '0-2年',
        mid_senior_level: '2-5年',
        associate: '1-3年',
        internship_level: '實習',
        director: '5年以上',
        executive: '10年以上'
      };
      const experience = seniorityMap[job.seniorityLevel] || '';
      
      // 更新時間
      const updateDate = job.contentUpdatedAt 
        ? new Date(job.contentUpdatedAt).toISOString().split('T')[0] 
        : '';
      
      // 薪資篩選
      if (minSalary > 0 && job.salary?.min) {
        const jobSalary = parseInt(job.salary.min);
        if (jobSalary < minSalary) {
          continue;
        }
      }
      
      results.push({
        company,
        title,
        salary,
        location,
        experience,
        description,
        link,
        updateDate,
        contactPerson: '',
        contactPhone: '',
        contactEmail: ''
      });
      
      count++;
      console.log(`   ✅ [${count}] ${company} - ${title}`);
    }
    
  } catch (error) {
    console.error('❌ 搜尋過程發生錯誤:', error.message);
  } finally {
    await browser.close();
  }
  
  console.log(`\n✅ 搜尋完成！共找到 ${results.length} 筆職缺\n`);
  return results;
}

/**
 * 匯出為 CSV
 */
function exportCSV(data, filename) {
  const csvDir = path.join(__dirname, '../data');
  const csvPath = path.join(csvDir, filename);
  
  // CSV 標頭
  const headers = [
    '公司名稱', '職缺標題', '薪資範圍', '地點', '經驗要求', 
    '工作內容', '聯絡人', '聯絡電話', '聯絡信箱', 
    '連結', '更新日期'
  ];
  const rows = [headers.join(',')];
  
  // 資料行
  data.forEach(job => {
    const row = [
      `"${job.company || ''}"`,
      `"${job.title || ''}"`,
      `"${job.salary || ''}"`,
      `"${job.location || ''}"`,
      `"${job.experience || ''}"`,
      `"${(job.description || '').replace(/"/g, '""')}"`,
      `"${job.contactPerson || ''}"`,
      `"${job.contactPhone || ''}"`,
      `"${job.contactEmail || ''}"`,
      `"${job.link || ''}"`,
      `"${job.updateDate || ''}"`
    ];
    rows.push(row.join(','));
  });
  
  const csvContent = rows.join('\n');
  fs.writeFileSync(csvPath, '\uFEFF' + csvContent);
  
  console.log(`💾 已儲存 CSV: ${csvPath}`);
  return csvPath;
}

/**
 * 主程式
 */
async function main() {
  const args = process.argv.slice(2);
  const keyword = args[0] || 'AI 工程師';
  const location = args[1] || '台北市';
  const minSalary = args[2] ? parseInt(args[2]) : 0;
  
  // 搜尋
  const results = await searchCake({ keyword, location, minSalary });
  
  if (results.length === 0) {
    console.log('❌ 沒有找到符合的職缺');
    return;
  }
  
  // 匯出 CSV
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `cakeresume_${keyword.replace(/\s+/g, '_')}_${timestamp}.csv`;
  const csvPath = exportCSV(results, filename);
  
  // 輸出摘要
  console.log('\n📊 搜尋摘要:');
  console.log(`   關鍵字: ${keyword}`);
  console.log(`   找到: ${results.length} 筆`);
  console.log(`   檔案: ${csvPath}`);
  console.log('\n前 3 筆預覽:');
  results.slice(0, 3).forEach((job, i) => {
    console.log(`\n${i + 1}. ${job.company} - ${job.title}`);
    console.log(`   💰 ${job.salary} | 📍 ${job.location}`);
    console.log(`   🔗 ${job.link}`);
  });
}

// 執行
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { searchCake, exportCSV };
