import SchemaItem, { type JSONSchemaItem } from '../SchemaItem'

export default class DzeioLiteral<T> extends SchemaItem<T> {
	public constructor(private readonly value: T) {
		super()
		this.validations.push({
			fn(input) {
				return input === value
			}
		})
	}

	public override isOfType(input: unknown): input is T {
		return typeof input === typeof this.value
	}

	public override toJSON(): JSONSchemaItem {
		return {
			type: 'literal',
			params: [this.value as string]
		}
	}
}
