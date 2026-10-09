module.exports = {
  rootDir: '..',
  testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { diagnostics: false }] },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/unit/setup-env.ts'],
};
