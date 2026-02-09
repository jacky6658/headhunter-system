#!/usr/bin/env node
/**
 * 分析 Cake.me HTML 中的 JSON 資料結構
 */

const fs = require('fs');
const path = require('path');

// 讀取 HTML 檔案
const htmlPath = path.join(__dirname, '../data/cakeresume_debug.html');
const html = fs.readFileSync(htmlPath, 'utf-8');

// 提取 __NEXT_DATA__ JSON
const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);

if (!match) {
  console.log('❌ 未找到 __NEXT_DATA__');
  process.exit(1);
}

try {
  const data = JSON.parse(match[1]);
  
  console.log('✅ 成功解析 JSON');
  console.log('\n📊 資料結構：');
  console.log('props 中的鍵：', Object.keys(data.props || {}));
  
  if (data.props && data.props.pageProps) {
    console.log('pageProps 中的鍵：', Object.keys(data.props.pageProps));
    
    // 查找職缺資料
    const pageProps = data.props.pageProps;
    
    // 檢查不同可能的路徑
    console.log('\n🔍 尋找職缺資料...');
    
    // 路徑 1: pageProps.initialState
    if (pageProps.initialState) {
      console.log('✅ 找到 initialState');
      console.log('initialState 中的鍵：', Object.keys(pageProps.initialState));
      
      if (pageProps.initialState.jobSearch) {
        console.log('✅ 找到 jobSearch');
        console.log('jobSearch 中的鍵：', Object.keys(pageProps.initialState.jobSearch));
        
        if (pageProps.initialState.jobSearch.entityByPathId) {
          const jobs = Object.values(pageProps.initialState.jobSearch.entityByPathId);
          console.log(`\n🎯 找到 ${jobs.length} 筆職缺資料！`);
          console.log('\n📝 第一筆職缺範例：');
          console.log(JSON.stringify(jobs[0], null, 2).substring(0, 1000));
        }
      }
    }
    
    // 輸出完整結構的前 2000 字元
    console.log('\n📄 完整 pageProps 結構（前 2000 字元）：');
    console.log(JSON.stringify(pageProps, null, 2).substring(0, 2000));
    
  }
  
} catch (err) {
  console.error('❌ JSON 解析失敗:', err.message);
}
