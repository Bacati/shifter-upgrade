import type Schema from 'libs/Schema'
import type { SchemaInfer } from 'libs/Schema'
import type DaoAdapter from 'models/Adapters/DaoAdapter'

export default class MultiAdapter<T extends Schema> implements DaoAdapter<T> {

	public constructor(
		public readonly schema: T,
		public readonly adapters: Array<{
			adapter: DaoAdapter<T>
			fields: Array<keyof T>
			/**
			 * a field from the main adapter that will backreference the child adapter
			 */
			childReference?: keyof T
		}> = []
	) {}

	// TODO: make it clearer what it does
	public async create(obj: Partial<SchemaInfer<T>>): Promise<SchemaInfer<T> | null> {
		let final: SchemaInfer<T> = {} as any
		// start by processing the childs
		for (const adapter of this.adapters.sort((a) => a.childReference ? -1 : 1)) {
			const partialObject: Partial<SchemaInfer<T>> = {}
			for (const key of adapter.fields) {
				partialObject[key] = obj[key]
			}
			const res = await adapter.adapter.create!(partialObject as any)
			if (res && adapter.childReference) {
				obj[adapter.childReference] = res[adapter.childReference]
			}
			final = {...final, ...res}
		}
		return final
	}

	// eslint-disable-next-line complexity
	// public async read(query?: Query<SchemaInfer<T>> | undefined): Promise<DBPull<T>> {
	// 	let final: SchemaInfer<T> = {} as any
	// 	// start by processing the childs
	// 	for (const adapter of this.adapters.sort((a) => a.childReference ? -1 : 1)) {
	// 		const partialObject: Partial<SchemaInfer<T>> = {}
	// 		for (const key of adapter.fields) {
	// 			partialObject[key] = obj[key]
	// 		}
	// 		const res = await adapter.adapter.read!(query)
	// 		if (res && adapter.childReference) {
	// 			obj[adapter.childReference] = res[adapter.childReference]
	// 		}
	// 		final = {...final, ...res}
	// 	}
	// 	// step 2 merge elements
	// 	return final
	// }

	public async update(_obj: Partial<SchemaInfer<T>>): Promise<SchemaInfer<T> | null> {
		throw new Error('not implemented')
	}

	public async patch(_id: string, _obj: Partial<SchemaInfer<T>>): Promise<SchemaInfer<T> | null> {
		throw new Error('not implemented')

	}

	public async delete(_obj: Partial<SchemaInfer<T>>): Promise<boolean> {
		throw new Error('not implemented')

	}
}
