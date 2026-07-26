
import { _electron as electron, test, expect, Page } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { v4 as uuidv4 } from 'uuid';

// === Test Setup ===

// Utility function to create a new book for testing purposes.
const createTestBook = async (page: Page, bookId: string) => {
  const book = {
    id: bookId,
    name: 'Chaos Test Book',
    synopsis: 'A book for testing.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await page.evaluate(
    (b) => (window as any).electron.books.save(b),
    book
  );
};

test.describe('Application Chaos Tests', () => {
  let app: ElectronApplication;
  let page: Page;

  // Launch the Electron app before each test.
  test.beforeEach(async () => {
    app = await electron.launch({ args: ['.'] });
    page = await app.firstWindow();
    
    // Add a listener to catch any uncaught exceptions in the main process.
    app.on('crash', () => {
      // This will cause the test to fail if the main process crashes.
      throw new Error('Main process has crashed.');
    });

    // Log any console messages from the renderer process for easier debugging.
    page.on('console', msg => console.log(`[Renderer Console]: ${msg.text()}`));
  });

  // Close the app after each test.
  test.afterEach(async () => {
    await app.close();
  });

  // === Test Scenarios ===

  /**
   * Scenario A (Memory): Rapidly loads and unloads the AI model 20 times.
   * This stress-tests the resource management and garbage collection of the
   * Llama service. It's designed to detect memory leaks.
   */
  test('Scenario A (Memory): Rapidly load/unload AI model', async () => {
    console.log('--- Running Memory Chaos Test ---');

    // 1. Check for a downloaded model first.
    const statuses = await page.evaluate(() => (window as any).electron.llama.modelStatuses());
    const downloadedModel = (statuses as any[]).find(m => m.downloaded);

    // 2. If no model is downloaded, skip the test.
    test.skip(!downloadedModel, 'No downloaded AI model found. Skipping memory chaos test. Please download a model first.');

    console.log(`Found downloaded model: ${downloadedModel.id}. Starting test...`);

    // 3. Set up listeners and run the test cycles.
    await page.evaluate(() => {
      (window as any).isLlamaReady = false;
      (window as any).electron.llama.onReady(() => {
        (window as any).isLlamaReady = true;
      });
    });

    for (let i = 0; i < 20; i++) {
      console.log(`Cycle ${i + 1} of 20...`);
      
      await page.evaluate(() => { (window as any).isLlamaReady = false; });
      
      // Initiate loading for the specific downloaded model.
      const initResult = await page.evaluate(
        (id) => (window as any).electron.llama.initById(id),
        downloadedModel.id
      );
      
      // Ensure the init call itself was successful.
      expect(initResult.ok, `llama.initById failed: ${initResult.message}`).toBe(true);

      // Wait for the isLlamaReady flag to become true.
      await page.waitForFunction(() => (window as any).isLlamaReady, {}, { timeout: 30000 });
      console.log('Llama Ready.');

      // Unload the model.
      await page.evaluate(() => (window as any).electron.llama.unload());
      console.log('Model unloaded.');
    }

    // Final check: After the loop, the app should still be responsive.
    const books = await page.evaluate(() => (window as any).electron.books.list());
    expect(books).toBeInstanceOf(Array);
    console.log('--- Memory Chaos Test Passed ---');
  });

  /**
   * Scenario B (Data): Attempts to save a chapter with a 100MB empty string.
   * This tests the robustness of the 'chapters:save' IPC channel.
   */
  test('Scenario B (Data): Save chapter with a 100MB payload', async () => {
    console.log('--- Running Data Chaos Test ---');
    const bookId = `chaos-book-${uuidv4()}`;
    await createTestBook(page, bookId);

    console.log('Generating 100MB string...');
    const largeContent = ' '.repeat(100 * 1024 * 1024);
    
    const chapter = {
      id: `chaos-chapter-${uuidv4()}`,
      bookId: bookId,
      title: 'The Great Wall of Text',
      content: largeContent,
      order: 1
    };

    console.log('Sending 100MB payload to "chapters:save"...');
    try {
      await page.evaluate(
        (c) => (window as any).electron.chapters.save(c),
        chapter
      );
    } catch (error) {
        console.log('Successfully caught expected error from oversized payload:', (error as Error).message);
    }
    
    // Final check: The app should still be responsive.
    const books = await page.evaluate(() => (window as any).electron.books.list());
    expect(books).toBeInstanceOf(Array);
    console.log('--- Data Chaos Test Passed ---');
  });

  /**
   * Scenario C (Concurrency): Triggers PDF export and AI model loading simultaneously.
   * This test is designed to find a crash. If the test fails because the
   * app crashes (e.g., "Target page, context or browser has been closed"),
   * then the test has successfully identified a critical concurrency bug.
   */
  test('Scenario C (Concurrency): Export PDF and load model at the same time', async () => {
    console.log('--- Running Concurrency Chaos Test ---');
    const bookId = `chaos-book-${uuidv4()}`;
    await createTestBook(page, bookId);

    page.once('dialog', async dialog => {
      console.log(`Dialog of type "${dialog.type()}" opened. Dismissing it.`);
      await dialog.dismiss();
    });

    console.log('Triggering PDF export and model loading simultaneously...');
    await Promise.all([
      page.evaluate(() => (window as any).electron.export.toPdf({ widthIn: 8.5, heightIn: 11 })),
      page.evaluate(() => (window as any).electron.llama.init())
    ]).catch(err => {
        console.warn('One of the concurrent operations failed as expected:', err.message);
    });

    // Final check: If the app hasn't crashed, it should still be responsive.
    const books = await page.evaluate(() => (window as any).electron.books.list());
    expect(books).toBeInstanceOf(Array);
    console.log('--- Concurrency Chaos Test Passed (App Did Not Crash) ---');
  });
});
