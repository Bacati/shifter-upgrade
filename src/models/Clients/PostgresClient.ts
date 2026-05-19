import { wait } from 'libs/AsyncUtils'
import { getEnv, requireEnv } from 'libs/Env'
import pg from 'pg'
import Client from '.'
const Postgres = pg.Client

// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
export default class PostgresClient extends Client {
	private static instance: PostgresClient = new PostgresClient()
	private client?: pg.Client | null
	public override async getVersion(): Promise<number> {
		try {
			const res = await this.execute(`SELECT value FROM settings WHERE id = 'db_version'`)

			const value = res[0]?.value
			if (!value) {
				return -1
			}
			return Number.parseInt(value)
		} catch (e) {
			// table does not exists
			console.log('Settings table does not exists', e)
			return -1
		}
	}
	public override async setVersion(version: number): Promise<void> {
		await this.execute(`UPDATE settings SET value = $1 WHERE id = 'db_version';`, [version.toString()])
	}
	public override async execute(query: string, params?: Array<unknown> | object, ...options: Array<any>): Promise<Array<Record<string, unknown>>> {
		if (!this.client || !await this.isReady()) {
			throw new Error('not connected')
		}
		const res = await this.client.query<Record<string, unknown>>(query, params)
		return res.rows
	}
	public override async connect(): Promise<void> {
		if (this.client) {
			return
		}
		this.client = new Postgres({
			host: requireEnv('POSTGRES_HOST'),
			user: requireEnv('POSTGRES_USERNAME'),
			password: requireEnv('POSTGRES_PASSWORD'),
			port: parseInt(getEnv('POSTGRES_PORT', '5432')),
			database: requireEnv('POSTGRES_DATABASE', 'projectmanager'),
			// debug(connection, query, parameters, paramTypes) {
			// 		console.log(`${query}, ${parameters}`);
			// },
		})
		.on('end', () => {
			this.client = null
		})
		try {
			await this.client.connect()
		} catch (e) {
			this.client = null
			console.error(e)
			throw new Error('Error connecting to Postgres')
		}
	}
	public override async isReady(): Promise<boolean> {
		return !!this.client
	}

	/**
	 * get the connexion to cassandra, it will try until it succedeed
	 */
	public static async get() {
		return PostgresClient.instance
	}
}
