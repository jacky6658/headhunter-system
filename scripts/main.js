#!/usr/bin/env node
/**
 * 獵頭系統主程式
 * 整合：104 爬蟲 + Brave Search 公司資訊補充 + CSV 匯出
 */

const { search104, exportCSV } = require('./search_104');
const { enrichCompanies, exportEnrichedCSV } = require('./company_enricher');
const fs = require('fs');
const path = require('path');

// 讀取配置
const configPath = path.join(__dirname, '../config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

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

  // Step 1: 搜尋 104 職缺
  console.log('\n📋 Step 1/3: 搜尋 104 職缺');
  const jobs = await search104({ keyword, location, minSalary });

  if (jobs.length === 0) {
    console.log('❌ 沒有找到符合的職缺');
    return;
  }

  // Step 2: 補充公司資訊（Brave Search）
  console.log('\n📋 Step 2/3: 補充公司資訊');
  let enrichedJobs = jobs;

  if (config.companyEnricher.enabled) {
    enrichedJobs = await enrichCompanies(jobs, {
      enabled: config.companyEnricher.enabled,
      batchDelay: config.companyEnricher.batchDelay,
      maxConcurrent: config.companyEnricher.maxConcurrent
    });
  } else {
    console.log('ℹ️  公司資訊補充功能已停用（config.json）');
  }

  // Step 3: 匯出 CSV
  console.log('\n📋 Step 3/3: 匯出結果');
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `104_enriched_${keyword.replace(/\s+/g, '_')}_${timestamp}.csv`;

  let csvPath;
  if (config.companyEnricher.enabled && enrichedJobs[0]?.companyInfo) {
    csvPath = exportEnrichedCSV(enrichedJobs, filename);
  } else {
    csvPath = exportCSV(jobs, filename);
  }

  // 輸出摘要
  console.log('\n' + '='.repeat(50));
  console.log('✅ 搜尋完成！');
  console.log('='.repeat(50));
  console.log(`📊 關鍵字: ${keyword}`);
  console.log(`📍 地點: ${location || '不限'}`);
  console.log(`💰 最低薪資: ${minSalary ? `${minSalary.toLocaleString()} 元` : '不限'}`);
  console.log(`📦 找到: ${enrichedJobs.length} 筆職缺`);
  console.log(`💾 檔案: ${csvPath}`);
  
  console.log('\n🔝 前 3 筆預覽:');
  enrichedJobs.slice(0, 3).forEach((job, i) => {
    console.log(`\n${i + 1}. ${job.company} - ${job.title}`);
    console.log(`   💰 ${job.salary} | 📍 ${job.location}`);
    console.log(`   🔗 ${job.link}`);
    
    if (job.companyInfo && job.companyInfo.summary) {
      console.log(`   ℹ️  ${job.companyInfo.summary.substring(0, 80)}...`);
    }
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
