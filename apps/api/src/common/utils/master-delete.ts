import { ConflictException } from '@nestjs/common';

/**
 * Blocks a permanent delete while any record still refers to the master.
 *
 * The foreign keys on these masters are `onDelete: SetNull`, so deleting a
 * referenced master would silently unlink those records. Callers must count
 * archived records too, for the same reason. The user is then offered
 * deactivation, which keeps the history intact.
 */
export function assertNotReferenced(
  recordLabel: string,
  usage: ReadonlyArray<{ label: string; count: number }>,
): void {
  const used = usage.filter((item) => item.count > 0);
  if (used.length === 0) return;
  const detail = used.map((item) => `${item.count} ${item.label}${item.count === 1 ? '' : 's'}`).join(', ');
  throw new ConflictException(
    `${recordLabel} cannot be deleted because it is used by ${detail}. Deactivate it instead to keep the history intact.`,
  );
}
