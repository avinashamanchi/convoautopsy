import { AccessibilityInfo, Modal } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { ConversationEditor } from '../src/components/ConversationEditor';
import { AiConsentSheet } from '../src/components/AiConsentSheet';
import { ConfirmDeleteSheet } from '../src/components/ConfirmDeleteSheet';
import { ResponseDraftCard } from '../src/components/ResponseDraftCard';
import { ResultSummary } from '../src/components/ResultSummary';
import type { AnalysisResult } from '../src/domain/analysis';

const result: AnalysisResult = {
  schemaVersion: 1,
  mode: 'local',
  intensityScore: 42,
  conflictMode: 'Collaborating',
  messages: [{
    sender: 'Person A', text: 'Can we talk?', pattern: 'Neutral', egoState: 'Adult',
    possibleInterpretation: 'This wording may reflect an attempt to communicate without a clear hostile pattern.',
  }],
};

const allPatternsResult: AnalysisResult = {
  ...result,
  messages: [
    { sender: 'Person A', text: 'You never listen.', pattern: 'Criticism', egoState: 'Parent', possibleInterpretation: 'Criticism interpretation.' },
    { sender: 'Person B', text: 'That is ridiculous.', pattern: 'Contempt', egoState: 'Parent', possibleInterpretation: 'Contempt interpretation.' },
    { sender: 'Person C', text: 'I did nothing wrong.', pattern: 'Defensiveness', egoState: 'Child', possibleInterpretation: 'Defensiveness interpretation.' },
    { sender: 'Person D', text: '...', pattern: 'Stonewalling', egoState: 'Child', possibleInterpretation: 'Stonewalling interpretation.' },
    { sender: 'Person E', text: 'Can we pause?', pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: 'Neutral interpretation.' },
  ],
};

it('gives the editor and import controls discoverable names', () => {
  render(<ConversationEditor disabled={false} error={null} onChange={() => {}} onImportFile={() => {}} onImportScreenshot={() => {}} onReview={() => {}} value="" />);

  expect(screen.getByLabelText('Conversation text')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Review conversation' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Import conversation file' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Import conversation screenshot' })).toBeOnTheScreen();
});

it('shows the Unicode code-point count users are actually limited by', () => {
  render(<ConversationEditor disabled={false} error={null} onChange={() => {}} onImportFile={() => {}} onImportScreenshot={() => {}} onReview={() => {}} value={'😀'.repeat(1_000)} />);

  expect(screen.getByText('1,000 of 100,000 characters')).toBeOnTheScreen();
});

it('exposes each primary tab as a named selectable navigation control', async () => {
  renderRouter('./fixtures/routes', { initialUrl: '/' });

  expect(await screen.findByRole('button', { name: 'Analyze, tab, 1 of 4', selected: true })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'History, tab, 2 of 4', selected: false })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Responses, tab, 3 of 4', selected: false })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Settings, tab, 4 of 4', selected: false })).toBeOnTheScreen();
});

it('announces the score and each pattern card with meaningful labels', () => {
  render(<ResultSummary result={result} />);

  expect(screen.getByLabelText('Intensity score: 42 out of 100')).toBeOnTheScreen();
  expect(screen.getByLabelText('Pattern for Person A: Neutral')).toBeOnTheScreen();
});

