/**
 * Proactive messages (deadline reminders, outcome notices, the call-customization prompt,
 * policy-change alerts) need a Space to send into. Spectrum hands you one for free when a
 * message arrives — that's the in-memory fast path below — but a background job firing after
 * a process restart, or for a student who hasn't texted this run, has nothing to attach to.
 *
 * The fix isn't a bigger in-memory cache: the iMessage platform can resolve a space
 * deterministically from a stored address with no prior inbound message and no network
 * round-trip (`platform.space.create(imessageId)` — confirmed in @spectrum-ts/imessage's
 * shared-mode implementation, which derives the DM chat id straight from the address). So the
 * DB-backed fallback here resolves from the already-persisted `students.imessage_id`
 * (src/db/schema.sql) and is what makes every proactive send in this codebase restart-proof
 * instead of "best effort, drops silently until they text again."
 *
 * Caveat: this guarantee is specific to the iMessage platform's address-derived space ids. The
 * terminal provider (local dev) mints an unrelated new session on every `space.create()` call,
 * so there it still only works via the in-memory fast path for the lifetime of one process —
 * that's an inherent property of a terminal session having no persistent identity, not a gap
 * in this fix.
 */
import { pool } from "../db/pool.js";

export interface SpaceLike {
  send: (text: string) => Promise<unknown>;
}

type SpaceResolver = (imessageId: string) => Promise<SpaceLike>;

const registry = new Map<string, SpaceLike>();
let resolver: SpaceResolver | undefined;

/** Called once at boss startup with a function that resolves a Space from a stored platform id. */
export function initSpaceResolver(fn: SpaceResolver): void {
  resolver = fn;
}

/** Fast path: remember the Space Spectrum just handed us for a live inbound message. */
export function registerSpace(studentId: string, space: SpaceLike): void {
  registry.set(studentId, space);
}

export async function getSpace(studentId: string): Promise<SpaceLike | undefined> {
  const cached = registry.get(studentId);
  if (cached) return cached;
  if (!resolver) return undefined;

  const { rows } = await pool.query<{ imessage_id: string }>(`SELECT imessage_id FROM students WHERE id = $1`, [studentId]);
  const imessageId = rows[0]?.imessage_id;
  if (!imessageId) return undefined;

  try {
    const space = await resolver(imessageId);
    registry.set(studentId, space);
    return space;
  } catch (err) {
    console.error(`[spaceRegistry] failed to resolve space for student ${studentId}:`, err);
    return undefined;
  }
}
