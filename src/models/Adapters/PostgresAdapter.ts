/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { objectFind, objectKeys, objectLoop, objectMap, objectRemap, objectValues } from '@dzeio/object-util'

import type Schema from 'libs/Schema'
import type { SchemaInfer } from 'libs/Schema'
import type SchemaItem from 'libs/Schema/SchemaItem'
import crypto from 'node:crypto'
import PostgresClient from '../Clients/PostgresClient'
import { Sort, type Query } from '../Query'
import { filter } from './AdapterUtils'
import type { DBPull } from './DaoAdapter'
import DaoAdapter from './DaoAdapter'

const specialKeywords = ['user', 'end'] as const

export default class PostgresAdapter<T extends Schema> extends DaoAdapter<T['model']> {

	private id: Array<string> = []

	public constructor(
		/**
		 * the schema used by Cassandra
		 */
		public readonly schema: T,
		/**
		 * the table name
		 */
		public readonly table: string,

		/**
		 * additionnal options to make the adapter work
		 */
		private readonly options?: {
			/**
			 * log the requests made to cassandra
			 */
			debug?: boolean
		}
	) {
		super()
		objectLoop(this.schema.model, (schema, key) => {
			if (schema.attributes.includes('db:auto')) {
				this.id.push(key)
			}
		})
	}

	// TODO: make it clearer what it does
	public async create(obj: Partial<SchemaInfer<T>>): Promise<SchemaInfer<T> | null> {
		// handle automated values
		objectLoop(this.schema.model, (item, key) => {
			if (item.attributes.includes('db:created') || item.attributes.includes('db:updated')) {
				// @ts-expect-error things get validated anyway
				obj[key] = new Date()
			} else if (item.attributes.includes('db:auto') && !obj[key]) {
				if (item.isOfType('')) {
					// @ts-expect-error things get validated anyway
					obj[key] = crypto.randomBytes(16).toString('hex')
				} else if (item.isOfType(123)) {
					// @ts-expect-error things get validated anyway
					obj[key] = crypto.randomBytes(16).readUint32BE()
				} else {
					throw new Error('cannot generate ID because it is not compatible with it')
				}
			}
		})

		// parse the data with the Schema
		const { object: clone, error} = this.schema.validate(obj)
		if (error) {
			console.error(error)
			throw new Error('Invalid data given to create the final object')
		}

		// prepare the database query
		const keys = objectKeys(clone)
			.map((it) => {
				if (specialKeywords.includes(it)) { // handle the special keyword
					return `"${it}"`
				}
				return it
			})
		const keysStr = keys.join(', ')
		const values = keys.map((_, idx) => `$${idx+1}`).join(', ')
		const req = `INSERT INTO ${this.table} (${keysStr}) VALUES (${values});`
		const client = await PostgresClient.get()

		const params = objectMap(clone as any, (value, key) => this.valueToDB(key as any, value))

		if (this.options?.debug) {
			console.log(req, params) // 27 from 1 36 from 0
		}

		// send to the database
		try {
			await client.execute(req, params)
		} catch (e) {
			console.log(e, req, params)
			return null
		}
		return this.schema.validate(clone).object ?? null
	}

	// eslint-disable-next-line complexity
	public async read(query?: Query<SchemaInfer<T>> | undefined): Promise<DBPull<T>> {
		// prepare the request to the database based on the query parameters
		let req: Array<string> = ['SELECT', '*', 'FROM', this.table]

		const client = await PostgresClient.get()

		if (this.options?.debug) {
			console.log(req)
		}

		// read from the database
		let res: Array<Record<string, any>>
		try {
			res = await client.execute(`${req.join(' ')}`)
		} catch (error) {
			console.error('error running request')
			console.error(req)
			throw error
		}
		if (!res) {
			return {
				rows: 0,
				pageTotal: 0,
				page: 1,
				rowsTotal: 0,
				data: []
			}
		}

		if (this.options?.debug) {
			console.log('preEdits', res)
		}

		// post-process the data from the database
		const raw = res
			.map((obj) => {
				// remap to use system value instead of db values
				obj = objectRemap(this.schema.model, (_, key) => ({
					key,
					value: this.dbToValue(key as any, (obj as any)[key])
				}))

				// validate the schema
				const res = this.schema.validate(obj)
				if (res.object) {
					return res.object
				}
				console.log(res.error)
				return null
			})
			.filter((it): it is SchemaInfer<T> => !!it)

		// temp modification of comportement to use the new and better query system
		if ((!query || !query?.$sort) && objectFind(this.schema.model, (_, key) => key === 'created')) {
			// temp fix for the sorting algorithm
			if (!query) {
				// @ts-expect-error normal currently
				query = { $sort: { created: Sort.DESC }}
			} else {
				query.$sort = { created: Sort.DESC }
			}
		}
		let dataset = raw


		if (this.options?.debug) {
			console.log('preFilters', dataset)
		}

		if (query) {
			dataset = filter(query, dataset, this.options).filtered
		}
		return {
			rows: dataset.length ?? 0,
			rowsTotal: res.length ?? 0,
			page: 1,
			pageTotal: 1,
			// page: page,
			// pageTotal: pageLimit ? res.rowLength / pageLimit : 1,
			data: dataset
		}
	}

