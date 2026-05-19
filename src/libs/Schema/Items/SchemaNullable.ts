import type { ValidationResult } from '..'
import SchemaItem from '../SchemaItem'
import { isNull } from '../utils'

export default class SchemaNullable<A> extends SchemaItem<A | undefined | null> {

	public constructor(private readonly item: SchemaItem<A>) {
		super()
	}

	public emptyAsNull(): this {
		this.parseActions.push((input) => {
			if (typeof input === 'string' && input === '') {
				return null
			}
			return input
		})

		return this
	}

	public falthyAsNull(): this {
		this.parseActions.push((input) => {
			if (!input) {
				return null
			}
			return input
		})

		return this
	}

	public override transform(input: A | null | undefined): A | null | undefined {
		const transformed = super.transform(input)

		if (isNull(transformed) || isNull(input)) {
			return transformed
		}

		return this.item.transform(input)
	}

	public override validate(input: A | null | undefined): ValidationResult<A | null | undefined> {
		if (isNull(input)) {
			return {
				object: input
			}
		}
		return this.item.validate(input)
	}

	public override parse(input: unknown): (A | null | undefined) | unknown {
		const parsed = super.parse(input)

		if (isNull(parsed) || isNull(input)) {
			return parsed
		}

		return this.item.parse(input)
	}

	public override isOfType(input: unknown): input is A | undefined | null {
		return isNull(input) || this.item.isOfType(input)
	}
}
