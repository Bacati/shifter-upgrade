/* eslint-disable @typescript-eslint/no-unused-vars */
import { objectClone, objectLoop, objectMap, objectOmit, objectRemap } from '@dzeio/object-util'
import ldap from 'ldapjs'
import type Schema from 'libs/Schema'
import type { SchemaInfer } from 'libs/Schema'
import type DaoAdapter from 'models/Adapters/DaoAdapter'
import type { DBPull } from 'models/Adapters/DaoAdapter'
import type { Query } from 'models/Query'
import { filter } from './AdapterUtils'
type LDAPFields = 'uid' | 'mail' | 'givenname' | 'sn' | 'jpegphoto' | 'password'

export default class LDAPAdapter<T extends Schema> implements DaoAdapter<T> {

	private reverseReference: Partial<Record<LDAPFields | string, keyof T>> = {}
	private attributes: Array<LDAPFields | string> = []

	public constructor(
		public readonly schema: T,
		public readonly options: {
			url: string
			dnSuffix: string
			admin: {
				dn?: string | undefined
				username?: string | undefined
				password: string
			}
			fieldsCorrespondance?: Partial<Record<keyof SchemaInfer<T>, LDAPFields | string>>
		}
	) {
		objectLoop(options.fieldsCorrespondance ?? {}, (value, key) => {
			this.reverseReference[value] = key
			this.attributes.push(value)
		})
	}

	// TODO: make it clearer what it does
	public async create(_obj: Partial<SchemaInfer<T>>): Promise<SchemaInfer<T> | null> {
		throw new Error('not implemented')
	}

	// eslint-disable-next-line complexity
	public async read(query?: Query<SchemaInfer<T>> | undefined): Promise<DBPull<T>> {
		const passwordField = this.options.fieldsCorrespondance?.password ?? 'password'
		const doLogin = !!query?.[passwordField]

		const emptyResult = {
			rows: 0,
			rowsTotal: 0,
			page: 1,
			pageTotal: 0,
			data: []
		}

		if (!query) {
			return emptyResult
		}

		// console.log(await this.ldapFind({mail: 'f.bouillon@aptatio.com'}))

		const userdn = objectMap(query, (value, key) => `${(this.options.fieldsCorrespondance as any)[key] ?? key}=${value}`)
			?.filter((it) => it.slice(0, it.indexOf('=')) !== passwordField)
			?.join(',')
		if (!doLogin) {
			const bind = this.options.admin.dn ?? `cn=${this.options.admin.username},${this.options.dnSuffix}`
			try {
				const client = await this.bind(bind, this.options.admin.password)
				// @ts-expect-error nique ta mere
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const results = (await this.ldapFind(client, objectMap(query, (value, key) => ({key: this.options.fieldsCorrespondance?.[key], value: value}))
				)).map((it) => this.schema.parse(
					objectRemap(it, (value, key) => ({key: this.reverseReference[key.toLowerCase() as string] as string, value: value}))
				)).filter((it): it is SchemaInfer<T> => !!it)

				const res = filter(query, results)

				return {
					rows: res.filtered.length,
					rowsTotal: results.length,
					page: 1,
					pageTotal: 1,
					data: res.filtered
				}
			} catch {
				return emptyResult
			}
		}

		// password authentication
		try {
			const clone = objectClone(query)
			delete clone.password

			// find using admin privileges
			const res = await this.read(clone)
			const user = res.data[0]
			if (!user) {
				return emptyResult
			}
			const password = query.password as string ?? ''
			const client = await this.bind(`uid=${user[this.reverseReference.uid as keyof typeof user]!},${this.options.dnSuffix}`, password)
			// @ts-expect-error nique x2
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const results = (await this.ldapFind(client, objectMap(clone, (value, key) => {
				const finalKey = this.options.fieldsCorrespondance?.[key]

				return {key: finalKey, value: value}
			})
			)).map((it) => this.schema.parse(
				objectRemap(it, (value, key) => ({ key: this.reverseReference[key as string] as string, value: value }))
			)).filter((it): it is SchemaInfer<T> => !!it)

			const final = filter(objectOmit(query, 'password'), results)
			// console.log(final, query, results)

			if (final.filtered.length !== 1) {
				return emptyResult
			}

			return {
				rows: final.filtered.length,
				rowsTotal: results.length,
				page: 1,
				pageTotal: 1,
				data: final.filtered
			}

		} catch (e) {
			console.log('error, user not found', e)
			return emptyResult
		}
	}

	public async update(_obj: Partial<SchemaInfer<T>>): Promise<SchemaInfer<T> | null> {
		throw new Error('not implemented')
	}

	public async patch(_id: string, _obj: Partial<SchemaInfer<T>>): Promise<SchemaInfer<T> | null> {
		throw new Error('not implemented')
	}

	public async delete(_obj: Partial<SchemaInfer<T>>): Promise<boolean> {
		throw new Error('not implemented')
	}

	private bind(dn: string, password: string): Promise<ldap.Client> {
		const client = ldap.createClient({
			url: this.options.url
		})
		return new Promise<ldap.Client>((res, rej) => {
			console.log('binding as', dn)
			client.on('connect', () => {
				client.bind(dn, password, (err) => {
					if (err) {
						console.error('error binding as', dn, err)
						client.unbind()
						rej(err)
						return
					}
					console.log('binded as', dn)
					res(client)
				})
			})
				.on('timeout', (err) => rej(err))
				.on('connectTimeout', (err) => rej(err))
				.on('error', (err) => rej(err))
				.on('connectError', (err) => rej(err))
		})
	}

	private async ldapFind(client: ldap.Client, filters: Array<{key: LDAPFields, value: string}>): Promise<Array<Record<LDAPFields, string | Array<string> | undefined>>> {

		if (filters.length === 0) {
			return []
		}
		const firstFilter = filters.shift()!
		return new Promise<Array<Record<LDAPFields, string | Array<string> | undefined>>>((res, rej) => {
			const users: Array<Record<LDAPFields, string | Array<string> | undefined>> = []
			const filter = {
				attribute: firstFilter.key as any,
				value: firstFilter.value,
			}
			console.log('Searching on LDAP')
			client.search(
				this.options.dnSuffix, {
					filter: new ldap.EqualityFilter(filter),
					// filter: `${filter.attribute}:caseExactMatch:=${filter.value}`,
					scope: 'sub',
					attributes: this.attributes
				}, (err, search) => {
					if (err) {
						rej(err)
					}
					// console.log('search', search, err)
					search.on('searchEntry', (entry) => {
						users.push(this.parseUser(entry))
					}).on('error', (err2) => {
						rej(err2)
						client.unbind()
						console.error('error in search lol', err2)
					}).on('end', () => {
						console.log(users)
						res(users)

						client.unbind()
					})
				}
			)
		})
	}

	private parseUser(usr: ldap.SearchEntry): Record<LDAPFields, string | Array<string> | undefined> {
		const user: Record<string, string | Array<string> | undefined> = { dn: usr.objectName ?? undefined }

		for (const attribute of usr.attributes) {
			user[attribute.type] = attribute.values.length === 1 ? attribute.values[0] : attribute.values

		}

		return user
	}
}
