#!/usr/bin/env node
/**
 * 104 人力銀行爬蟲
 * 使用 Playwright（OpenClaw browser）
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
  headless: true,
  slowMo: 1000, // 每個操作延遲 1 秒（模擬真人）
  timeout: 30000,
  maxResults: 20 // 最多抓 20 筆
};

/**
 * 搜尋 104 職缺
 * @param {Object} params - 搜尋參數
 * @param {string} params.keyword - 關鍵字（如：AI 工程師）
 * @param {string} params.location - 地點（如：台北市）
 * @param {number} params.minSalary - 最低薪資（如：60000）
 */
async function search104(params = {}) {
  const { keyword = 'AI 工程師', location = '', minSalary = 0 } = params;
  
  console.log(`🔍 開始搜尋 104...`);
  console.log(`   關鍵字: ${keyword}`);
  console.log(`   地點: ${location || '不限'}`);
  console.log(`   最低薪資: ${minSalary || '不限'}`);
  
  const browser = await chromium.launch({
    headless: CONFIG.headless,
    slowMo: CONFIG.slowMo
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  const results = [];
  
  try {
    // 1. 訪問 104 搜尋頁
    const searchUrl = `https://www.104.com.tw/jobs/search/?keyword=${encodeURIComponent(keyword)}`;
    console.log(`📄 訪問: ${searchUrl}`);
    
    await page.goto(searchUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000); // 等待頁面載入
    
    // 2. 等待職缺列表出現
    console.log(`⏳ 等待職缺列表載入...`);
    await page.waitForSelector('.job-summary', { timeout: CONFIG.timeout });
    
    // 3. 抓取職缺卡片
    console.log(`📊 開始解析職缺...`);
    const jobCards = await page.$$('.job-summary');
    
    console.log(`   找到 ${jobCards.length} 筆職缺`);
    
    for (let i = 0; i < Math.min(jobCards.length, CONFIG.maxResults); i++) {
      try {
        const card = jobCards[i];
        
        // 解析職缺基本資訊
        const jobData = await card.evaluate((el) => {
          // 公司名稱
          const companyEl = el.querySelector('.info-company__text');
          const company = companyEl ? companyEl.textContent.trim() : '';
          
          // 職缺標題
          const titleEl = el.querySelector('.info-job__text');
          const title = titleEl ? titleEl.textContent.trim() : '';
          const link = titleEl ? titleEl.href : '';
          
          // 薪資、地點、經驗（都在 .info-tags 裡）
          const tagsEls = el.querySelectorAll('.info-tags .info-tags__text');
          let location = '';
          let experience = '';
          let salary = '面議';
          
          tagsEls.forEach(tag => {
            const text = tag.textContent.trim();
            if (text.includes('市') || text.includes('縣')) {
              location = text;
            } else if (text.includes('經歷')) {
              experience = text;
            } else if (text.includes('月薪') || text.includes('元')) {
              salary = text;
            }
          });
          
          // 更新日期
          const dateEl = el.querySelector('.date-container');
          const updateDate = dateEl ? dateEl.textContent.trim() : '';
          
          return { company, title, salary, location, experience, link, updateDate };
        });
        
        // 過濾：薪資篩選（如果有設定）
        if (minSalary > 0) {
          const salaryMatch = jobData.salary.match(/(\d+)/);
          if (salaryMatch) {
            const jobSalary = parseInt(salaryMatch[1]) * 1000; // 假設是 K 為單位
            if (jobSalary < minSalary) {
              continue; // 跳過低於最低薪資的職缺
            }
          }
        }
        
        // 進入職缺詳細頁面抓取工作內容 + 聯絡資訊
        try {
          console.log(`   🔍 [${i + 1}] 進入詳細頁面: ${jobData.title}`);
          
          const detailPage = await context.newPage();
          await detailPage.goto(jobData.link, { waitUntil: 'networkidle' });
          await detailPage.waitForTimeout(2000);
          
          // 抓取詳細資訊（只抓工作內容 + 聯絡人）
          const detailData = await detailPage.evaluate(() => {
            // 工作內容
            const descEl = document.querySelector('.job-description__content');
            const description = descEl ? descEl.textContent.trim().replace(/\s+/g, ' ').substring(0, 300) : '';
            
            // 聯絡人（從頁面所有元素中找包含「聯絡人」的）
            let contactPerson = '';
            const allElements = Array.from(document.querySelectorAll('*'));
            const contactSection = allElements.find(el => 
              el.textContent.includes('聯絡人') && el.children.length < 5
            );
            if (contactSection) {
              // 嘗試找名字（通常在「聯絡人」後面）
              const text = contactSection.textContent;
              const match = text.match(/聯絡人[:：\s]*([^\s\n應徵回]+)/);
              if (match) contactPerson = match[1];
            }
            
            // 電話/信箱由階段 2 官網補充
            return { description, contactPerson, contactPhone: '', contactEmail: '' };
          });
          
          // 合併資料
          Object.assign(jobData, detailData);
          
          await detailPage.close();
          console.log(`   ✅ [${i + 1}] ${jobData.company} - ${jobData.title}`);
          
        } catch (detailErr) {
          console.error(`   ⚠️  無法抓取詳細資訊: ${detailErr.message}`);
          // 設定預設值
          jobData.description = '';
          jobData.contactPerson = '';
          jobData.contactPhone = '';
          jobData.contactEmail = '';
        }
        
        results.push(jobData);
        
        // 每抓 3 筆休息一下（因為現在要進詳細頁，頻率降低）
        if ((i + 1) % 3 === 0) {
          await page.waitForTimeout(3000);
        }
        
      } catch (err) {
        console.error(`   ❌ 解析第 ${i + 1} 筆失敗:`, err.message);
      }
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
  
  // CSV 標頭（新增：工作內容、聯絡人、聯絡電話、聯絡信箱）
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
      `"${(job.description || '').replace(/"/g, '""')}"`, // 處理內容中的引號
      `"${job.contactPerson || ''}"`,
      `"${job.contactPhone || ''}"`,
      `"${job.contactEmail || ''}"`,
      `"${job.link || ''}"`,
      `"${job.updateDate || ''}"`
    ];
    rows.push(row.join(','));
  });
  
  const csvContent = rows.join('\n');
  fs.writeFileSync(csvPath, '\uFEFF' + csvContent); // 加 BOM 支援 Excel 中文
  
  console.log(`💾 已儲存 CSV: ${csvPath}`);
  return csvPath;
}

/**
 * 主程式
 */
async function main() {
  const args = process.argv.slice(2);
  const keyword = args[0] || 'AI 工程師';
  const location = args[1] || '';
  const minSalary = args[2] ? parseInt(args[2]) : 0;
  
  // 搜尋
  const results = await search104({ keyword, location, minSalary });
  
  if (results.length === 0) {
    console.log('❌ 沒有找到符合的職缺');
    return;
  }
  
  // 匯出 CSV
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `104_${keyword.replace(/\s+/g, '_')}_${timestamp}.csv`;
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

module.exports = { search104, exportCSV };
