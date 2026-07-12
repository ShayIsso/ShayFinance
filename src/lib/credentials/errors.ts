/**
 * Typed errors on the credentials module's public interface.
 *
 * Kept in a dedicated module (no DB imports) so action boundaries and tests
 * can import the real class even when "@/lib/credentials" itself is mocked.
 * The message never includes credential values — only the row UUID.
 */
export class CredentialNotFoundError extends Error {
  constructor(id: string) {
    super(`Credential not found: ${id}`);
    this.name = "CredentialNotFoundError";
  }
}
