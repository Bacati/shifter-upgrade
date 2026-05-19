import type { ValidationError, ValidationResult } from '..'
import SchemaItem from '../SchemaItem'

export default class SchemaArray<A> extends SchemaItem<Array<A>> {

	public constructor(
		private readonly values: SchemaItem<A>
	) {
		super()
	}

	public override parse(input: unknown): A[] | unknown {
		// let master handle the first pass is desired
		input = super.parse(input)

		if (!Array.isArray(input)) {
			return input
		}

		const clone = []
		for (const item of input) {
			clone.push(this.values.parse(item))
		}

		return clone
	}

	public override validate(input: A[], fast = false): ValidationResult<A[]> {
		const tmp = super.validate(input, fast)
		if (tmp.error) {
			return tmp
		}
		const clone: Array<A> = []
		const errs: Array<ValidationError> = []
		for (let idx = 0; idx < tmp.object.length; idx++) {
			const item = tmp.object[idx];
			const res = this.values.validate(item as A)
			if (res.error) {
				const errors = res.error.map((it) => ({
					message: it.message,
					field: it.field ? `${idx}.${it.field}` : idx.toString()
				}))
				if (fast) {
					return {
						error: errors
					}
				}
				errs.push(...errors)
			} else {
				clone.push(res.object as A)
			}
		}

		if (errs.length > 0) {
			return {
				error: errs
			}
		}

		return {
			object: clone
		}
	}

	public override transform(input: A[]): A[] {
		const clone = []
		for (const item of super.transform(input)) {
			clone.push(this.values.transform(item))
		}

		return clone
	}

	/**
	 * transform the array so it only contains one of each elements
	 */
	public unique(): this {
		this.transforms.push((input) => input.filter((it, idx) => input.indexOf(it) === idx))

		return this
	}

	public override isOfType(input: unknown): input is Array<A> {
		return Array.isArray(input)
	}

	// public override toJSON(): JSONSchemaItem {
	// 	return {
	// 		type: 'array',
	// 		childs: this.values
	// 	}
	// }
}
