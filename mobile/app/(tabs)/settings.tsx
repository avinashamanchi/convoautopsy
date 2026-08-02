import { EmptyState } from '../../src/components/EmptyState';
import { Screen } from '../../src/components/Screen';

export default function SettingsScreen() {
  return (
    <Screen>
      <EmptyState
        title="Settings"
        description="Privacy and analysis preferences will appear here."
      />
    </Screen>
  );
}
