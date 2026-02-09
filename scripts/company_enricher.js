#!/usr/bin/env node
/**
 * 公司聯絡資訊補充器
 * 使用 Brave Search 找官網 → Playwright 爬取聯絡資訊
 */

const https = require('https');
const { chromium } = require('playwright');

// Brave Search API Key
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || process.env.BRAVE_SEARCH_API_KEY;

/**
 * 使用 Brave Search 找公司官網
 * @param {string} companyName - 公司名稱
 * @returns {Promise<string|null>} - 官網 URL
 */
async function findCompanyWebsite(companyName) {
  if (!BRAVE_API_KEY) {
    console.warn('⚠️  未設定 BRAVE_API_KEY');
    return null;
  }

  const query = `${companyName} 官網`;
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=3`;

  return new Promise((resolve) => {
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
          
          if (result.message || !result.web?.results?.length) {
            resolve(null);
            return;
          }
          
          // 取第一個結果的 URL
          const websiteUrl = result.web.results[0].url;
          resolve(websiteUrl);
        } catch (err) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

/**
 * 爬取官網聯絡資訊
 * @param {string} websiteUrl - 官網 URL
 * @returns {Promise<Object>} - {contactPerson, contactPhone, contactEmail}
 */
async function scrapeContactInfo(websiteUrl) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  const result = {
    contactPerson: '',
    contactPhone: '',
    contactEmail: ''
  };

  try {
    await page.goto(websiteUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    // 嘗試找聯絡頁面連結
    const contactLinks = await page.$$eval('a', links => 
      links
        .filter(a => /contact|聯絡|關於/i.test(a.textContent || a.href))
        .map(a => a.href)
    );

    // 如果有聯絡頁面，進入該頁面
    if (contactLinks.length > 0) {
      const contactUrl = contactLinks[0];
      await page.goto(contactUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);
    }

    // 提取聯絡資訊
    const contactData = await page.evaluate(() => {
      let person = '';
      let phone = '';
      let email = '';

      // 聯絡人
      const personEl = document.querySelector('[class*="contact"] [class*="name"]') ||
                       document.querySelector('[class*="recruiter"]');
      if (personEl) person = personEl.textContent.trim();

      // 電話（正則匹配）
      const bodyText = document.body.textContent;
      const phoneMatch = bodyText.match(/(\+886|0)\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/);
      if (phoneMatch) phone = phoneMatch[0];

      // 信箱
      const emailEl = document.querySelector('a[href^="mailto:"]');
      if (emailEl) {
        email = emailEl.href.replace('mailto:', '');
      } else {
        const emailMatch = bodyText.match(/[\w\.-]+@[\w\.-]+\.\w+/);
        if (emailMatch) email = emailMatch[0];
      }

      return { person, phone, email };
    });

    result.contactPerson = contactData.person;
    result.contactPhone = contactData.phone;
    result.contactEmail = contactData.email;

  } catch (err) {
    console.error(`   ⚠️  爬取失敗: ${err.message}`);
  } finally {
    await browser.close();
  }

  return result;
}

/**
 * 補充單一公司的聯絡資訊
 * @param {Object} job - 職缺資料
 * @returns {Promise<Object>} - 補充後的職缺資料
 */
async function enrichSingleCompany(job) {
  const { company, contactPerson, contactPhone, contactEmail } = job;

  // 如果已經有完整聯絡資訊，跳過
  if (contactPerson && contactPhone && contactEmail) {
    console.log(`   ✅ ${company} (已有完整聯絡資訊)`);
    return job;
  }

  console.log(`   🔍 ${company} (補充聯絡資訊...)`);

  // 1. 找官網
  const websiteUrl = await findCompanyWebsite(company);
  if (!websiteUrl) {
    console.log(`   ⚠️  ${company} (找不到官網)`);
    return job;
  }

  console.log(`   🌐 找到官網: ${websiteUrl}`);

  // 2. 爬取聯絡資訊
  const contactInfo = await scrapeContactInfo(websiteUrl);

  // 3. 只補充缺失的欄位
  const enrichedJob = { ...job };
  if (!enrichedJob.contactPerson && contactInfo.contactPerson) {
    enrichedJob.contactPerson = contactInfo.contactPerson;
  }
  if (!enrichedJob.contactPhone && contactInfo.contactPhone) {
    enrichedJob.contactPhone = contactInfo.contactPhone;
  }
  if (!enrichedJob.contactEmail && contactInfo.contactEmail) {
    enrichedJob.contactEmail = contactInfo.contactEmail;
  }

  console.log(`   ✅ ${company} (電話: ${enrichedJob.contactPhone || '無'} | 信箱: ${enrichedJob.contactEmail || '無'})`);

  return enrichedJob;
}

/**
 * 批次補充公司聯絡資訊
 * @param {Array} jobs - 職缺列表
 * @param {Object} options - 選項
 * @returns {Promise<Array>} - 補充後的職缺列表
 */
async function enrichCompanies(jobs, options = {}) {
  const { 
    enabled = true, 
    batchDelay = 2000, // 每次查詢間隔 2 秒
  } = options;

  if (!enabled) {
    console.log('ℹ️  聯絡資訊補充功能已停用');
    return jobs;
  }

  if (!BRAVE_API_KEY) {
    console.warn('⚠️  未設定 BRAVE_API_KEY');
    return jobs;
  }

  console.log(`\n🔍 開始補充聯絡資訊...`);
  console.log(`   共 ${jobs.length} 筆職缺`);

  const enrichedJobs = [];

  // 按公司去重，已有完整資訊的公司只處理一次
  const processedCompanies = new Map();

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const company = job.company;

    // 如果該公司已處理過，複用聯絡資訊
    if (processedCompanies.has(company)) {
      const cachedContact = processedCompanies.get(company);
      enrichedJobs.push({
        ...job,
        contactPerson: job.contactPerson || cachedContact.contactPerson,
        contactPhone: job.contactPhone || cachedContact.contactPhone,
        contactEmail: job.contactEmail || cachedContact.contactEmail
      });
      continue;
    }

    // 處理新公司
    const enrichedJob = await enrichSingleCompany(job);
    enrichedJobs.push(enrichedJob);

    // 快取該公司的聯絡資訊
    processedCompanies.set(company, {
      contactPerson: enrichedJob.contactPerson,
      contactPhone: enrichedJob.contactPhone,
      contactEmail: enrichedJob.contactEmail
    });

    // 每處理一家公司休息一下
    if (i < jobs.length - 1) {
      await new Promise(resolve => setTimeout(resolve, batchDelay));
    }
  }

  console.log(`✅ 聯絡資訊補充完成！\n`);
  return enrichedJobs;
}

module.exports = {
  findCompanyWebsite,
  scrapeContactInfo,
  enrichSingleCompany,
  enrichCompanies
};
