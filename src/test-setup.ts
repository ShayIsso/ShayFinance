// Set required env vars before any module is imported in tests
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://test:test@localhost:5432/test";
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "a".repeat(64);
process.env.APP_PASSWORD = process.env.APP_PASSWORD ?? "$2b$12$placeholder";
