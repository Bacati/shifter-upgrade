import type { AstroIntegration } from 'astro'
import fs from 'node:fs/promises'

const baseFile = `
import { objectLoop } from '@dzeio/object-util'

/**
 * Format a Route with \`[param]\` elements with data in them
 *
 * limits: currently does not support \`[...param]\`
 *
 * @param url {string} the url to format
 * @param params {Record<string, string | number>} parameters to add to the URL (in [] first else in the query)
 *
 * @returns the URL formatted with the params
 */
export function formatRoute<T extends string>(url: T, params?: Record<string, string | number>): string {
	let result: string = url

	// early return if there are no params
	if (!params) {
		return result
	}

	// external queries for the URL
	let externalQueries = ''

	// loop through the parameters
	objectLoop(params, (value, key) => {
		const search = \`[\${key}]\`
		value = encodeURI(value.toString())
		if (!result.includes(search)) {
			externalQueries += \`\${encodeURI(key)}=\${value}&\`
		} else {
			result = result.replace(search, value)
		}
	})

	// add items to the external queries if they are set
	if (externalQueries) {
		externalQueries = '?' + externalQueries.slice(0, externalQueries.length - 1)
	}

	return result + externalQueries
}`.trim()

/**
 * Generate the file that contains every routes
 *
 * @param output the output file location
 */
async function updateRoutes(output: string, routes: Array<string>) {
	let file = baseFile
	file += `\n\nexport type Routes = ${routes.map((it) => `'${it}'`).join(' | ')}`

	file +=
		'\n\nexport default function route(route: Routes, query?: Record<string, string | number>) {'
	file += '\n\treturn formatRoute(route, query)'
	file += '\n}\n'

	await fs.writeFile(output, file)
}

/**
 * format the path back to an url usable by the app
 *
 * @param path the path to format
 * @returns the path formatted as a URL
 */
function formatPath(basePath: string, path: string, removeExtension = true): string {
	// remove the base path
	path = path.replace(basePath, '')

	// remove the extension if asked
	if (removeExtension) {
		const lastDot = path.lastIndexOf('.')
		path = path.slice(0, lastDot)
	}

	// remove the index from the element
	if (path.endsWith('/index')) {
		path = path.replace('/index', '')
	}

	// handle the `/` endpoint
	if (path === '') {
		path = '/'
	}

	return path
}

/**
 * get every files recursivelly in a specific directory
 *
 * @param path the path to search
 * @returns the list of files recursivelly in the specific directory
 */
async function getFiles(path: string): Promise<Array<string>> {
	const dir = await fs.readdir(path)
	let files: Array<string> = []
	for (const file of dir) {
		if (file.startsWith('_')) continue
		const filePath = path + '/' + file
		if ((await fs.stat(filePath)).isDirectory()) {
			files = files.concat(await getFiles(filePath))
		} else {
			files.push(filePath)
		}
	}
	return files
}

let publicFolder!: string
let srcFolder!: string
let pagesFolder!: string
let outputFile!: string

/**
 * launch the integration
 * @returns the routng integration
 */
const integration: () => AstroIntegration = () => ({
	name: 'Routing',
	hooks: {
		'astro:config:setup': async ({ config }) => {
			publicFolder = config.publicDir.toString().replace('file:///', '')
			srcFolder = config.srcDir.toString().replace('file:///', '')
			if (process.platform !== 'win32') {
				srcFolder = '/' + srcFolder
				publicFolder = '/' + publicFolder
			}
			pagesFolder = srcFolder + 'pages'
			outputFile = srcFolder + 'route.ts'

			// get the files list
			const files = (await Promise.all([
				await getFiles(pagesFolder).then((ev) => ev.map((it) => formatPath(pagesFolder, it))),
				await getFiles(publicFolder).then((ev) => ev.map((it) => formatPath(publicFolder, it, false)))
			])).flat()
			await updateRoutes(outputFile, files)
		},
		'astro:server:setup': async ({ server }) => {
			// get the files list
			const files = (await Promise.all([
				await getFiles(pagesFolder).then((ev) => ev.map((it) => formatPath(pagesFolder, it))),
				await getFiles(publicFolder).then((ev) => ev.map((it) => formatPath(publicFolder, it, false)))
			])).flat()

			// watch FS changes for new files to add them to the route list
			server.watcher.on('add', (path) => {
				path = path.replace(/\\/g, '/')

				// ignore files starting with '_'
				const filename = path.slice(path.lastIndexOf('/') + 1)
				if (filename.startsWith('_')) return

				let removeExtension = true
				let folder = pagesFolder
				if (path.startsWith(publicFolder)) {
					removeExtension = false
					folder = publicFolder
				} else if (!path.startsWith(folder)) {
					return
				}

				// format the path
				path = formatPath(folder, path, removeExtension)

				// update the router
				files.push(path)
				updateRoutes(outputFile, files)
			})

			// watch FS changes for removed files to remove them from the list
			server.watcher.on('unlink', (path) => {
				path = path.replace(/\\/g, '/')
				let removeExtension = true
				let folder = pagesFolder
				if (path.startsWith(publicFolder)) {
					removeExtension = false
					folder = publicFolder
				}
				path = formatPath(folder, path, removeExtension)

				const index = files.indexOf(path)

				files.splice(index, 1)
				updateRoutes(outputFile, files)
			})

			// run the script once
			await updateRoutes(outputFile, files)
		}
	}
})

export default integration
