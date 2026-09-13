import { parseParticipantLine, computeBalances, settleBill, extractBankAccountFromText, maskAccountNo, Bill } from './model';
import { parseVietQR, buildVietQR } from './vietqr';

test('parseParticipantLine name only', () => {
  const r = parseParticipantLine('Lan');
  expect(r.participant?.name).toBe('Lan');
  expect(r.participant?.kind).toBe('none');
});

test('parseParticipantLine email+name', () => {
  const r = parseParticipantLine('lan@example.com Lan');
  expect(r.participant?.email).toBe('lan@example.com');
  expect(r.participant?.name).toBe('Lan');
});

test('parseParticipantLine phone+name', () => {
  const r = parseParticipantLine('0912345678 Minh');
  expect(r.participant?.phone).toBe('0912345678');
  expect(r.participant?.name).toBe('Minh');
});

test('settlement min-cash-flow with remainder', () => {
  const pA = parseParticipantLine('An').participant!;
  pA.id = 'an';
  const pB = parseParticipantLine('Binh').participant!;
  pB.id = 'binh';
  const pC = parseParticipantLine('Cuong').participant!;
  pC.id = 'cuong';
  const bill: Bill = {
    id: 'bill1',
    title: 'test',
    participants: [pA, pB, pC],
    items: [
      { id: '1', description: 'pho', amountVnd: 100000, payerId: 'an', sharedWithIds: ['an', 'binh', 'cuong'], inputMode: 'text', createdAt: 1 },
    ],
    payoutAccounts: [
      { participantId: 'an', bankBin: '970415', bankName: 'VietinBank', accountNo: '111111', source: 'text' },
      { participantId: 'binh', bankBin: '970415', bankName: 'VietinBank', accountNo: '222222', source: 'text' },
      { participantId: 'cuong', bankBin: '970415', bankName: 'VietinBank', accountNo: '333333', source: 'text' },
    ],
    createdAt: 1,
  };
  const bal = computeBalances(bill);
  // 100k /3 = 33333 remainder 1 -> last gets 33334, An net +66667, Binh -33333, Cuong -33334
  expect(bal.get('an')).toBe(66667);
  expect(bal.get('binh')).toBe(-33333);
  expect(bal.get('cuong')).toBe(-33334);
  const transfers = settleBill(bill);
  expect(transfers.length).toBe(2);
  expect(transfers.reduce((s, t) => s + t.amountVnd, 0)).toBe(66667);
});

test('extractBankAccountFromText', () => {
  const r = extractBankAccountFromText('Vietcombank 0123456789');
  expect(r.bankBin).toBe('970436');
  expect(r.accountNo).toBe('0123456789');
});

test('maskAccountNo', () => {
  expect(maskAccountNo('0123456789')).toBe('****6789');
});

test('vietqr build and parse roundtrip', () => {
  const payload = buildVietQR({ acqBin: '970415', accountNo: '113366668888', amount: 50000, purpose: 'Chia tien test' });
  const parsed = parseVietQR(payload);
  expect('error' in parsed).toBe(false);
  if (!('error' in parsed)) {
    expect(parsed.bankBin).toBe('970415');
    expect(parsed.accountNo).toBe('113366668888');
    expect(parsed.amount).toBe(50000);
  }
});

test('vietqr CRC mismatch', () => {
  const payload = buildVietQR({ acqBin: '970415', accountNo: '113366668888', amount: 1000 });
  const bad = payload.slice(0, -4) + 'FFFF';
  const parsed = parseVietQR(bad);
  expect('error' in parsed && (parsed as { error: string }).error).toBe('CRC_MISMATCH');
});
