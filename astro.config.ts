import node from '@astrojs/node'
import tailwind from '@astrojs/tailwind'
import { defineConfig } from 'astro/config'
import routing from './hooks/routing'

// const faviconHook = {
// 	name: 'Favicon',
// 	hooks: {
// 		"astro:build:setup": async () => {
// 			await Manifest.create('./src/assets/favicon.png', {
// 				name: 'Template'
// 			})
// 		}
// 	}
// }

// https://astro.build/config
export default defineConfig({
	// Use the NodeJS adapter
	adapter: node({
		mode: 'standalone'
	}),

	// some settings to the build output
	build: {
		// the asset path
		assets: 'assets',

		// inline the stylesheet if it is small enough
		inlineStylesheets: 'auto'
	},

	// Compress the HTML output
	compressHTML: true,

	// Customizable depending on goal
	output: 'server',

	// Add TailwindCSS
	integrations: [tailwind(), routing()],

	// prefetch links
	prefetch: {
		defaultStrategy: 'hover'
	},

	// the site url
	site: 'https://example.com',

	// the Output server
	server: {
		host: true,
		port: 3000
	},

	// Remove the trailing slash by default
	trailingSlash: 'never',

	// Dev Server
	vite: {
		server: {
			watch: {
				// Ignore some paths
				ignored: [],
				// support polling and WSL
				usePolling: !!(process.env.USE_POLLING ?? process.env.WSL_DISTRO_NAME)
			}
		}
	}
})
