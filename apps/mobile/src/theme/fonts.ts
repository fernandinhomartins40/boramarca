import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { fontFamily } from '@boramarca/shared';

/** Font map for `useFonts`; keys are the `fontFamily` tokens of packages/shared. */
export const brandFonts = {
  [fontFamily.regular]: PlusJakartaSans_400Regular,
  [fontFamily.medium]: PlusJakartaSans_500Medium,
  [fontFamily.semibold]: PlusJakartaSans_600SemiBold,
  [fontFamily.bold]: PlusJakartaSans_700Bold,
};
