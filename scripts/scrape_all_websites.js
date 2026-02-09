const { chromium } = require('playwright');
const fs = require('fs');

const companies = JSON.parse(fs.readFileSync('/tmp/companies_with_website.json', 'utf-8'));

// 跳過已處理的前 26 家
const toProcess = companies.slice(26);

async function scrapeContact(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
    await page.waitForTimeout(1500);
    
    const content = await page.content();
    
    // 提取電話
    const phonePatterns = [
      /(?:電話|Tel|TEL|Phone|聯絡電話)[：:\s]*([0-9\-\(\)\s]{8,})/gi,
      /(\+?886[\-\s]?[0-9\-\s]{8,})/g,
      /(0[2-9][\-\s]?[0-9]{3,4}[\-\s]?[0-9]{4})/g
    ];
    
    let phone = null;
    for (const pattern of phonePatterns) {
      const match = content.match(pattern);
      if (match) {
        phone = match[0].replace(/[電話TelTELPhone聯絡：:\s]/gi, '').trim();
        if (phone.length >= 8) break;
      }
    }
    
    // 提取信箱
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = content.match(emailPattern) || [];
    const validEmail = emails.find(e => 
      !/(example|test|png|jpg|gif|svg|css|js|woff|ttf)/i.test(e) &&
      /(info|contact|hr|service|support|sales|hello|admin|customer|marketing)/i.test(e)
    ) || emails.find(e => !/(example|test|png|jpg|gif|svg|css|js|woff|ttf)/i.test(e));
    
    return { phone, email: validEmail || null };
  } catch (err) {
    return { phone: null, email: null };
  }
}

async function main() {
  console.log(`🚀 開始爬取 ${toProcess.length} 家公司...`);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  const results = [];
  
  for (let i = 0; i < toProcess.length; i++) {
    const { row, company, website } = toProcess[i];
    process.stdout.write(`[${i+1}/${toProcess.length}] ${company.substring(0,15)}... `);
    
    const { phone, email } = await scrapeContact(page, website);
    results.push({ row, company, website, phone, email });
    
    console.log(`📧 ${email || '無'}`);
    
    await page.waitForTimeout(1000 + Math.random() * 500);
  }
  
  await browser.close();
  
  // 合併之前的結果
  const prevResults = JSON.parse(fs.readFileSync('/tmp/contact_results.json', 'utf-8'));
  const allResults = [...prevResults, ...results];
  
  // 統計
  const withEmail = allResults.filter(r => r.email && !/(png|jpg|gif|svg|css|js)/i.test(r.email));
  console.log(`\n✅ 全部完成！`);
  console.log(`   總處理: ${allResults.length} 家`);
  console.log(`   有 Email: ${withEmail.length} 家`);
  
  // 輸出有 Email 的公司
  console.log('\n📧 有信箱的公司：');
  withEmail.forEach((r, i) => {
    console.log(`${i+1}. ${r.company} → ${r.email}`);
  });
  
  // 儲存結果
  fs.writeFileSync('/tmp/all_contact_results.json', JSON.stringify(allResults, null, 2));
  fs.writeFileSync('/tmp/emails_only.json', JSON.stringify(withEmail, null, 2));
}

main().catch(console.error);
