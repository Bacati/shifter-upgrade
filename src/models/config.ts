import Schema from 'libs/Schema'
import type Dao from './Adapters/DaoAdapter'
import PostgresAdapter from './Adapters/PostgresAdapter'
import CassandraClient from './Clients/CassandraClient'
import type { ClientStatic } from './Clients/Client'
import type Migration from './Migrations/Migration'

// @ts-ignore
interface Config {
	/**
	 * the main client is responsible for the Migration system
	 */
	mainClient: ClientStatic

	/**
	 * define every models of the application
	 */
	models: Record<string, Dao>

	/**
	 * Define the application migrations
	 */
	migrations: Array<Migration>
}

const config = {
	/**
	 * the main client is responsible for the Migration system
	 */
	mainClient: CassandraClient as ClientStatic<CassandraClient>,

	/**
	 * define every models of the application
	 */
	models: {
		session: new PostgresAdapter(new Schema({}), 'pouet')
		// session: new Dao(Session, 			new CassandraAdapter(Session, 		'Session', 		'id')),
	},

	/**
	 * Define the application migrations
	 */
	migrations: [
		// Migration20240326115528
	]
} as const

export default config
