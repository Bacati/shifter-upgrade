interface QueryRootFilters<Obj extends Record<string, unknown>> {
	/**
	 * one of the results should be true to be true
	 */
	$or?: Array<QueryList<Obj>>
	/**
	 * every results should be false to be true
	 */
	$nor?: Array<QueryList<Obj>>
	/**
	 * (default) make sure every sub queries return true
	 */
	$and?: Array<QueryList<Obj>>
	/**
	 * at least one result must be false
	 */
	$nand?: Array<QueryList<Obj>>
	/**
	 * invert the result from the following query
	 */
	$not?: QueryList<Obj>
	/**
	 * define a precise offset of the data you fetched
	 */
	$offset?: number
	/**
	 * limit the number of elements returned from the dataset
	 */
	$limit?: number
	/**
	 * sort the data the way you want with each keys being priorized
	 *
	 * ex:
	 * {a: Sort.DESC, b: Sort.ASC}
	 *
	 * will sort first by a and if equal will sort by b
	 */
	$sort?: SortInterface<Obj>
}

/**
 * Logical operators that can be used to filter data
 */
export type QueryLogicalOperator<Value> = {
	/**
	 * one of the results should be true to be true
	 */
	$or: Array<QueryValues<Value>>
} | {
	/**
	 * every results should be false to be true
	 */
	$nor: Array<QueryValues<Value>>
} | {
	/**
	 * at least one result must be false
	 */
	$nand: Array<QueryValues<Value>>
} | {
	/**
	 * (default) make sure every sub queries return true
	 */
	$and: Array<QueryValues<Value>>
} | {
	/**
	 * invert the result from the following query
	 */
	$not: QueryValues<Value>
}

/**
 * differents comparisons operators that can be used to filter data
 */
export type QueryComparisonOperator<Value> = {
	/**
	 * the remote source value must be absolutelly equal to the proposed value
	 */
	$eq: Value | null
} | {
	/**
	 * the remote source value must be greater than the proposed value
	 */
	$gt: number | Date
} | {
	/**
	 * the remote source value must be lesser than the proposed value
	 */
	$lt: number | Date
} | {
	/**
	 * the remote source value must be greater or equal than the proposed value
	 */
	$gte: number | Date
} | {
	/**
	 * the remote source value must be lesser or equal than the proposed value
	 */
	$lte: number | Date
} | {
	/**
	 * the remote source value must be one of the proposed values
	 */
	$in: Array<Value>
} | {
	/**
	 * (for string only) part of the proposed value must be in the remote source
	 */
	$inc: Value | null
}

export type QueryList<Obj extends Record<string, unknown>> = {
	[Key in keyof Obj]?: QueryValues<Obj[Key]>
}

/**
 * Differents values the element can take
 * if null it will check if it is NULL on the remote
 * if array it will check oneOf
 * if RegExp it will check if regexp match
 */
export type QueryValues<Value> = Value |
	null |
	Array<Value> |
	RegExp |
	QueryComparisonOperator<Value> |
	QueryLogicalOperator<Value>

/**
 * The query element that allows you to query different elements
 */
export type Query<Obj extends Record<string, unknown>> = QueryList<Obj> & QueryRootFilters<Obj>

/**
 * sorting interface with priority
 */
export type SortInterface<Obj extends Record<string, unknown>> = {
	[Key in keyof Obj]?: Sort
}

export enum Sort {
	/**
	 * Sort the values from the lowest to the largest
	 */
	ASC,
	/**
	 * Sort the values form the largest to the lowest
	 */
	DESC
}
