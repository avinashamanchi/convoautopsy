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
