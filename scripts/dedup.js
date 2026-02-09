#!/usr/bin/env node
/**
 * 職缺去重模組
 * 記錄已爬過的職缺，避免重複
 */

const fs = require('fs');
const path = require('path');

// 快取檔案路徑
const CACHE_PATH = path.join(__dirname, '../data/cache/seen_jobs.json');
const CACHE_EXPIRE_DAYS = 7; // 7 天後重新爬取

/**
 * 載入快取
 */
function loadCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    }
  } catch (err) {
    console.warn('⚠️  快取讀取失敗，建立新快取');
  }
  return { jobs: {}, lastCleanup: Date.now() };
}

/**
 * 儲存快取
 */
function saveCache(cache) {
  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

/**
 * 生成職缺唯一 ID
 */
function generateJobId(job) {
  // 使用 URL 或 公司+職稱 作為唯一識別
  if (job.link) {
    return job.link;
  }
  return `${job.company}_${job.title}`.replace(/\s+/g, '_');
}

/**
 * 檢查職缺是否已存在（且未過期）
 */
function isDuplicate(job, cache) {
  const jobId = generateJobId(job);
  const record = cache.jobs[jobId];
  
  if (!record) return false;
  
  // 檢查是否過期
  const expireMs = CACHE_EXPIRE_DAYS * 24 * 60 * 60 * 1000;
  if (Date.now() - record.timestamp > expireMs) {
    return false; // 已過期，可以重新爬取
  }
  
  return true;
}

/**
 * 標記職缺為已處理
 */
function markAsSeen(job, cache) {
  const jobId = generateJobId(job);
  cache.jobs[jobId] = {
    timestamp: Date.now(),
    company: job.company,
    title: job.title,
    platform: job.platform || 'unknown'
  };
}

/**
 * 清理過期的快取記錄
 */
function cleanupExpired(cache) {
  const expireMs = CACHE_EXPIRE_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let cleaned = 0;
  
  for (const [jobId, record] of Object.entries(cache.jobs)) {
    if (now - record.timestamp > expireMs) {
      delete cache.jobs[jobId];
      cleaned++;
    }
  }
  
  cache.lastCleanup = now;
  return cleaned;
}

/**
 * 過濾重複職缺
 * @param {Array} jobs - 職缺列表
 * @param {Object} options - 選項
 * @returns {Object} - { unique: 不重複的職缺, duplicates: 重複的職缺, cache: 更新後的快取 }
 */
function filterDuplicates(jobs, options = {}) {
  const { 
    markSeen = true,  // 是否標記為已處理
    cleanup = true    // 是否清理過期記錄
  } = options;
  
  const cache = loadCache();
  
  // 定期清理（每天最多一次）
  if (cleanup && Date.now() - cache.lastCleanup > 24 * 60 * 60 * 1000) {
    const cleaned = cleanupExpired(cache);
    if (cleaned > 0) {
      console.log(`   🗑️  清理 ${cleaned} 筆過期快取`);
    }
  }
  
  const unique = [];
  const duplicates = [];
  
  for (const job of jobs) {
    if (isDuplicate(job, cache)) {
      duplicates.push(job);
    } else {
      unique.push(job);
      if (markSeen) {
        markAsSeen(job, cache);
      }
    }
  }
  
  if (markSeen) {
    saveCache(cache);
  }
  
  return { unique, duplicates, cache };
}

/**
 * 取得快取統計
 */
function getStats() {
  const cache = loadCache();
  const total = Object.keys(cache.jobs).length;
  
  // 按平台統計
  const byPlatform = {};
  for (const record of Object.values(cache.jobs)) {
    const platform = record.platform || 'unknown';
    byPlatform[platform] = (byPlatform[platform] || 0) + 1;
  }
  
  return { total, byPlatform, lastCleanup: cache.lastCleanup };
}

/**
 * 清空快取
 */
function clearCache() {
  const cache = { jobs: {}, lastCleanup: Date.now() };
  saveCache(cache);
  return true;
}

// CLI 模式
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--stats')) {
    const stats = getStats();
    console.log('📊 快取統計:');
    console.log(`   總數: ${stats.total} 筆`);
    console.log(`   平台分布:`, stats.byPlatform);
    console.log(`   最後清理: ${new Date(stats.lastCleanup).toLocaleString()}`);
  } else if (args.includes('--clear')) {
    clearCache();
    console.log('✅ 快取已清空');
  } else {
    console.log('職缺去重模組');
    console.log('');
    console.log('用法:');
    console.log('  node dedup.js --stats   查看快取統計');
    console.log('  node dedup.js --clear   清空快取');
  }
}

module.exports = {
  loadCache,
  saveCache,
  isDuplicate,
  markAsSeen,
  filterDuplicates,
  getStats,
  clearCache,
  CACHE_EXPIRE_DAYS
};
