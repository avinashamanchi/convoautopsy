import { applyRedactions, detectRedactions } from '../src/domain/redaction';

it('replaces selected candidates while preserving unselected text and offsets', () => {
  const source = 'Email sam@example.com or call +1 415 555 0101.';
  const candidates = detectRedactions(source);

  expect(candidates.map(({ kind, value }) => ({ kind, value }))).toEqual([
    { kind: 'email', value: 'sam@example.com' },
    { kind: 'phone', value: '+1 415 555 0101' },
  ]);
  expect(applyRedactions(source, [candidates[0].id])).toBe('Email [EMAIL] or call +1 415 555 0101.');
});

it('preserves Unicode text and lets the URL win over email and handle matches inside it', () => {
  const source = 'José shared https://sam@example.com/@support and üser@例子.测试.';

  expect(detectRedactions(source).map(({ kind, value }) => ({ kind, value }))).toEqual([
    { kind: 'url', value: 'https://sam@example.com/@support' },
    { kind: 'email', value: 'üser@例子.测试' },
  ]);
});

it('keeps normalized URL offsets aligned while replacing a separate Unicode handle', () => {
  const source = 'See https://example.com/path, then ping @josé.';
  const candidates = detectRedactions(source);

  expect(candidates.map(({ kind, value }) => ({ kind, value }))).toEqual([
    { kind: 'url', value: 'https://example.com/path' },
    { kind: 'handle', value: '@josé' },
  ]);
  expect(applyRedactions(source, candidates.map(({ id }) => id))).toBe('See [URL], then ping [HANDLE].');
});

it('gives repeated values deterministic offset-specific IDs and can replace both', () => {
  const source = 'sam@example.com then sam@example.com';
  const candidates = detectRedactions(source);

  expect(candidates).toHaveLength(2);
  expect(candidates[0].id).not.toBe(candidates[1].id);
  expect(candidates.map(({ start, end, kind }) => ({ start, end, kind }))).toEqual([
    { start: 0, end: 15, kind: 'email' },
    { start: 21, end: 36, kind: 'email' },
  ]);
  expect(applyRedactions(source, candidates.map(({ id }) => id))).toBe('[EMAIL] then [EMAIL]');
});

it('detects supported international and extension phone shapes without flagging short numbers', () => {
  const source = 'Room 42 at 7. Call +44 20 7946 0958 ext 123 or (415) 555-0101.';

  expect(detectRedactions(source).map(({ kind, value }) => ({ kind, value }))).toEqual([
    { kind: 'phone', value: '+44 20 7946 0958 ext 123' },
    { kind: 'phone', value: '(415) 555-0101' },
  ]);
});

it('detects obvious standalone long numbers but does not claim short numbers are identifiers', () => {
  const source = 'Use reference 123456789012 and code 123456.';

  expect(detectRedactions(source).map(({ kind, value, replacement }) => ({ kind, value, replacement }))).toEqual([
    { kind: 'long-number', value: '123456789012', replacement: '[LONG NUMBER]' },
  ]);
});

it('never applies stale candidate offsets to manually edited text', () => {
  const original = 'Email sam@example.com';
  const selectedIds = detectRedactions(original).map(({ id }) => id);

  expect(applyRedactions('Email new@example.com', selectedIds)).toBe('Email new@example.com');
});

it('accepts the 100,000-character source boundary and rejects larger input', () => {
  expect(detectRedactions('x'.repeat(100_000))).toEqual([]);
  expect(() => detectRedactions('x'.repeat(100_001))).toThrow('INPUT_TOO_LARGE');
});
