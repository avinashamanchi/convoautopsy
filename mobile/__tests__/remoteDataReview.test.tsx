import { fireEvent, render, screen } from '@testing-library/react-native';
import { AiConsentSheet } from '../src/components/AiConsentSheet';
import { RemoteDataReview } from '../src/components/RemoteDataReview';
import { PrivacyCopy } from '../app/privacy';
import type { ParsedMessage } from '../src/domain/analysis';

const messages: ParsedMessage[] = [
  { id: 'line-1', sender: 'Person A', text: 'Email sam@example.com', sourceLine: 1 },
  { id: 'line-2', sender: 'Person B', text: 'Meet in room 42', sourceLine: 2 },
];

const responseMessages = [
  { ...messages[0], pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: 'Email sam@example.com may be a request.' },
  { ...messages[1], pattern: 'Avoidance', egoState: 'Child', possibleInterpretation: 'Room 42 could be a meeting place.' },
];

const responseContext = {
  sender: 'Person A',
  goal: 'resolve',
  tone: 'direct',
  intensityScore: 42,
  conflictMode: 'Collaborating',
} as const;

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
  expect(screen.getByLabelText(
    'Text sent for Person A message 1: Email [EMAIL]',
  )).toBeOnTheScreen();
});

it('lets the person toggle a candidate and confirms exactly the visible outgoing texts', () => {
  const onConfirm = jest.fn();
  render(<RemoteDataReview isConfirming={false} messages={messages} onCancel={() => {}} onConfirm={onConfirm} />);

  fireEvent.press(screen.getByRole('button', { name: 'Redact email sam@example.com in Person A message 1' }));
  expect(screen.getByRole('button', {
    name: 'Redact email sam@example.com in Person A message 1',
    selected: false,
  })).toBeOnTheScreen();
  expect(screen.getByLabelText(
    'Text sent for Person A message 1: Email sam@example.com',
  )).toBeOnTheScreen();
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
  expect(screen.getByLabelText(
    'Text sent for Person A message 1: New address [EMAIL]',
  )).toBeOnTheScreen();
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
  expect(screen.getByText('Message text must be 280 characters or fewer for remote AI.')).toBeOnTheScreen();
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
  expect(screen.getByText(/random installation token for abuse prevention/)).toBeOnTheScreen();
  expect(screen.getByText(/pseudonymous RevenueCat app-user ID for plan and allowance verification/)).toBeOnTheScreen();
  expect(screen.getByText(/The review does not display either raw identifier/)).toBeOnTheScreen();
  expect(screen.getByText(/RevenueCat does not receive your conversation text/)).toBeOnTheScreen();
  expect(screen.getByText(/technical fields are sent to ConvoAutopsy's Cloudflare service/)).toBeOnTheScreen();
  expect(screen.getByText(/Neither raw technical identifier is forwarded to Groq/)).toBeOnTheScreen();
});

it('uses response-specific consent copy for a reviewed AI draft', () => {
  render(<AiConsentSheet feature="response-draft" isRunning={false} onAgree={() => {}} onCancel={() => {}} />);

  expect(screen.getByText('Before AI-assisted response drafting')).toBeOnTheScreen();
  expect(screen.getByText(/The reviewed message text is sent to Groq/)).toBeOnTheScreen();
  expect(screen.getByText(/On-device response drafts are available without sharing/)).toBeOnTheScreen();
});

it('shows, edits, redacts, and freezes response possible interpretations with message text', () => {
  const onConfirm = jest.fn();
  render(<RemoteDataReview isConfirming={false} messages={responseMessages} onCancel={() => {}} onConfirm={onConfirm} responseContext={responseContext} />);

  expect(screen.getByLabelText('Response sender sent, read-only: Person A')).toBeOnTheScreen();
  expect(screen.getByLabelText('Response goal sent, read-only: resolve')).toBeOnTheScreen();
  expect(screen.getByLabelText('Response tone sent, read-only: direct')).toBeOnTheScreen();
  expect(screen.getByLabelText('Analysis intensity sent, read-only: 42')).toBeOnTheScreen();
  expect(screen.getByLabelText('Analysis conflict sent, read-only: Collaborating')).toBeOnTheScreen();
  expect(screen.getByLabelText('Message 1 sender sent, read-only: Person A')).toBeOnTheScreen();
  expect(screen.getByLabelText('Message 1 pattern sent, read-only: Neutral')).toBeOnTheScreen();
  expect(screen.getByLabelText('Message 1 ego state sent, read-only: Adult')).toBeOnTheScreen();

  expect(screen.getByLabelText('Outgoing possible interpretation for Person A message 1')).toHaveProp(
    'value',
    'Email sam@example.com may be a request.',
  );
  expect(screen.getByLabelText(
    'Possible interpretation sent for Person A message 1: Email [EMAIL] may be a request.',
  )).toBeOnTheScreen();
  fireEvent.changeText(
    screen.getByLabelText('Outgoing possible interpretation for Person A message 1'),
    'New contact new@example.com may want space.',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Confirm exact text' }));

  const confirmed = onConfirm.mock.calls[0][0];
  expect(confirmed[0].possibleInterpretation).toBe('New contact [EMAIL] may want space.');
  expect(Object.isFrozen(confirmed)).toBe(true);
  expect(Object.isFrozen(confirmed[0])).toBe(true);
});

it('keeps a response interpretation above 150 code points editable but blocks remote confirmation', () => {
  const onConfirm = jest.fn();
  render(<RemoteDataReview isConfirming={false} messages={responseMessages} onCancel={() => {}} onConfirm={onConfirm} responseContext={responseContext} />);

  fireEvent.changeText(
    screen.getByLabelText('Outgoing possible interpretation for Person A message 1'),
    '🧠'.repeat(151),
  );

  expect(screen.getByText('Possible interpretation must be 150 characters or fewer for remote AI.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Confirm exact text', disabled: true })).toBeOnTheScreen();
  expect(onConfirm).not.toHaveBeenCalled();
});

it('validates the expanded outgoing redaction placeholder at the 280-message boundary', () => {
  const onConfirm = jest.fn();
  const rawText = `${'x'.repeat(276)} @aa`;
  render(<RemoteDataReview isConfirming={false} messages={[{ ...messages[0], text: rawText }]} onCancel={() => {}} onConfirm={onConfirm} />);

  expect(Array.from(rawText)).toHaveLength(280);
  expect(screen.getByLabelText(/Text sent for Person A message 1:/).props.accessibilityLabel).toContain('[HANDLE]');
  expect(screen.getByText('Message text must be 280 characters or fewer for remote AI.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Confirm exact text', disabled: true })).toBeOnTheScreen();
  expect(onConfirm).not.toHaveBeenCalled();
});

it('validates the expanded outgoing redaction placeholder at the 150-interpretation boundary', () => {
  const onConfirm = jest.fn();
  const rawInterpretation = `${'x'.repeat(146)} @aa`;
  render(<RemoteDataReview
    isConfirming={false}
    messages={[{ ...responseMessages[0], possibleInterpretation: rawInterpretation }]}
    onCancel={() => {}}
    onConfirm={onConfirm}
    responseContext={responseContext}
  />);

  expect(Array.from(rawInterpretation)).toHaveLength(150);
  expect(screen.getByLabelText(/Possible interpretation sent for Person A message 1:/).props.accessibilityLabel).toContain('[HANDLE]');
  expect(screen.getByText('Possible interpretation must be 150 characters or fewer for remote AI.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Confirm exact text', disabled: true })).toBeOnTheScreen();
  expect(onConfirm).not.toHaveBeenCalled();
});

it('enumerates every analysis and response-draft field plus pseudonymous request metadata in privacy copy', () => {
  render(<PrivacyCopy />);

  expect(screen.getByText(/AI-assisted analysis sends each reviewed message sender label and text/)).toBeOnTheScreen();
  expect(screen.getByText(/response sender, goal, tone, analysis intensity and conflict/)).toBeOnTheScreen();
  expect(screen.getByText(/each message sender, reviewed text, pattern, ego state, and reviewed possible interpretation/)).toBeOnTheScreen();
  expect(screen.getByText(/random installation token and a pseudonymous RevenueCat app-user ID/)).toBeOnTheScreen();
  expect(screen.queryByText(/\$RCAnonymousID:/)).toBeNull();
});
