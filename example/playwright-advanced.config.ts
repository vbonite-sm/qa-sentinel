import { defineConfig, devices } from '@playwright/test';

/**
 * Advanced Playwright configuration demonstrating:
 * - Multi-project setup with separate history per project
 * - CSP-safe mode for restricted environments
 * - Step filtering for cleaner reports
 * - Custom path resolution
 */
export default defineConfig({
  testDir: './',
  timeout: 30000,
  retries: 2,

  use: {
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },

  // Define multiple test projects
  projects: [
    {
      name: 'api-tests',
      testMatch: /.*\.api\.spec\.ts/,
    },
    {
      name: 'ui-tests',
      testMatch: /.*\.ui\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  reporter: [
    ['list'],
    ['../dist/qa-sentinel.js', {
      // === Multi-Project History ===
      // Each project gets its own history file for accurate metrics
      projectName: process.env.PROJECT_NAME || 'default',
      historyFile: 'reports/{project}-history.json',  // Creates: reports/api-tests-history.json
      outputFile: 'reports/smart-report.html',

      // === Path Resolution ===
      // Resolve paths from current working directory (useful when rootDir differs)
      relativeToCwd: true,

      // === CSP-Safe Mode ===
      // Enable for Jenkins, corporate environments, or strict CSP policies
      cspSafe: true,

      // === Step Filtering ===
      // Hide verbose Playwright API calls, show only custom test.step descriptions
      filterPwApiSteps: true,

      // === Network Filtering ===
      // Only show API calls, not static assets
      networkLogFilter: '/api/',
      networkLogExcludeAssets: true,
      networkLogMaxEntries: 100,

      // === Minimal Report (disable heavy features) ===
      // Uncomment these for faster report generation with large test suites:
      // enableAIRecommendations: false,
      // enableHistoryDrilldown: false,
      // enableGalleryView: false,
      // enableNetworkLogs: false,

      // === Strict Thresholds ===
      stabilityThreshold: 80,          // Require B grade or higher
      performanceThreshold: 0.15,      // Alert at 15% slowdown
      retryFailureThreshold: 2,        // Flag after 2 retries
    }],
  ],
});
