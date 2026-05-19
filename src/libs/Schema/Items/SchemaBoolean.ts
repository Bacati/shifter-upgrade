import SchemaItem from '../SchemaItem'

export default class SchemaBoolean extends SchemaItem<boolean> {

	public override isOfType(input: unknown): input is boolean {
		return typeof input === 'boolean'
	}
}
