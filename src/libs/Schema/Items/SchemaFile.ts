import SchemaItem from '../SchemaItem'

export default class SchemaFile extends SchemaItem<File> {
	constructor () {
		super()
		this.parseActions.push((input) => this.isOfType(input) && input.size > 0 ? input : undefined)
	}

	public extension(ext: string, message?: string): this {
		this.validations.push({
			fn: (input) => input.name.endsWith(ext),
			message
		})

		return this
	}

	public override isOfType(input: unknown): input is File {
		return input instanceof File
	}
}
