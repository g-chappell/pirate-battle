export const TEAM_SIZE = 6;

export function toggleSelection(
  current: readonly string[],
  templateKey: string,
): string[] {
  const idx = current.indexOf(templateKey);
  if (idx >= 0) {
    return current.filter((k) => k !== templateKey);
  }
  if (current.length >= TEAM_SIZE) return [...current];
  return [...current, templateKey];
}

export function isReadyToSubmit(selection: readonly string[]): boolean {
  return selection.length === TEAM_SIZE;
}
