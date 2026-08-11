import { render, screen } from '@testing-library/react-native';
import { KeyboardAvoidingView, ScrollView } from 'react-native';
import HomeScreen from '../app/(tabs)/index';
import { AnalysisSessionProvider } from '../src/state/AnalysisSession';

it('renders the native analyze entry point', () => {
  const view = render(
    <AnalysisSessionProvider>
      <HomeScreen />
    </AnalysisSessionProvider>,
  );
  expect(screen.getByRole('header', { name: 'Analyze a conversation' })).toBeOnTheScreen();
  expect(screen.getByText('Your text stays on this device unless you choose AI-assisted analysis.')).toBeOnTheScreen();
  expect(view.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('padding');
  expect(view.UNSAFE_getByType(ScrollView).props.keyboardDismissMode).toBe('interactive');
  expect(view.UNSAFE_getByType(ScrollView).props.keyboardShouldPersistTaps).toBe('handled');
});
