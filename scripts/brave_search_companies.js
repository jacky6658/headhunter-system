const { chromium } = require('playwright');
const https = require('https');
const fs = require('fs');

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const companies = JSON.parse(fs.readFileSync('/tmp/companies_no_website.json', 'utf-8'));

async function braveSearch(query) {
  return new Promise((resolve) => {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=3`;
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
          if (result.web?.results?.length) {
            // 過濾人力銀行
            const urls = result.web.results
              .map(r => r.url)
              .filter(u => !/(104\.com|1111\.com|518\.com|cakeresume|linkedin|facebook|twincn|findcompany)/i.test(u));
            resolve(urls[0] || null);
          } else {
            resolve(null);
          }
        } catch (err) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

async function scrapeContact(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
    await page.waitForTimeout(1500);
    
    const content = await page.content();
    
    // 電話
    const phonePatterns = [
      /(?:電話|Tel|TEL|Phone)[：:\s]*([0-9\-\(\)\s]{8,})/gi,
      /(0[2-9][\-\s]?[0-9]{3,4}[\-\s]?[0-9]{4})/g
    ];
    
    let phone = null;
    for (const pattern of phonePatterns) {
      const match = content.match(pattern);
      if (match) {
        phone = match[0].replace(/[電話TelTELPhone：:\s]/gi, '').trim();
        if (phone.length >= 8) break;
      }
    }
    
    // 信箱
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = content.match(emailPattern) || [];
    const validEmail = emails.find(e => 
      !/(example|test|png|jpg|gif|svg|css|js|woff|sentry)/i.test(e) &&
      /(info|contact|hr|service|support|sales|hello|admin|customer|marketing)/i.test(e)
    ) || emails.find(e => !/(example|test|png|jpg|gif|svg|css|js|woff|sentry)/i.test(e));
    
    return { phone, email: validEmail || null };
  } catch (err) {
    return { phone: null, email: null };
  }
}

async function main() {
  if (!BRAVE_API_KEY) {
    console.error('❌ 請設定 BRAVE_API_KEY');
    process.exit(1);
  }

  console.log(`🚀 開始處理 ${companies.length} 家公司（Brave Search）...`);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  const results = [];
  
  for (let i = 0; i < companies.length; i++) {
    const { row, company } = companies[i];
    process.stdout.write(`[${i+1}/${companies.length}] ${company.substring(0,12)}... `);
    
    // 1. Brave 搜尋官網
    const website = await braveSearch(`${company} 官網 聯絡`);
    
    if (!website) {
      console.log('🔍 找不到官網');
      results.push({ row, company, website: null, phone: null, email: null });
      continue;
    }
    
    // 2. 爬取聯絡資訊
    const { phone, email } = await scrapeContact(page, website);
    results.push({ row, company, website, phone, email });
    
    console.log(`📧 ${email || '無'}`);
    
    await page.waitForTimeout(1000);
  }
  
  await browser.close();
  
  // 統計
  const withEmail = results.filter(r => r.email);
  console.log(`\n✅ 完成！`);
  console.log(`   API 消耗: ${companies.length} 次`);
  console.log(`   找到官網: ${results.filter(r => r.website).length} 家`);
  console.log(`   有 Email: ${withEmail.length} 家`);
  
  if (withEmail.length > 0) {
    console.log('\n📧 有信箱的公司：');
    withEmail.forEach((r, i) => {
      console.log(`${i+1}. ${r.company} → ${r.email}`);
    });
  }
  
  fs.writeFileSync('/tmp/brave_search_results.json', JSON.stringify(results, null, 2));
}

main().catch(console.error);
