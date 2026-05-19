import type Client from 'models/Clients/Client'
import type Migration from './Migration'

/**
 * A system migration
 * the file need then to be imported into the `models/config.ts` file
 */
export default {
	/** SET THE DATE IN ISO FORMAT HERE */
	date: Date.UTC(2024, 3, 26, 11, 55, 28),
	async up(client: Client): Promise<boolean> {
		const requests: Array<string> = [

		]

		for await (const request of requests) {
			await client.execute(request)
		}

		return true
	},
	async down(client: Client) {
		const requests: Array<string> = [

		]

		for await (const request of requests) {
			try {
				await client.execute(request)
			} catch {}
		}

		return true
	},
} as Migration
