import { StyleSheet } from 'react-native';
import {
  brand,
  colors,
  fontFamily,
  radii,
  spacing,
  touchTarget,
  typography,
  type ColorScheme,
  type ColorSchemeName,
  type TypographyToken,
} from '@boramarca/shared';

/**
 * App tokens. Colors, spacing, radii, touch targets and type come from packages/shared/src/theme.ts
 * (the kit). The extra values below are layout sizes built on the same base-4 scale; they are the
 * only numbers components may use besides the shared tokens.
 */
export type TextVariant = TypographyToken;

export interface TextStyleToken {
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
}

export const text = Object.fromEntries(
  Object.entries(typography).map(([name, t]) => [
    name,
    { fontSize: t.fontSize, lineHeight: t.lineHeight, fontFamily: fontFamily[t.weight] },
  ]),
) as Record<TextVariant, TextStyleToken>;

/** Balcão phrase size: read from 1–2 m away (2 × display). */
export const balcaoText: TextStyleToken = {
  fontSize: typography.display.fontSize * 2,
  lineHeight: typography.display.lineHeight * 2,
  fontFamily: fontFamily.bold,
};

export const sizes = {
  hairline: StyleSheet.hairlineWidth,
  border: 1,
  borderStrong: 2,
  iconSm: spacing.lg + spacing.xs, // 20
  icon: spacing.xl, // 24
  iconLg: spacing.xxl, // 32
  dot: spacing.md, // timeline dot
  avatarSm: spacing.xxl + spacing.sm, // 40
  avatar: spacing.xxxl, // 48
  avatarLg: spacing.xxxl + spacing.xxl, // 80
  logoHeader: spacing.xxl, // logo height in headers
  progress: spacing.xs, // progress bars / deadline bar
  orb: spacing.xxxl * 5, // 240: VoiceOrb default diameter
  fab: touchTarget.min + spacing.sm, // 64
  sheetHandle: spacing.xxxl - spacing.sm, // 40 wide handle
} as const;

export const opacity = { pressed: 0.85, disabled: 0.45, past: 0.55, scrim: 0.5 } as const;

export const duration = { fast: 150, normal: 250, toast: 2600, pulse: 900, orb: 1600 } as const;

/** Colors the app derives per scheme from the shared tokens (no new hex values). */
export interface AppColors extends ColorScheme {
  /** Active tab label/icon: violeta on light, lima on dark (reference 04-agenda). */
  tabActive: string;
  /** Scrim behind sheets/modals. */
  scrim: string;
}

export interface AppTheme {
  scheme: ColorSchemeName;
  colors: AppColors;
  brand: typeof brand;
  spacing: typeof spacing;
  radii: typeof radii;
  touchTarget: typeof touchTarget;
  fontFamily: typeof fontFamily;
  text: typeof text;
  balcaoText: TextStyleToken;
  sizes: typeof sizes;
  opacity: typeof opacity;
  duration: typeof duration;
}

function build(scheme: ColorSchemeName): AppTheme {
  const c = colors[scheme];
  return {
    scheme,
    colors: { ...c, tabActive: scheme === 'dark' ? c.accent : c.primaryText, scrim: brand.grafite },
    brand,
    spacing,
    radii,
    touchTarget,
    fontFamily,
    text,
    balcaoText,
    sizes,
    opacity,
    duration,
  };
}

export const themes: Record<ColorSchemeName, AppTheme> = {
  light: build('light'),
  dark: build('dark'),
};
