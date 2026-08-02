import { EmptyState } from '../../src/components/EmptyState';
import { Screen } from '../../src/components/Screen';

export default function ResponsesScreen() {
  return (
    <Screen>
      <EmptyState
        title="Responses"
        description="Draft response options will appear after an analysis."
      />
    </Screen>
  );
}
