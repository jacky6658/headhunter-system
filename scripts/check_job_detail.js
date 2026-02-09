#!/usr/bin/env node
/**
 * 檢查 104 職缺詳情頁結構（尋找電話）
 */

const { chromium } = require('playwright');

async function checkJobDetail() {
  console.log('🔍 啟動瀏覽器...');
  
  const browser = await chromium.launch({
    headless: false,
    slowMo: 1000
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  const page = await context.newPage();
  
  try {
    // 使用之前的職缺連結
    const url = 'https://www.104.com.tw/job/8y3sp';
    console.log(`📄 訪問: ${url}`);
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    
    console.log('\n🔍 尋找電話資訊...\n');
    
    // 嘗試不同的 selector
    const selectors = [
      'a[href^="tel:"]',
      '[class*="phone"]',
      '[class*="contact"]',
      'text=/電話/',
      'text=/聯絡/',
      'text=/TEL/',
      '.company-info',
      '.job-company',
    ];
    
    for (const selector of selectors) {
      try {
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          console.log(`✅ ${selector}: ${elements.length} 個`);
          for (let i = 0; i < Math.min(elements.length, 3); i++) {
            const text = await elements[i].textContent();
            console.log(`   [${i + 1}] ${text?.trim().substring(0, 100)}`);
          }
          console.log('');
        }
      } catch (err) {
        // 忽略
      }
    }
    
    // 輸出完整 HTML
    const html = await page.content();
    const fs = require('fs');
    const path = require('path');
    const outputPath = path.join(__dirname, '../data/job_detail_debug.html');
    fs.writeFileSync(outputPath, html);
    console.log(`💾 完整 HTML 已儲存: ${outputPath}`);
    
    // 截圖
    const screenshotPath = path.join(__dirname, '../data/job_detail_debug.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 截圖已儲存: ${screenshotPath}`);
    
    console.log('\n✅ 調試完成！瀏覽器保持開啟 10 秒...');
    await page.waitForTimeout(10000);
    
  } catch (error) {
    console.error('❌ 錯誤:', error.message);
  } finally {
    await browser.close();
  }
}

checkJobDetail();
