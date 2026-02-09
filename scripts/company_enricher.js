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
 * 從頁面提取聯絡資訊（獨立函數）
 * @param {Page} page - Playwright Page 物件
 * @returns {Promise<Object>} - {person, phone, email}
 */
async function extractContactInfo(page) {
  return await page.evaluate(() => {
    let person = '';
    let phone = '';
    let email = '';

    // === 電話提取（改善正則，支援更多格式）===
    const bodyText = document.body.textContent;
    
    // 台灣電話格式：
    // 1. 手機：09xx-xxx-xxx 或 09xxxxxxxx (10碼)
    // 2. 市話：(02)xxxx-xxxx, 02-xxxx-xxxx, +886-2-xxxx-xxxx
    // 3. 客服：0800-xxx-xxx
    const phonePatterns = [
      /\+886[-\s]?[29][-\s]?[0-9]{4}[-\s]?[0-9]{4}/,           // +886-2-xxxx-xxxx
      /\(0[2-9]\)[-\s]?[0-9]{4}[-\s]?[0-9]{4}/,                // (02)xxxx-xxxx
      /0[2-9][-\s]?[0-9]{4}[-\s]?[0-9]{4}/,                    // 02-xxxx-xxxx (市話 9碼)
      /09[0-9]{2}[-\s]?[0-9]{3}[-\s]?[0-9]{3}/,                // 09xx-xxx-xxx (手機 10碼)
      /0800[-\s]?[0-9]{3}[-\s]?[0-9]{3}/                       // 0800-xxx-xxx
    ];
    
    for (const pattern of phonePatterns) {
      const match = bodyText.match(pattern);
      if (match) {
        let phoneNum = match[0].replace(/\s+/g, '').replace(/-/g, '');
        // 驗證電話長度（排除異常號碼）
        const digitsOnly = phoneNum.replace(/\D/g, '');
        // 市話 9-10 碼，手機 10 碼，0800 10 碼，+886 開頭 12 碼
        if (digitsOnly.length >= 9 && digitsOnly.length <= 12) {
          // 排除全 0 或重複數字的假號碼
          if (!/^0{5,}/.test(digitsOnly) && !/(\d)\1{6,}/.test(digitsOnly)) {
            phone = match[0].replace(/\s+/g, ' ').trim();
            break;
          }
        }
      }
    }

    // 如果還沒找到，嘗試 footer
    if (!phone) {
      const footer = document.querySelector('footer') || document.querySelector('[class*="footer"]');
      if (footer) {
        const footerText = footer.textContent;
        for (const pattern of phonePatterns) {
          const match = footerText.match(pattern);
          if (match) {
            phone = match[0].replace(/\s+/g, ' ').trim();
            break;
          }
        }
      }
    }

    // === 信箱提取（改善過濾）===
    // 優先找 mailto 連結
    const emailLinks = Array.from(document.querySelectorAll('a[href^="mailto:"]'));
    if (emailLinks.length > 0) {
      // 過濾掉 noreply, no-reply, donotreply 等
      const validEmail = emailLinks.find(a => {
        const addr = a.href.replace('mailto:', '');
        return !/noreply|no-reply|donotreply/i.test(addr);
      });
      if (validEmail) {
        email = validEmail.href.replace('mailto:', '').split('?')[0]; // 移除查詢參數
      }
    }
    
    // 如果沒找到，用正則
    if (!email) {
      const emailMatches = bodyText.match(/[\w\.-]+@[\w\.-]+\.\w{2,}/g);
      if (emailMatches) {
        // 過濾並選擇最可能的
        const validEmails = emailMatches.filter(e => 
          !/noreply|no-reply|donotreply|example\.com|test\.com/i.test(e)
        );
        if (validEmails.length > 0) {
          // 優先選擇包含 info, contact, hr, service 的信箱
          email = validEmails.find(e => /info|contact|hr|service|招募|人才/i.test(e)) || validEmails[0];
        }
      }
    }

    // === 聯絡人提取（擴展選擇器）===
    const personSelectors = [
      '[class*="contact"] [class*="name"]',
      '[class*="recruiter"]',
      '[class*="hr"]',
      '[class*="人資"]',
      '[class*="聯絡人"]'
    ];
    
    for (const selector of personSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        person = el.textContent.trim();
        break;
      }
    }

    return { person, phone, email };
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

    // 嘗試找聯絡頁面連結（擴展關鍵字）
    const contactLinks = await page.$$eval('a', links => 
      links
        .filter(a => {
          const text = (a.textContent || '').toLowerCase();
          const href = (a.href || '').toLowerCase();
          return /contact|聯絡|關於|about|公司介紹|公司簡介|聯繫|客服|服務|招募|人才|careers/i.test(text + href);
        })
        .map(a => a.href)
        .filter((href, index, self) => self.indexOf(href) === index) // 去重
    );

    // 優先順序：contact > 聯絡 > about > 其他
    const priorityLinks = contactLinks.sort((a, b) => {
      const scoreA = /contact|聯絡/i.test(a) ? 3 : /about|關於/i.test(a) ? 2 : 1;
      const scoreB = /contact|聯絡/i.test(b) ? 3 : /about|關於/i.test(b) ? 2 : 1;
      return scoreB - scoreA;
    });

    // 嘗試前 2 個聯絡頁面
    const pagesToTry = [websiteUrl, ...priorityLinks.slice(0, 2)];
    const allContactData = [];

    for (const pageUrl of pagesToTry) {
      try {
        if (pageUrl !== websiteUrl) {
          await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(1500);
        }

        const contactData = await extractContactInfo(page);
        allContactData.push(contactData);
        
        // 如果已經找齊資料，提前結束
        if (contactData.phone && contactData.email) break;
      } catch (err) {
        // 繼續嘗試下一個頁面
      }
    }

    // 合併所有頁面的資料（優先使用最完整的）
    const mergedData = allContactData.reduce((best, current) => ({
      person: best.person || current.person,
      phone: best.phone || current.phone,
      email: best.email || current.email
    }), { person: '', phone: '', email: '' });

    result.contactPerson = mergedData.person;
    result.contactPhone = mergedData.phone;
    result.contactEmail = mergedData.email;

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
