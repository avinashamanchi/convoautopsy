import { render, screen } from '@testing-library/react-native';
import { ResultSummary } from '../src/components/ResultSummary';
import type { AnalysisResult } from '../src/domain/analysis';

const validLocalResult: AnalysisResult = {
  schemaVersion: 1,
  mode: 'local',
  intensityScore: 42,
  conflictMode: 'Collaborating',
  messages: [
    {
      sender: 'Person A',
      text: 'Can we talk about this?',
      pattern: 'Neutral',
      egoState: 'Adult',
      possibleInterpretation: 'This wording may reflect an attempt to communicate without a clear hostile pattern.',
    },
  ],
};

it('uses estimate and possible-interpretation language', () => {
  render(<ResultSummary result={validLocalResult} />);

  expect(screen.getByText('On-device estimate')).toBeOnTheScreen();
  expect(screen.getByText('Possible interpretation')).toBeOnTheScreen();
  expect(screen.queryByText(/clinical|diagnosis|hidden meaning|what they really mean/i)).toBeNull();
});
