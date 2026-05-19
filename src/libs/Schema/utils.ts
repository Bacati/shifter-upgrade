export function isNull(value: unknown): value is undefined | null {
	return typeof value === 'undefined' || value === null
}
