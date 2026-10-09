process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:1/x';
process.env.REDIS_URL ??= 'redis://localhost:1';
process.env.JWT_ACCESS_SECRET ??= 'unit-test-secret-unit-test-secret-000000';
process.env.LOG_LEVEL = 'silent';
