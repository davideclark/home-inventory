export function emojiIcon(value: string | null | undefined): string | null {
  if (!value || value.startsWith('si:') || value.startsWith('svg:')) return null;
  return value;
}
