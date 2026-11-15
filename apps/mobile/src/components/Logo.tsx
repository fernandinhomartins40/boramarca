import type { FC } from 'react';
import type { SvgProps } from 'react-native-svg';
import { useTheme } from '@/theme';
import HorizontalCor from '../../assets/brand/logo-horizontal-cor.svg';
import HorizontalNegativo from '../../assets/brand/logo-horizontal-negativo.svg';
import HorizontalVioletaBranco from '../../assets/brand/logo-horizontal-violeta-branco.svg';
import SimboloCor from '../../assets/brand/simbolo-cor.svg';
import SimboloNegativo from '../../assets/brand/simbolo-negativo.svg';
import SimboloVioletaBranco from '../../assets/brand/simbolo-violeta-branco.svg';

/**
 * cor = fundo claro · negativo = fundo escuro (símbolo lima) · violeta-branco = sobre grafite ou
 * violeta. `auto` picks cor (light) or violeta-branco (dark), as in reference 04-agenda.
 */
export type LogoVariant = 'auto' | 'cor' | 'negativo' | 'violeta-branco';
export type LogoKind = 'horizontal' | 'simbolo';

export interface LogoProps {
  kind?: LogoKind;
  variant?: LogoVariant;
  /** Height in dp; the width follows the file's viewBox, so the mark is never stretched. */
  height?: number;
}

const files: Record<LogoKind, Record<Exclude<LogoVariant, 'auto'>, FC<SvgProps>>> = {
  horizontal: {
    cor: HorizontalCor,
    negativo: HorizontalNegativo,
    'violeta-branco': HorizontalVioletaBranco,
  },
  simbolo: { cor: SimboloCor, negativo: SimboloNegativo, 'violeta-branco': SimboloVioletaBranco },
};

/** viewBox width / height of the kit files (01-marca/svg). */
const ratio: Record<LogoKind, number> = { horizontal: 1376 / 304, simbolo: 236 / 304 };

/** Brand mark from Bora-Marca-Kit/01-marca/svg, used as is (no recolor, no stretch). */
export function Logo({ kind = 'horizontal', variant = 'auto', height }: LogoProps) {
  const t = useTheme();
  const v = variant === 'auto' ? (t.scheme === 'dark' ? 'violeta-branco' : 'cor') : variant;
  const Svg = files[kind][v];
  const h = height ?? t.sizes.logoHeader;
  return (
    <Svg
      width={h * ratio[kind]}
      height={h}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Bora Marca"
    />
  );
}
