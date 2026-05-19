import type { APIRoute } from 'astro'
import ResponseBuilder from '../../libs/ResponseBuilder'

/**
 * Plausible proxy
 */
export const GET: APIRoute = async () => {
	const res = await fetch('https://plausible.io/js/script.outbound-links.tagged-events.js')
	return new ResponseBuilder()
		.status(200)
		.body(await res.text())
		.build()
}
