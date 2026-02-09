#!/usr/bin/env node
/**
 * 批次郵件發送器
 * 讀取 Google Sheet → 生成個性化郵件 → 批次發送
 * 
 * 用法：
 *   node email_sender.js --sheet <sheetId> --tab <分頁名稱> --preview   # 預覽不發送
 *   node email_sender.js --sheet <sheetId> --tab <分頁名稱> --send      # 實際發送
 * 
 * AI 對話範例：
 *   「讀取 Sheet 並發信給有信箱的公司」
 *   「批次發送開發信給客戶」
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 設定
const CONFIG = {
  account: process.env.GOG_ACCOUNT || 'aiagentg888@gmail.com',
  delayBetweenEmails: 5000,  // 每封信間隔 5 秒
  templatePath: path.join(__dirname, '../config/email_template.json')
};

// 預設郵件模板
const DEFAULT_TEMPLATE = {
  subject: "【合作洽詢】{{company}} - AI 數位轉型解決方案",
  body: `{{contactName}} 您好，

我是 AIJob 學院的業務代表。

注意到 貴公司 {{company}} 在 {{industry}} 領域的發展，我們提供 AI 數位轉型的完整解決方案，協助企業：

✅ 提升營運效率
✅ 降低人力成本  
✅ 加速數位化進程

不知是否有機會與您約個時間，進一步了解 貴公司的需求？

期待您的回覆！

Best regards,
AIJob 學院
聯絡電話：02-xxxx-xxxx
官網：https://aijob.com.tw`
};

/**
 * 執行 gog 命令
 */
function runGog(args, silent = false) {
  const cmd = `gog ${args} --account ${CONFIG.account}`;
  try {
    const result = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    return result;
  } catch (err) {
    if (!silent) console.error(`❌ gog 命令失敗: ${err.message}`);
    return null;
  }
}

/**
 * 讀取郵件模板
 */
function loadTemplate() {
  try {
    if (fs.existsSync(CONFIG.templatePath)) {
      return JSON.parse(fs.readFileSync(CONFIG.templatePath, 'utf-8'));
    }
  } catch (err) {
    console.warn('⚠️  讀取模板失敗，使用預設模板');
  }
  return DEFAULT_TEMPLATE;
}

/**
 * 儲存郵件模板
 */
function saveTemplate(template) {
  const dir = path.dirname(CONFIG.templatePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG.templatePath, JSON.stringify(template, null, 2));
  console.log(`💾 模板已儲存: ${CONFIG.templatePath}`);
}

/**
 * 讀取 Google Sheet 資料
 */
function readSheet(sheetId, tabName, range = 'A:L') {
  console.log(`📊 讀取 Sheet: ${tabName}`);
  
  const result = runGog(`sheets get ${sheetId} "${tabName}!${range}" --json`);
  if (!result) return [];
  
  try {
    const data = JSON.parse(result);
    if (!data.values || data.values.length < 2) return [];
    
    const headers = data.values[0].map(h => h.trim());
    const rows = data.values.slice(1);
    
    return rows.map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = (row[i] || '').trim();
      });
      return obj;
    });
  } catch (err) {
    console.error('❌ 解析 Sheet 失敗:', err.message);
    return [];
  }
}

/**
 * 根據公司資料生成個性化郵件
 */
function generateEmail(company, template) {
  let subject = template.subject;
  let body = template.body;
  
  // 取得聯絡人名稱和職稱
  const companyName = company['公司行號'] || company['公司名稱'] || '貴公司';
  const contactName = company['負責人'] || company['聯絡人'] || '';
  const contactTitle = company['職稱'] || company['聯絡人職稱'] || '';
  const industry = company['業務分類'] || company['產業'] || '相關';
  const businessModel = company['營運模式 / 主要收入來源'] || '';
  
  // 生成稱呼（只用公司名稱）
  let greeting = companyName;
  
  // 發送者資訊（從模板設定讀取）
  const sender = template.sender || {};
  
  // 替換模板變數
  const replacements = {
    '{{company}}': companyName,
    '{{contactName}}': contactName || companyName,
    '{{contactTitle}}': contactTitle,
    '{{greeting}}': greeting,
    '{{industry}}': industry,
    '{{businessModel}}': businessModel,
    '{{address}}': company['地址'] || '',
    '{{capital}}': company['資本額'] || '',
    '{{senderName}}': sender.name || 'Phoebe',
    '{{senderTitle}}': sender.title || '獵頭顧問',
    '{{senderEmail}}': sender.email || '',
    '{{senderPhone}}': sender.phone || ''
  };
  
  for (const [key, value] of Object.entries(replacements)) {
    subject = subject.replace(new RegExp(key, 'g'), value);
    body = body.replace(new RegExp(key, 'g'), value);
  }
  
  // 清理多餘空格和換行
  body = body.replace(/\n{3,}/g, '\n\n').replace(/^ +/gm, '');
  
  return { subject, body };
}

/**
 * 發送單封郵件
 */
