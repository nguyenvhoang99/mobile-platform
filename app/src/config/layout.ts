export type LayoutTokens = {
  spacing: {
    none: number;
    xxs: number;
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  radius: {
    none: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    pill: number;
  };
  size: {
    touchTarget: number;
    icon: number;
  };
};

export type TypographyTokens = {
  size: {
    caption: number;
    label: number;
    body: number;
    heading: number;
    title: number;
  };
  lineHeight: {
    caption: number;
    label: number;
    body: number;
    heading: number;
    title: number;
  };
  weight: {
    regular: '400';
    medium: '500';
    semibold: '600';
    bold: '700';
  };
};

export const layoutTokens: LayoutTokens = {
  spacing: {
    none: 0,
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  radius: {
    none: 0,
    sm: 8,
    md: 12,
    lg: 20,
    xl: 28,
    pill: 999,
  },
  size: {
    touchTarget: 48,
    icon: 24,
  },
};

export const typographyTokens: TypographyTokens = {
  size: {
    caption: 12,
    label: 14,
    body: 16,
    heading: 20,
    title: 28,
  },
  lineHeight: {
    caption: 16,
    label: 20,
    body: 24,
    heading: 28,
    title: 34,
  },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
};
