#!/usr/bin/env node
/**
 * Google Sheet 匯出器
 * 將爬蟲結果寫入 Google Sheet
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 預設設定
const CONFIG = {
  account: process.env.GOG_ACCOUNT || 'aiagentg888@gmail.com',
  sheetId: process.env.HEADHUNTER_SHEET_ID || '',
  tabName: '職缺資料'
};

/**
 * 執行 gog 命令
 */
function runGog(args) {
  const cmd = `gog ${args} --account ${CONFIG.account}`;
  try {
    const result = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    return result;
  } catch (err) {
    console.error(`❌ gog 命令失敗: ${err.message}`);
    return null;
  }
}

/**
 * 讀取 CSV 檔案並轉換為二維陣列
 */
function csvToArray(csvPath) {
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  return lines.map(line => {
    // 簡單 CSV 解析（處理引號內的逗號）
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    
    return result;
  });
}

/**
 * 取得 Sheet metadata
 */
function getSheetMetadata(sheetId) {
  const result = runGog(`sheets metadata ${sheetId} --json`);
  if (!result) return null;
  
  try {
    return JSON.parse(result);
  } catch {
    return null;
  }
}

/**
 * 檢查 Tab 是否存在
 */
function tabExists(sheetId, tabName) {
  const metadata = getSheetMetadata(sheetId);
  if (!metadata || !metadata.sheets) return false;
  
  return metadata.sheets.some(sheet => sheet.properties?.title === tabName);
}

/**
 * 清除 Sheet 內容（保留標題列）
 */
function clearSheet(sheetId, tabName) {
  console.log(`   🗑️  清除舊資料...`);
  runGog(`sheets clear ${sheetId} "${tabName}!A2:Z"`);
}

/**
 * 寫入標題列
 */
function writeHeader(sheetId, tabName, headers) {
  console.log(`   📝 寫入標題列...`);
  const valuesJson = JSON.stringify([headers]);
  runGog(`sheets update ${sheetId} "${tabName}!A1" --values-json '${valuesJson}' --input USER_ENTERED`);
}

/**
 * 追加資料列
 */
function appendRows(sheetId, tabName, rows) {
  console.log(`   📊 寫入 ${rows.length} 筆資料...`);
  const valuesJson = JSON.stringify(rows);
  // 需要 escape 單引號
  const escaped = valuesJson.replace(/'/g, "'\\''");
  runGog(`sheets append ${sheetId} "${tabName}!A:K" --values-json '${escaped}' --insert INSERT_ROWS`);
}

/**
 * 匯出 CSV 到 Google Sheet
 * @param {string} csvPath - CSV 檔案路徑
 * @param {Object} options - 選項
 */
async function exportToSheet(csvPath, options = {}) {
  const {
    sheetId = CONFIG.sheetId,
    tabName = CONFIG.tabName,
    clearFirst = true
  } = options;

  if (!sheetId) {
    console.error('❌ 未設定 Sheet ID');
    console.log('   請設定環境變數 HEADHUNTER_SHEET_ID 或在 config.json 中設定');
    return false;
  }

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV 檔案不存在: ${csvPath}`);
    return false;
  }

  console.log(`\n📤 匯出到 Google Sheet...`);
  console.log(`   Sheet ID: ${sheetId}`);
  console.log(`   Tab: ${tabName}`);
  console.log(`   CSV: ${csvPath}`);

  // 讀取 CSV
  const data = csvToArray(csvPath);
  if (data.length < 2) {
    console.error('❌ CSV 資料不足');
    return false;
  }

  const headers = data[0];
  const rows = data.slice(1);

  // 清除舊資料（可選）
  if (clearFirst) {
    clearSheet(sheetId, tabName);
  }

  // 寫入標題
  writeHeader(sheetId, tabName, headers);

  // 寫入資料
  appendRows(sheetId, tabName, rows);

  console.log(`✅ 匯出完成！共 ${rows.length} 筆`);
  console.log(`   🔗 https://docs.google.com/spreadsheets/d/${sheetId}`);

  return true;
}

/**
 * 從 config.json 讀取設定
 */
function loadConfig() {
  const configPath = path.join(__dirname, '../config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.googleSheet) {
        CONFIG.sheetId = config.googleSheet.sheetId || CONFIG.sheetId;
        CONFIG.tabName = config.googleSheet.tabName || CONFIG.tabName;
      }
    } catch (err) {
      console.warn('⚠️  讀取 config.json 失敗');
    }
  }
}

// CLI 模式
if (require.main === module) {
  loadConfig();
  
  const csvPath = process.argv[2];
  const sheetId = process.argv[3] || CONFIG.sheetId;
  const tabName = process.argv[4] || CONFIG.tabName;

  if (!csvPath) {
    console.log('用法: node sheet_exporter.js <csv檔案> [sheetId] [tabName]');
    console.log('');
    console.log('範例:');
    console.log('  node sheet_exporter.js data/104_test.csv 1abc123xyz');
    console.log('');
    console.log('環境變數:');
    console.log('  HEADHUNTER_SHEET_ID - 預設 Sheet ID');
    console.log('  GOG_ACCOUNT - gog 帳號');
    process.exit(1);
  }

  exportToSheet(csvPath, { sheetId, tabName });
}

module.exports = { exportToSheet, csvToArray, loadConfig };
