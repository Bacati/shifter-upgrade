import type { Command } from 'commands'
import DaoFactory from 'models/DaoFactory'

const command: Command = {
	name: 'migrations:migrate',
	description: 'Migrate the database to the latest version',
	async run() {
		const client = await DaoFactory.client()
		console.log('connecting...')
		await client.connect()
		console.log('migrating...')
		await client.migrateToLatest()
		console.log('migrations should be ok :D')
		return {
			code: 0
		}
	},
}
export default command
