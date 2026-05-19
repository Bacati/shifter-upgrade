import { objectRemap } from '@dzeio/object-util'
import AdmZip from 'adm-zip'
import CSV from './CSV'
import XML, { type Tag } from './XML'

export default class XLSX {
	/**
	 *
	 * @param xlsx the xlsx data as a buffer
	 * @returns a Record with each sheets and the raw CSV linked to it
	 */
	public static async parse(xlsx: ArrayBuffer): Promise<Record<string, string>> {
		const zip = new AdmZip(Buffer.from(xlsx))
		const shared = await XML.parse(zip.readAsText('xl/sharedStrings.xml'))
		const workbook = zip.readAsText('xl/workbook.xml')
		const relations = zip.readAsText('xl/_rels/workbook.xml.rels')
		const sheetsRelations = await XML.parse(relations)
		const sheetsList = XML.findChild(await XML.parse(workbook), 'sheets')!.childs?.map((it) => ({
			name: XML.getAttribute(it as Tag, 'name'),
			id: XML.getAttribute(it as Tag, 'r:id'),
			path: '',
			data: ''
		}))!
		for (const sheetItem of sheetsList) {
			const rels = (sheetsRelations.childs as Array<Tag>)
			const rel = rels.find((it) => XML.getAttribute(it, 'Id') === sheetItem.id)
			sheetItem.path = XML.getAttribute(rel!, 'Target')!
		}

		await Promise.all(sheetsList.map(async (it) => {
			it.data = await this.parseWorkSheet(shared, zip.readAsText(`xl/${it.path}`))
			return it
		}))

		return objectRemap(sheetsList, (v) => ({
			key: v.name,
			value: v.data
		}))
	}
	public static async parseWorkSheet(refs: Tag, data: string): Promise<string> {
		const json = await XML.parse(data)
		const sheetData = XML.findChild(json, 'sheetData')!
		let headers: Array<string> = []
		const res: Array<Record<string, any>> = []
		let headerDone = false
		for (const row of sheetData.childs ?? []) {
			const line: Array<string> = []
			const id = XML.getAttribute((row as Tag), 'r')
			for (const col of (row as Tag).childs ?? []) {
				if (!(col as Tag).childs) {
					continue
				}
				const type = XML.getAttribute(col as Tag, 't')
				const colIdx = XML.getAttribute(col as Tag, 'r')
				const idx = colIdx!.charCodeAt(0) - 65 // TODO: handle more than 26 cols
				const value = XML.findChild(col as Tag, 'v')?.childs?.[0]
				if (!value || typeof value !== 'string') {
					continue
				}
				// const value = ((col as Tag).childs![0] as Tag).childs![0] as string
				if (type === 's') {
					line[idx] = this.getRef(refs, value)
				} else {
					line[idx] = value
				}
			}

			if (!headerDone) {
				headers = line
			} else {
				res[parseInt(id!, 10) - 1] = objectRemap(line, (v, idx: number) => {
					return {
						key: headers[idx] as string,
						value: v
					}
				})
			}


			headerDone = true
		}

		return CSV.stringify(headers, res)
	}

	private static getRef(refs: Tag, id: string | number): string {
		if (typeof id === 'string') {
			id = parseInt(id, 10)
		}

		return ((refs.childs![id] as Tag)!.childs![0] as Tag)!.childs![0] as string
	}
}
