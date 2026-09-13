export type CardBenefitType =
  | 'cashback'
  | 'discount'
  | 'interest_free'
  | 'lounge'
  | 'other';

export type CardBenefit = {
  title: string;
  detail: string;
  type: CardBenefitType;
};

export type BankCard = {
  id: string;
  bankId: string;
  bankName: string;
  bankCode: string;
  cardBrand: 'visa' | 'mastercard' | 'jcb' | 'amex';
  cardName: string;
  annualFeeVnd: number;
  firstYearFree: boolean;
  imageColor: string;
  benefits: readonly CardBenefit[];
};

/**
 * The dataset the mini-app renders. MVP keeps it on the device; the official
 * build serves it daily from the platform backend through
 * `appConfig.cards.endpoint`. `retrievedAt` drives the renewal clock either way.
 */
export type CardDataset = {
  retrievedAt: number;
  source: 'seed' | 'remote';
  cards: readonly BankCard[];
};

const benefitTypeRank: Record<CardBenefitType, number> = {
  cashback: 0,
  discount: 1,
  interest_free: 2,
  lounge: 3,
  other: 4,
};

/** Folds Vietnamese text to a diacritic-insensitive, case-folded form. */
export function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
}

/** Picks the headline benefit shown on the list row. */
export function bestBenefit(card: BankCard): CardBenefit {
  const ranked = [...card.benefits].sort(
    (a, b) => benefitTypeRank[a.type] - benefitTypeRank[b.type],
  );
  return ranked[0];
}

function cardMatchesToken(card: BankCard, token: string): boolean {
  const haystacks = [
    foldText(card.bankName),
    foldText(card.cardName),
    ...card.benefits.map(benefit => foldText(`${benefit.title} ${benefit.detail}`)),
  ];
  return haystacks.some(haystack => haystack.includes(token));
}

/**
 * Every whitespace-separated token must match somewhere in the bank name,
 * card name, or any benefit text. Empty or blank queries match everything.
 */
export function searchCards(
  cards: readonly BankCard[],
  query: string,
): readonly BankCard[] {
  const tokens = foldText(query)
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) {
    return cards;
  }
  return cards.filter(card =>
    tokens.every(token => cardMatchesToken(card, token)),
  );
}

/** `/card/:cardId` → `cardId`; anything else → null. */
export function parseCardRoute(path: string): string | null {
  const segments = path.split('/').filter(Boolean);
  if (segments.length !== 2 || segments[0] !== 'card') {
    return null;
  }
  return segments[1];
}

export const DAY_MS = 24 * 60 * 60 * 1_000;

export function isDatasetFresh(
  dataset: CardDataset,
  now: number,
  maxAgeMs: number = DAY_MS,
): boolean {
  return (
    Number.isFinite(dataset.retrievedAt) && now - dataset.retrievedAt <= maxAgeMs
  );
}

function validBenefit(value: unknown): CardBenefit | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title : '';
  const detail = typeof record.detail === 'string' ? record.detail : '';
  if (!title || !detail) {
    return null;
  }
  const type = (
    ['cashback', 'discount', 'interest_free', 'lounge', 'other'] as const
  ).find(candidate => candidate === record.type);
  return { title, detail, type: type ?? 'other' };
}

function validCard(value: unknown): BankCard | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const parsed = value as Record<string, unknown>;
  const id = typeof parsed.id === 'string' ? parsed.id : '';
  const bankName = typeof parsed.bankName === 'string' ? parsed.bankName : '';
  const cardName = typeof parsed.cardName === 'string' ? parsed.cardName : '';
  const benefitsRaw = Array.isArray(parsed.benefits) ? parsed.benefits : [];
  const benefits = benefitsRaw
    .map(validBenefit)
    .filter((benefit): benefit is CardBenefit => benefit !== null);
  if (!id || !bankName || !cardName || benefits.length === 0) {
    return null;
  }
  const brands = ['visa', 'mastercard', 'jcb', 'amex'] as const;
  const brand = brands.find(candidate => candidate === parsed.cardBrand);
  return {
    id,
    bankName,
    bankId: typeof parsed.bankId === 'string' ? parsed.bankId : '',
    bankCode:
      typeof parsed.bankCode === 'string' ? parsed.bankCode : id.slice(0, 4),
    cardBrand: brand ?? 'visa',
    cardName,
    annualFeeVnd:
      typeof parsed.annualFeeVnd === 'number' ? parsed.annualFeeVnd : 0,
    firstYearFree: parsed.firstYearFree === true,
    imageColor:
      typeof parsed.imageColor === 'string' ? parsed.imageColor : '#2E3A8C',
    benefits,
  };
}

/**
 * Validates a stored or fetched dataset payload against the shape above.
 * Returns null for anything malformed so callers can fall back to seed data.
 */
export function parseStoredDataset(raw: string | null): CardDataset | null {
  if (!raw) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const retrievedAt =
    typeof record.retrievedAt === 'number' ? record.retrievedAt : NaN;
  if (!Number.isFinite(retrievedAt)) {
    return null;
  }
  const cardsRaw = Array.isArray(record.cards) ? record.cards : [];
  const cards = cardsRaw
    .map(validCard)
    .filter((card): card is BankCard => card !== null);
  if (cards.length === 0) {
    return null;
  }
  return {
    retrievedAt,
    source: record.source === 'remote' ? 'remote' : 'seed',
    cards,
  };
}
