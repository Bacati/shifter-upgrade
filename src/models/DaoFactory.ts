import type { default as Dao, default as DaoAdapter } from './Adapters/DaoAdapter'
import config from './config'

/**
 * Class to get any DAO
 */

// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
export default class DaoFactory {
	/**
	 * get the total list of daos available
	 * @returns return the list of daos available
	 */
	public static getAll(): Record<string, DaoAdapter> {
		return config.models
	}

	/**
	 * Get a a dao by its key
	 *
	 * it will throw an error if no Dao exists linked to the item key
	 *
	 * @param key the dao key to get
	 * @returns the Dao you want as a singleton
	 */
	public static get<Key extends keyof typeof config['models']>(key: Key): typeof config['models'][Key] {
		return config.models[key]
	}

	/**
	 * get the main client linked to migrations
	 * @returns the main client
	 */
	public static async client(): ReturnType<(typeof config.mainClient)['get']> {
		return config.mainClient.get()
	}
}
