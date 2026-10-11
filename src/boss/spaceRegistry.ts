/**
 * Proactive messages (deadline reminders, "your call finished", policy-change alerts) need a
 * Space to send into, but Spectrum only hands you a Space when a message arrives on it. This
 * registry remembers the Space for every student_id who has texted the boss agent at least once
 * (always true — onboarding itself starts from their first text) so background jobs can reach them.
 */
export interface SpaceLike {
  send: (text: string) => Promise<unknown>;
}

const registry = new Map<string, SpaceLike>();

export function registerSpace(studentId: string, space: SpaceLike): void {
  registry.set(studentId, space);
}

export function getSpace(studentId: string): SpaceLike | undefined {
  return registry.get(studentId);
}
