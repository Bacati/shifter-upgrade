import SchemaItem from '../SchemaItem'

export default class SchemaDate extends SchemaItem<Date> {

	public parseString(): this {
		this.parseActions.push((input) => typeof input === 'string' ? new Date(input) : input)
		return this
	}

	public min(value: Date, message?: string): this {
		this.validations.push({
			fn(input) {
				return input >= value
			},
			message: message
		})

		return this
	}

	public parseFromExcelString(): this {
		this.parseActions.push((input) => {
			if (typeof input !== 'string') {
				return input
			}
			const days = parseFloat(input)
			const millis = days * 24 * 60 * 60 * 1000
			const date = new Date('1900-01-01')
			date.setTime(date.getTime() + millis)
			return date
		})
		return this
	}

	public max(value: Date, message?: string): this {
		this.validations.push({
			fn(input) {
				return input <= value
			},
			message: message
		})
		return this
	}

	public override isOfType(input: unknown): input is Date {
		return input instanceof Date && !isNaN(input.getTime())
	}
}
