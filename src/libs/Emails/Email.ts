import type { ImapMessageAttributes } from 'imap'
import Imap from 'imap'

interface EmailAddress {
	name?: string
	address: string
}

interface Headers {
	to: Array<EmailAddress>
	from: EmailAddress
	date: Date
	subject: string
}

export default class Email {
	public constructor(
		private imap: Imap,
		private mailbox: Imap.Box,
		public readonly id: number
	) {}

	public async getAttributes(): Promise<ImapMessageAttributes | Array<ImapMessageAttributes>> {
		return new Promise<ImapMessageAttributes | Array<ImapMessageAttributes>>((res) => {
			this.imap.fetch(this.id, {
				bodies: [],
				struct: true
			}).on('message', (msg) => msg.on('attributes', (attrs) => {
				res(attrs.struct as Array<ImapMessageAttributes>)
			}))
		})
	}


	public async getFlags(): Promise<Array<string>> {

		return new Promise<Array<string>>((res) => {
			this.imap.fetch(this.id, {
				bodies: [],
				struct: false
			}).on('message', (msg) => msg.on('attributes', (attrs) => {
				res(attrs.flags)
			}))
		})
	}

	public async getText() {
		const part = await this.getTextPart()
		if (!part) {
			return ''
		}
		return this.fetchPart(part.partID).then(this.decodeEmail)
	}

	public async isSeen() {
		return this.getFlags().then((arr) => arr.includes('\\Seen'))
	}

	public async setIsSeen(isSeen: boolean): Promise<boolean> {
		console.log(this.mailbox.flags, this.mailbox.permFlags, '\\\\Seen')
		console.log('isSeen', isSeen, await this.isSeen())
		if (await this.isSeen() === isSeen) {
			return isSeen
		}
		if (isSeen) {
			return new Promise<boolean>((res, rej) => {
				this.imap.addFlags(this.id, 'SEEN', (err) => {
					if (err) {
						rej(err)
						return
					}
					res(isSeen)
				})
			})
		}

		return new Promise<boolean>((res, rej) => {
			this.imap.addKeywords(this.id, 'SEEN', (err) => {
				if (err) {
					rej(err)
					return
				}
				res(isSeen)
			})
		})
	}

	public async getHeaders(): Promise<Headers> {
		const req = this.imap.fetch(this.id, {
			bodies: ['HEADER'],
			struct: false
		})
		return new Promise<Headers>((res) => {
			req.on('message', (msg) => msg.on('body', (stream) => {
				let bfr = ''
				stream
					.on('data', (chunk) => bfr += chunk.toString('utf8'))
					.once('end', () => {
						const tmp = Imap.parseHeader(bfr)
						function t(email: string): EmailAddress {
							if (email.includes('<')) {
								const [name, addr] = email.split('<', 2)
								if (!addr || !name) {
									return {
										address: email
									}
								}
								return {
									name,
									address: addr.slice(0, addr.indexOf('>'))
								}
							}
							return {
								address: email
							}
						}
						// console.log(tmp)
						res({
							subject: tmp.subject?.[0] as string,
							to: tmp.to?.map(t) ?? [],
							from: t(tmp.from?.[0] ?? ''),
							date: new Date(tmp.date?.[0] ?? '')
						})
					})
			}))
		})
	}

	/**
	 * hold the attachment ID
	 */
	public async getAttachments(): Promise<Array<any>> {
		return this.getAttachmentParts()
	}

	public async downloadAttachment(attachment: any): Promise<{filename: string, data: Buffer}> {
		const req = this.imap.fetch(this.id, {
			bodies: [attachment.partID],
			struct: true
		})
		return new Promise((res) => {
			req.on('message', (msg) => {
				const filename = attachment.params.name
				const encoding = attachment.encoding
				console.log(filename, encoding, msg)
				let buffer = new Uint8Array(0)
				msg.on('body', (stream) => {
					stream.on('data', (chunk: Buffer) => {
						// merge into one common buffer
						const len = buffer.length + chunk.length
						const merged = new Uint8Array(len)
						merged.set(buffer)
						merged.set(chunk, buffer.length)
						buffer = merged
					}).once('end', () => {
						res({filename, data: Buffer.from(
							Buffer
								.from(buffer)
								.toString('ascii'),
							'base64'
						)})
					})
				}).once('end', () => {
					console.log('ended')
				}).once('error', (err) => {
					console.log(err)
				})
			}).once('error', (err) => {
				console.log(err)
			})
		})
	}

	// this is defined but eslint do not seems to reconize it
	// eslint-disable-next-line no-undef
	private fetchPart(partID: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
		const req = this.imap.fetch(this.id, {
			bodies: partID,
			struct: true
		})
		return new Promise((res) => {
			req.on('message', (msg) => {
				msg.on('body', (strm) => {
					let bfr = ''
					strm.on('data', (chunk: Buffer) => bfr += chunk.toString(encoding))
						.once('end', () => res(bfr))
				})
			})
		})
	}

	private async getTextPart(attrs?: ImapMessageAttributes | Array<ImapMessageAttributes>): Promise<{partID: string} | null> {
		if (!attrs) {
			attrs = await this.getAttributes()
		}
		// @ts-expect-error IMAP does not return the correct type
		for (const item of attrs) {
			if (Array.isArray(item)) {
				return this.getTextPart(item)
			} else if (item.type === 'text' && item.subtype === 'plain') {
				return item
			}
		}
		return null
	}

	private async getAttachmentParts(attrs?: ImapMessageAttributes | Array<ImapMessageAttributes>): Promise<Array<{partID: string}>> {
		if (!attrs) {
			attrs = await this.getAttributes()
		}
		const attachments = []
		for (const item of attrs) {
			if (Array.isArray(item)) {
				attachments.push(...await this.getAttachmentParts(item))
			} else if (item.disposition && ['inline', 'attachment'].indexOf(item.disposition.type.toLowerCase()) > -1) {
				attachments.push(item)
			}

		}
		return attachments
	}

	private decodeEmail(data: string): string {
		// normalise end-of-line signals
		data = data.replace(/(\r\n|\n|\r)/g, '\n')

		// replace equals sign at end-of-line with nothing
		data = data.replace(/=\n/g, '')

		// encoded text might contain percent signs
		// decode each section separately
		const bits = data.split('%')
		for (let idx = 0; idx < bits.length; idx++) {
			let char = bits[idx]
			if (!char) {
				continue
			}

			// replace equals sign with percent sign
			char = char.replace(/=/g, '%')

			// decode the section
			bits[idx] = decodeURIComponent(char)
		}

		// join the sections back together
		return bits.join('%')
	}
}
