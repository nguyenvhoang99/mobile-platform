import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { loadCardDataset } from '../cards/cardStore';
import {
  BankCard,
  CardBenefitType,
  CardDataset,
  bestBenefit,
  foldText,
  parseCardRoute,
  searchCards,
} from '../cards/model';
import { ShellPalette } from '../config/palette';

const benefitTypeLabel: Record<CardBenefitType, string> = {
  cashback: 'Hoàn tiền',
  discount: 'Giảm giá',
  interest_free: 'Miễn lãi',
  lounge: 'Phòng chờ',
  other: 'Ưu đãi',
};

const brandLabel: Record<BankCard['cardBrand'], string> = {
  visa: 'VISA',
  mastercard: 'MC',
  jcb: 'JCB',
  amex: 'AMEX',
};

function formatAnnualFee(card: BankCard): string {
  if (card.firstYearFree && card.annualFeeVnd > 0) {
    const fee = card.annualFeeVnd.toLocaleString('vi-VN');
    return `Phí ${fee}đ/năm · Miễn phí năm đầu`;
  }
  if (card.annualFeeVnd === 0) {
    return 'Miễn phí thường niên';
  }
  return `Phí ${card.annualFeeVnd.toLocaleString('vi-VN')}đ/năm`;
}

function datasetUpdatedLabel(dataset: CardDataset): string {
  const date = new Date(dataset.retrievedAt);
  const day = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}/${date.getFullYear()}`;
  return dataset.source === 'remote'
    ? `Dữ liệu máy chủ · Cập nhật ${day}`
    : `Dữ liệu trên máy · Cập nhật ${day}`;
}

type Props = {
  palette: ShellPalette;
  path: string;
  onNavigate: (path: string) => void;
  onTrackEvent: (
    name: string,
    version: number,
    data: Record<string, unknown>,
  ) => void;
};

export function CardCatalogBody({ palette, path, onNavigate, onTrackEvent }: Props) {
  const insets = useSafeAreaInsets();
  const [dataset, setDataset] = useState<CardDataset | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadCardDataset().then(loaded => {
      if (!cancelled) {
        setDataset(loaded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const detailCardId = parseCardRoute(path);
  const detailCard = useMemo(
    () => dataset?.cards.find(card => card.id === detailCardId) ?? null,
    [dataset, detailCardId],
  );

  const results = useMemo(
    () => (dataset ? searchCards(dataset.cards, query) : []),
    [dataset, query],
  );

  const trackDetail = useCallback(
    (card: BankCard) => {
      onTrackEvent('card_detail_viewed', 1, {
        card_id: card.id,
        source: 'list',
      });
    },
    [onTrackEvent],
  );

  if (detailCardId && dataset && !detailCard) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.emptyTitle, { color: palette.text }]}>
          Không tìm thấy thẻ
        </Text>
        <Text style={[styles.emptyBody, { color: palette.mutedText }]}>
          Thẻ này không có trong danh mục hiện tại.
        </Text>
      </View>
    );
  }

  if (detailCard) {
    return (
      <View style={styles.detail}>
        <View
          style={[
            styles.cardImage,
            styles.cardImageLarge,
            { backgroundColor: detailCard.imageColor },
          ]}
        >
          <Text style={styles.cardImageBrand}>
            {brandLabel[detailCard.cardBrand]}
          </Text>
          <Text numberOfLines={2} style={styles.cardImageName}>
            {detailCard.cardName}
          </Text>
        </View>
        <View style={styles.detailHeader}>
          <View
            style={[
              styles.bankBadge,
              { backgroundColor: palette.primarySoft },
            ]}
          >
            <Text style={[styles.bankBadgeText, { color: palette.primary }]}>
              {detailCard.bankCode}
            </Text>
          </View>
          <View style={styles.detailHeaderText}>
            <Text style={[styles.bankName, { color: palette.text }]}>
              {detailCard.bankName}
            </Text>
            <Text style={[styles.feeText, { color: palette.mutedText }]}>
              {formatAnnualFee(detailCard)}
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>
          Ưu đãi ({detailCard.benefits.length})
        </Text>
        <View style={styles.benefitList}>
          {detailCard.benefits.map(benefit => (
            <View
              key={benefit.title}
              style={[styles.benefitCard, { backgroundColor: palette.surface }]}
            >
              <View style={styles.benefitTitleRow}>
                <View
                  style={[
                    styles.benefitChip,
                    { backgroundColor: palette.primarySoft },
                  ]}
                >
                  <Text
                    style={[styles.benefitChipText, { color: palette.primary }]}
                  >
                    {benefitTypeLabel[benefit.type]}
                  </Text>
                </View>
                <Text
                  style={[styles.benefitTitle, { color: palette.text }]}
                  numberOfLines={2}
                >
                  {benefit.title}
                </Text>
              </View>
              <Text style={[styles.benefitDetail, { color: palette.mutedText }]}>
                {benefit.detail}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      <TextInput
        accessibilityLabel="Tìm kiếm ưu đãi thẻ"
        onChangeText={setQuery}
        onEndEditing={() => {
          onTrackEvent('benefit_search_performed', 1, {
            query_length: foldText(query).trim().length,
            result_count: results.length,
          });
        }}
        placeholder="Tìm ưu đãi, ngân hàng, loại thẻ…"
        placeholderTextColor={palette.mutedText}
        returnKeyType="search"
        style={[
          styles.searchField,
          {
            backgroundColor: palette.surface,
            borderColor: palette.glassBorder,
            color: palette.text,
          },
        ]}
        value={query}
      />
      {dataset ? (
        <Text style={[styles.datasetLabel, { color: palette.mutedText }]}>
          {datasetUpdatedLabel(dataset)} · {results.length} thẻ
        </Text>
      ) : (
        <Text style={[styles.datasetLabel, { color: palette.mutedText }]}>
          Đang tải danh mục thẻ…
        </Text>
      )}
      <View style={styles.cardList}>
        {results.map(card => {
          const headline = bestBenefit(card);
          return (
            <Pressable
              key={card.id}
              onPress={() => {
                trackDetail(card);
                onNavigate(`/card/${card.id}`);
              }}
              style={({ pressed }) => [
                styles.cardRow,
                { backgroundColor: palette.surface },
                pressed && styles.pressed,
              ]}
            >
              <View
                style={[styles.bankBadge, { backgroundColor: palette.primarySoft }]}
              >
                <Text style={[styles.bankBadgeText, { color: palette.primary }]}>
                  {card.bankCode}
                </Text>
              </View>
              <View
                style={[styles.cardImage, { backgroundColor: card.imageColor }]}
              >
                <Text style={styles.cardImageBrand}>
                  {brandLabel[card.cardBrand]}
                </Text>
              </View>
              <View style={styles.cardRowText}>
                <Text numberOfLines={1} style={[styles.cardName, { color: palette.text }]}>
                  {card.cardName}
                </Text>
                <Text numberOfLines={1} style={[styles.bankNameSmall, { color: palette.mutedText }]}>
                  {card.bankName} · {formatAnnualFee(card)}
                </Text>
                <Text
                  numberOfLines={2}
                  style={[styles.bestBenefit, { color: palette.primary }]}
                >
                  ⭐ {headline.title}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {dataset && results.length === 0 ? (
        <View style={[styles.emptyState, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={[styles.emptyTitle, { color: palette.text }]}>
            Không có thẻ phù hợp
          </Text>
          <Text style={[styles.emptyBody, { color: palette.mutedText }]}>
            Thử từ khóa khác như “hoàn tiền”, “sân bay” hoặc tên ngân hàng.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  searchField: {
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  datasetLabel: { fontSize: 12, fontWeight: '600', marginTop: 10 },
  cardList: { gap: 12, marginTop: 12 },
  cardRow: {
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 12,
    minHeight: 96,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  bankBadge: {
    alignItems: 'center',
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    width: 52,
  },
  bankBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  cardImage: {
    alignItems: 'flex-end',
    borderRadius: 10,
    height: 56,
    justifyContent: 'space-between',
    padding: 8,
    width: 88,
  },
  cardImageLarge: {
    alignSelf: 'stretch',
    height: 140,
    justifyContent: 'flex-end',
    width: undefined,
  },
  cardImageBrand: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  cardImageName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cardRowText: { flex: 1 },
  cardName: { fontSize: 14, fontWeight: '800' },
  bankName: { fontSize: 17, fontWeight: '800' },
  bankNameSmall: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  feeText: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  bestBenefit: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  detail: { flex: 1 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  detailHeaderText: { flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12, marginTop: 24 },
  benefitList: { gap: 10 },
  benefitCard: { borderRadius: 16, padding: 14 },
  benefitTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  benefitChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  benefitChipText: { fontSize: 10, fontWeight: '800' },
  benefitTitle: { flex: 1, fontSize: 14, fontWeight: '800' },
  benefitDetail: { fontSize: 13, lineHeight: 19, marginTop: 8 },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  emptyState: { alignItems: 'center', paddingTop: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '800' },
  emptyBody: { fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' },
});
