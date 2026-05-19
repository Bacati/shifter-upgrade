import { objectMap } from '@dzeio/object-util'
import xml2js from 'xml2js'

export interface Attribute {
	key: string
	value: string
}

export interface Tag {

	/**
	 * the name of the tag
	 */
	name: string

	/**
	 * The tag attributes
	 */
	attrs?: Array<Attribute | undefined>

	/**
	 * The tag childs
	 */
	childs?: Array<Tag | string | undefined>
}

/**
 * xml2js tag interface not published for our options
 */
interface xml2jsTag {
	/**
	 * the name of the tag (it is a private value because of our integration, but we still want to get it)
	*/
	// @ts-ignore see above
	// #name: string
	/**
	 * the attributes record
	 */
	$?: Record<string, string>

	/**
	 * the possible text (only when #name === __text__)
	 */
	_?: string

	/**
	 * the tag Childs
	 */
	$$?: Array<xml2jsTag>
}

export interface XMLOptions {

	/**
	 * if set (min: `true`)
	 * it will render the content in a user readable form
	 * (should not break compatibility (ODT excluded))
	 */
	pretty?: boolean | {

		/**
		 * the whitespace character(s)
		 * default: '\t'
		 */
		whitespaceCharacter?: string

		/**
		 * the base number of whitespace character to use
		 * default: 0
		 */
		baseCount?: number
	}
}

/**
 * XML, the XML parser/stringifier that keep everything in order !
 */
export default class XML {

	/**
	 * Parse XML content to xml Tags
	 * @param str the XML string
	 */
	public static async parse(str: string): Promise<Tag> {
		const xml: xml2jsTag = await xml2js.parseStringPromise(str, {
			charsAsChildren: true,
			explicitChildren: true,
			explicitRoot: false,

			preserveChildrenOrder: true
		})
		return this.convert(xml)
	}

	public static getAttribute(tag: Tag, key: string): string | undefined {
		if (!tag.attrs || tag.attrs.length === 0) {
			return undefined
		}
		return (tag.attrs.find((it) => it?.key === key))?.value
	}

	/**
	 * Transform the Parsed XML back to XML
	 * @param tag the root tag
	 * @param options the options used
	 */
	public static async stringify(tag: Tag, options?: XMLOptions): Promise<string> {
		return this.stringifySync(tag, options)
	}

	/**
	 * Transform the Parsed XML back to XML
	 * @param tag the root tag
	 * @param options the options used
	 */
	public static stringifySync(tag: Tag, options?: XMLOptions): string {
		const pretty = !!options?.pretty
		const baseCount = (typeof options?.pretty === 'object' && options?.pretty?.baseCount) || 0
		const whitespaceCharacter = (typeof options?.pretty === 'object' && options?.pretty?.whitespaceCharacter) || '\t'
		const hasChilds = Array.isArray(tag.childs) && tag.childs.length > 0
		let base = options?.pretty ? ''.padEnd(baseCount, whitespaceCharacter) : ''

		if (!tag.name) {
			throw new Error('Tag name MUST be set')
		} else if (tag.name.includes(' ')) {
			throw new Error(`The tag name MUST not include spaces (${tag.name})`)
		}

		// start of tag
		base += `<${tag.name}`

		// add every attributes
		if (tag.attrs) {
			for (const attr of tag.attrs) {
				if (typeof attr === 'undefined') {
					continue
				}
				base += ` ${attr.key}`
				if (typeof attr.value === 'string') {
					base += `="${this.escape(attr.value)}"`
				}
			}
		}

		// end of tag
		base += hasChilds ? '>' : '/>'

		if (options?.pretty) {
			base += '\n'
		}

		// process childs
		if (hasChilds) {
			for (const subTag of tag.childs!) {
				if (typeof subTag === 'undefined') {
					continue
				}
				if (typeof subTag === 'string') {
					if (pretty) {
						base += ''.padEnd(baseCount + 1, whitespaceCharacter)
					}
					base += this.escape(subTag)
					if (pretty) {
						base += '\n'
					}
				} else {
					base += this.stringifySync(subTag, pretty ? { pretty: { baseCount: baseCount + 1, whitespaceCharacter } } : undefined)
				}
			}
		}

		// end of tag
		if (hasChilds) {
			if (pretty) {
				base += ''.padEnd(baseCount, whitespaceCharacter)
			}
			base += `</${tag.name}>`
			if (pretty) {
				base += '\n'
			}
		}
		return base
	}

	/**
	 *
	 * @param it the element to validate
	 * @returns {boolean} if {it} is of type {@link Tag}
	 */
	public static isTag(it: any): it is Tag {
		if (typeof it === 'object') {
			return 'name' in it
		}
		return false
	}

	public static findChild(tag: Tag, name: string): Tag | null {
		if (tag.name === name) {
			return tag
		} else if (tag.childs) {
			for (const child of tag.childs) {
				if (typeof child !== 'object') {
					continue
				}
				const found = this.findChild(child, name)
				if (found) {
					return found
				}
			}
		}
		return null
	}

	/**
	 * Convert a xml2js tag to a XML.Tag
	 * @param {xml2jsTag} tag the xml2js tag
	 * @returns {Tag} the XML Tag
	 */
	private static convert(tag: xml2jsTag): Tag {
		const baseTag: Tag = {
			name: tag['#name']
		}

		// convert XML2JS attributes to our attribut format
		// (Allowing users to keep order and to add items not only at the bottom)
		if (tag.$) {
			baseTag.attrs = objectMap(tag.$, (v, k) => ({ key: k, value: v }))
		}

		// convert childs
		if (tag.$$) {
			baseTag.childs = tag.$$
				.map((subTag) => {
					// if child is a string
					if (subTag['#name'] === '__text__') {
						return subTag._
					}

					// convert child
					return this.convert(subTag)
				})
				// filter empty items
				.filter((v) => !!v)
		}
		return baseTag
	}

	/**
	 * Escape every XML characters
	 * @param str the base string
	 * @returns {string} the escaped string
	 */
	private static escape(str: string): string {
		return str
			.replace(/&/gu, '&amp;')
			.replace(/"/gu, '&quot;')
			.replace(/'/gu, '&apos;')
			.replace(/</gu, '&lt;')
			.replace(/>/gu, '&gt;')
	}

}
