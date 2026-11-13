/**
 * Bora Marca design tokens (plan section 10). Source: Bora-Marca-Kit/paleta.json + tokens.css.
 * Base colors come from the kit; every other tone is "derivado" (see packages/shared/README.md).
 * Consumers: apps/mobile/src/theme and the Tailwind theme of apps/web. No other colors are allowed.
 */

/** Kit palette (Bora-Marca-Kit/paleta.json). */
export const brand = {
  violeta: '#7138F5',
  lima: '#D9FC60',
  grafite: '#191624',
  neutro: '#F8F7FC',
  branco: '#FFFFFF',
} as const;

export type ColorToken =
  | 'bg'
  | 'surface'
  | 'surfaceAlt'
  | 'text'
  | 'textMuted'
  | 'primary'
  | 'onPrimary'
  | 'primaryText'
  | 'accent'
  | 'onAccent'
  | 'accentSoft'
  | 'success'
  | 'onSuccess'
  | 'warning'
  | 'onWarning'
  | 'danger'
  | 'onDanger'
  | 'border';

export type ColorScheme = Record<ColorToken, string>;

export const lightColors: ColorScheme = {
  bg: brand.neutro,
  surface: brand.branco,
  surfaceAlt: '#EFECF8', // derivado: neutro escurecido com o matiz violeta
  text: brand.grafite,
  textMuted: '#5F5A70', // derivado: grafite clareado
  primary: brand.violeta,
  onPrimary: brand.branco,
  primaryText: brand.violeta, // violeta usado como texto/link sobre fundo claro
  accent: brand.lima,
  onAccent: brand.grafite,
  accentSoft: '#F1FDD0', // derivado: lima claro (card de pedido de encaixe)
  success: brand.lima, // selo "Confirmado": lima com texto grafite
  onSuccess: brand.grafite,
  warning: '#F5A524', // derivado: âmbar para "pendente / precisa de você"
  onWarning: brand.grafite,
  danger: '#C8283F', // derivado: vermelho para cancelado/erro
  onDanger: brand.branco,
  border: '#E2DEEE', // derivado
};

export const darkColors: ColorScheme = {
  bg: brand.grafite,
  surface: '#231F30', // derivado: grafite clareado
  surfaceAlt: '#2E2940', // derivado
  text: brand.neutro,
  textMuted: '#B4AFC4', // derivado
  primary: brand.violeta,
  onPrimary: brand.branco,
  primaryText: '#A98BFA', // derivado: violeta clareado (violeta puro não atinge AA sobre grafite)
  accent: brand.lima,
  onAccent: brand.grafite,
  accentSoft: '#2F3518', // derivado: lima escurecido para cards de encaixe no escuro
  success: brand.lima,
  onSuccess: brand.grafite,
  warning: '#F5A524', // derivado
  onWarning: brand.grafite,
  danger: '#FF8A9B', // derivado: vermelho clareado para o fundo escuro
  onDanger: brand.grafite,
  border: '#3A3548', // derivado
};

export const colors = { light: lightColors, dark: darkColors } as const;
export type ColorSchemeName = keyof typeof colors;

/**
 * Text/background pairs used by the UI. Each must reach WCAG AA (4.5:1); checked by theme.test.ts.
 * Add a pair here before using a new combination. "Texto lima sobre violeta" is only for large
 * titles (AA large = 3:1) and is listed separately.
 */
export const contrastPairs: ReadonlyArray<readonly [fg: ColorToken, bg: ColorToken]> = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['text', 'surfaceAlt'],
  ['text', 'accentSoft'],
  ['textMuted', 'bg'],
  ['textMuted', 'surface'],
  ['textMuted', 'surfaceAlt'],
  ['textMuted', 'accentSoft'],
  ['onPrimary', 'primary'],
  ['primaryText', 'bg'],
  ['primaryText', 'surface'],
  ['primaryText', 'surfaceAlt'],
  ['onAccent', 'accent'],
  ['onSuccess', 'success'],
  ['onWarning', 'warning'],
  ['onDanger', 'danger'],
  ['danger', 'bg'],
  ['danger', 'surface'],
  ['danger', 'surfaceAlt'],
];

/** Large-title-only pairs (WCAG AA large text, 3:1). */
export const largeTextPairs: ReadonlyArray<readonly [fg: string, bg: string]> = [
  [brand.lima, brand.violeta],
  [brand.lima, brand.grafite],
];

/** Spacing scale, base 4. */
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export type SpacingToken = keyof typeof spacing;

export const radii = { sm: 8, md: 14, lg: 24, pill: 999 } as const;
export type RadiusToken = keyof typeof radii;

/** Minimum touch target (dp/px): bigger than usual, for gloved or wet hands. */
export const touchTarget = {
  min: 56,
  button: { md: 56, lg: 64 },
  bigChoice: 96,
  balcaoChoice: 120,
} as const;

/** Inter family names: `@expo-google-fonts/inter` keys on mobile, CSS weights on web. */
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;
export const fontFamilyWeb = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
export const fontWeight = { regular: 400, medium: 500, semibold: 600, bold: 700 } as const;
export type FontWeightToken = keyof typeof fontWeight;

/** Type scale (body 17: the phone is read from a distance on the counter). */
export const typography = {
  display: { fontSize: 32, lineHeight: 38, weight: 'bold' },
  title: { fontSize: 24, lineHeight: 30, weight: 'bold' },
  heading: { fontSize: 20, lineHeight: 26, weight: 'semibold' },
  body: { fontSize: 17, lineHeight: 24, weight: 'regular' },
  bodySmall: { fontSize: 15, lineHeight: 21, weight: 'regular' },
  caption: { fontSize: 13, lineHeight: 18, weight: 'medium' },
} as const satisfies Record<
  string,
  { fontSize: number; lineHeight: number; weight: FontWeightToken }
>;
export type TypographyToken = keyof typeof typography;

/** Web layout values from Bora-Marca-Kit/tokens.css. */
export const web = {
  container: '76rem',
  gutter: 'clamp(1.25rem, 4vw, 4rem)',
  radius: 'clamp(1.25rem, 2vw, 2rem)',
} as const;

export const theme = {
  brand,
  colors,
  spacing,
  radii,
  touchTarget,
  fontFamily,
  fontWeight,
  typography,
  web,
} as const;
export type Theme = typeof theme;

// ---- WCAG helpers (also used by tests and by apps that compose new pairs)

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) throw new Error(`Cor inválida: ${hex}`);
  const n = parseInt(m[1], 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}
