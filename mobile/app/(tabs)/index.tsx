import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { tokens } from '../../src/theme/tokens';

export default function HomeScreen() {
  return (
    <Screen>
      <View style={styles.container}>
        <Text accessibilityRole="header" style={styles.title}>Analyze a conversation</Text>
        <Text style={styles.body}>
          Your text stays on this device unless you choose AI-assisted analysis.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  title: { color: tokens.colors.textPrimary, fontSize: 32, fontWeight: '700', marginBottom: 12 },
  body: { color: tokens.colors.textSecondary, fontSize: 16, lineHeight: 24 },
});
