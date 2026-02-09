#!/usr/bin/env node
/**
 * 公司資訊補充器
 * 使用 Brave Search API 查詢公司背景、新聞、評價
 */

const https = require('https');

// Brave Search API Key（從環境變數讀取）
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || process.env.BRAVE_SEARCH_API_KEY;

/**
 * 使用 Brave Search 查詢公司資訊
 * @param {string} companyName - 公司名稱
 * @returns {Promise<Object>} - 公司資訊
 */
async function searchCompanyInfo(companyName) {
  if (!BRAVE_API_KEY) {
    console.warn('⚠️  未設定 BRAVE_API_KEY，跳過公司資訊補充');
    return null;
  }

  const query = `${companyName} 公司 評價 薪資`;
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=3`;

  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': BRAVE_API_KEY
      }
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          
          if (result.message) {
            console.error(`❌ Brave Search API 錯誤: ${result.message}`);
            resolve(null);
            return;
          }
          
          const enrichedInfo = {
            companyName,
            sources: [],
            summary: ''
          };

          if (result.web && result.web.results && result.web.results.length > 0) {
            enrichedInfo.sources = result.web.results.slice(0, 3).map(item => ({
              title: item.title,
              url: item.url,
              description: item.description
            }));
            
            // 簡單摘要（取第一個結果的描述）
            enrichedInfo.summary = result.web.results[0].description || '';
          }

          resolve(enrichedInfo);
        } catch (err) {
          console.error(`❌ 解析 Brave Search 結果失敗: ${err.message}`);
          resolve(null);
        }
      });
    }).on('error', (err) => {
      console.error(`❌ Brave Search 請求失敗: ${err.message}`);
      resolve(null);
    });
  });
}

/**
 * 批次補充公司資訊
 * @param {Array} jobs - 職缺列表
 * @param {Object} options - 選項
 * @returns {Promise<Array>} - 補充後的職缺列表
 */
async function enrichCompanies(jobs, options = {}) {
  const { 
    enabled = true, 
    batchDelay = 1000, // 每次查詢間隔 1 秒
    maxConcurrent = 3  // 最多同時查詢 3 家公司
  } = options;

  if (!enabled) {
    console.log('ℹ️  公司資訊補充功能已停用');
    return jobs;
  }

  if (!BRAVE_API_KEY) {
    console.warn('⚠️  未設定 BRAVE_API_KEY，跳過公司資訊補充');
    return jobs;
  }

  console.log(`\n🔍 開始補充公司資訊...`);
  console.log(`   共 ${jobs.length} 家公司`);

  // 去重（同一家公司只查一次）
  const uniqueCompanies = [...new Set(jobs.map(job => job.company))];
  console.log(`   去重後: ${uniqueCompanies.length} 家公司`);

  const companyInfoCache = {};

  // 分批處理
  for (let i = 0; i < uniqueCompanies.length; i += maxConcurrent) {
    const batch = uniqueCompanies.slice(i, i + maxConcurrent);
    
    console.log(`   處理第 ${i + 1}-${Math.min(i + maxConcurrent, uniqueCompanies.length)} 家...`);

    const promises = batch.map(async (companyName) => {
      try {
        const info = await searchCompanyInfo(companyName);
        if (info) {
          companyInfoCache[companyName] = info;
          console.log(`   ✅ ${companyName}`);
        } else {
          console.log(`   ⚠️  ${companyName} (無資訊)`);
        }
      } catch (err) {
        console.error(`   ❌ ${companyName}: ${err.message}`);
      }
    });

    await Promise.all(promises);

    // 批次間延遲
    if (i + maxConcurrent < uniqueCompanies.length) {
      await new Promise(resolve => setTimeout(resolve, batchDelay));
    }
  }

  // 將補充資訊加入職缺資料
  const enrichedJobs = jobs.map(job => ({
    ...job,
    companyInfo: companyInfoCache[job.company] || null
  }));

  console.log(`✅ 公司資訊補充完成！\n`);
  return enrichedJobs;
}

/**
 * 匯出補充後的 CSV（包含公司資訊）
 */
function exportEnrichedCSV(data, filename) {
  const fs = require('fs');
  const path = require('path');

  const csvDir = path.join(__dirname, '../data');
  const csvPath = path.join(csvDir, filename);

  // CSV 標頭（新增公司摘要和來源）
  const headers = [
    '公司名稱', 
    '職缺標題', 
    '薪資範圍', 
    '地點', 
    '經驗要求', 
    '連結', 
    '更新日期',
    '公司簡介',
    '資料來源1',
    '資料來源2',
    '資料來源3'
  ];
  const rows = [headers.join(',')];

  // 資料行
  data.forEach(job => {
    const companyInfo = job.companyInfo || {};
    const sources = companyInfo.sources || [];

    const row = [
      `"${job.company}"`,
      `"${job.title}"`,
      `"${job.salary}"`,
      `"${job.location}"`,
      `"${job.experience}"`,
      `"${job.link}"`,
      `"${job.updateDate}"`,
      `"${companyInfo.summary || ''}"`,
      sources[0] ? `"${sources[0].title} - ${sources[0].url}"` : '""',
      sources[1] ? `"${sources[1].title} - ${sources[1].url}"` : '""',
      sources[2] ? `"${sources[2].title} - ${sources[2].url}"` : '""'
    ];
    rows.push(row.join(','));
  });

  const csvContent = rows.join('\n');
  fs.writeFileSync(csvPath, '\uFEFF' + csvContent); // 加 BOM 支援 Excel 中文

  console.log(`💾 已儲存補充版 CSV: ${csvPath}`);
  return csvPath;
}

module.exports = {
  searchCompanyInfo,
  enrichCompanies,
  exportEnrichedCSV
};