	public async update(obj: SchemaInfer<T>): Promise<SchemaInfer<T> | null> {
		return this.patch(obj)
	}

	public async patch(id: Partial<SchemaInfer<T>>): Promise<SchemaInfer<T> | null>
	public async patch(id: string, obj: Partial<SchemaInfer<T>>): Promise<SchemaInfer<T> | null>
	// eslint-disable-next-line complexity
	public async patch(id: string | Partial<SchemaInfer<T>>, obj?: Partial<SchemaInfer<T>>): Promise<SchemaInfer<T> | null> {

		if (!obj) {
			if (typeof id === 'string') {
				return null
			}
			obj = {...id} as Partial<SchemaInfer<T>>
		}

		// const tmp = this.schema.validate(obj)
		// // if (tmp.error) {
		// // 	throw new Error(`obj invalid can\'t patch ${JSON.stringify(tmp.error)}`)
		// // }

		// obj = tmp.object

		// update the updated time
		objectLoop(this.schema.model, (item, key) => {
			if (item.attributes.includes('db:updated')) {
				// @ts-expect-error things get validated anyway
				obj[key] = new Date()
			}
		})

		// build the request parts
		const parts: Array<string> = ['UPDATE', this.table, 'SET']
		const params: Array<any> = []

		// remove ids
		for (const tmp of this.id) {
			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			delete obj[tmp]
		}

		// map the items to update
		const keys = objectMap(obj as {}, (_, key, idx) => {
			if (specialKeywords.includes(key)) {
				return `"${key}"=$${idx+1}`
			}

			return `${key}=$${idx+1}`
		})
		parts.push(keys.join(', '))
		params.push(...objectValues(obj as {}))

		// filter by the ids
		parts.push('WHERE')
		const read: Partial<any> = {}
		for (let idx = 0; idx < this.id.length; idx++) {
			const key = this.id[idx] as string

			if (idx > 0) {
				parts.push('AND')
			}
			parts.push(`${key}=$${params.length+1}`)
			const value = obj[key] ?? (typeof id === 'string' ? id : id[key])
			read[key] = this.valueToDB(key as any, value)
			if (!value) {
				throw new Error(`Missing id (${key})`)
			}
			params.push(value)
		}

		const req = parts.join(' ')
		const client = await PostgresClient.get()

		if (this.options?.debug) {
			console.log(req, params)
		}

		try {
			const res = await client!.execute(req, params)
			// console.log(res, req)
			if (this.options?.debug) {
				console.log('post patch result', res, req)
			}
			return (await this.read(read)).data[0] ?? null
		} catch (e) {
			console.log(e, req, params)
		}
		return null
	}

	public async delete(obj: SchemaInfer<T>): Promise<boolean> {
		const parts = ['DELETE', 'FROM', this.table, 'WHERE']

		objectLoop(obj as {}, (value, key, idx) => {
			if (idx > 0) {
				parts.push('AND')
			}
			parts.push(`${key}=${value}`)
		})

		const client = await PostgresClient.get()

		if (this.options?.debug) {}

		try {
			await client!.execute(`${parts.join(' ')}`)
		} catch (e) {
			console.error(e, parts)
			throw e
		}
		return true
	}

	private valueToDB(key: keyof T, value: any): string | number | boolean | Date {
		const item: SchemaItem<unknown> = (this.schema.model as any)[key]

		if (item.isOfType({})) {
			return JSON.stringify(value)
		}

		return value
	}

	private dbToValue(key: keyof T, value: string | number | boolean | Date): any {
		const item: SchemaItem<unknown> = (this.schema.model as any)[key]

		if (item.isOfType(543) && typeof value === 'string') {
			return parseFloat(value)
		}

		if (item.isOfType({}) && typeof value === 'string') {
			return JSON.parse(value)
		}

		return value
	}
}
