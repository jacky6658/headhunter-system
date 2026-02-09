#!/usr/bin/env node
/**
 * 104 頁面結構調試工具
 */

const { chromium } = require('playwright');

async function debug104() {
  console.log('🔍 啟動瀏覽器...');
  
  const browser = await chromium.launch({
    headless: false, // 顯示瀏覽器
    slowMo: 1000
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  const page = await context.newPage();
  
  try {
    const url = 'https://www.104.com.tw/jobs/search/?keyword=短影音企劃';
    console.log(`📄 訪問: ${url}`);
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(8000); // 等待 8 秒讓頁面完全載入
    
    console.log('\n📊 檢查頁面結構...\n');
    
    // 1. 檢查 article 標籤
    const articles = await page.$$('article');
    console.log(`找到 ${articles.length} 個 <article> 標籤`);
    
    if (articles.length > 0) {
      const firstArticle = articles[0];
      const className = await firstArticle.getAttribute('class');
      const innerHTML = await firstArticle.innerHTML();
      console.log(`\n第一個 article class: ${className}`);
      console.log(`\n第一個 article HTML (前 500 字):\n${innerHTML.substring(0, 500)}\n`);
    }
    
    // 2. 檢查職缺卡片
    const selectors = [
      'article[class*="job"]',
      'div[class*="job-list"]',
      'div[class*="job-item"]',
      'li[class*="job"]',
      '.job-list-item',
      '[data-job-name]'
    ];
    
    console.log('\n測試不同 selector:');
    for (const selector of selectors) {
      try {
        const elements = await page.$$(selector);
        console.log(`  ${selector}: ${elements.length} 個`);
      } catch (err) {
        console.log(`  ${selector}: 錯誤`);
      }
    }
    
    // 3. 輸出完整 HTML 到文件
    const html = await page.content();
    const fs = require('fs');
    const path = require('path');
    const outputPath = path.join(__dirname, '../data/104_debug.html');
    fs.writeFileSync(outputPath, html);
    console.log(`\n💾 完整 HTML 已儲存: ${outputPath}`);
    
    // 4. 截圖
    const screenshotPath = path.join(__dirname, '../data/104_debug.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 截圖已儲存: ${screenshotPath}`);
    
    console.log('\n✅ 調試完成！瀏覽器保持開啟，按 Ctrl+C 結束');
    
    // 保持瀏覽器開啟
    await new Promise(() => {});
    
  } catch (error) {
    console.error('❌ 錯誤:', error.message);
  }
}

debug104();
