import axios from 'axios';
import * as XLSX from 'xlsx';
import { promises as fs } from 'fs';
import path from 'path';
import { format } from 'date-fns';
import crypto from 'crypto';
import { DATA_SOURCES, DATE_FORMAT } from '../constants';
import type { ComexStockData } from '../validators';

const RAW_DATA_DIR = path.join(process.cwd(), 'raw-data', 'comex');

// Validation bounds (oz)
const VALIDATION = {
  MIN_REGISTERED: 1_000_000,    // 1M oz minimum
  MAX_REGISTERED: 1_000_000_000, // 1B oz maximum
  MIN_ELIGIBLE: 1_000_000,
  MAX_ELIGIBLE: 1_000_000_000,
  MIN_COMBINED: 2_000_000,
  MAX_COMBINED: 2_000_000_000,
};

interface ParseMeta {
  sheetName: string;
  headerMap: Record<string, number>;
  rowsParsed: number;
  warnings: string[];
  fileHash: string;
}

/**
 * Ensures raw data directory exists
 */
async function ensureDataDir() {
  try {
    await fs.mkdir(RAW_DATA_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating data directory:', error);
  }
}

/**
 * Downloads COMEX Silver Stocks XLS file
 */
export async function downloadComexXLS(date: Date): Promise<string | null> {
  try {
    await ensureDataDir();
    
    const response = await axios.get(DATA_SOURCES.COMEX_XLS, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/vnd.ms-excel,application/octet-stream,*/*',
      },
    });

    const dateStr = format(date, DATE_FORMAT);
    const filename = `silver_stocks_${dateStr}.xls`;
    const filepath = path.join(RAW_DATA_DIR, filename);

    await fs.writeFile(filepath, Buffer.from(response.data));
    
    console.log(`✓ Downloaded COMEX XLS to: ${filepath}`);
    return filepath;
  } catch (error) {
    console.error('✗ Error downloading COMEX XLS:', error);
    return null;
  }
}

/**
 * Normalize string for comparison (lowercase, trim, collapse spaces)
 */
function normalizeString(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Parse numeric value from cell (handles commas, parentheses, spaces)
 */
function parseNumeric(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  
  // Already a number
  if (typeof value === 'number') return value;
  
  // Convert to string and clean
  const str = String(value)
    .replace(/,/g, '')           // Remove commas
    .replace(/\s/g, '')          // Remove spaces
    .replace(/[()]/g, '-')       // Parentheses mean negative
    .trim();
  
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

/**
 * Find sheet containing silver stocks data
 * Looks for keywords: "silver", "stocks", "registered", "eligible"
 */
function findSilverSheet(workbook: XLSX.WorkBook): string | null {
  const keywords = ['silver', 'stock', 'registered', 'eligible'];
  
  for (const sheetName of workbook.SheetNames) {
    const nameLower = normalizeString(sheetName);
    
    // Check if sheet name contains relevant keywords
    if (keywords.some(kw => nameLower.includes(kw))) {
      return sheetName;
    }
    
    // Also check first few rows of each sheet for keywords
    const sheet = workbook.Sheets[sheetName];
    const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    const firstRows = data.slice(0, 10).flat().map(c => 
      c ? normalizeString(String(c)) : ''
    );
    
    const hasKeywords = keywords.filter(kw => 
      firstRows.some(cell => cell.includes(kw))
    ).length >= 2;
    
    if (hasKeywords) return sheetName;
  }
  
  // Fallback to first sheet
  return workbook.SheetNames[0] || null;
}

/**
 * Find header row and map column indices
 * Returns { rowIndex, columnMap }
 */
function findHeaders(data: any[][]): { rowIndex: number; columnMap: Record<string, number> } | null {
  const headerKeywords = {
    warehouse: ['warehouse', 'depository', 'name', 'location'],
    registered: ['registered'],
    eligible: ['eligible'],
    total: ['total', 'combined'],
    deposits: ['deposit', 'receipts'],
    withdrawals: ['withdrawal', 'shipped'],
    adjustments: ['adjustment', 'adjust'],
  };
  
  for (let i = 0; i < Math.min(data.length, 20); i++) {
    const row = data[i];
    if (!row || row.length < 2) continue;
    
    const columnMap: Record<string, number> = {};
    let matchCount = 0;
    
    for (let j = 0; j < row.length; j++) {
      if (!row[j]) continue;
      const cellNorm = normalizeString(String(row[j]));
      
      // Check each keyword category
      for (const [key, keywords] of Object.entries(headerKeywords)) {
        if (keywords.some(kw => cellNorm.includes(kw))) {
          columnMap[key] = j;
          matchCount++;
          break;
        }
      }
    }
    
    // We need at least 'registered' and 'eligible'
    if (columnMap.registered !== undefined && columnMap.eligible !== undefined) {
      return { rowIndex: i, columnMap };
    }
  }
  
  return null;
}

/**
 * Validate parsed values
 */
function validateStockValues(registered: number, eligible: number, combined: number): string[] {
  const warnings: string[] = [];
  
  if (registered < VALIDATION.MIN_REGISTERED || registered > VALIDATION.MAX_REGISTERED) {
    warnings.push(`Registered ${registered} oz outside expected range`);
  }
  
  if (eligible < VALIDATION.MIN_ELIGIBLE || eligible > VALIDATION.MAX_ELIGIBLE) {
    warnings.push(`Eligible ${eligible} oz outside expected range`);
  }
  
  if (combined < VALIDATION.MIN_COMBINED || combined > VALIDATION.MAX_COMBINED) {
    warnings.push(`Combined ${combined} oz outside expected range`);
  }
  
  // Check if combined matches registered + eligible (within 1% tolerance)
  const expectedCombined = registered + eligible;
  const diff = Math.abs(combined - expectedCombined);
  const tolerance = expectedCombined * 0.01;
  
  if (diff > tolerance) {
    warnings.push(`Combined (${combined}) doesn't match Registered (${registered}) + Eligible (${eligible})`);
  }
  
  return warnings;
}

/**
 * Robust COMEX Silver Stocks Parser
 * Auto-detects sheet, headers, and data rows
 */
export async function parseComexSilverStocks(filepath: string): Promise<(ComexStockData & { meta: ParseMeta }) | null> {
  try {
    const fileBuffer = await fs.readFile(filepath);
    const fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex');
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    
    // Find the right sheet
    const sheetName = findSilverSheet(workbook);
    if (!sheetName) {
      console.error('✗ No silver stocks sheet found in workbook');
      return null;
    }
    
    const worksheet = workbook.Sheets[sheetName];
    const data: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    // Find header row and column mapping
    const headerInfo = findHeaders(data);
    if (!headerInfo) {
      console.error('✗ Could not find header row with Registered/Eligible columns');
      return null;
    }
    
    const { rowIndex: headerRow, columnMap } = headerInfo;
    const warnings: string[] = [];
    
    let totalRegistered = 0;
    let totalEligible = 0;
    let totalCombined = 0;
    const warehouses: any[] = [];
    let rowsParsed = 0;
    
    // Parse data rows (start after header)
    for (let i = headerRow + 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length < 2) continue;
      
      const warehouseCell = row[columnMap.warehouse || 0];
      if (!warehouseCell) continue;
      
      const warehouseName = String(warehouseCell).trim();
      const wareNameNorm = normalizeString(warehouseName);
      
      // Skip empty or header-like rows
      if (!wareNameNorm || wareNameNorm.length < 3) continue;
      if (wareNameNorm.includes('warehouse') || wareNameNorm.includes('depository')) continue;
      
      const registered = parseNumeric(row[columnMap.registered]);
      const eligible = parseNumeric(row[columnMap.eligible]);
      
      if (registered === null || eligible === null) continue;
      
      // Check if this is a TOTAL row
      if (wareNameNorm.includes('total') || wareNameNorm.includes('grand')) {
        totalRegistered = registered;
        totalEligible = eligible;
        totalCombined = columnMap.total !== undefined 
          ? (parseNumeric(row[columnMap.total]) || (registered + eligible))
          : (registered + eligible);
        rowsParsed++;
        continue;
      }
      
      // Individual warehouse row
      if (registered > 0 || eligible > 0) {
        warehouses.push({
          warehouseName,
          registered,
          eligible,
          deposits: columnMap.deposits !== undefined ? parseNumeric(row[columnMap.deposits]) : undefined,
          withdrawals: columnMap.withdrawals !== undefined ? parseNumeric(row[columnMap.withdrawals]) : undefined,
          adjustments: columnMap.adjustments !== undefined ? parseNumeric(row[columnMap.adjustments]) : undefined,
        });
        rowsParsed++;
      }
    }
    
    // If no TOTAL row found, sum up warehouses
    if (totalCombined === 0 && warehouses.length > 0) {
      totalRegistered = warehouses.reduce((sum, w) => sum + w.registered, 0);
      totalEligible = warehouses.reduce((sum, w) => sum + w.eligible, 0);
      totalCombined = totalRegistered + totalEligible;
      warnings.push('No TOTAL row found - computed from warehouse sum');
    }
    
    // Validation
    if (totalCombined === 0) {
      console.error('✗ Failed to parse COMEX data - no valid totals found');
      return null;
    }
    
    const validationWarnings = validateStockValues(totalRegistered, totalEligible, totalCombined);
    warnings.push(...validationWarnings);
    
    if (validationWarnings.length > 0) {
      console.warn('⚠ Validation warnings:', validationWarnings);
    }
    
    const meta: ParseMeta = {
      sheetName,
      headerMap: columnMap,
      rowsParsed,
      warnings,
      fileHash,
    };
    
    console.log(`✓ Parsed COMEX stocks: Registered=${totalRegistered.toLocaleString()} oz, Eligible=${totalEligible.toLocaleString()} oz`);
    
    return {
      date: new Date(), // Will be set to market date by caller
      totalRegistered,
      totalEligible,
      totalCombined,
      warehouses: warehouses.length > 0 ? warehouses : undefined,
      meta,
    };
    
  } catch (error) {
    console.error('✗ Error parsing COMEX XLS:', error);
    return null;
  }
}

/**
 * Fetches and parses COMEX stock data
 */
export async function fetchComexStocks(date: Date = new Date()): Promise<ComexStockData | null> {
  const filepath = await downloadComexXLS(date);
  
  if (!filepath) {
    return null;
  }
  
  const result = await parseComexSilverStocks(filepath);
  
  if (!result) {
    return null;
  }
  
  // Set the market date
  result.date = date;
  
  return result;
}
