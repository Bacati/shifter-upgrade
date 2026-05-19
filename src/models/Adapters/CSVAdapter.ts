import CSV, { type CSVOptions } from 'libs/FileFormats/CSV'
import type Schema from 'libs/Schema'
import type { SchemaInfer } from 'libs/Schema'
import fs from 'node:fs'
import type { Query } from '../Query'
import { filter } from './AdapterUtils'
import type DaoAdapter from './DaoAdapter'
import type { DBPull } from './DaoAdapter'


export default class CSVAdapter<T extends Schema> implements DaoAdapter<T> {

	private data: Array<SchemaInfer<T>>

	public constructor(
		public readonly schema: T,
		public readonly serverPath: string,
		private readonly csvOptions?: CSVOptions
	) {
		const data = fs.readFileSync(serverPath, 'utf-8')
		this.data = CSV.parse(data, csvOptions) as Array<SchemaInfer<T>>
	}

	public async create(_obj: Partial<SchemaInfer<T>>): Promise<SchemaInfer<T> | null> {
		throw new Error('not implemented')
	}

	// eslint-disable-next-line complexity
	public async read(query?: Query<SchemaInfer<T>> | undefined): Promise<DBPull<T>> {

		const res = filter(query ?? {}, this.data)

		return {
			rows: res.filtered.length,
			rowsTotal: res.unpaginatedLength,
			page: 1,
			pageTotal: 1,
			data: res.filtered
		}
	}

	public async update(_obj: SchemaInfer<T>): Promise<SchemaInfer<T> | null> {
		throw new Error('not implemented')
	}

	public async patch(_id: string, _obj: Partial<SchemaInfer<T>>): Promise<SchemaInfer<T> | null> {
		throw new Error('not implemented')

	}

	public async delete(obj: SchemaInfer<T>): Promise<boolean> {
		throw new Error('not implemented')
	}
}
