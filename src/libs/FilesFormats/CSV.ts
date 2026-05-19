import { objectMap, objectSort, objectValues } from '@dzeio/object-util'
import assert from "node:assert/strict"

export interface CSVOptions {
	lineSeparator?: string
	columnSeparator?: string
	/**
	 * if set, it will skip trying to parse a number
	 */
	skipParsing?: boolean
}

// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
// biome-ignore lint/style/useNamingConvention: <explanation>
export default class CSV {

	// eslint-disable-next-line complexity
	public static parse(data: string, options?: CSVOptions): Array<Record<string, string | number>> {
		assert(typeof data === 'string', `Data is not a string (${typeof data})`)
		const lineSeparator = options?.lineSeparator ?? '\n'
		const colSeparator = options?.columnSeparator ?? ','

		let headers: Array<string> | null = null

		const res: Array<Record<string, string | number>> = []

		let values: Array<string> = []

		let previousSplit = 0
		let quoteCount = 0
		for (let idx = 0; idx < data.length; idx++) {
			const char = data[idx]
			if (char === '"') {
				quoteCount++
			}
			if ((char === colSeparator || char === lineSeparator) && quoteCount % 2 === 0) {
				let text = data.slice(previousSplit, idx)
				if (text.startsWith('"') && text.endsWith('"')) {
					text = text.slice(1, text.length - 1)
				}
				values.push(text)
				previousSplit = idx + 1
			}
			if (char === lineSeparator && quoteCount % 2 === 0) {
				if (!headers) {
					headers = values
					values = []
					continue
				}
				const lineFinal: Record<string, string | number> = {}
				let filled = false // filled make sure to skip empty lines
				// eslint-disable-next-line max-depth
				for (let idx2 = 0; idx2 < values.length; idx2++) {
					let value: string | number = values[idx2]!
					if (value.length === 0) {
						continue
					}
					// eslint-disable-next-line max-depth
					if (!options?.skipParsing && /^-?(\d|\.|E)+$/g.test(value as string)) {
						value = Number.parseFloat(value as string)
					}
					const key = headers[idx2]!
					lineFinal[key] = value
					filled = true
				}
				if (filled) {
					res.push(lineFinal)
				}
				values = []
			}
		}
		return res
	}

	public static stringify(headers: Array<string>, data: Array<Record<string, unknown>>, options?: CSVOptions) {
		const ls = options?.lineSeparator ?? '\n'

		// encode headers
		let body = CSV.encodeLine(headers, options) + ls

		// encode data body
		for (const entry of data) {
			body += CSV.encodeLine(objectValues(objectSort(entry, headers)), options) + ls
		}
		return body
	}

	private static encodeLine(line: Array<unknown>, options?: CSVOptions): string {
		const ls = options?.lineSeparator ?? '\n'
		const cs = options?.columnSeparator ?? ','

		return objectMap(line, (it) => {
			if (typeof it !== 'string') {
				return it
			}
			if (it.includes('"') || it.includes(ls)|| it.includes(cs)) {
				return `"${it}"`
			}
			return it
			//column separator
		}).join(cs)
	}

	public static getHeaders(data: string, options?: {
		lineSeparator?: string
		columnSeparator?: string
	}) {
		const ls = options?.lineSeparator ?? '\n'
		const cs = options?.columnSeparator ?? ','

		//line separator et column separator
		return data.split(ls)[0]?.split(cs)!
	}
}
