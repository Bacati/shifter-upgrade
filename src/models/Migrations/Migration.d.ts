import type Client from 'models/Clients/Client'

export default interface Migration {
	/**
	 * timestamp in UTC
	 */
	date: number
	up(client: Client): Promise<boolean>
	down?(client: Client): Promise<boolean>
}
