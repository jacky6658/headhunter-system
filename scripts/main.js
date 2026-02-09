#!/usr/bin/env node
/**
 * 獵頭系統主程式 v2.0
 * 整合：104 + CakeResume 爬蟲 + 官網聯絡資訊補充 + Google Sheet 自動匯出
 */

const { search104 } = require('./search_104');
const { searchCake: searchCakeResume } = require('./search_cakeresume');
const { enrichCompanies } = require('./company_enricher');
const { exportToSheet, loadConfig: loadSheetConfig } = require('./sheet_exporter');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 讀取配置
const configPath = path.join(__dirname, '../config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

/**
 * 匯出 CSV
 */
function exportCSV(data, filename) {
  const csvDir = path.join(__dirname, '../data');
  if (!fs.existsSync(csvDir)) fs.mkdirSync(csvDir, { recursive: true });
  const csvPath = path.join(csvDir, filename);
  
  const headers = [
    '公司名稱', '職缺標題', '薪資範圍', '地點', '經驗要求', 
    '工作內容', '聯絡人', '聯絡電話', '聯絡信箱', '連結', '更新日期'
  ];
  const rows = [headers.join(',')];
  
  data.forEach(job => {
    const row = [
      `"${(job.company || '').replace(/"/g, '""')}"`,
      `"${(job.title || '').replace(/"/g, '""')}"`,
      `"${(job.salary || '').replace(/"/g, '""')}"`,
      `"${(job.location || '').replace(/"/g, '""')}"`,
      `"${(job.experience || '').replace(/"/g, '""')}"`,
      `"${(job.description || '').replace(/"/g, '""').substring(0, 300)}"`,
      `"${(job.contactPerson || '').replace(/"/g, '""')}"`,
      `"${(job.contactPhone || '').replace(/"/g, '""')}"`,
      `"${(job.contactEmail || '').replace(/"/g, '""')}"`,
      `"${(job.link || '').replace(/"/g, '""')}"`,
      `"${(job.updateDate || '').replace(/"/g, '""')}"`
    ];
    rows.push(row.join(','));
  });
  
  fs.writeFileSync(csvPath, '\uFEFF' + rows.join('\n'));
  return csvPath;
}

/**
 * 匯出到 Google Sheet（指定分頁）
 */
function exportToGoogleSheet(data, tabName) {
  if (!config.googleSheets?.enabled || !config.googleSheets?.sheetId) {
    console.log('   ⚠️  Google Sheet 未啟用或未設定');
    return false;
  }

  const { sheetId, account } = config.googleSheets;
  
  try {
    // 寫入標題列
    const headers = ['公司名稱', '職缺標題', '薪資範圍', '地點', '經驗要求', 
                     '工作內容', '聯絡人', '聯絡電話', '聯絡信箱', '連結', '更新日期'];
    const headerJson = JSON.stringify([headers]);
    execSync(`gog sheets clear ${sheetId} "${tabName}!A2:Z" --account ${account} --force 2>/dev/null || true`);
    execSync(`gog sheets update ${sheetId} "${tabName}!A1:K1" --values-json '${headerJson}' --input USER_ENTERED --account ${account}`, { stdio: 'pipe' });
    
    // 寫入資料
    if (data.length > 0) {
      const rows = data.map(job => [
        job.company || '',
        job.title || '',
        job.salary || '',
        job.location || '',
        job.experience || '',
        (job.description || '').substring(0, 300),
        job.contactPerson || '',
        job.contactPhone || '',
        job.contactEmail || '',
        job.link || '',
        job.updateDate || ''
      ]);
      const dataJson = JSON.stringify(rows).replace(/'/g, "'\\''");
      execSync(`gog sheets append ${sheetId} "${tabName}!A:K" --values-json '${dataJson}' --insert INSERT_ROWS --account ${account}`, { stdio: 'pipe' });
    }
    
    console.log(`   ✅ 已匯出到 Sheet「${tabName}」分頁 (${data.length} 筆)`);
    return true;
  } catch (err) {
    console.error(`   ❌ Sheet 匯出失敗: ${err.message}`);
    return false;
  }
}

/**
 * 顯示統計
 */
function showStats(jobs, label) {
  const stats = {
    total: jobs.length,
    hasPerson: jobs.filter(j => j.contactPerson).length,
    hasPhone: jobs.filter(j => j.contactPhone).length,
    hasEmail: jobs.filter(j => j.contactEmail).length
  };
  console.log(`\n📊 ${label} 聯絡資訊:`);
  console.log(`   聯絡人: ${stats.hasPerson}/${stats.total} | 電話: ${stats.hasPhone}/${stats.total} | 信箱: ${stats.hasEmail}/${stats.total}`);
  return stats;
}

/**
 * 主流程
 */
async function main() {
  const args = process.argv.slice(2);
  const keyword = args[0] || 'AI 工程師';
  const location = args[1] || '';
  const minSalary = args[2] ? parseInt(args[2]) : 0;
  const maxResults = args[3] ? parseInt(args[3]) : config.scraper?.maxResults || 20;

  console.log('🦞 OpenClaw 獵頭系統 v2.0');
  console.log('='.repeat(50));
  console.log(`📝 關鍵字: ${keyword}`);
  console.log(`📍 地點: ${location || '不限'}`);
  console.log(`💰 最低薪資: ${minSalary ? minSalary.toLocaleString() + ' 元' : '不限'}`);
  console.log(`📦 最大筆數: ${maxResults}`);
  console.log('='.repeat(50));

  const timestamp = new Date().toISOString().split('T')[0];
  const results = { '104': [], 'cakeresume': [] };

  // ========== Step 1: 搜尋 104 ==========
  console.log('\n📋 Step 1/4: 搜尋 104 人力銀行');
  try {
    const jobs104 = await search104({ keyword, location, minSalary, maxResults });
    results['104'] = jobs104;
    console.log(`   找到 ${jobs104.length} 筆職缺`);
  } catch (err) {
    console.error(`   ❌ 104 搜尋失敗: ${err.message}`);
  }

  // ========== Step 2: 搜尋 CakeResume ==========
  console.log('\n📋 Step 2/4: 搜尋 CakeResume');
  try {
    const jobsCake = await searchCakeResume({ keyword, location, minSalary, maxResults });
    results['cakeresume'] = jobsCake;
    console.log(`   找到 ${jobsCake.length} 筆職缺`);
  } catch (err) {
    console.error(`   ❌ CakeResume 搜尋失敗: ${err.message}`);
  }

  // 合計
  const totalJobs = results['104'].length + results['cakeresume'].length;
  if (totalJobs === 0) {
    console.log('\n❌ 沒有找到任何職缺');
    return;
  }

  // ========== Step 3: 補充聯絡資訊（僅 104）==========
  console.log('\n📋 Step 3/4: 補充聯絡資訊（官網）');
  if (config.companyEnricher?.enabled && results['104'].length > 0) {
    const needEnrich = results['104'].filter(j => !j.contactPhone || !j.contactEmail);
    if (needEnrich.length > 0) {
      console.log(`   需補充: ${needEnrich.length} 筆`);
      results['104'] = await enrichCompanies(results['104'], {
        enabled: true,
        batchDelay: config.companyEnricher.batchDelay || 2000
      });
    } else {
      console.log('   ✅ 所有職缺已有完整聯絡資訊');
    }
  } else {
    console.log('   ⏭️  跳過（未啟用或無 104 資料）');
  }

  // ========== Step 4: 匯出結果 ==========
  console.log('\n📋 Step 4/4: 匯出結果');
  
  // 匯出 CSV
  const csvFiles = {};
  for (const [platform, jobs] of Object.entries(results)) {
    if (jobs.length > 0) {
      const filename = `${platform}_${keyword.replace(/\s+/g, '_')}_${timestamp}.csv`;
      csvFiles[platform] = exportCSV(jobs, filename);
      console.log(`   💾 ${platform}: ${csvFiles[platform]}`);
    }
  }

  // 匯出 Google Sheet
  if (config.googleSheets?.enabled) {
    console.log('\n📤 匯出到 Google Sheet...');
    for (const [platform, jobs] of Object.entries(results)) {
      if (jobs.length > 0) {
        exportToGoogleSheet(jobs, platform);
      }
    }
    console.log(`   🔗 https://docs.google.com/spreadsheets/d/${config.googleSheets.sheetId}`);
  }

  // ========== 輸出摘要 ==========
  console.log('\n' + '='.repeat(50));
  console.log('✅ 搜尋完成！');
  console.log('='.repeat(50));
  
  console.log('\n📊 結果摘要:');
  console.log(`   104: ${results['104'].length} 筆`);
  console.log(`   CakeResume: ${results['cakeresume'].length} 筆`);
  console.log(`   總計: ${totalJobs} 筆`);

  // 顯示聯絡資訊統計
  if (results['104'].length > 0) showStats(results['104'], '104');
  if (results['cakeresume'].length > 0) showStats(results['cakeresume'], 'CakeResume');

  // 預覽
  console.log('\n🔝 前 3 筆預覽 (104):');
  results['104'].slice(0, 3).forEach((job, i) => {
    console.log(`\n${i + 1}. ${job.company} - ${job.title}`);
    console.log(`   💰 ${job.salary} | 📍 ${job.location}`);
    console.log(`   👤 ${job.contactPerson || '(無)'} | 📞 ${job.contactPhone || '(無)'} | 📧 ${job.contactEmail || '(無)'}`);
  });

  console.log('\n');
}

// 執行
if (require.main === module) {
  main().catch((err) => {
    console.error('\n❌ 執行失敗:', err.message);
    process.exit(1);
  });
}

module.exports = { main };
