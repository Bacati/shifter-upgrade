import type { ValidationResult } from '.'
import Schema from '.'
import { isNull } from './utils'

export interface Messages {
	globalInvalid: string
}

/**
 * An element of a schema
 */
export default abstract class SchemaItem<T> {
	/**
	 * get additionnal attributes used to make the Schema work with outside libs
	 */
	public attributes: Array<string> = []

	/**
	 * the list of validations
	 */
	protected validations: Array<{
		fn: (input: T) => boolean
		message?: string | undefined
	}> = []

	protected parseActions: Array<(input: unknown) => T | unknown> = []
	protected transforms: Array<(input: T) => T> = []

	/**
	 * set the list of attributes for the item of the schema
	 * @param attributes the attributes
	 */
	public attr(...attributes: Array<string>) {
		this.attributes = attributes
		return this
	}

	/**
	 * set the default value of the schema element
	 * @param value the default value
	 * @param strict if strict, it will use it for null/undefined, else it will check for falthy values
	 */
	public defaultValue(value: T, strict = true) {
		this.parseActions.push((input) => {
			if (strict && isNull(input)) {
				return value
			}
			if (!value) {
				return input
			}
			return input
		})

		return this
	}

	/**
	 *
	 * @param values the possible values the field can be
	 * @param message the message returned if it does not respect the value
	 */
	public in(values: Array<T>, message?: string) {
		this.validations.push({
			fn: (input) => values.includes(input),
			message
		})

		return this
	}

	/**
	 * Try to parse the input from another format
	 *
	 * @param input the input to transform, it is done before validation, so the value can be anything
	 * @returns the transformed value
	 */
	public parse(input: unknown): T | unknown {
		for (const transform of this.parseActions) {
			const tmp = transform(input)
			if (this.isOfType(tmp)) {
				return tmp
			}
		}

		return input
	}

	/**
	 * transform a valid value
	 *
	 * @param input the input to transform, it MUST be validated beforehand
	 * @returns the transformed value
	 */
	public transform(input: T): T {
		let res = input

		for (const action of this.transforms) {
			res = action(res)
		}

		return res
	}

	/**
	 * validate that the input is valid or not
	 * @param input the input to validate
	 * @param fast if true the validation stops at the first error
	 * @returns a string if it's not valid, else null
	 */
	public validate(input: T, fast = false): ValidationResult<T> {
		for (const validation of this.validations) {
			if (!validation.fn(input as T)) {
				return {
					error: [{
						message: validation.message ?? Schema.messages.globalInvalid
					}]
				}
			}
		}
		return {
			object: input as T
		}
	}

	/**
	 * validate that the input value is of the type of the schema item
	 *
	 * it makes others functions easier to works with
	 * @param input the input to validate
	 */
	public abstract isOfType(input: unknown): input is T

	// public abstract toJSON(): JSONSchemaItem
}

type Parseable = string | number | boolean

export interface ValidatorJSON {
	/**
	 * the function name (ex: `min`, `max`)
	 */
	name: string
	/**
	 * the function parameters
	 */
	params?: Array<Parseable>
}

export interface JSONSchemaItem {
	/**
	 * Schema item
	 *
	 * ex: `string`, `number`, `boolean`, ...
	 */
	type: string
	/**
	 * constructor params
	 */
	params?: Array<Parseable>
	/**
	 * list of attributes
	 */
	attributes?: Array<string>
	actions?: Array<ValidatorJSON>
}

export type JSONSchema = {
	[a: string]: JSONSchemaItem
}
