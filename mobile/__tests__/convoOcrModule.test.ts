declare const __dirname: string;

const fs = jest.requireActual<{
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: string): string;
}>('fs');
const path = jest.requireActual<{ join(...parts: string[]): string }>('path');

it('includes the Swift source beside the podspec in the autolinked local module', () => {
  const moduleRoot = path.join(__dirname, '..', 'modules', 'convo-ocr');
  const podspec = fs.readFileSync(path.join(moduleRoot, 'ios', 'ConvoOcr.podspec'), 'utf8');

  expect(fs.existsSync(path.join(moduleRoot, 'ios', 'ConvoOcrModule.swift'))).toBe(true);
  expect(podspec).toContain("s.source_files   = '**/*.{h,m,mm,swift}'");
  expect(podspec).not.toContain("s.source_files   = 'ios/**/*.{h,m,mm,swift}'");
});

it('uses a deterministic top-to-bottom, same-line left-to-right OCR reading order', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'convo-ocr', 'ios', 'ConvoOcrModule.swift'), 'utf8');

  expect(source).toContain('sameLineVerticalTolerance: CGFloat = 0.02');
  expect(source).toContain('if abs(verticalDelta) > sameLineVerticalTolerance');
  expect(source).toContain('return horizontalDelta < 0');
  expect(source).toContain('return left.uuid.uuidString < right.uuid.uuidString');
  expect(source).toContain('.sorted(by: ConvoOcrModule.isBeforeInReadingOrder)');
});
