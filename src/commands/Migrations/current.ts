import type { Command } from 'commands'
import DaoFactory from 'models/DaoFactory'

const command: Command = {
	name: 'migrations:current',
	description: 'Get the current version of the database',
	async run() {
		const client = await DaoFactory.client()
		await client.connect()
		const ver = await client.getVersion()
		if (ver < 0) {
			console.log('no database :(')
		} else {
			console.log(`Current database version: ${new Date(ver)}`)
		}
		return {
			code: 0
		}
	},
}
export default command
