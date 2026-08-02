import { EmptyState } from '../../src/components/EmptyState';
import { Screen } from '../../src/components/Screen';

export default function HistoryScreen() {
  return (
    <Screen>
      <EmptyState
        title="History"
        description="Saved analysis history will appear here on this device."
      />
    </Screen>
  );
}
