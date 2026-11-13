import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@boramarca/shared';

// Provisional home — agent A4 replaces it with the tab navigation (prompt 00).
export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bora Marca</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.light.bg,
  },
  title: {
    fontSize: typography.title.fontSize,
    lineHeight: typography.title.lineHeight,
    color: colors.light.text,
  },
});
