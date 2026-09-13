import { BankCard, CardDataset } from './model';

/**
 * Bundled seed copy of the card catalog. Values are illustrative demo data,
 * not live bank offers. The official build replaces this through
 * `appConfig.cards.endpoint`; MVP serves it from the device.
 */
const seedCards: readonly BankCard[] = [
  {
    id: 'vcb-epartner-visa',
    bankId: 'vietcombank',
    bankName: 'Vietcombank',
    bankCode: 'VCB',
    cardBrand: 'visa',
    cardName: ' Vietcombank Visa Platinum',
    annualFeeVnd: 500000,
    firstYearFree: true,
    imageColor: '#006B3F',
    benefits: [
      {
        title: 'Hoàn tiền 7% ăn uống',
        detail:
          'Hoàn tiền đến 7% giao dịch nhà hàng, tối đa 300.000đ/tháng, áp dụng thứ Sáu–Chủ nhật.',
        type: 'cashback',
      },
      {
        title: 'Miễn lãi 45 ngày',
        detail: 'Miễn lãi suất tối đa 45 ngày cho giao dịch thanh toán hàng hóa, dịch vụ.',
        type: 'interest_free',
      },
      {
        title: 'Phòng chờ sân bay',
        detail: '4 lần/tháng vào phòng chờ thương gia tại các sân bay quốc tế trong nước.',
        type: 'lounge',
      },
    ],
  },
  {
    id: 'tcb-visa-platinum',
    bankId: 'techcombank',
    bankName: 'Techcombank',
    bankCode: 'TCB',
    cardBrand: 'visa',
    cardName: 'Techcombank Visa Platinum Cashback',
    annualFeeVnd: 499000,
    firstYearFree: true,
    imageColor: '#E4002B',
    benefits: [
      {
        title: 'Hoàn 15% siêu thị online',
        detail: 'Hoàn tiền 15% khi mua sắm trên các sàn thương mại điện tử, tối đa 600.000đ/tháng.',
        type: 'cashback',
      },
      {
        title: 'Giảm 50% xem phim',
        detail: 'Mua vé xem phim giảm đến 50% mỗi thứ Tư trên ứng dụng đặt vé.',
        type: 'discount',
      },
    ],
  },
  {
    id: 'vpbank-stepup',
    bankId: 'vpbank',
    bankName: 'VPBank',
    bankCode: 'VPB',
    cardBrand: 'mastercard',
    cardName: 'VPBank StepUp World Mastercard',
    annualFeeVnd: 0,
    firstYearFree: true,
    imageColor: '#0B4EA2',
    benefits: [
      {
        title: 'Miễn phí thường niên',
        detail: 'Miễn phí thường niên khi chi tiêu từ 30 triệu đồng/năm.',
        type: 'other',
      },
      {
        title: 'Hoàn 10% xăng xe',
        detail: 'Hoàn tiền 10% chi tiêu xăng dầu và đi lại, tối đa 200.000đ/tháng.',
        type: 'cashback',
      },
      {
        title: 'Trả góp 0%',
        detail: 'Trả góp lãi suất 0% đến 12 tháng tại đối tác liên kết.',
        type: 'interest_free',
      },
    ],
  },
  {
    id: 'mb-visa-hi',
    bankId: 'mbbank',
    bankName: 'MB Bank',
    bankCode: 'MB',
    cardBrand: 'visa',
    cardName: 'MB Visa Hi Cashback',
    annualFeeVnd: 299000,
    firstYearFree: true,
    imageColor: '#1D4ED8',
    benefits: [
      {
        title: 'Hoàn 5% mọi giao dịch',
        detail: 'Hoàn tiền 5% không giới hạn nhóm hàng, tối đa 500.000đ/tháng.',
        type: 'cashback',
      },
      {
        title: 'Giảm 30% Grab',
        detail: 'Giảm 30% giá vé đi xe công nghệ, áp dụng cuối tuần, tối đa 60.000đ/lượt.',
        type: 'discount',
      },
    ],
  },
  {
    id: 'tpbank-talented',
    bankId: 'tpbank',
    bankName: 'TPBank',
    bankCode: 'TPB',
    cardBrand: 'visa',
    cardName: 'TPBank Talented Visa',
    annualFeeVnd: 399000,
    firstYearFree: true,
    imageColor: '#F97316',
    benefits: [
      {
        title: 'Hoàn 20% online đầu tiên',
        detail: 'Hoàn 20% giao dịch mua sắm trực tuyến trong 2 tháng đầu mở thẻ, tối đa 1 triệu đồng.',
        type: 'cashback',
      },
      {
        title: 'Quà tặng sinh nhật',
        detail: 'Tặng điểm thưởng nhân đôi chi tiêu trong tháng sinh nhật.',
        type: 'other',
      },
    ],
  },
  {
    id: 'acb-visa-cashback',
    bankId: 'acb',
    bankName: 'ACB',
    bankCode: 'ACB',
    cardBrand: 'visa',
    cardName: 'ACB Visa Cashback',
    annualFeeVnd: 299000,
    firstYearFree: true,
    imageColor: '#0E7490',
    benefits: [
      {
        title: 'Hoàn 6% điện máy',
        detail: 'Hoàn 6% khi mua điện máy, gia dụng tại chuỗi đối tác, tối đa 800.000đ/tháng.',
        type: 'cashback',
      },
      {
        title: 'Miễn lãi 55 ngày',
        detail: 'Miễn lãi tối đa 55 ngày từ ngày giao dịch đầu tiên của kỳ sao kê.',
        type: 'interest_free',
      },
    ],
  },
  {
    id: 'vietin-jcb-cashbon',
    bankId: 'vietinbank',
    bankName: 'VietinBank',
    bankCode: 'CTG',
    cardBrand: 'jcb',
    cardName: 'VietinBank JCB CashBon',
    annualFeeVnd: 250000,
    firstYearFree: true,
    imageColor: '#0A57A6',
    benefits: [
      {
        title: 'Hoàn 8% du lịch',
        detail: 'Hoàn 8% chi tiêu khách sạn và vé máy bay trong nước, tối đa 400.000đ/tháng.',
        type: 'cashback',
      },
      {
        title: 'Giảm 40% buffet',
        detail: 'Giảm đến 40% giá buffet tại nhà hàng đối tác ở Hà Nội và TP.HCM.',
        type: 'discount',
      },
    ],
  },
  {
    id: 'bidv-visa-privilege',
    bankId: 'bidv',
    bankName: 'BIDV',
    bankCode: 'BIDV',
    cardBrand: 'visa',
    cardName: 'BIDV Visa Privilege',
    annualFeeVnd: 700000,
    firstYearFree: false,
    imageColor: '#166534',
    benefits: [
      {
        title: 'Phòng chờ vô hạn',
        detail: 'Không giới hạn số lần vào phòng chờ bậc thang tại Việt Nam và khu vực.',
        type: 'lounge',
      },
      {
        title: 'Hoàn 5% quốc tế',
        detail: 'Hoàn 5% giao dịch ngoại tệ trực tuyến, tối đa 1.000.000đ/tháng.',
        type: 'cashback',
      },
    ],
  },
  {
    id: 'sacombank-visa-360',
    bankId: 'sacombank',
    bankName: 'Sacombank',
    bankCode: 'STB',
    cardBrand: 'visa',
    cardName: 'Sacombank Visa 360°',
    annualFeeVnd: 350000,
    firstYearFree: true,
    imageColor: '#B91C1C',
    benefits: [
      {
        title: 'Hoàn 10% giáo dục',
        detail: 'Hoàn 10% học phí và chi tiêu giáo dục, tối đa 500.000đ/tháng.',
        type: 'cashback',
      },
      {
        title: 'Trả góp 0% 6 tháng',
        detail: 'Trả góp 0% kỳ hạn 6 tháng tại bệnh viện và phòng khám liên kết.',
        type: 'interest_free',
      },
    ],
  },
  {
    id: 'vib-online-plus',
    bankId: 'vib',
    bankName: 'VIB',
    bankCode: 'VIB',
    cardBrand: 'mastercard',
    cardName: 'VIB Online Plus',
    annualFeeVnd: 0,
    firstYearFree: true,
    imageColor: '#C2410C',
    benefits: [
      {
        title: 'Miễn phí thường niên',
        detail: 'Không mất phí thường niên trong suốt thời gian dùng thẻ.',
        type: 'other',
      },
      {
        title: 'Hoàn 25% online đầu tiên',
        detail: 'Hoàn đến 25% giao dịch mua sắm online trong tháng đầu, tối đa 500.000đ.',
        type: 'cashback',
      },
      {
        title: 'Giảm 50% giao đồ ăn',
        detail: 'Giảm 50% đơn giao đồ ăn thứ Sáu hằng tuần, tối đa 70.000đ/đơn.',
        type: 'discount',
      },
    ],
  },
  {
    id: 'msb-travel-platinum',
    bankId: 'msb',
    bankName: 'MSB',
    bankCode: 'MSB',
    cardBrand: 'visa',
    cardName: 'MSB Travel Platinum Visa',
    annualFeeVnd: 600000,
    firstYearFree: true,
    imageColor: '#1E3A8A',
    benefits: [
      {
        title: 'Hoàn 12% vé máy bay',
        detail: 'Hoàn 12% khi đặt vé máy bay qua ứng dụng liên kết, tối đa 600.000đ/tháng.',
        type: 'cashback',
      },
      {
        title: 'Bảo hiểm du lịch',
        detail: 'Miễn phí bảo hiểm du lịch toàn cầu trị giá đến 5 tỷ đồng/chuyến.',
        type: 'other',
      },
      {
        title: 'Phòng chờ sân bay',
        detail: '8 lượt/phòng chờ quốc tế mỗi năm.',
        type: 'lounge',
      },
    ],
  },
  {
    id: 'shinhan-solo',
    bankId: 'shinhan',
    bankName: 'Shinhan Bank',
    bankCode: 'SHB',
    cardBrand: 'visa',
    cardName: 'Shinhan Solo Card',
    annualFeeVnd: 400000,
    firstYearFree: true,
    imageColor: '#0369A1',
    benefits: [
      {
        title: 'Hoàn 10% thời trang',
        detail: 'Hoàn 10% chi tiêu thời trang và làm đẹp, tối đa 300.000đ/tháng.',
        type: 'cashback',
      },
      {
        title: '2-for-1 cà phê',
        detail: 'Mua 1 tặng 1 thức uống tại chuỗi cà phê liên kết mỗi thứ Hai.',
        type: 'discount',
      },
    ],
  },
];

export function seedCardDataset(now: number): CardDataset {
  return { retrievedAt: now, source: 'seed', cards: seedCards };
}
