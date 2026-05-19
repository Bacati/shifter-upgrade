import { isObject, objectLoop } from '@dzeio/object-util'
import DzeioLiteral from './Items/DzeioLiteral'
import SchemaArray from './Items/SchemaArray'
import SchemaBoolean from './Items/SchemaBoolean'
import SchemaDate from './Items/SchemaDate'
import SchemaFile from './Items/SchemaFile'
import SchemaNullable from './Items/SchemaNullable'
import SchemaNumber from './Items/SchemaNumber'
import SchemaRecord from './Items/SchemaRecord'
import SchemaString from './Items/SchemaString'
import SchemaItem from './SchemaItem'

export interface ValidationError {
	message: string
	field?: string
	value?: unknown
}

export type ValidationResult<T> = {
	object: T
	error?: undefined
} | {
	object?: undefined
	error: Array<ValidationError>
}

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export type Model = Record<string, SchemaItem<any>>

export type SchemaInfer<S extends Schema> = ModelInfer<S['model']>

export type ModelInfer<M extends Model> = {
	[key in keyof M]: ReturnType<M[key]['transform']>
}

/**
 * A schema to validate input or external datas
 */
export default class Schema<M extends Model = Model> extends SchemaItem<ModelInfer<Model>> {

	public static messages = {
		typeInvalid: 'Type of field is not valid',
		notAnObject: 'the data submitted is not valid',
		globalInvalid: 'the field is invalid'
	}

	public constructor(public readonly model: M) {
		super()
	}

	/**
	 * See {@link SchemaString}
	 */
	public static string(
		...inputs: ConstructorParameters<typeof SchemaString>
	) : SchemaString {
		return new SchemaString(...inputs)
	}

	public static file(
		...inputs: ConstructorParameters<typeof SchemaFile>
	): SchemaFile {
		return new SchemaFile(...inputs)
	}

	public static number(
		...inputs: ConstructorParameters<typeof SchemaNumber>
	): SchemaNumber {
		return new SchemaNumber(...inputs)
	}

	public static date(
		...inputs: ConstructorParameters<typeof SchemaDate>
	): SchemaDate {
		return new SchemaDate(...inputs)
	}

	public static literal<T>(
		...inputs: ConstructorParameters<typeof DzeioLiteral<T>>
	): DzeioLiteral<T> {
		return new DzeioLiteral<T>(...inputs)
	}

	public static object<T extends Model>(
		...inputs: ConstructorParameters<typeof Schema<T>>
	): Schema<T> {
		return new Schema(...inputs)
	}

	public static record<A extends string | number, B>(
		...inputs: ConstructorParameters<typeof SchemaRecord<A, B>>
	): SchemaRecord<A, B> {
		return new SchemaRecord<A, B>(...inputs)
	}

	public static array<A>(
		...inputs: ConstructorParameters<typeof SchemaArray<A>>
	): SchemaArray<A> {
		return new SchemaArray<A>(...inputs)
	}

	public static nullable<A>(
		...inputs: ConstructorParameters<typeof SchemaNullable<A>>
	): SchemaNullable<A> {
		return new SchemaNullable<A>(...inputs)
	}

	public static boolean(
		...inputs: ConstructorParameters<typeof SchemaBoolean>
	): SchemaBoolean {
		return new SchemaBoolean(...inputs)
	}

	/**
	 * @param query the URL params to validate
	 * @returns
	 */
	public validateQuery(query: URLSearchParams, fast = false): ReturnType<Schema<M>['validate']> {
		const record: Record<string, unknown> = {}
		for (const [key, value] of query) {
			record[key] = value
		}

		return this.validate(record, fast)
	}

	/**
	 * @param form the form to validate
	 */
	public validateForm(form: HTMLFormElement, fast = false): ReturnType<Schema<M>['validate']> {
		const data = new FormData(form)
		return this.validateFormData(data, fast)
	}

	/**
	 * @param data the FormData to validate
	 * @returns
	 */
	public validateFormData(data: FormData, fast = false): ReturnType<Schema<M>['validate']> {
		const record: Record<string, unknown> = {}
		for (const [key, value] of data) {
			const isArray = this.model[key]?.isOfType([]) ?? false
			record[key] = isArray ? data.getAll(key) : value
		}

		return this.validate(record, fast)
	}

	/**
	 *
	 * @param input the data to validate
	 * @param options additionnal validation options
	 * @returns blablabla
	 */
	public override validate(input: unknown, fast = false): ValidationResult<SchemaInfer<this>> {
		if (!isObject(input)) {
			return {
				error: [{
					message: Schema.messages.notAnObject
				}]
			}
		}

		const errors: Array<ValidationError> = []
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		const res: ModelInfer<M> = {} as any
		objectLoop(this.model, (v, k) => {
			// parse value from other formats
			const value = v.parse(input[k])

			// validate that the value is of type
			if (!v.isOfType(value)) {
				errors.push({
					message: Schema.messages.typeInvalid,
					field: k,
					value: value
				})
				return !fast
			}

			// run validations
			const invalid = v.validate(value)
			if (invalid.error) {
				errors.push(...invalid.error.map((it) => ({
					message: it.message,
					field: it.field ? `${k}.${it.field}` : k
				})))
				return !fast
			}

			// transform and assign final value
			// @ts-expect-error normal behavior
			res[k] = v.transform(value)

			return true
		})

		if (errors.length > 0) {
			return {
				error: errors
			}
		}

		return {
			object: res
		}
	}

	public override isOfType(input: unknown): input is ModelInfer<Model> {
		return isObject(input)
	}
}

/**
 * alias of {@link Schema}
 */
export const s = Schema
