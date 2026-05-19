import SchemaItem from '../SchemaItem'

export default class SchemaNumber extends SchemaItem<number> {

	public min(...params: Parameters<SchemaNumber['gte']>): this {
		return this.gte(...params)
	}

	public max(...params: Parameters<SchemaNumber['lte']>): this {
		return this.lte(...params)
	}

	/**
	 * validate that the number is less or equal than {@link value}
	 * @param value the maxumum value (inclusive)
	 * @param message the message sent if not valid
	 */
	public lte(value: number, message?: string): this {
		this.validations.push({
			fn(input) {
				return input <= value
			},
			message: message
		})

		return this
	}

	/**
	 * validate that the number is more or equal than {@link value}
	 * @param value the minimum value (inclusive)
	 * @param message the message sent if not valid
	 */
	public gte(value: number, message?: string): this {
		this.validations.push({
			fn(input) {
				return input >= value
			},
			message: message
		})
		return this
	}

	/**
	 * validate that the number is less than {@link value}
	 * @param value the maxumum value (exclusive)
	 * @param message the message sent if not valid
	 */
	public lt(value: number, message?: string): this {
		this.validations.push({
			fn(input) {
				return input < value
			},
			message: message
		})

		return this
	}

	/**
	 * validate that the number is more than {@link value}
	 * @param value the minimum value (exclusive)
	 * @param message the message sent if not valid
	 */
	public gt(value: number, message?: string): this {
		this.validations.push({
			fn(input) {
				return input > value
			},
			message: message
		})
		return this
	}

	/**
	 * Try to parse strings before validating
	 */
	public parseString(): this {
		this.parseActions.push((input) =>
			typeof input === 'string' ? Number.parseFloat(input) : input
		)

		return this
	}

	public override isOfType(input: unknown): input is number {
		return typeof input === 'number' && !Number.isNaN(input)
	}
}
