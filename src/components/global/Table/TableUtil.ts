import type Props from './TableProps'

export function updateTable(comp: HTMLTableElement, data: Props, options?: {
	keepHeaders?: boolean
	keepData?: boolean
}) {
	const head = comp.querySelector('thead > tr')
	const body = comp.querySelector('tbody')

	if (!head || !body) {
		console.error('could not update table')
		return
	}

	const curHeaders = head.querySelectorAll('th')
	const newHeaders = data.header ?? []
	const headersLength = Math.max(newHeaders.length, curHeaders?.length ?? 0)

	for (let headerIdx = 0; headerIdx < headersLength; headerIdx++) {
		const headerHTML = curHeaders[headerIdx]
		const headerContent = newHeaders[headerIdx]
		// new el, add it
		if (!headerHTML) {
			const el = document.createElement('th')
			el.innerText = headerContent as string
			el.dataset.idx = headerIdx.toString()
			head.appendChild(el)
		// header too large, remove
		} else if (!headerContent && !options?.keepHeaders) {
			head.removeChild(headerHTML)
		// replace content
		} else if(!options?.keepHeaders) {
			headerHTML.innerText = (headerContent ?? '').toString()
		}
	}

	const curBody = body.querySelectorAll('tr')
	const newBody = data.data ?? []
	const bodyLength = Math.max(newBody.length, curBody.length ?? 0)

	for (let bodyRowIdx = 0; bodyRowIdx < bodyLength; bodyRowIdx++) {
		const bodyRowHTML = curBody[bodyRowIdx]
		const bodyRowContent = newBody[bodyRowIdx]
		// new el, add it
		if (!bodyRowHTML) {
			const row = document.createElement('tr')
			row.dataset.row = bodyRowIdx.toString()
			for (let cellIdx = 0; cellIdx < (bodyRowContent as Array<string>).length; cellIdx++) {
				const cellContent = (bodyRowContent as Array<string>)[cellIdx] as string
				const cell = document.createElement('td')
				cell.dataset.cell = cellIdx.toString()
				cell.innerText = cellContent
				row.appendChild(cell)
			}
			body.appendChild(row)
		// body too large, remove row
		} else if (!bodyRowContent) {
			body.removeChild(bodyRowHTML)
		// replace row
		} else {
			const bodyRowHTML = curBody[bodyRowIdx] as HTMLTableRowElement
			const cells = bodyRowHTML!.querySelectorAll('td')
			const cellLength = Math.max(cells.length, bodyRowContent.length)
			for (let cellIdx = 0; cellIdx < cellLength; cellIdx++) {
				const currCell = cells[cellIdx];
				const newCell = bodyRowContent[cellIdx];
				// new el, add it
				if (!currCell) {
					const el = document.createElement('td')
					el.dataset.cell = cellIdx.toString()
					el.innerText = newCell as string
					bodyRowHTML.appendChild(el)
				// header too large, remove
				} else if (!newCell && !options?.keepData) {
					bodyRowHTML.removeChild(currCell)
				// replace content
				} else if(!options?.keepData) {
					currCell.innerText = (newCell ?? '').toString()
				}
			}
		}
	}
}

export function setOnTableClick(table: HTMLTableElement, fn: (row: number, cell: number) => void | Promise<void>) {
	table.querySelector('tbody')?.classList?.add('hover:cursor-pointer')
	table.querySelectorAll<HTMLTableCellElement>('td').forEach((it) => {
		it.addEventListener('click', () => {
			const row = it.parentElement as HTMLTableRowElement
			const rowIdx = Number.parseInt(row.dataset.row as string)
			const cellIdx = Number.parseInt(it.dataset.cell as string)
			fn(rowIdx, cellIdx)
		})
	})
}
