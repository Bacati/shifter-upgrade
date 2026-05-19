import { objectRemap } from '@dzeio/object-util'
import Cassandra from 'cassandra-driver'
import { getEnv, requireEnv } from 'libs/Env'
import Client from './Client'

export default class CassandraClient extends Client {

	private static instance: CassandraClient | null = null
	private client?: Cassandra.Client | null = null


	public async getVersion(): Promise<number> {
		try {
			await this.execute(`USE ${requireEnv('CASSANDRA_DATABASE')}`)
		} catch (e) {
			// database not found
			console.log('database not found', e)
			return -1
		}
		try {
			const res = await this.execute('SELECT value FROM settings WHERE id = \'db_version\'')
			const value = res[0]?.value
			if (value.includes('T')) {
				return new Date(value).getTime()
			}
			return Number.parseInt(value)
		} catch (e) {
			// table does not exists
			console.log('Settings table does not exists', e)
			return -1
		}
	}

	public override async setVersion(version: number): Promise<void> {
		await this.execute(`
			UPDATE settings SET value = ? WHERE id = 'db_version';
		`.trim(), [version.toString()])
	}

	public async execute(query: string, params?: Array<unknown> | object, options?: Cassandra.QueryOptions): Promise<Array<Record<string, any>>> {
		if (!this.client || this.client.getState().getConnectedHosts().length === 0) {
			throw new Error('not connected to the database !')
		}

		const res = await this.client.execute(query, params, options)
		// if (query.includes('users'))
		// 	console.log(res)


		return res.rows?.map((it) => objectRemap(it.keys(), (key: string) => ({key: key, value: it.get(key)}))) ?? []
	}

	/**
	 * get the connexion to cassandra, it will try until it succedeed
	 */
	public static async get() {
		const client = CassandraClient.instance ?? new CassandraClient()
		CassandraClient.instance = client
		return client
	}

	/**
	 * connect to Cassandra
	 */
	// eslint-disable-next-line complexity
	public async connect() {
		if (await this.isReady()) {
			return
		}

		console.log('connecting to cassandra')
		let authProvider: Cassandra.auth.AuthProvider|undefined

		const method = getEnv('CASSANDRA_AUTH_METHOD')
		if (method) {
			// eslint-disable-next-line max-depth
			switch (method.toLowerCase()) {
				case 'passwordauthenticator':
				case 'plaintext':
					authProvider = new Cassandra.auth.PlainTextAuthProvider(
						requireEnv('CASSANDRA_USERNAME'),
						requireEnv('CASSANDRA_PASSWORD')
					)
					break
				case 'dseplaintext':
					authProvider = new Cassandra.auth.DsePlainTextAuthProvider(
						requireEnv('CASSANDRA_USERNAME'),
						requireEnv('CASSANDRA_PASSWORD'),
						getEnv('CASSANDRA_AUTHORIZATION_ID')
					)
					break
				case 'none':
					break
				default:
					console.error('Please use a valid CASSANDRA_AUTH_METHOD value (none|plaintext|dseplaintext)')
					throw new Error('Please use a valid CASSANDRA_AUTH_METHOD value (none|plaintext|dseplaintext)')
			}
		}

		this.client = new Cassandra.Client({
			contactPoints: [requireEnv('CASSANDRA_CONTACT_POINT')],
			authProvider: authProvider as Cassandra.auth.AuthProvider,
			localDataCenter: getEnv('CASSANDRA_LOCAL_DATA_CENTER', 'datacenter1')
		})
		// this.client.on('log', (level, loggerName, message, furtherInfo) => {
		// 	console.log(`${level} - ${loggerName}:  ${message}`);
		// })

		try {
			await this.client.connect()
		} catch (e) {
			this.client = null
			console.error(e)
			throw new Error('Error connecting to Cassandra')
		}
			// try {
			// 	await Migration.migrateToLatest()
			// } catch (e) {
			// 	this.migrated = -1
			// 	console.error(e)
			// 	throw new Error('An error occured while migrating')
			// }
			// this.migrated = 1

	}

	public async isReady(): Promise<boolean> {
		return !!this.client && this.client.getState().getConnectedHosts().length >= 1
	}
}
