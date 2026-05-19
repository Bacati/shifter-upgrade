import type Schema from 'libs/Schema'
import type { Model, ModelInfer, SchemaInfer } from 'libs/Schema'
import type { Query } from '../Query'

export interface DBPull<T extends Schema> {
	/**
	 * total number of rows that are valid with the specified query
	 */
	rows: number
	/**
	 * total number of rows in the table
	 */
	rowsTotal: number

	/**
	 * current page number
	 */
	page: number

	/**
	 * total amount of pages
	 */
	pageTotal: number

	/**
	 * the data fetched
	 */
	data: Array<SchemaInfer<T>>
}

/**
 * the DaoAdapter is the object that connect the Database or source to the application layer
 *
 * you MUST call it through the `DaoFactory` file
 */
export default abstract class DaoAdapter<M extends Model = Model> {
	/**
	 * insert a new object into the source
	 *
	 * @param obj the object to create
	 * @returns the object with it's id filled if create or null otherwise
	 */
	abstract create(obj: Partial<ModelInfer<M>>): Promise<ModelInfer<M> | null>

	/**
	 * insert a new object into the source
	 *
	 * @param obj the object to create
	 * @returns the object with it's id filled if create or null otherwise
	 */
	public insert: DaoAdapter<ModelInfer<M>>['create'] = (obj: Parameters<DaoAdapter<ModelInfer<M>>['create']>[0]) =>
		this.create(obj)

	/**
	 * find the list of objects having elements from the query
	 *
	 * @param query a partial object which filter depending on the elements, if not set it will fetch everything
	 * @returns an array containing the list of elements that match with the query
	 */
	abstract read(query?: Query<ModelInfer<M>> | undefined): Promise<DBPull<Schema<M>>>

	/**
	 * find the list of objects having elements from the query
	 *
	 * @param query a partial object which filter depending on the elements, if not set it will fetch everything
	 * @returns an array containing the list of elements that match with the query
	 */
	public findAll: DaoAdapter<ModelInfer<M>>['read'] = (query: Parameters<DaoAdapter<ModelInfer<M>>['read']>[0]) =>
		this.read(query)

	/**
	 * find the list of objects having elements from the query
	 *
	 * @param query a partial object which filter depending on the elements, if not set it will fetch everything
	 * @returns an array containing the list of elements that match with the query
	 */
	public find: DaoAdapter<ModelInfer<M>>['read'] = (query: Parameters<DaoAdapter<ModelInfer<M>>['read']>[0]) =>
		this.read(query)

	/**
	 * find an object by it's id
	 *
	 * (shortcut to findOne({id: id}))
	 *
	 * @param id the id of the object
	 * @returns
	 */
	public findById(id: ModelInfer<M>['id']): Promise<ModelInfer<M> | null> {
		return this.findOne({ id: id } as Partial<ModelInfer<M>>)
	}

	/**
	 * find an object by it's id
	 *
	 * (shortcut to findOne({id: id}))
	 *
	 * @param id the id of the object
	 * @returns
	 */
	public get(id: ModelInfer<M>['id']) {
		return this.findById(id)
	}

	/**
	 * find the first element that match `query`
	 *
	 * @param query a partial object which filter depending on the elements, if not set it will fetch everything
	 * @returns the first element matching with the query or null otherwise
	 */
	public async findOne(query?: Partial<ModelInfer<M>>): Promise<ModelInfer<M> | null> {
		return (await this.findAll(query)).data[0] ?? null
	}

	/**
	 * update the remote reference of the object
	 *
	 * note: it will not try to insert an item (use `upsert` to handle this)
	 *
	 * @param obj the object to update
	 * @returns an object if it was able to update or null otherwise
	 */
	abstract update(obj: Partial<ModelInfer<M>>): Promise<ModelInfer<M> | null>

	/**
	 * change some elements from the object and return the object updated
	 * @param id the id of the object
	 * @param changegs the change to make
	 */
	public async patch(id: ModelInfer<M>['id'], changes: Partial<ModelInfer<M>>): Promise<ModelInfer<M> | null> {
		const query = await this.findById(id)
		if (!query) {
			return null
		}
		return await this.update({ ...query, ...changes })
	}
	/**
	 * update the remote reference of the object or create it if not found
	 * @param obj the object to update/insert
	 * @returns the object is updated/inserted or null otherwise
	 */
	public async upsert(
		object: Partial<ModelInfer<M>>
	): Promise<ModelInfer<M> | null> {
		if ('id' in object) {
			return this.update(object)
		}
		return this.insert(object)
	}

	/**
	 * Delete the object
	 * @param obj the object to delete
	 *
	 * @returns if the object was deleted or not (if object is not in db it will return true)
	 */
	abstract delete(obj: ModelInfer<M>): Promise<boolean>
}
