import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
	webServer: {
		command: 'npm run start',
		url: 'http://localhost:3000',
		timeout: 120 * 1000,
		reuseExistingServer: !process.env.CI
	},
	outputDir: './playwright/results',
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : (undefined as any),
	reporter: process.env.CI
		? 'list'
		: [
				[
					'html',
					{
						outputFolder: './playwright/report',
						open: 'never'
					}
				]
			],
	use: {
		baseURL: 'http://localhost:3000',
		trace: 'on-first-retry'
	},

	/* Configure projects for major browsers */
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		},

		{
			name: 'firefox',
			use: { ...devices['Desktop Firefox'] }
		},

		{
			name: 'webkit',
			use: { ...devices['Desktop Safari'] }
		}

		/* Test against mobile viewports. */
		// {
		//   name: 'Mobile Chrome',
		//   use: { ...devices['Pixel 5'] },
		// },
		// {
		//   name: 'Mobile Safari',
		//   use: { ...devices['iPhone 12'] },
		// },

		/* Test against branded browsers. */
		// {
		//   name: 'Microsoft Edge',
		//   use: { ...devices['Desktop Edge'], channel: 'msedge' },
		// },
		// {
		//   name: 'Google Chrome',
		//   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
		// },
	]
})