it('keeps consent and share actions identifiable to assistive technology', () => {
  render(<AiConsentSheet isRunning={false} onAgree={() => {}} onCancel={() => {}} />);
  expect(screen.getByRole('button', { name: 'Agree and continue' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeOnTheScreen();
  screen.unmount();

  render(<ResponseDraftCard draft={{ id: 'boundary', text: 'I need a pause.', hint: 'Sets a boundary' }} onCopy={async () => {}} onShare={async () => ({ ok: true })} />);
  expect(screen.getByRole('button', { name: 'Copy draft' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Share draft' })).toBeOnTheScreen();
});

it('gives the destructive cancel action a specific name', async () => {
  render(<ConfirmDeleteSheet onCancel={() => {}} onConfirm={() => {}} title="Friday conversation" visible />);
  expect(screen.getByRole('button', { name: 'Confirm delete Friday conversation' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Cancel deletion' })).toBeOnTheScreen();
  await act(async () => { await Promise.resolve(); });
});

it('stacks action groups at a 200 percent font scale without clipping critical content', () => {
  const dimensions = jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ fontScale: 2, height: 800, scale: 2, width: 390 });
  render(<ConversationEditor disabled={false} error={null} onChange={() => {}} onImportFile={() => {}} onImportScreenshot={() => {}} onReview={() => {}} value="Alex: Hi" />);
  expect(screen.getByTestId('editor-import-actions').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ flexDirection: 'column' })]));
  expect(screen.getByRole('button', { name: 'Review conversation' }).props.style).toEqual(expect.arrayContaining([expect.objectContaining({ minHeight: 48 })]));
  expect(screen.getByRole('button', { name: 'Import conversation file' }).props.style).toEqual(expect.objectContaining({ minHeight: 48 }));
  expect(screen.getByRole('button', { name: 'Import conversation screenshot' }).props.style).toEqual(expect.objectContaining({ minHeight: 48 }));
  screen.unmount();
  render(<ResponseDraftCard draft={{ id: 'boundary', text: 'I need a pause.', hint: 'Sets a boundary' }} onCopy={async () => {}} onShare={async () => ({ ok: true })} />);
  expect(screen.getByTestId('draft-actions').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ flexDirection: 'column' })]));
  expect(screen.getByRole('button', { name: 'Copy draft' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Share draft' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Copy draft' }).props.style).toEqual(expect.arrayContaining([expect.objectContaining({ minHeight: 48 })]));
  expect(screen.getByRole('button', { name: 'Share draft' }).props.style).toEqual(expect.arrayContaining([expect.objectContaining({ minHeight: 48 })]));
  screen.unmount();
  render(<ResultSummary result={allPatternsResult} />);

  expect(screen.getByText('Intensity score (estimate): 42/100')).toBeOnTheScreen();
  expect(screen.getByText('Analysis mode: On-device (local)')).toBeOnTheScreen();
  for (const [pattern, interpretation] of [
    ['Criticism', 'Criticism interpretation.'], ['Contempt', 'Contempt interpretation.'], ['Defensiveness', 'Defensiveness interpretation.'], ['Stonewalling', 'Stonewalling interpretation.'], ['Neutral', 'Neutral interpretation.'],
  ]) {
    expect(screen.getByText(`Pattern: ${pattern}`)).toBeOnTheScreen();
    expect(screen.getByText(interpretation)).toBeOnTheScreen();
  }
  expect(screen.getByText('This educational estimate is not a factual conclusion about people or relationships.')).toBeOnTheScreen();
  expect(screen.getByLabelText('Pattern for Person E: Neutral').props.style).not.toEqual(expect.objectContaining({ height: expect.any(Number), overflow: 'hidden' }));
  for (const item of [screen.getByTestId('result-summary'), ...screen.getAllByTestId('pattern-card'), screen.getByTestId('result-limitation')]) {
    const style = item.props.style;
    expect(style.height).toBeUndefined();
    expect(style.maxHeight).toBeUndefined();
    expect(style.overflow).not.toBe('hidden');
  }
  dimensions.mockRestore();
});

it('removes the nonessential delete-sheet transition when Reduce Motion is enabled', async () => {
  const preference = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const view = render(<ConfirmDeleteSheet onCancel={() => {}} onConfirm={() => {}} title="Friday conversation" visible />);

  await waitFor(() => expect(view.UNSAFE_getByType(Modal).props.animationType).toBe('none'));
  expect(preference).toHaveBeenCalled();
  preference.mockRestore();
});
