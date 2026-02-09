#!/usr/bin/env node
/**
 * 獵頭系統主程式
 * 整合：104 爬蟲（含聯絡資訊）+ 官網聯絡資訊補充 + CSV 匯出
 */

const { search104 } = require('./search_104');
const { enrichCompanies } = require('./company_enricher');
const fs = require('fs');
const path = require('path');

// 讀取配置
const configPath = path.join(__dirname, '../config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

/**
 * 匯出完整 CSV（包含聯絡資訊）
 */
function exportFinalCSV(data, filename) {
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
      `"${(job.description || '').replace(/"/g, '""').substring(0, 300)}"`,
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
 * 主流程
 */
async function main() {
  const args = process.argv.slice(2);
  const keyword = args[0] || 'AI 工程師';
  const location = args[1] || '';
  const minSalary = args[2] ? parseInt(args[2]) : 0;

  console.log('🦞 OpenClaw 獵頭系統');
  console.log('='.repeat(50));

  // Step 1: 搜尋 104 職缺（含基本聯絡資訊）
  console.log('\n📋 Step 1/2: 搜尋 104 職缺');
  const jobs = await search104({ keyword, location, minSalary });

  if (jobs.length === 0) {
    console.log('❌ 沒有找到符合的職缺');
    return;
  }

  // 統計聯絡資訊完整度
  const contactStats = {
    total: jobs.length,
    hasPerson: jobs.filter(j => j.contactPerson).length,
    hasPhone: jobs.filter(j => j.contactPhone).length,
    hasEmail: jobs.filter(j => j.contactEmail).length,
    hasAny: jobs.filter(j => j.contactPerson || j.contactPhone || j.contactEmail).length
  };

  console.log(`\n📊 聯絡資訊統計:`);
  console.log(`   聯絡人: ${contactStats.hasPerson}/${contactStats.total} 筆`);
  console.log(`   電話: ${contactStats.hasPhone}/${contactStats.total} 筆`);
  console.log(`   信箱: ${contactStats.hasEmail}/${contactStats.total} 筆`);
  console.log(`   至少一項: ${contactStats.hasAny}/${contactStats.total} 筆`);

  // Step 2: 補充缺失的聯絡資訊（官網爬蟲）
  console.log('\n📋 Step 2/2: 補充聯絡資訊（官網）');
  let enrichedJobs = jobs;

  if (config.companyEnricher.enabled) {
    // 只處理缺少聯絡資訊的職缺
    const needEnrichment = jobs.filter(j => !j.contactPerson || !j.contactPhone || !j.contactEmail);
    
    if (needEnrichment.length > 0) {
      console.log(`   需補充: ${needEnrichment.length} 筆`);
      enrichedJobs = await enrichCompanies(jobs, {
        enabled: config.companyEnricher.enabled,
        batchDelay: config.companyEnricher.batchDelay
      });
    } else {
      console.log('   ✅ 所有職缺已有完整聯絡資訊，跳過補充');
    }
  } else {
    console.log('ℹ️  聯絡資訊補充功能已停用（config.json）');
  }

  // Step 3: 匯出 CSV
  console.log('\n📋 Step 3/3: 匯出結果');
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `104_${keyword.replace(/\s+/g, '_')}_${timestamp}.csv`;
  const csvPath = exportFinalCSV(enrichedJobs, filename);

  // 輸出摘要
  const finalStats = {
    hasPerson: enrichedJobs.filter(j => j.contactPerson).length,
    hasPhone: enrichedJobs.filter(j => j.contactPhone).length,
    hasEmail: enrichedJobs.filter(j => j.contactEmail).length
  };

  console.log('\n' + '='.repeat(50));
  console.log('✅ 搜尋完成！');
  console.log('='.repeat(50));
  console.log(`📊 關鍵字: ${keyword}`);
  console.log(`📍 地點: ${location || '不限'}`);
  console.log(`💰 最低薪資: ${minSalary ? `${minSalary.toLocaleString()} 元` : '不限'}`);
  console.log(`📦 找到: ${enrichedJobs.length} 筆職缺`);
  console.log(`💾 檔案: ${csvPath}`);
  
  console.log(`\n📞 最終聯絡資訊:`);
  console.log(`   聯絡人: ${finalStats.hasPerson}/${enrichedJobs.length} 筆`);
  console.log(`   電話: ${finalStats.hasPhone}/${enrichedJobs.length} 筆`);
  console.log(`   信箱: ${finalStats.hasEmail}/${enrichedJobs.length} 筆`);
  
  console.log('\n🔝 前 3 筆預覽:');
  enrichedJobs.slice(0, 3).forEach((job, i) => {
    console.log(`\n${i + 1}. ${job.company} - ${job.title}`);
    console.log(`   💰 ${job.salary} | 📍 ${job.location}`);
    console.log(`   👤 ${job.contactPerson || '(無)'} | 📞 ${job.contactPhone || '(無)'} | 📧 ${job.contactEmail || '(無)'}`);
    console.log(`   🔗 ${job.link}`);
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
