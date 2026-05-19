type Fn<T extends HTMLElement> = (el: Component<T>) => void | Promise<void>

/**
 * Component client side initialisation class
 */
export default class Component<T extends HTMLElement> {
	private constructor(public element: T) {}

	public handled(value: boolean): this
	public handled(): boolean
	public handled(value?: boolean): this | boolean {
		if (typeof value === 'undefined') {
			return typeof this.element.dataset.handled === 'string'
		}
		this.element.dataset.handled = ''
		return this
	}

	public init(fn: (el: Component<T>) => void | Promise<void>) {
		if (this.handled()) {
			return
		}
		fn(this)
		this.handled(true)
	}

	public child<El extends HTMLElement>(query: string, fn: Fn<El>) {
		this.element.querySelectorAll<El>(query).forEach((it) => {
			const cp = new Component(it)
			cp.init(fn)
		})
	}

	/**
	 * start handling an element
	 * @param query the query to get the element
	 * @param fn the function that is run ONCE per elements
	 */
	public static handle<T extends HTMLElement>(query: string, fn: (el: T) => void | Promise<void>) {
		document.querySelectorAll<T>(query).forEach((it) => {
			const cp = new Component(it)
			cp.init((it) => fn(it.element))
		})
		document.addEventListener('astro:page-load', () => {
			document.querySelectorAll<T>(query).forEach((it) => {
				const cp = new Component(it)
				cp.init((it) => fn(it.element))
			})
		})
	}
}
