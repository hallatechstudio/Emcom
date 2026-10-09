module.exports = {
  rootDir: '..',
  testMatch: ['<rootDir>/test/integration/**/*.e2e-spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { diagnostics: false }] },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/integration/setup-env.ts'],
  testTimeout: 30000,
};
