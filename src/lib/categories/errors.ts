/**
 * Typed errors on the categories module's public interface.
 *
 * Kept in a dedicated module (no DB imports) so action boundaries and tests
 * can import the real class even when "@/lib/categories" itself is mocked.
 */
export class DefaultCategoryDeletionError extends Error {
  constructor() {
    super("Cannot delete a default category");
    this.name = "DefaultCategoryDeletionError";
  }
}
