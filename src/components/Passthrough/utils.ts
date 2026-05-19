/**
 * note: you MUST only pass simple items that can go in JSON format natively
 */
export function load<T extends {} = {}>(): T {
	const tag = document.querySelector<HTMLScriptElement>('#ASTRO_DATA')
	if (!tag) {
		throw new Error('could not load client variables, tag not found')
	}
	return JSON.parse(tag.innerText)
}
