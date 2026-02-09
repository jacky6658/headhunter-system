const { chromium } = require('playwright');

const companies = [
  { company: '誌磊實業股份有限公司', website: 'https://www.grandmaxx.com.tw/' },
  { company: '台灣意高藥品有限公司', website: 'https://www.egopharm.com/tw/zh_tw.html' },
  { company: '台灣賀利氏材料科技股份有限公司', website: 'https://www.heraeus.com/en/group/home/home.html' },
  { company: '優納比科技股份有限公司', website: 'https://www.unabiz.com/' },
  { company: '捷敏數據有限公司', website: 'https://www.geminidata.com/' },
  { company: '台灣科奈特科技股份有限公司', website: 'https://www.verint.com/' },
  { company: '台灣豪威光電科技股份有限公司', website: 'https://www.ovt.com/' },
  { company: '台灣亞德諾半導體股份有限公司', website: 'https://www.analog.com/en/index.html' },
  { company: '台灣康普通信系統有限公司', website: 'https://www.commscope.com/ruckus/' },
  { company: '台灣塞爾克斯應用生技有限公司', website: 'https://www.sciex.com/' },
  { company: '格雷維蒂互動股份有限公司', website: 'https://www.gnjoy.com.tw/' },
  { company: '台灣耐格如信有限公司', website: 'http://www.nagra.com/' },
  { company: '台灣富友聯合食品有限公司', website: 'https://foodunion.com/' },
  { company: '台灣貳陸有限公司', website: 'https://ii-vi.com/' },
  { company: '聖勝科技有限公司', website: 'http://www.st-win.com.tw/' },
  { company: '麒點科技有限公司', website: 'https://kronosresearch.com/' },
  { company: '益遊數位股份有限公司', website: 'https://www.playerium.com/' },
  { company: '皮格瑪有限公司', website: 'https://www.neondoctrine.com/' },
  { company: '佑廸實業有限公司', website: 'http://www.yourstextile.com/' },
  { company: '輔翼科技股份有限公司', website: 'https://www.flaps.com.tw/' },
  { company: '思必瑞股份有限公司', website: 'https://www.spirox.com/' },
  { company: '美商亞仕得科技有限公司', website: 'https://www.axalta.com/' },
  { company: '德誼數位科技股份有限公司', website: 'https://www.deyi.com.tw/' },
  { company: '韓商浦鐵重工股份有限公司', website: 'http://posco-plt.com/' },
  { company: '緯來電視網股份有限公司', website: 'https://www.videoland.com.tw/' },
  { company: '安豐紡織股份有限公司', website: 'http://www.anfon.com.tw/' }
];

async function scrapeContact(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
    
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
      !/(example|test|png|jpg|gif|svg|css|js)/i.test(e) &&
      /(info|contact|hr|service|support|sales|hello|admin)/i.test(e)
    ) || emails[0];
    
    return { phone, email: validEmail || null };
  } catch (err) {
    return { phone: null, email: null };
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  const results = [];
  
  for (let i = 0; i < companies.length; i++) {
    const { company, website } = companies[i];
    process.stdout.write(`[${i+1}/${companies.length}] ${company}... `);
    
    const { phone, email } = await scrapeContact(page, website);
    results.push({ company, website, phone, email });
    
    console.log(`📞 ${phone || '無'} | 📧 ${email || '無'}`);
    
    await page.waitForTimeout(1500);
  }
  
  await browser.close();
  
  // 統計
  const withEmail = results.filter(r => r.email);
  console.log(`\n✅ 完成！有 Email: ${withEmail.length}/${results.length}`);
  
  // 輸出有 Email 的公司
  console.log('\n📧 有信箱的公司：');
  withEmail.forEach((r, i) => {
    console.log(`${i+1}. ${r.company} → ${r.email}`);
  });
  
  // 輸出 JSON
  require('fs').writeFileSync('/tmp/contact_results.json', JSON.stringify(results, null, 2));
}

main().catch(console.error);
