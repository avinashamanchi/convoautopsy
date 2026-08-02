import { StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>Analyze a conversation</Text>
      <Text style={styles.body}>
        Your text stays on this device unless you choose AI-assisted analysis.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070708', padding: 24, justifyContent: 'center' },
  title: { color: '#f0eff4', fontSize: 32, fontWeight: '700', marginBottom: 12 },
  body: { color: '#b8b6c1', fontSize: 16, lineHeight: 24 },
});
