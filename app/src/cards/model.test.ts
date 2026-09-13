import {
  BankCard,
  bestBenefit,
  DAY_MS,
  foldText,
  isDatasetFresh,
  parseCardRoute,
  parseStoredDataset,
  searchCards,
} from './model';
import { seedCardDataset } from './dataset';

const card: BankCard = {
  id: 'test-visa',
  bankId: 'testbank',
  bankName: 'Ngân hàng Test',
  bankCode: 'TST',
  cardBrand: 'visa',
  cardName: 'Thẻ Hoàn Tiền Platinum',
  annualFeeVnd: 500000,
  firstYearFree: true,
  imageColor: '#123456',
  benefits: [
    {
      title: 'Phòng chờ sân bay',
      detail: 'Vào phòng chờ thương gia 4 lần mỗi tháng.',
      type: 'lounge',
    },
    {
      title: 'Hoàn tiền 7% ăn uống',
      detail: 'Hoàn đến 7% chi tiêu nhà hàng mỗi cuối tuần.',
      type: 'cashback',
    },
  ],
};

describe('card search', () => {
  test('folds Vietnamese diacritics and đ', () => {
    expect(foldText('Hoàn Tiền Đặc Biệt')).toBe('hoan tien dac biet');
  });

  test('matches tokens across bank name, card name, and benefits without diacritics', () => {
    expect(searchCards([card], 'hoan tien')).toHaveLength(1);
    expect(searchCards([card], 'test')).toHaveLength(1);
    expect(searchCards([card], 'san bay')).toHaveLength(1);
    expect(searchCards([card], 'khong co')).toHaveLength(0);
  });
  test('requires every token to match somewhere on the card', () => {
    // Tokens may land in different fields of the same card.
    expect(searchCards([card], 'hoan phong cho')).toHaveLength(1);
    expect(searchCards([card], 'techcombank hoan tien')).toHaveLength(0);
  });

  test('blank queries return everything in order', () => {
    expect(searchCards([card], '   ')).toEqual([card]);
  });
});

describe('headline benefit', () => {
  test('ranks cashback ahead of lounge access', () => {
    expect(bestBenefit(card).title).toContain('Hoàn tiền');
  });
});

describe('route parsing', () => {
  test.each([
    ['/card/vcb-epartner-visa', 'vcb-epartner-visa'],
    ['/', null],
    ['/card/', null],
    ['/card/a/b', null],
    ['/notes/welcome', null],
  ])('parses %s → %p', (path, expected) => {
    expect(parseCardRoute(path)).toBe(expected);
  });
});

describe('dataset freshness', () => {
  const dataset = seedCardDataset(1_000_000);

  test('accepts a copy renewed within the daily window', () => {
    expect(isDatasetFresh(dataset, 1_000_000 + DAY_MS)).toBe(true);
  });

  test('expires a copy older than one day', () => {
    expect(isDatasetFresh(dataset, 1_000_000 + DAY_MS + 1)).toBe(false);
  });

  test('rejects a non-numeric retrieval time', () => {
    expect(
      isDatasetFresh({ ...dataset, retrievedAt: NaN }, 1_000_000),
    ).toBe(false);
  });
});

describe('stored dataset validation', () => {
  const stored = JSON.stringify(seedCardDataset(1_234));

  test('round-trips a seeded dataset', () => {
    const parsed = parseStoredDataset(stored);
    expect(parsed).not.toBeNull();
    expect(parsed?.retrievedAt).toBe(1_234);
    expect(parsed?.cards.length).toBeGreaterThan(0);
    expect(parsed?.cards[0].benefits.length).toBeGreaterThan(0);
  });

  test('rejects malformed payloads instead of trusting them', () => {
    expect(parseStoredDataset(null)).toBeNull();
    expect(parseStoredDataset('')).toBeNull();
    expect(parseStoredDataset('not json')).toBeNull();
    expect(parseStoredDataset(JSON.stringify({ retrievedAt: 1 }))).toBeNull();
    expect(
      parseStoredDataset(JSON.stringify({ retrievedAt: 'x', cards: [] })),
    ).toBeNull();
    expect(
      parseStoredDataset(
        JSON.stringify({
          retrievedAt: 5,
          cards: [{ id: 'x', bankName: 'B', cardName: 'C' }],
        }),
      ),
    ).toBeNull();
  });

  test('defaults unknown benefit types and brands safely', () => {
    const parsed = parseStoredDataset(
      JSON.stringify({
        source: 'remote',
        retrievedAt: 7,
        cards: [
          {
            id: 'c1',
            bankName: 'Bank',
            cardName: 'Card',
            benefits: [{ title: 'T', detail: 'D', type: 'mystery' }],
            cardBrand: 'unionpay',
          },
        ],
      }),
    );
    expect(parsed?.source).toBe('remote');
    expect(parsed?.cards[0].benefits[0].type).toBe('other');
    expect(parsed?.cards[0].cardBrand).toBe('visa');
  });
});
