import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { tokens } from '../../src/theme/tokens';

const tabOptions = {
  headerShown: false,
  tabBarActiveTintColor: tokens.colors.textPrimary,
  tabBarInactiveTintColor: tokens.colors.textSecondary,
  tabBarStyle: {
    backgroundColor: tokens.colors.surface,
    borderTopColor: tokens.colors.textSecondary,
  },
  tabBarLabelStyle: {
    fontWeight: '700' as const,
  },
};

function TabIcon({ color, focused }: { color: string; focused: boolean }) {
  return <Text style={{ color }}>{focused ? '◆' : '◇'}</Text>;
}

export default function TabLayout() {
  return (
    <Tabs screenOptions={tabOptions}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Analyze', tabBarIcon: TabIcon }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: 'History', tabBarButtonTestID: 'tab-history', tabBarIcon: TabIcon }}
      />
      <Tabs.Screen
        name="responses"
        options={{ title: 'Responses', tabBarButtonTestID: 'tab-responses', tabBarIcon: TabIcon }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarButtonTestID: 'tab-settings', tabBarIcon: TabIcon }}
      />
    </Tabs>
  );
}
