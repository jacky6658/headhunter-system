#!/usr/bin/env node
/**
 * 公司聯絡資訊反查工具
 * 輸入公司名稱，查詢電話和信箱
 * 
 * 用法：
 *   node company_lookup.js "公司名稱"
 *   node company_lookup.js "公司1" "公司2" "公司3"
 * 
 * AI 對話觸發範例：
 *   「查詢 精誠資訊 的聯絡方式」
 *   「幫我找 台積電 的電話和信箱」
 */

const { findCompanyWebsite, scrapeContactInfo } = require('./company_enricher');

/**
 * 查詢單一公司
 */
async function lookupCompany(companyName) {
  console.log(`\n🔍 查詢: ${companyName}`);
  
  // 1. 找官網
  const websiteUrl = await findCompanyWebsite(companyName);
  if (!websiteUrl) {
    return {
      company: companyName,
      website: null,
      phone: null,
      email: null,
      error: '找不到官網'
    };
  }
  
  console.log(`   🌐 官網: ${websiteUrl}`);
  
  // 2. 爬取聯絡資訊
  const contactInfo = await scrapeContactInfo(websiteUrl);
  
  return {
    company: companyName,
    website: websiteUrl,
    phone: contactInfo.contactPhone || null,
    email: contactInfo.contactEmail || null,
    error: null
  };
}

/**
 * 批次查詢多個公司
 */
async function lookupCompanies(companyNames) {
  const results = [];
  
  for (let i = 0; i < companyNames.length; i++) {
    const name = companyNames[i];
    const result = await lookupCompany(name);
    results.push(result);
    
    // 顯示結果
    if (result.error) {
      console.log(`   ❌ ${result.error}`);
    } else {
      console.log(`   📞 電話: ${result.phone || '(無)'}`);
      console.log(`   📧 信箱: ${result.email || '(無)'}`);
    }
    
    // 間隔避免被封鎖
    if (i < companyNames.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  return results;
}

/**
 * 格式化輸出結果
 */
function formatResults(results) {
  console.log('\n' + '='.repeat(50));
  console.log('📊 查詢結果摘要');
  console.log('='.repeat(50));
  
  results.forEach((r, i) => {
    console.log(`\n${i + 1}. ${r.company}`);
    if (r.error) {
      console.log(`   ❌ ${r.error}`);
    } else {
      console.log(`   🌐 ${r.website}`);
      console.log(`   📞 ${r.phone || '(無)'}`);
      console.log(`   📧 ${r.email || '(無)'}`);
    }
  });
  
  // 統計
  const success = results.filter(r => !r.error).length;
  const hasPhone = results.filter(r => r.phone).length;
  const hasEmail = results.filter(r => r.email).length;
  
  console.log('\n' + '-'.repeat(50));
  console.log(`✅ 成功查詢: ${success}/${results.length}`);
  console.log(`📞 有電話: ${hasPhone}/${results.length}`);
  console.log(`📧 有信箱: ${hasEmail}/${results.length}`);
  
  return results;
}

// CLI 執行
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('🔍 公司聯絡資訊反查工具');
    console.log('');
    console.log('用法:');
    console.log('  node company_lookup.js "公司名稱"');
    console.log('  node company_lookup.js "公司1" "公司2" "公司3"');
    console.log('');
    console.log('範例:');
    console.log('  node company_lookup.js "精誠資訊"');
    console.log('  node company_lookup.js "台積電" "聯發科" "鴻海"');
    process.exit(0);
  }
  
  console.log('🔍 公司聯絡資訊反查');
  console.log(`   查詢 ${args.length} 家公司...`);
  
  const results = await lookupCompanies(args);
  formatResults(results);
  
  // 輸出 JSON（方便程式處理）
  if (process.env.JSON_OUTPUT === 'true') {
    console.log('\n📄 JSON 輸出:');
    console.log(JSON.stringify(results, null, 2));
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ 執行失敗:', err.message);
    process.exit(1);
  });
}

module.exports = { lookupCompany, lookupCompanies };
