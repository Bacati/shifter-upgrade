import SchemaItem from '../SchemaItem'
import SchemaNullable from './SchemaNullable'

export default class SchemaString extends SchemaItem<string> {
	/**
	 * force the input text to be a minimum of `value` size
	 * @param value the minimum length of the text
	 * @param message the message to display on an error
	 */
	public min(value: number, message?: string): SchemaString {
		this.validations.push({
			fn(input) {
				return input.length >= value
			},
			message: message
		})

		return this
	}

	/**
	 * force the input text to be a maximum of `value` size
	 * @param value the maximum length of the text
	 * @param message the message to display on an error
	 */
	public max(value: number, message?: string): SchemaString {
		this.validations.push({
			fn(input) {
				return input.length <= value
			},
			message: message
		})
		return this
	}

	/**
	 * the value must not be empty (`''`)
	 * @param message
	 * @returns
	 */
	public notEmpty(message?: string): this {
		this.validations.push({
			fn(input) {
				return input !== ''
			},
			message: message
		})
		return this
	}

	/**
	 * note: this nullable MUST be used last as it change the type of the returned function
	 */
	public nullable() {
		return new SchemaNullable(this)
	}

	/**
	 * force the input text to respect a Regexp
	 * @param regex the regex to validate against
	 * @param message the message to display on an error
	 */
	public regex(regex: RegExp, message?: string): SchemaString {
		this.validations.push({
			fn(input) {
				return regex.test(input)
			},
			message
		})
		return this
	}

	public override isOfType(input: unknown): input is string {
		return typeof input === 'string'
	}
}
