const { chromium } = require('playwright');
const fs = require('fs');

const companies = JSON.parse(fs.readFileSync('/tmp/companies_104_only.json', 'utf-8'));

async function scrapeContact(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
    
    const content = await page.content();
    
    // 104 公司頁面結構提取
    // 電話
    const phonePatterns = [
      /電話[：:\s]*([0-9\-\(\)\s]{8,})/gi,
      /(0[2-9][\-\s]?[0-9]{3,4}[\-\s]?[0-9]{4})/g
    ];
    
    let phone = null;
    for (const pattern of phonePatterns) {
      const match = content.match(pattern);
      if (match) {
        phone = match[0].replace(/[電話：:\s]/gi, '').trim();
        if (phone.length >= 8) break;
      }
    }
    
    // 信箱
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = content.match(emailPattern) || [];
    const validEmail = emails.find(e => 
      !/(104\.com|example|test|png|jpg|gif|svg|css|js|woff)/i.test(e)
    );
    
    return { phone, email: validEmail || null };
  } catch (err) {
    return { phone: null, email: null };
  }
}

async function main() {
  console.log(`🚀 開始爬取 ${companies.length} 家 104 公司頁面...`);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  const results = [];
  
  for (let i = 0; i < companies.length; i++) {
    const { row, company, link104 } = companies[i];
    process.stdout.write(`[${i+1}/${companies.length}] ${company.substring(0,12)}... `);
    
    const { phone, email } = await scrapeContact(page, link104);
    results.push({ row, company, link104, phone, email });
    
    console.log(`📧 ${email || '無'}`);
    
    await page.waitForTimeout(1500 + Math.random() * 1000);
  }
  
  await browser.close();
  
  // 統計
  const withEmail = results.filter(r => r.email);
  console.log(`\n✅ 完成！`);
  console.log(`   總處理: ${results.length} 家`);
  console.log(`   有 Email: ${withEmail.length} 家`);
  
  // 輸出有 Email 的公司
  if (withEmail.length > 0) {
    console.log('\n📧 有信箱的公司：');
    withEmail.forEach((r, i) => {
      console.log(`${i+1}. ${r.company} → ${r.email}`);
    });
  }
  
  // 儲存結果
  fs.writeFileSync('/tmp/104_contact_results.json', JSON.stringify(results, null, 2));
  fs.writeFileSync('/tmp/104_emails_only.json', JSON.stringify(withEmail, null, 2));
}

main().catch(console.error);
