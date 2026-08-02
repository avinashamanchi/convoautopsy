import { renderRouter, screen } from 'expo-router/testing-library';

it('exposes the four native tabs', () => {
  renderRouter('./fixtures/routes', { initialUrl: '/' });
  expect(screen.getByText('Analyze')).toBeOnTheScreen();
  expect(screen.getByText('History')).toBeOnTheScreen();
  expect(screen.getByText('Responses')).toBeOnTheScreen();
  expect(screen.getByText('Settings')).toBeOnTheScreen();
});
