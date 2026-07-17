/**
 * Typed errors on the goals module's public interface.
 *
 * Kept in a dedicated module (no DB imports) so action boundaries and tests can
 * import the real class even when "@/lib/goals" itself is mocked.
 */
export class InvalidGoalTargetMonthError extends Error {
  constructor() {
    super("A goal's target month must not be before its start month");
    this.name = "InvalidGoalTargetMonthError";
  }
}