function sendEmail(to, subject, body) {
  // 將內容寫入臨時檔案（處理換行和特殊字元）
  const tmpFile = `/tmp/email_body_${Date.now()}.txt`;
  fs.writeFileSync(tmpFile, body);
  
  try {
    const result = runGog(`gmail send --to "${to}" --subject "${subject.replace(/"/g, '\\"')}" --body-file "${tmpFile}" --force`);
    return result !== null;
  } finally {
    // 清理臨時檔案
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

/**
 * 批次發送郵件
 */
async function batchSendEmails(companies, template, options = {}) {
  const { preview = false, maxEmails = 50 } = options;
  
  // 過濾有信箱的公司
  const withEmail = companies.filter(c => {
    const email = c['信箱'] || c['email'] || c['Email'];
    return email && email.includes('@');
  });
  
  if (withEmail.length === 0) {
    console.log('❌ 沒有找到有效的信箱');
    return { sent: 0, failed: 0, skipped: 0 };
  }
  
  console.log(`\n📧 準備發送 ${Math.min(withEmail.length, maxEmails)} 封郵件`);
  console.log(`   發送帳號: ${CONFIG.account}`);
  console.log(`   模式: ${preview ? '預覽（不發送）' : '實際發送'}`);
  
  const results = { sent: 0, failed: 0, skipped: 0, details: [] };
  
  for (let i = 0; i < Math.min(withEmail.length, maxEmails); i++) {
    const company = withEmail[i];
    const email = company['信箱'] || company['email'] || company['Email'];
    const companyName = company['公司行號'] || company['公司名稱'] || '未知公司';
    
    // 生成個性化郵件
    const { subject, body } = generateEmail(company, template);
    
    console.log(`\n${'-'.repeat(50)}`);
    console.log(`📨 [${i + 1}/${withEmail.length}] ${companyName}`);
    console.log(`   收件人: ${email}`);
    console.log(`   主旨: ${subject}`);
    
    if (preview) {
      console.log(`   內文預覽:\n${body.substring(0, 200)}...`);
      results.details.push({ company: companyName, email, subject, status: 'preview' });
      results.skipped++;
    } else {
      // 實際發送
      const success = sendEmail(email, subject, body);
      if (success) {
        console.log(`   ✅ 發送成功`);
        results.sent++;
        results.details.push({ company: companyName, email, subject, status: 'sent' });
      } else {
        console.log(`   ❌ 發送失敗`);
        results.failed++;
        results.details.push({ company: companyName, email, subject, status: 'failed' });
      }
      
      // 間隔避免被當垃圾信
      if (i < withEmail.length - 1) {
        console.log(`   ⏳ 等待 ${CONFIG.delayBetweenEmails / 1000} 秒...`);
        await new Promise(r => setTimeout(r, CONFIG.delayBetweenEmails));
      }
    }
  }
  
  // 摘要
  console.log(`\n${'='.repeat(50)}`);
  console.log('📊 發送結果摘要');
  console.log('='.repeat(50));
  if (preview) {
    console.log(`   預覽: ${results.skipped} 封`);
  } else {
    console.log(`   成功: ${results.sent} 封`);
    console.log(`   失敗: ${results.failed} 封`);
  }
  
  return results;
}

/**
 * 主程式
 */
async function main() {
  const args = process.argv.slice(2);
  
  // 解析參數
  const getArg = (name) => {
    const idx = args.indexOf(name);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };
  
  const sheetId = getArg('--sheet');
  const tabName = getArg('--tab') || '洲子街';
  const preview = args.includes('--preview');
  const send = args.includes('--send');
  const initTemplate = args.includes('--init-template');
  
  // 顯示幫助
  if (args.includes('--help') || args.includes('-h')) {
    console.log('📧 批次郵件發送器');
    console.log('');
    console.log('用法:');
    console.log('  node email_sender.js --sheet <ID> --tab <分頁> --preview  預覽郵件');
    console.log('  node email_sender.js --sheet <ID> --tab <分頁> --send     發送郵件');
    console.log('  node email_sender.js --init-template                      建立模板');
    console.log('');
    console.log('選項:');
    console.log('  --sheet <ID>    Google Sheet ID');
    console.log('  --tab <名稱>    分頁名稱（預設: 洲子街）');
    console.log('  --preview       預覽模式（不發送）');
    console.log('  --send          實際發送');
    console.log('');
    console.log('環境變數:');
    console.log('  GOG_ACCOUNT     發送帳號（預設: aiagentg888@gmail.com）');
    return;
  }
  
  // 初始化模板
  if (initTemplate) {
    saveTemplate(DEFAULT_TEMPLATE);
    console.log('✅ 請編輯模板後再執行發送');
    return;
  }
  
  if (!sheetId) {
    console.error('❌ 請提供 --sheet <ID>');
    console.log('   使用 --help 查看說明');
    return;
  }
  
  if (!preview && !send) {
    console.error('❌ 請指定 --preview 或 --send');
    return;
  }
  
  // 讀取資料
  const companies = readSheet(sheetId, tabName);
  if (companies.length === 0) {
    console.error('❌ Sheet 沒有資料');
    return;
  }
  
  console.log(`✅ 讀取到 ${companies.length} 筆公司資料`);
  
  // 載入模板
  const template = loadTemplate();
  console.log(`📝 使用模板: ${fs.existsSync(CONFIG.templatePath) ? '自訂' : '預設'}`);
  
  // 發送郵件
  await batchSendEmails(companies, template, { preview: !send });
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ 執行失敗:', err.message);
    process.exit(1);
  });
}

module.exports = { readSheet, generateEmail, sendEmail, batchSendEmails, loadTemplate };
