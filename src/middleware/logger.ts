import { defineMiddleware } from 'astro/middleware'
import ResponseBuilder from 'libs/ResponseBuilder'

/**
 * Simple Middleware that handle the logging of requests and handling processing errors
 */
export default defineMiddleware(async ({ request, url }, next) => {
	const now = new Date()
	//                   Date of request              User-Agent 32 first chars                                     request Method
	let prefix = `\x1b[2m${now.toISOString()}\x1b[22m ${request.headers
		.get('user-agent')
		?.slice(0, 32)
		.padEnd(32)} ${request.method.padEnd(7)}`

	const fullURL = url.toString()
	const path = fullURL.slice(fullURL.indexOf(url.pathname, fullURL.indexOf(url.host)))

	if (!import.meta.env.PROD) {
		//                time of request
		prefix = `\x1b[2m${new Date().toLocaleTimeString('fr')}\x1b[22m`
	}

	//                        HTTP Status Code     Time to run request   path of request
	console.log(`${prefix} ${''.padStart(5, ' ')} ${''.padStart(7, ' ')} ${path}`)

	// Handle if the request die
	try {
		const res = await next()

		if (import.meta.env.PROD) {
			//                              HTTP Status                  time to execute                                                                 path of request
			console.log(
				`${prefix} \x1b[34m[${res.status}]\x1b[0m \x1b[2m${(new Date().getTime() - now.getTime())
					.toFixed(0)
					.padStart(5, ' ')}ms\x1b[22m ${path}`
			)
		}

		return res
	} catch (e) {
		if (import.meta.env.PROD) {
			//                                                 time to execute                                                                 path of request
			console.log(
				`${prefix} \x1b[34m[500]\x1b[0m \x1b[2m${(new Date().getTime() - now.getTime())
					.toFixed(0)
					.padStart(5, ' ')}ms\x1b[22m ${path}`
			)
		}

		// add a full line dash to not miss it
		const columns = (process?.stdout?.columns ?? 32) - 7
		const dashes = ''.padEnd(columns / 2, '-')

		// colorize the lines to make sur to not miss it
		console.error(`\x1b[91m${dashes} ERROR ${dashes}\x1b[0m`)
		console.error(e)
		console.error(`\x1b[91m${dashes} ERROR ${dashes}\x1b[0m`)

		return new ResponseBuilder()
			.status(500)
			.body('An error occured while processing your request')
			.build()
	}
})
