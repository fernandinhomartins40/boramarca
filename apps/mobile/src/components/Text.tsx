import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import type { fontFamily } from '@boramarca/shared';
import { useTheme, type AppColors, type TextVariant } from '@/theme';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: keyof AppColors;
  weight?: keyof typeof fontFamily;
  align?: 'left' | 'center' | 'right';
}

/** Text in the type scale (body 17 by default). Respects the system font size. */
export function Text({
  variant = 'body',
  color = 'text',
  weight,
  align,
  style,
  ...rest
}: TextProps) {
  const t = useTheme();
  return (
    <RNText
      style={[
        t.text[variant],
        { color: t.colors[color] },
        weight && { fontFamily: t.fontFamily[weight] },
        align && { textAlign: align },
        style,
      ]}
      {...rest}
    />
  );
}
