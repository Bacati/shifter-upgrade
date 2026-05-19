import nodemailer from 'nodemailer'
import type NodeMailer from 'nodemailer/lib/mailer'

/**
 * Environment variables used
 * EMAIL_USERNAME
 * EMAIL_PASSWORD
 * EMAIL_HOST
 * EMAIL_FROM
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export default class Mailer<Templates extends Record<string, Record<string, any>> = {}> {
	public constructor(
		private fetcher: (template: keyof Templates, ext: 'html' | 'txt') => Promise<{
			content: string
			title: string
		} | null>, private settings: {
			username: string
			password: string
			host: string
			from: string
			secure?: boolean
			tls?: boolean
		}) {}

	/**
	 * Send the Email
	 * @param template the Template to use
	 * @param to the destination Email
	 * @param vars variables of the email, don't give subject as it is added inside the function
	 * @param options Email options
	 */
	public async send<T extends keyof Templates>(template: T, to: string | Array<string>, vars: Templates[T], options?: Omit<NodeMailer.Options, 'to' | 'from' | 'subject' | 'html' | 'text'>) {
		const mailer = nodemailer.createTransport({
			host: this.settings.host,
			auth: {
				user: this.settings.username,
				pass: this.settings.password
			},
			logger: true,
			secure: true
		})
		const { title } = await this.fetcher(template, 'txt') ?? { title: '' }
		await mailer.sendMail(Object.assign(options ?? {}, {
			to,
			from: this.settings.from,
			subject: title,
			html: await this.html(template, { ...vars, subject: title }),
			text: await this.text(template, { ...vars, subject: title })
		}))
	}

	public html<T extends keyof Templates>(template: T, vars: Templates[T]) {
		return this.generateTemplate(template, vars, 'html')
	}

	public text<T extends keyof Templates>(template: T, vars: Templates[T]) {
		return this.generateTemplate(template, vars, 'txt')
	}

	private async generateTemplate<T extends keyof Templates>(template: T, _vars: Templates[T], ext: 'html' | 'txt') {
		try {
			const txt = await this.fetcher(template, ext)
			if (!txt) {
				console.warn(`Error, Template not found (${template as string} - ${ext})`)
				return undefined
			}
			return txt.content
		} catch {
			console.warn(`Error, Template not found (${template as string} - ${ext})`)
			return undefined
		}
	}
}
