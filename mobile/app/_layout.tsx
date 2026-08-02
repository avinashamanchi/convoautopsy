import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AnalysisSessionProvider } from '../src/state/AnalysisSession';
import { ReportRepositoryProvider } from '../src/services/reportRepositoryContext';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ReportRepositoryProvider>
        <AnalysisSessionProvider>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
          <StatusBar style="light" />
        </AnalysisSessionProvider>
      </ReportRepositoryProvider>
    </SafeAreaProvider>
  );
}
