import { objectFind, objectLoop } from '@dzeio/object-util'
import { Sort, type Query, type QueryList, type QueryValues } from 'models/Query'

export declare type AllowedValues = string | number | bigint | boolean | null | undefined

// eslint-disable-next-line complexity
export function filter<T extends object>(query: Query<T>, results: Array<T>, options?: { debug?: boolean }): {filtered: Array<T>, unpaginatedLength: number} {
	if (options?.debug) {
		console.log('Query', query)
	}
	// filter
	let filtered = results.filter((it) => {
		const res = objectLoop(query, (value, key) => {
			if (key === '$or') {
				for (const sub of value as any) {
					const final = filterEntry(sub, it)
					// eslint-disable-next-line max-depth
					if (final) {
						return true
					}
				}
				return false
			}
			if ((key as string).startsWith('$')) {
				return true
			}
			return filterEntry(query, it)
		})
		// console.log(it, res)
		return res
	})
	if (options?.debug) {
		console.log('postFilters', filtered)
	}

	// sort
	if (query.$sort) {
		// temp until better solution is found
		const first = objectFind(query.$sort, () => true)
		filtered = filtered.sort((objA, objB) => {
			const a = objA[first!.key]
			const b = objB[first!.key]
			const ascend = first?.value !== Sort.DESC
			if (typeof a === 'number' && typeof b === 'number') {
				if (ascend) {
					return b - a
				} else {
					return a - b
				}
			}
			if (a instanceof Date && b instanceof Date) {
				if (ascend) {
					return a.getTime() - b.getTime()
				} else {
					return b.getTime() - a.getTime()
				}
			}
			if (typeof a === 'string' && typeof b === 'string') {
				if (ascend) {
					return a.localeCompare(b)
				} else {
					return b.localeCompare(a)
				}

			}
			if (ascend) {
				return a > b ? 1 : -1
			}
			return a > b ? -1 : 1
		})
	}
	if (options?.debug) {
		console.log('postSort', filtered)
	}

	// length of the query assuming a single page
	const unpaginatedLength = filtered.length
	// limit
	if (query.$offset || query.$limit) {
		const offset = query.$offset ?? 0
		filtered = filtered.slice(offset, offset + (query.$limit ?? Infinity))
	}
	if (options?.debug) {
		console.log('postLimit', filtered)
	}

	return { filtered, unpaginatedLength }
}

/**
 *
 * @param query the query of the entry
 * @param item the implementation of the item
 * @returns if it should be kept or not
 */
export function filterEntry<T extends object>(query: QueryList<T>, item: T): boolean {
	// eslint-disable-next-line complexity
	const res = objectLoop(query as any, (queryValue, key: keyof typeof query) => {
		/**
		 * TODO: handle $keys
		 */
		if ((key as string).startsWith('$')) {
			return true
		}

		return filterValue(item[key], queryValue)
	})

	return res
}

/**
 * indicate if a value should be kept by an ENTIRE query
 *
 * @param value the value to filter
 * @param query the full query
 * @returns if the query should keep the value or not
 */
function filterValue<T extends AllowedValues>(value: any, query: QueryValues<T>) {
	if (typeof query !== 'object' || query === null || query instanceof RegExp || Array.isArray(query)) {
		return filterItem(value, query)
	}

	// loop through each keys of the query
	// eslint-disable-next-line arrow-body-style
	return objectLoop(query, (querySubValue: any, queryKey: any) => {
		return filterItem(value, {[queryKey]: querySubValue } as QueryValues<T>)
	})
}

/**
 *
 * @param value the value to check
 * @param query a SINGLE query to check against
 * @returns if the value should be kept or not
 */
// eslint-disable-next-line complexity
function filterItem(value: any, query: QueryValues<AllowedValues>): boolean {
	/**
	 * check if the value is null
	 */
	if (query === null) {
		return typeof value === 'undefined' || value === null
	}

	if (query instanceof RegExp) {
		return query.test(typeof value === 'string' ? value : value.toString())
	}

	/**
	 * ?!?
	 */
	if (value === null || typeof value === 'undefined') {
		return false
	}

	/**
	 * strict value check by default
	 */
	if (!(typeof query === 'object')) {
		return query === value
	}

	/**
	 * Array checking and $in
	 */
	if (Array.isArray(query) || '$in' in query) {
		const arr = Array.isArray(query) ? query : query.$in as Array<AllowedValues>
		return arr.includes(value)
	}

	if ('$inc' in query) {
		return (value.toString() as string).toLowerCase().includes(query.$inc!.toString()!.toLowerCase())
	}

	if ('$eq' in query) {
		return query.$eq === value
	}

	/**
	 * numbers specific cases for numbers
	 */
	if ('$gt' in query) {
		value = value instanceof Date ? value.getTime() : value
		const comparedValue = query.$gt instanceof Date ? query.$gt.getTime() : query.$gt
		return typeof value === 'number' && typeof comparedValue === 'number' && value > comparedValue
	}

	if ('$lt' in query) {
		value = value instanceof Date ? value.getTime() : value
		const comparedValue = query.$lt instanceof Date ? query.$lt.getTime() : query.$lt
		return typeof value === 'number' && typeof comparedValue === 'number' && value < comparedValue
	}

	if ('$gte' in query) {
		value = value instanceof Date ? value.getTime() : value
		const comparedValue = query.$gte instanceof Date ? query.$gte.getTime() : query.$gte
		return typeof value === 'number' && typeof comparedValue === 'number' && value >= comparedValue
	}

	if ('$lte' in query) {
		value = value instanceof Date ? value.getTime() : value
		const comparedValue = query.$lte instanceof Date ? query.$lte.getTime() : query.$lte
		return typeof value === 'number' && typeof comparedValue === 'number' && value <= comparedValue
	}

	if ('$len' in query && Array.isArray(value)) {
		return value.length === query.$len
	}

	/**
	 * Logical Operators
	 */
	if ('$or' in query && Array.isArray(query.$or)) {
		return !!query.$or.find((it) => filterValue(value, it as QueryValues<any>))
	}
	if ('$and' in query && Array.isArray(query.$and)) {
		return !query.$and.find((it) => !filterValue(value, it as QueryValues<any>))
	}

	if ('$not' in query) {
		return !filterValue(value, query.$not as QueryValues<any>)
	}

	if ('$nor' in query && Array.isArray(query.$nor)) {
		return !query.$nor.find((it) => filterValue(value, it as QueryValues<any>))
	}

	if ('$nand' in query && Array.isArray(query.$nand)) {
		return !!query.$nand.find((it) => !filterValue(value, it as QueryValues<any>))
	}

	return false
}
