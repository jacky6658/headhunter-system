#!/usr/bin/env node
/**
 * 定時自動搜尋腳本
 * 可設定多組搜尋條件，定時執行並更新 Google Sheet
 * 
 * 用法：
 *   node scheduled_search.js                    # 執行所有預設搜尋
 *   node scheduled_search.js --list             # 列出所有搜尋設定
 *   node scheduled_search.js --run "設定名稱"   # 執行指定設定
 * 
 * 設定 cron job（範例）：
 *   每天早上 9 點執行：0 9 * * * cd /path/to/headhunter && node scripts/scheduled_search.js
 *   每週一早上 9 點：0 9 * * 1 cd /path/to/headhunter && node scripts/scheduled_search.js
 */

const fs = require('fs');
const path = require('path');
const { main: runSearch } = require('./main');

// 搜尋設定檔路徑
const SCHEDULE_CONFIG_PATH = path.join(__dirname, '../config/scheduled_searches.json');

// 預設搜尋設定
const DEFAULT_SCHEDULES = {
  searches: [
    {
      name: "AI工程師_台北",
      enabled: true,
      keyword: "AI 工程師",
      location: "台北",
      minSalary: 60000,
      maxResults: 20,
      description: "台北 AI 工程師職缺"
    },
    {
      name: "產品經理_台北",
      enabled: true,
      keyword: "產品經理",
      location: "台北",
      minSalary: 50000,
      maxResults: 20,
      description: "台北產品經理職缺"
    },
    {
      name: "行銷企劃_台北",
      enabled: false,
      keyword: "行銷企劃",
      location: "台北",
      minSalary: 40000,
      maxResults: 15,
      description: "台北行銷企劃職缺（已停用）"
    }
  ],
  settings: {
    delayBetweenSearches: 60000,  // 每組搜尋間隔 60 秒
    notifyOnComplete: true,       // 完成後通知
    logToFile: true               // 記錄到檔案
  }
};

/**
 * 讀取搜尋設定
 */
function loadScheduleConfig() {
  try {
    if (fs.existsSync(SCHEDULE_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(SCHEDULE_CONFIG_PATH, 'utf-8'));
    }
  } catch (err) {
    console.warn('⚠️  讀取設定失敗，使用預設值');
  }
  return DEFAULT_SCHEDULES;
}

/**
 * 儲存搜尋設定
 */
function saveScheduleConfig(config) {
  const configDir = path.dirname(SCHEDULE_CONFIG_PATH);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(SCHEDULE_CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`💾 設定已儲存: ${SCHEDULE_CONFIG_PATH}`);
}

/**
 * 列出所有搜尋設定
 */
function listSearches() {
  const config = loadScheduleConfig();
  
  console.log('\n📋 定時搜尋設定列表');
  console.log('='.repeat(50));
  
  config.searches.forEach((search, i) => {
    const status = search.enabled ? '✅' : '⏸️';
    console.log(`\n${i + 1}. ${status} ${search.name}`);
    console.log(`   關鍵字: ${search.keyword}`);
    console.log(`   地點: ${search.location || '不限'}`);
    console.log(`   薪資: ${search.minSalary ? search.minSalary.toLocaleString() + '+ 元' : '不限'}`);
    console.log(`   筆數: ${search.maxResults}`);
    if (search.description) {
      console.log(`   說明: ${search.description}`);
    }
  });
  
  const enabledCount = config.searches.filter(s => s.enabled).length;
  console.log('\n' + '-'.repeat(50));
  console.log(`📊 共 ${config.searches.length} 組設定，${enabledCount} 組啟用中`);
}

/**
 * 執行單一搜尋
 */
async function runSingleSearch(search) {
  console.log(`\n🔍 執行搜尋: ${search.name}`);
  console.log(`   關鍵字: ${search.keyword}`);
  console.log(`   地點: ${search.location || '不限'}`);
  console.log(`   薪資: ${search.minSalary || '不限'}`);
  console.log(`   筆數: ${search.maxResults}`);
  
  // 設定參數到 process.argv（模擬命令列執行）
  const originalArgv = process.argv;
  process.argv = [
    process.argv[0],
    process.argv[1],
    search.keyword,
    search.location || '',
    String(search.minSalary || 0),
    String(search.maxResults || 20)
  ];
  
  try {
    await runSearch();
    return { name: search.name, success: true, error: null };
  } catch (err) {
    console.error(`   ❌ 搜尋失敗: ${err.message}`);
    return { name: search.name, success: false, error: err.message };
  } finally {
    process.argv = originalArgv;
  }
}

