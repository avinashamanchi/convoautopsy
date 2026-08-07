import { codePointCount, MAX_INPUT_CODE_POINTS } from './textLimits';

export type RedactionKind = 'email' | 'phone' | 'url' | 'handle' | 'long-number';

export type RedactionCandidate = {
  id: string;
  kind: RedactionKind;
  start: number;
  end: number;
  value: string;
  replacement: string;
};

const REPLACEMENTS: Record<RedactionKind, string> = {
  email: '[EMAIL]',
  phone: '[PHONE]',
  url: '[URL]',
  handle: '[HANDLE]',
  'long-number': '[LONG NUMBER]',
};

const KIND_PRIORITY: Record<RedactionKind, number> = {
  url: 0,
  email: 1,
  phone: 2,
  handle: 3,
  'long-number': 4,
};

const URL = /\b(?:https?:\/\/|www\.)[^\s<>"'\[\]{}]+/giu;
const EMAIL = /[\p{L}\p{N}][\p{L}\p{N}._%+-]{0,63}@[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?)+/gu;
const PHONE = /(?<![\p{L}\p{N}])(?:\+\d{1,3}[\s.-]*)?(?:(?:\(\d{2,4}\)|\d{2,4})[\s.-]+){2,4}\d{2,4}(?:\s*(?:ext\.?|extension|x)\s*\d{1,6})?(?![\p{L}\p{N}])/giu;
const HANDLE = /(?<![\p{L}\p{M}\p{N}_.%+-])@[\p{L}\p{N}_]{2,30}/gu;
const LONG_NUMBER = /(?<!\d)\d{8,19}(?!\d)/g;

export function detectRedactions(text: string): RedactionCandidate[] {
  if (codePointCount(text) > MAX_INPUT_CODE_POINTS) throw new Error('INPUT_TOO_LARGE');

  const matches = [
    ...collect(text, URL, 'url', trimUrlPunctuation),
    ...collect(text, EMAIL, 'email'),
    ...collect(text, PHONE, 'phone', validPhone),
    ...collect(text, HANDLE, 'handle'),
    ...collect(text, LONG_NUMBER, 'long-number'),
  ].sort((left, right) => (
    left.start - right.start
    || (right.end - right.start) - (left.end - left.start)
    || KIND_PRIORITY[left.kind] - KIND_PRIORITY[right.kind]
    || left.id.localeCompare(right.id)
  ));

  const nonOverlapping: RedactionCandidate[] = [];
  let occupiedUntil = -1;
  for (const candidate of matches) {
    if (candidate.start < occupiedUntil) continue;
    nonOverlapping.push(candidate);
    occupiedUntil = candidate.end;
  }
  return nonOverlapping;
}

export function applyRedactions(text: string, selectedIds: Iterable<string>): string {
  const selected = new Set(selectedIds);
  return detectRedactions(text)
    .filter(({ id }) => selected.has(id))
    .sort((left, right) => right.start - left.start)
    .reduce(
      (result, candidate) => `${result.slice(0, candidate.start)}${candidate.replacement}${result.slice(candidate.end)}`,
      text,
    );
}

function collect(
  text: string,
  pattern: RegExp,
  kind: RedactionKind,
  normalize: (value: string) => string | null = (value) => value,
): RedactionCandidate[] {
  const candidates: RedactionCandidate[] = [];
  for (const match of text.matchAll(pattern)) {
    const rawValue = match[0];
    const value = normalize(rawValue);
    if (!value || match.index === undefined) continue;
    const start = match.index;
    const end = start + value.length;
    candidates.push({
      id: `${kind}:${start}:${end}:${value}`,
      kind,
      start,
      end,
      value,
      replacement: REPLACEMENTS[kind],
    });
  }
  return candidates;
}

function trimUrlPunctuation(value: string): string | null {
  const trimmed = value.replace(/[.,!?;:)]*$/u, '');
  return trimmed || null;
}

function validPhone(value: string): string | null {
  const main = value.split(/\s*(?:ext\.?|extension|x)\s*/iu, 1)[0];
  const digitCount = main.replace(/\D/g, '').length;
  return digitCount >= 7 && digitCount <= 15 ? value : null;
}
