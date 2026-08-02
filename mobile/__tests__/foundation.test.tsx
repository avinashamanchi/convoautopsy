import { render, screen } from '@testing-library/react-native';
import HomeScreen from '../app/(tabs)/index';
import { AnalysisSessionProvider } from '../src/state/AnalysisSession';

it('renders the native analyze entry point', () => {
  render(
    <AnalysisSessionProvider>
      <HomeScreen />
    </AnalysisSessionProvider>,
  );
  expect(screen.getByRole('header', { name: 'Analyze a conversation' })).toBeOnTheScreen();
  expect(screen.getByText('Your text stays on this device unless you choose AI-assisted analysis.')).toBeOnTheScreen();
});