/**
 * 執行所有啟用的搜尋
 */
async function runAllSearches() {
  const config = loadScheduleConfig();
  const enabledSearches = config.searches.filter(s => s.enabled);
  
  if (enabledSearches.length === 0) {
    console.log('⚠️  沒有啟用的搜尋設定');
    return [];
  }
  
  console.log('🚀 開始定時搜尋任務');
  console.log(`   共 ${enabledSearches.length} 組搜尋`);
  console.log(`   開始時間: ${new Date().toLocaleString('zh-TW')}`);
  
  const results = [];
  
  for (let i = 0; i < enabledSearches.length; i++) {
    const search = enabledSearches[i];
    const result = await runSingleSearch(search);
    results.push(result);
    
    // 搜尋間隔
    if (i < enabledSearches.length - 1) {
      const delay = config.settings?.delayBetweenSearches || 60000;
      console.log(`\n⏳ 等待 ${delay / 1000} 秒後執行下一組...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  
  // 輸出摘要
  console.log('\n' + '='.repeat(50));
  console.log('📊 定時搜尋完成');
  console.log('='.repeat(50));
  console.log(`   完成時間: ${new Date().toLocaleString('zh-TW')}`);
  console.log(`   成功: ${results.filter(r => r.success).length}/${results.length}`);
  
  results.forEach(r => {
    const status = r.success ? '✅' : '❌';
    console.log(`   ${status} ${r.name}${r.error ? ` (${r.error})` : ''}`);
  });
  
  return results;
}

/**
 * 執行指定名稱的搜尋
 */
async function runNamedSearch(name) {
  const config = loadScheduleConfig();
  const search = config.searches.find(s => s.name === name);
  
  if (!search) {
    console.error(`❌ 找不到搜尋設定: ${name}`);
    console.log('   使用 --list 查看所有設定');
    return null;
  }
  
  return await runSingleSearch(search);
}

/**
 * 初始化設定檔
 */
function initConfig() {
  if (!fs.existsSync(SCHEDULE_CONFIG_PATH)) {
    saveScheduleConfig(DEFAULT_SCHEDULES);
    console.log('✅ 已建立預設設定檔');
    console.log(`   路徑: ${SCHEDULE_CONFIG_PATH}`);
    console.log('   請編輯此檔案自訂搜尋條件');
  } else {
    console.log('ℹ️  設定檔已存在');
    console.log(`   路徑: ${SCHEDULE_CONFIG_PATH}`);
  }
}

// CLI 處理
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('🕐 定時自動搜尋腳本');
    console.log('');
    console.log('用法:');
    console.log('  node scheduled_search.js              執行所有啟用的搜尋');
    console.log('  node scheduled_search.js --list       列出所有搜尋設定');
    console.log('  node scheduled_search.js --run "名稱" 執行指定設定');
    console.log('  node scheduled_search.js --init       初始化設定檔');
    console.log('');
    console.log('Cron 設定範例:');
    console.log('  每天 9:00: 0 9 * * *');
    console.log('  每週一 9:00: 0 9 * * 1');
    console.log('  每月 1 號 9:00: 0 9 1 * *');
    return;
  }
  
  if (args.includes('--init')) {
    initConfig();
    return;
  }
  
  if (args.includes('--list')) {
    listSearches();
    return;
  }
  
  const runIndex = args.indexOf('--run');
  if (runIndex !== -1 && args[runIndex + 1]) {
    await runNamedSearch(args[runIndex + 1]);
    return;
  }
  
  // 預設：執行所有啟用的搜尋
  await runAllSearches();
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ 執行失敗:', err.message);
    process.exit(1);
  });
}

module.exports = { runAllSearches, runNamedSearch, listSearches, loadScheduleConfig };
