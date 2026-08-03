declare const __dirname: string;

const fs = jest.requireActual<{ readFileSync(path: string, encoding: string): string }>('fs');
const path = jest.requireActual<{ join(...parts: string[]): string }>('path');

it('asserts the English iOS share-sheet control after the explicit share action', () => {
  const flow = fs.readFileSync(path.join(__dirname, '..', 'e2e', 'analyze-flow.yaml'), 'utf8');

  expect(flow).toContain('id: share-response-0\n- assertVisible: "Copy"');
});
