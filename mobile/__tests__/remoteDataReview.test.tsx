import { fireEvent, render, screen } from '@testing-library/react-native';
import { AiConsentSheet } from '../src/components/AiConsentSheet';
import { RemoteDataReview } from '../src/components/RemoteDataReview';
import type { ParsedMessage } from '../src/domain/analysis';

const messages: ParsedMessage[] = [
  { id: 'line-1', sender: 'Person A', text: 'Email sam@example.com', sourceLine: 1 },
  { id: 'line-2', sender: 'Person B', text: 'Meet in room 42', sourceLine: 2 },
];

it('warns that automatic detection can miss details even when no candidates exist', () => {
  render(
    <RemoteDataReview
      isConfirming={false}
      messages={[messages[1]]}
      onCancel={() => {}}
      onConfirm={() => {}}
    />,
  );

  expect(screen.getByRole('alert')).toHaveTextContent(
    'Automatic detection can miss identifying details. Review the exact text below.',
  );
});

it('shows every anonymous message in an editable labeled input and selects safe candidates by default', () => {
  render(<RemoteDataReview isConfirming={false} messages={messages} onCancel={() => {}} onConfirm={() => {}} />);

  expect(screen.getByLabelText('Outgoing text for Person A message 1')).toHaveProp('value', 'Email sam@example.com');
  expect(screen.getByLabelText('Outgoing text for Person B message 2')).toHaveProp('value', 'Meet in room 42');
  expect(screen.getByRole('button', {
    name: 'Redact email sam@example.com in Person A message 1',
    selected: true,
  })).toBeOnTheScreen();
  expect(screen.getByLabelText('Text sent for Person A message 1')).toHaveTextContent('Email [EMAIL]');
});

it('lets the person toggle a candidate and confirms exactly the visible outgoing texts', () => {
  const onConfirm = jest.fn();
  render(<RemoteDataReview isConfirming={false} messages={messages} onCancel={() => {}} onConfirm={onConfirm} />);

  fireEvent.press(screen.getByRole('button', { name: 'Redact email sam@example.com in Person A message 1' }));
  expect(screen.getByRole('button', {
    name: 'Redact email sam@example.com in Person A message 1',
    selected: false,
  })).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Confirm exact text' }));

  expect(onConfirm).toHaveBeenCalledWith([
    { id: 'line-1', sender: 'Person A', text: 'Email sam@example.com', sourceLine: 1 },
    { id: 'line-2', sender: 'Person B', text: 'Meet in room 42', sourceLine: 2 },
  ]);
});

it('re-detects candidates after an edit instead of applying stale offsets', () => {
  const onConfirm = jest.fn();
  render(<RemoteDataReview isConfirming={false} messages={messages} onCancel={() => {}} onConfirm={onConfirm} />);

  fireEvent.changeText(
    screen.getByLabelText('Outgoing text for Person A message 1'),
    'New address new@example.com',
  );

  expect(screen.queryByRole('button', { name: /sam@example\.com/ })).toBeNull();
  expect(screen.getByRole('button', {
    name: 'Redact email new@example.com in Person A message 1',
    selected: true,
  })).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Confirm exact text' }));
  expect(onConfirm.mock.calls[0][0][0].text).toBe('New address [EMAIL]');
});

it('keeps an oversized manual paste editable without crashing or allowing confirmation', () => {
  const onConfirm = jest.fn();
  render(<RemoteDataReview isConfirming={false} messages={messages} onCancel={() => {}} onConfirm={onConfirm} />);

  fireEvent.changeText(
    screen.getByLabelText('Outgoing text for Person A message 1'),
    'x'.repeat(100_001),
  );

  expect(screen.getByLabelText('Outgoing text for Person A message 1')).toHaveProp('value', 'x'.repeat(100_001));
  expect(screen.getByText('Message text must be 1,000 characters or fewer.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Confirm exact text', disabled: true })).toBeOnTheScreen();
  expect(onConfirm).not.toHaveBeenCalled();
});

it('has a distinct cancel action and disables confirmation while transitioning', () => {
  const onCancel = jest.fn();
  const onConfirm = jest.fn();
  render(<RemoteDataReview isConfirming messages={messages} onCancel={onCancel} onConfirm={onConfirm} />);

  expect(screen.getByRole('button', { name: 'Confirming reviewed text…', disabled: true })).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Cancel remote analysis' }));

  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});

it('separates RevenueCat plan verification metadata from the Groq conversation disclosure', () => {
  render(<AiConsentSheet isRunning={false} onAgree={() => {}} onCancel={() => {}} />);

  expect(screen.getByText(/Message text is sent to Groq through ConvoAutopsy's server/)).toBeOnTheScreen();
  expect(screen.getByText(
    'If you use a subscription, your RevenueCat app user ID may be sent to our server to verify your plan; RevenueCat does not receive your conversation text.',
  )).toBeOnTheScreen();
});
