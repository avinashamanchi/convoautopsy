import { fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

jest.mock('../src/billing/BillingProvider', () => ({
  BillingProvider: ({ children }: { children: React.ReactNode }) => children,
  useBilling: () => ({
    appUserId: '$RCAnonymousID:analyze-flow',
    identityStatus: 'ready',
    entitlementStatus: 'free',
  }),
}));

it('previews parsed messages before running local analysis', async () => {
  renderRouter('./app', { initialUrl: '/' });

  fireEvent.changeText(await screen.findByLabelText('Conversation text'), 'Alex: Hello\nJordan: Hi');
  fireEvent.press(screen.getByRole('button', { name: 'Review conversation' }));

  expect(await screen.findByText('Person A')).toBeOnTheScreen();
  expect(screen.getByText('Person B')).toBeOnTheScreen();

  fireEvent.press(screen.getByRole('button', { name: 'Run on-device analysis' }));

  expect(await screen.findByText('On-device estimate')).toBeOnTheScreen();
});

it('shows rejected lines in the preview', async () => {
  renderRouter('./app', { initialUrl: '/' });

  fireEvent.changeText(
    await screen.findByLabelText('Conversation text'),
    'Alex: Hello\nnot a message\nJordan: Hi',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Review conversation' }));

  expect(await screen.findByText('Line 2: not a message')).toBeOnTheScreen();
  expect(screen.getByText('Use Name: Message format.')).toBeOnTheScreen();
});

it('returns to the editor with an actionable error when no messages are accepted', async () => {
  renderRouter('./app', { initialUrl: '/' });

  fireEvent.changeText(await screen.findByLabelText('Conversation text'), 'not a message');
  fireEvent.press(screen.getByRole('button', { name: 'Review conversation' }));

  expect(
    await screen.findByText("Couldn't find any messages. Use Name: Message on each line."),
  ).toBeOnTheScreen();
  expect(screen.getByLabelText('Conversation text').props.value).toBe('not a message');
});

it('recovers an over-limit pasted draft at the editor without losing it', async () => {
  renderRouter('./app', { initialUrl: '/' });
  const overLimitDraft = `Alex: ${'x'.repeat(100_000)}`;

  fireEvent.changeText(await screen.findByLabelText('Conversation text'), overLimitDraft);
  fireEvent.press(screen.getByRole('button', { name: 'Review conversation' }));

  expect(
    await screen.findByText('Conversation is over 100,000 characters. Shorten it and try again.'),
  ).toBeOnTheScreen();
  expect(screen.getByRole('alert')).toBeOnTheScreen();
  expect(screen.getByLabelText('Conversation text').props.value).toBe(overLimitDraft);
});

it('keeps the draft available for editing from the preview', async () => {
  renderRouter('./app', { initialUrl: '/' });

  fireEvent.changeText(await screen.findByLabelText('Conversation text'), 'Alex: Hello\nnot a message');
  fireEvent.press(screen.getByRole('button', { name: 'Review conversation' }));
  await screen.findByText('Person A');

  fireEvent.press(screen.getByRole('button', { name: 'Edit conversation' }));
  const editor = await screen.findByLabelText('Conversation text');
  expect(editor.props.value).toBe('Alex: Hello\nnot a message');

  fireEvent.changeText(editor, 'Alex: Hello\nJordan: Hi');
  fireEvent.press(screen.getByRole('button', { name: 'Review conversation' }));
  expect(await screen.findByText('Person B')).toBeOnTheScreen();
});

it('shows the exact outgoing-data review before the AI-sharing disclosure', async () => {
  renderRouter('./app', { initialUrl: '/' });

  fireEvent.changeText(await screen.findByLabelText('Conversation text'), 'Alex: Hello\nJordan: Hi');
  fireEvent.press(screen.getByRole('button', { name: 'Review conversation' }));
  await screen.findByText('Person A');

  fireEvent.press(screen.getByRole('button', { name: 'Use AI-assisted analysis' }));
  expect(await screen.findByText(
    'Automatic detection can miss identifying details. Review the exact text below.',
  )).toBeOnTheScreen();
  expect(screen.queryByText(/Message text is sent to Groq/)).toBeNull();

  fireEvent.press(screen.getByRole('button', { name: 'Confirm exact text' }));
  expect(
    await screen.findByText(
      /Speaker labels are replaced with Person labels. Message text is sent to Groq through ConvoAutopsy's server./,
    ),
  ).toBeOnTheScreen();
});
