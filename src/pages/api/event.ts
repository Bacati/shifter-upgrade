import type { APIRoute } from 'astro'
import ResponseBuilder from '../../libs/ResponseBuilder'

/**
 * Plausible proxy
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
	// const body = await request.json()
	// console.log(body, clientAddress)
	const res = await fetch('https://plausible.io/api/event', {
		method: 'POST',
		headers: {
			'User-Agent': request.headers.get('User-Agent') as string,
			'X-Forwarded-For': clientAddress,
			'Content-Type': 'application/json'
		},
		body: await request.text()
	})
	return new ResponseBuilder()
		.status(res.status)
		.body(await res.text())
		.build()
}
