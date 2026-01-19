/**
 * Test setup file for Vitest
 * Configures global test utilities and mocks
 */

// Global test setup
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});