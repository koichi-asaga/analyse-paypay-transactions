import { createHash } from 'node:crypto';
import { classify, toKind } from './classify.ts';
import type { ParseResult, Transaction } from './types.ts';

/** UTF-8（BOM 付き含む）を優先し、不正なバイト列なら Shift_JIS として読む */
export function decodeCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('shift_jis').decode(bytes);
  }
}

/** RFC 4180 準拠の最小 CSV パーサ（ダブルクォート内の改行・カンマ・"" に対応） */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

type Column = 'datetime' | 'out' | 'in' | 'content' | 'merchant' | 'method' | 'id';

const HEADER_ALIASES: Record<Column, string[]> = {
  datetime: ['取引日', '取引日時', '日時', '利用日'],
  out: ['出金金額(円)', '出金金額', '支払金額', '利用金額'],
  in: ['入金金額(円)', '入金金額'],
  content: ['取引内容', '内容'],
  merchant: ['取引先', '利用店名', '店舗名'],
  method: ['取引方法', '支払い方法'],
  id: ['取引番号', '決済番号'],
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/\s/g, '');
}

function mapHeader(header: string[]): Partial<Record<Column, number>> {
  const normalized = header.map(normalizeHeader);
  const map: Partial<Record<Column, number>> = {};
  for (const [col, aliases] of Object.entries(HEADER_ALIASES) as [Column, string[]][]) {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx >= 0) map[col] = idx;
  }
  return map;
}

export function parseAmount(s: string | undefined): number {
  if (!s) return 0;
  const cleaned = s.replace(/[¥￥,，円\s]/g, '');
  if (cleaned === '' || cleaned === '-') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

/** `2025/01/02 12:34:56` などを `2025-01-02T12:34:56` に正規化 */
export function parseDateTime(s: string | undefined): string | null {
  const m = s?.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '00', se = '00'] = m;
  const pad = (v: string) => v.padStart(2, '0');
  return `${y}-${pad(mo!)}-${pad(d!)}T${pad(h)}:${mi}:${se}`;
}

export function parsePayPayCsv(text: string): ParseResult {
  const rows = parseCsvRows(text);
  const header = rows[0];
  if (!header) throw new Error('CSV が空です');
  const col = mapHeader(header);
  if (col.datetime === undefined || (col.out === undefined && col.in === undefined)) {
    throw new Error('PayPay の取引履歴 CSV として認識できませんでした（「取引日」「出金金額」列が必要です）');
  }

  const transactions: Transaction[] = [];
  const skipped: ParseResult['skipped'] = [];
  const seen = new Map<string, number>();
  const at = (row: string[], c: Column) => (col[c] === undefined ? '' : (row[col[c]] ?? '').trim());

  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    const datetime = parseDateTime(at(row, 'datetime'));
    if (!datetime) {
      skipped.push({ line, reason: '日時を解釈できません' });
      return;
    }
    const outAmount = parseAmount(at(row, 'out'));
    const inAmount = parseAmount(at(row, 'in'));
    const rawKind = at(row, 'content');
    const merchant = at(row, 'merchant') || '(不明)';
    const method = at(row, 'method');

    let id = at(row, 'id');
    if (!id || id === '-') {
      // 取引番号が無い場合は内容から決定的な ID を作る（同一ファイルの再アップロードで重複しないように）
      const base = createHash('sha256')
        .update([datetime, outAmount, inAmount, rawKind, merchant, method].join('|'))
        .digest('hex')
        .slice(0, 16);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      id = `h_${base}_${n}`;
    }

    transactions.push({
      id,
      datetime,
      outAmount,
      inAmount,
      kind: toKind(rawKind, outAmount, inAmount),
      rawKind,
      merchant,
      method,
      category: classify(merchant),
    });
  });

  return { transactions, skipped };
}
