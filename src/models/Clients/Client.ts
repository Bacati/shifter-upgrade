import config from 'models/config'
import type MigrationObj from 'models/Migrations'

export enum ConnectionStatus {
	DISCONNECTED,
	MIGRATING,
	READY
}

export interface ClientStatic<C extends Client = Client> {
	get(): Promise<C>
}

export default abstract class Client {


	public status: ConnectionStatus = ConnectionStatus.DISCONNECTED

	/**
	 * -1: unknown
	 * 0: migrating
	 * 1: migrated
	 */
	public migrationStatus = -1

	/**
	 * get the current migration version
	 *
	 * -1 nothing/error
	 * 0+ current migration
	 */
	public abstract getVersion(): Promise<number>
	public abstract setVersion(version: number): Promise<void>

	public abstract execute(query: string, params?: Array<unknown> | object, ...options: Array<any>): Promise<Array<Record<string, unknown>>>

	public abstract connect(): Promise<void>

	/**
	 * Migrate the database to the latest version
	 */
	public async migrateToLatest() {
		const migrations = this.getMigrations()
		const latest = migrations[migrations.length - 1]
		if (!latest) {
			return
		}
		return await this.migrateTo(latest.date)
	}

	public getMigrations(): ReadonlyArray<MigrationObj> {
		return config.migrations as ReadonlyArray<MigrationObj>
	}

	/**
	 * migrate to a specific date in time
	 * @param date the date to try to migrate to
	 */
	public async migrateTo(date: number) {
		this.migrationStatus = 0

		let version = await this.getVersion()

		const migrations = this.getMigrations()

		const time = !version ? -1 : version

		console.log('Current DB version', version)
		 // same version, don't to anything
		if (date === time) {
			this.migrationStatus = 1
			return
		}
		console.log('\x1b[35mCurrent DB version', version, '\x1b[0m')

		// run up migrations
		if (time < date) {
			console.log('\x1b[35m', 'Migrating up to', date, '\x1b[0m')
			const migrationsToRun = migrations.filter((it) => it.date > time && it.date <= date)
			for (const migration of migrationsToRun) {
				console.log('\x1b[35m', 'Migrating from', version, 'to', migration.date, '\x1b[0m')
				await migration.up(this)
				await this.setVersion(migration.date)
				version = migration.date
			}
		} else { // run down migrations
			console.log('\x1b[35m', 'Migrating down to', date, '\x1b[0m')
			const migrationsToRun = migrations.filter((it) => it.date < time && it.date >= date)
				.toReversed()
			for (const migration of migrationsToRun) {
				console.log('\x1b[35m', 'Migrating from', version, 'to', migration.date, '\x1b[0m')
				await migration.down?.(this)
				await this.setVersion(migration.date)
				version = migration.date
			}
		}
		console.log('\x1b[32mDone migrating\x1b[0m')
		this.migrationStatus = 1
	}

	// public getStatus(): Promise<ClientStatus>

	// public abstract isMigrated(): Promise<boolean>

	/**
	 * indicate if the client is ready for new requests (not if migrations are done or not)
	 */
	public abstract isReady(): Promise<boolean>

	/**
	 * wait until every migrations are done or fail
	 */
	public async waitForMigrations(): Promise<void> {
		if (this.migrationStatus === -1) {
			await this.migrateToLatest()
		}
		while (!await this.isMigrated()) {
			console.log('waiting...')
			await new Promise((res) => setTimeout(res, 100))
		}
	}

	public async isMigrated(): Promise<boolean> {
		return this.migrationStatus === 1
		// if (this.migrationStatus < 1) {
		// 	return false
		// } else if (this.migrationStatus === 1) {
		// 	return
		// }
		// const migrations = this.getMigrations()
		// const last = migrations[migrations.length - 1]
		// if (!last) {
		// 	return true
		// }
		// return last.date === await this.getVersion()
	}
}
