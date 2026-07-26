
import { defineConfig } from '@playwright/test';

export default defineConfig({
  // Point to the directory where your chaos test file is located.
  testDir: './tests',
  
  // Set a generous timeout, as these tests can be slow, especially the memory test.
  timeout: 120 * 1000,
  
  // Run tests in serial to avoid resource contention from the test runner itself.
  workers: 1, 
  
  reporter: 'list',
  
  use: {
    // Basic trace on first retry.
    trace: 'on-first-retry',
  },
});
