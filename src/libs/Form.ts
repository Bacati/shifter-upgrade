import { objectFind, objectLoop } from '@dzeio/object-util'
import type { Model, ModelInfer, ValidationError, ValidationResult } from './Schema'
import Schema from './Schema'

/**
 * Handle most of the form validation and error reporting
 *
 * create a new one by using {@link Form.create}
 *
 * note: This library is made to work with {@link Model}
 */
export default class Form<M extends Model> {

	private data?: ValidationResult<ModelInfer<M>>
	private formData?: FormData
	private schema: Schema

	private globalError?: string
	private errors: Partial<Record<keyof M, string>> = {}
	private defaultValues: Partial<Record<keyof M, any>> = {}

	/**
	 * Create a ready to use form
	 * @param model the model the form should respect
	 * @param request the request element
	 * @returns the Form object
	 */
	public static async create<M extends Model>(model: M, request: Request) {
		const fm = new Form(model, request)
		await fm.init()
		return fm
	}

	private constructor(public readonly model: M, private readonly request: Request) {
		this.schema = new Schema(model)
	}

	/**
	 * you should not use this function by itself, it is called bu {@link Form.create}
	 */
	public async init() {
		try {
			if (this.request.method === 'POST') {
				if (!(this.request.headers.get('Content-Type') ?? '').startsWith('multipart/form-data')) {
					console.warn('form\'s content-type is not multipart/form-data')
				}
				this.formData = await this.request.formData()
				this.data = this.schema.validateFormData(this.formData) as any
				if (this.data?.error) {
					for (const error of this.data.error) {
						if (error.field) {
							const field = error.field
							if (field.includes('.')) {
								this.errors[field.slice(0, field.indexOf('.')) as keyof M] = error.message
							} else {
								this.errors[error.field as keyof M] = error.message
							}
						} else {
							this.globalError = error.message
						}
					}
				}
			}
		} catch {}
	}

	public defaultValue(name: keyof M, value: any) {
		this.defaultValues[name] = value
		return this
	}

	public defaultObject(obj: Record<string, any>) {
		objectLoop(obj, (value, key) => {
			this.defaultValue(key, value)
		})
		return this
	}

	/**
	 * indicate if the form is valid or not
	 * @returns if the form submitted is valid or not
	 */
	public isValid(): boolean {
		if (this.request.method !== 'POST' || !this.data) {
			return false
		}
		if (this.data.error) {
			return false
		}
		return true
	}

	/**
	 *
	 * @param message the error message
	 * @param key (optionnal) the specific key to apply the error to
	 */
	public setError(message: string, key?: keyof M) {
		if (key) {
			this.errors[key] = message
		} else {
			this.globalError = message
		}
	}

	public getError(key?: keyof M): string | undefined {
		if (!key) {
			return this.globalError
		}
		return this.errors[key]
	}

	public hasError(key?: keyof M): boolean {
		return !!this.getError(key)
	}

	public getAnyError(): string | undefined {
		if (this.globalError) {
			return this.globalError
		}
		const other = objectFind(this.errors, (value) => !!value)
		if (other) {
			return `${other.key.toString()}: ${other.value}`
		}
		return undefined
	}

	public hasAnyError(): boolean {
		return !!this.getAnyError()
	}

	public attrs(key: keyof M) {
		return this.attributes(key)
	}

	public attributes(key: keyof M): Record<string, any> {
		const schema = this.model[key]
		if (!schema) {
			return {}
		}
		const attrs: Record<string, any> = {
			name: key
		}
		if (!schema.attributes.includes('form:password')) {
			const value: any = this.formData?.get(key as string) as string ?? this.defaultValues[key]
			if (value instanceof Date) {
				attrs.value = `${value.getFullYear().toString().padStart(4, '0')}-${(value.getMonth() + 1).toString().padStart(2, '0')}-${value.getDate().toString().padStart(2, '0')}`
			} else {
				attrs.value = value
			}
		}

		return attrs
	}

	public getData(): ModelInfer<M> {
		return this.data!.object!
	}
}
