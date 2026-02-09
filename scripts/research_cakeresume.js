#!/usr/bin/env node
/**
 * CakeResume 網站結構研究
 */

const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  // 訪問 Cake.me 搜尋頁（新域名）
  console.log('🔍 訪問 Cake.me 搜尋頁...');
  await page.goto('https://www.cake.me/jobs/行銷企劃?location=台北市', { 
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  
  await page.waitForTimeout(5000);
  
  // 嘗試找職缺列表
  console.log('📊 分析頁面結構...');
  
  const selectors = [
    'article',
    '.job-item',
    '[data-testid*="job"]',
    '.job-card',
    '[class*="JobSearchItem"]',
    '[class*="job-list"] > *'
  ];
  
  for (const selector of selectors) {
    const elements = await page.$$(selector);
    console.log(`✅ "${selector}": ${elements.length} 個元素`);
  }
  
  // 儲存 HTML
  const html = await page.content();
  fs.writeFileSync('data/cakeresume_debug.html', html);
  console.log('✅ HTML 已儲存: data/cakeresume_debug.html');
  
  // 截圖
  await page.screenshot({ path: 'data/cakeresume_debug.png', fullPage: true });
  console.log('✅ 截圖已儲存: data/cakeresume_debug.png');
  
  console.log('\n⏳ 保持瀏覽器開啟 30 秒供人工觀察...');
  await page.waitForTimeout(30000);
  
  await browser.close();
  console.log('✅ 完成！');
})();
