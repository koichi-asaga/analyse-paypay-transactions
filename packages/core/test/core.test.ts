import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyze, decodeCsv, mergeTransactions, parseCsvRows, parsePayPayCsv } from '../src/index.ts';

const HEADER = '取引日,出金金額（円）,入金金額（円）,取引内容,取引先,取引方法,取引番号';

describe('parseCsvRows', () => {
  it('クォート内のカンマ・改行・エスケープを扱える', () => {
    expect(parseCsvRows('a,"b,c","d\r\ne","f""g"\r\n1,2,3,4\r\n')).toEqual([
      ['a', 'b,c', 'd\r\ne', 'f"g'],
      ['1', '2', '3', '4'],
    ]);
  });
});

describe('decodeCsv', () => {
  it('BOM 付き UTF-8 を読める', () => {
    expect(decodeCsv(new TextEncoder().encode('﻿取引日'))).toBe('取引日');
  });
  it('Shift_JIS にフォールバックする', () => {
    const sjis = new Uint8Array([0x8e, 0xe6, 0x88, 0xf8, 0x93, 0xfa]); // 「取引日」
    expect(decodeCsv(sjis)).toBe('取引日');
  });
});

describe('parsePayPayCsv', () => {
  it('取引を正規化して分類する', () => {
    const { transactions, skipped } = parsePayPayCsv(
      [
        HEADER,
        '2026/09/01 08:15:00,"1,234",-,支払い,セブン-イレブン 渋谷店,PayPay残高,111',
        '2026/09/02 10:00:00,-,"5,000",チャージ,みずほ銀行,銀行口座,112',
        '2026/09/03 12:00:00,-,500,返金,Amazon.co.jp,PayPay残高,113',
        'invalid,1,2,3,4,5,6',
      ].join('\n'),
    );
    expect(skipped).toEqual([{ line: 5, reason: '日時を解釈できません' }]);
    expect(transactions).toMatchObject([
      { id: '111', datetime: '2026-09-01T08:15:00', outAmount: 1234, kind: 'payment', category: 'コンビニ' },
      { id: '112', inAmount: 5000, kind: 'charge' },
      { id: '113', inAmount: 500, kind: 'refund', category: 'EC・通販' },
    ]);
  });

  it('取引番号が無くても再アップロードで同じ ID になる', () => {
    const csv = '取引日,出金金額（円）,取引内容,取引先\n2026/09/01 08:15,100,支払い,A\n2026/09/01 08:15,100,支払い,A';
    const a = parsePayPayCsv(csv).transactions.map((t) => t.id);
    const b = parsePayPayCsv(csv).transactions.map((t) => t.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(2);
  });

  it('PayPay の CSV でなければエラー', () => {
    expect(() => parsePayPayCsv('foo,bar\n1,2')).toThrow(/認識できませんでした/);
  });
});

describe('mergeTransactions', () => {
  it('重複を除いてマージする', () => {
    const { transactions } = parsePayPayCsv(`${HEADER}\n2026/09/01 08:15:00,100,-,支払い,A,x,1\n2026/09/02 08:15:00,100,-,支払い,A,x,2`);
    const result = mergeTransactions(transactions.slice(0, 1), transactions);
    expect(result).toMatchObject({ added: 1, duplicates: 1 });
    expect(result.merged.map((t) => t.id)).toEqual(['1', '2']);
  });
});

describe('analyze', () => {
  const csv = decodeCsv(readFileSync(new URL('../../../samples/paypay-sample.csv', import.meta.url)));
  const { transactions } = parsePayPayCsv(csv);
  const result = analyze(transactions);

  it('月次・週次に集計する', () => {
    expect(result.monthly.map((m) => m.month)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(result.weekly[0]!.weekStart).toBe('2026-06-29'); // 2026-07-01(水) の週の月曜
    const total = result.monthly.reduce((a, m) => a + m.spending, 0);
    expect(total).toBe(result.summary.netSpending);
  });

  it('チャージ・送金は支出に含めない', () => {
    expect(result.byCategory.some((c) => c.amount === 0)).toBe(false);
    expect(result.summary.charged).toBe(150000);
    expect(result.summary.transferredOut).toBe(3000);
  });

  it('無駄遣いの候補を検出する', () => {
    const types = new Set(result.insights.map((i) => i.type));
    expect(types).toEqual(
      new Set(['convenience_store', 'small_frequent', 'subscription', 'late_night', 'delivery', 'duplicate', 'category_spike']),
    );
    expect(result.insights[0]!.severity).toBe('high');
    expect(result.insights.filter((i) => i.type === 'subscription').map((i) => i.merchant).sort()).toEqual([
      'Netflix',
      'Spotify',
    ]);
  });

  it('期間で絞り込める', () => {
    const sep = analyze(transactions, { from: '2026-09-01', to: '2026-09-30' });
    expect(sep.monthly.map((m) => m.month)).toEqual(['2026-09']);
    expect(sep.period.days).toBe(30);
  });
});
