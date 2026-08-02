import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';

type EmptyStateProps = {
  title: string;
  description: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    color: tokens.colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: tokens.spacing.sm,
    textAlign: 'center',
  },
  description: {
    color: tokens.colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
});
