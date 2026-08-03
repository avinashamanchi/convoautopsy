export const MAX_INPUT_CODE_POINTS = 100_000;
export const MAX_MESSAGE_CODE_POINTS = 1_000;

export function codePointCount(value: string): number {
  return Array.from(value).length;
}

export function isCodePointLengthBetween(value: string, minimum: number, maximum: number): boolean {
  const length = codePointCount(value);
  return length >= minimum && length <= maximum;
}
