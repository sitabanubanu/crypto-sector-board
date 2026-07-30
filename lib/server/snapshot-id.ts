const SNAPSHOT_ID_PATTERN =
  /^(20\d{2})-(\d{2})-(\d{2})(?:T([01]\d|2[0-3]))?$/;

export function isValidSnapshotId(value: string): boolean {
  const match = SNAPSHOT_ID_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] === undefined ? 0 : Number(match[4]);
  const date = new Date(Date.UTC(year, month - 1, day, hour));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour
  );
}
