module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'e2e',
  testRegex: '.*\\.e2e\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/../src/$1',
    '^e2e/(.*)$': '<rootDir>/$1',
  },
  testTimeout: 60000, // Increased timeout for e2e tests that wait for workers
};

