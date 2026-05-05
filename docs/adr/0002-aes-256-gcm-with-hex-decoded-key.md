# ADR-0002: AES-256-GCM with hex-decoded key for credentials and sessions

**Status:** Accepted
**Date:** 2026-02-15 (MVP build, retroactively recorded 2026-05-05)

## Context

Bank credentials (national IDs, passwords, account numbers for Discount; usernames + passwords for Max and Cal) are stored in PostgreSQL on the user's local machine. Even though the deployment is local/Docker only, encryption at rest is non-negotiable — the threat model includes:

- A stolen laptop / disk image being mounted on another machine
- Backup files or DB dumps leaving the host
- Future cloud or remote deployment (Phase 4 backlog)

A symmetric authenticated encryption scheme is required. Two design points needed locking down:

1. **Algorithm** — AES-256-GCM for confidentiality + integrity in one primitive, with a unique 96-bit IV per record. The `auth tag` detects tampering. ChaCha20-Poly1305 was an alternative; AES-256-GCM was chosen for ubiquity and Node.js native `crypto` support.
2. **Key handling** — the master key (`ENCRYPTION_KEY`) is stored in `.env` as a hex string for human handling. Both the credential `encrypt` / `decrypt` paths and the session HMAC paths must hex-decode the key to raw bytes before use.

## Decision

- **Encryption:** AES-256-GCM, unique IV per record, auth tag verified on decrypt.
- **Key encoding in `.env`:** hex-encoded 32-byte string.
- **Key consumption rule:** always `Buffer.from(key, 'hex')` before passing to `crypto.createCipheriv` / `createHmac`. This rule applies to **both** `createSession` and `validateSessionEdge`.

## Consequences

- **Locks in:** AES-256-GCM as the only symmetric encryption primitive in the codebase. Any new encrypted column or session token must use the same scheme.
- **Critical invariant:** if one path uses the raw hex string and another decodes to bytes, tokens / ciphertexts produced by one will never validate in the other. CLAUDE.md flags this in "Known Gotchas" because it has burned us before.
- **Precludes:** key rotation without a re-encrypt migration (acceptable trade-off for single-user local deployment; revisit if Phase 4 cloud option lands).
- **Failure mode prevention:** the `crypto` module has 5 tests covering encrypt/decrypt integrity, unique IVs, and tamper detection. New encrypted columns must add coverage at the same level.
