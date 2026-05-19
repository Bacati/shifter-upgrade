import { isObject, objectLoop, objectRemap } from '@dzeio/object-util'
import type { ValidationError, ValidationResult } from '..'
import SchemaItem from '../SchemaItem'

export default class SchemaRecord<A extends string | number | symbol, B> extends SchemaItem<Record<A, B>> {

	public constructor(
		private readonly key: SchemaItem<A>,
		private readonly values: SchemaItem<B>
	) {
		super()
	}

	public override parse(input: unknown): unknown {
		input = super.parse(input)

		if (!this.isOfType(input)) {
			return input
		}

		const finalObj: Record<A, B> = {} as Record<A, B>
		const error = objectLoop(input, (value, key) => {
			const res1 = this.key.parse(key)
			const res2 = this.values.parse(value)
			if (typeof res1 !== 'string' && typeof res1 !== 'number') {
				return false
			}
			// @ts-expect-error normal behavior
			finalObj[res1] = res2
			return true
		})
		if (error) {
			return input
		}
		return finalObj
	}

	public override transform(input: Record<A, B>): Record<A, B> {
		return objectRemap(super.transform(input), (value, key) => {
			return {
				key: this.key.transform(key),
				value: this.values.transform(value)
			}
		})
	}

	public override validate(input: Record<A, B>, fast = false): ValidationResult<Record<A, B>> {
		const tmp = super.validate(input)
		if (tmp.error) {
			return tmp
		}

		const errs: Array<ValidationError> = []
		const finalObj: Record<A, B> = {} as Record<A, B>

		objectLoop(tmp.object, (value, key) => {
			const res1 = this.key.validate(key)
			const res2 = this.values.validate(value)
			const localErrs = (res1.error ?? []).concat(...(res2.error ?? []))
			if (localErrs.length > 0) {
				errs.push(...localErrs.map((it) => ({
					message: it.message,
					field: it.field ? `${key as string}.${it.field}` : key.toString()
				})))
				return !fast
			} else {
				// @ts-expect-error the check in the if assure the typing below
				finalObj[res1.object] = res2.object
			}

			return true
		})

		if (errs.length > 0) {
			return {
				error: errs
			}
		}

		return {
			object: finalObj
		}
	}

	public override isOfType(input: unknown): input is Record<A, B> {
		return isObject(input) && Object.prototype.toString.call(input) === '[object Object]'
	}
}
