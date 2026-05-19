import { objectFind } from '@dzeio/object-util'
import Imap from 'imap'
import { getEnv, requireEnv } from 'libs/Env'
import nodemailer from 'nodemailer'
import type Mail from 'nodemailer/lib/mailer'
import Email from './Email'
import htmlEmail from './HTML'

export default class EmailServer {
	private static instances: Record<string, EmailServer> = {}

	public debug: boolean

	private currentBox: Imap.Box | null = null

	private imap: Imap

	private smtp: nodemailer.Transporter

	private readonly config: {
		imap: {
			host: string
			port: number
			tls: boolean
			username: string
		}
		smtp: {
			host: string
			port: number
			secure: boolean
			username: string
		}
	}

	private constructor(
		private username: string,
		password: string,
		initConfig?: {
			auth?: {
				username: string
				password: string
			}
			imap?: {
				host: string
				port?: number
				tls?: boolean
				username?: string
				password?: string
			}
			smtp?: {
				host: string
				port?: number
				secure?: boolean
				username?: string
				password?: string
			},
			debug?: boolean
		}
	) {
		this.debug = initConfig?.debug ?? getEnv('EMAIL_DEBUG', 'false') === 'true'

		this.config = {
			imap: {
				host: initConfig?.imap?.host ?? requireEnv('IMAP_HOST'),
				port: initConfig?.imap?.port ?? Number.parseInt(getEnv('IMAP_PORT', '993'), 10),
				tls: initConfig?.imap?.tls ?? !!getEnv('IMAP_SECURE'),
				username: initConfig?.imap?.username ?? initConfig?.auth?.username ?? username
			},
			smtp: {
				host: initConfig?.smtp?.host ?? requireEnv('SMTP_HOST'),
				port: initConfig?.smtp?.port ?? Number.parseInt(getEnv('SMTP_PORT', '465'), 10),
				secure: initConfig?.smtp?.secure ?? !!getEnv('SMTP_SECURE'),
				username: initConfig?.smtp?.username ?? initConfig?.auth?.username ?? username
			}
		}

		EmailServer.instances[username] = this

		this.imap = new Imap({
			user: this.config.imap.username,
			password: initConfig?.imap?.password ?? initConfig?.auth?.password ?? password,
			host: this.config.imap.host,
			port: this.config.imap.port,
			tls: this.config.imap.tls,
			debug: (info: string) => {
				if (this.debug) {
					console.log('IMAP[DEBUG]:', info)
				}
			}
		})

		// biome-ignore lint/suspicious/noExplicitAny: library return `any`
		const smtpLogger = (level: string) => (...params: Array<any>) => {
			if (this.debug) {
				console.log(`SMTP[${level}]:`, ...params)
			}
		}

		this.smtp = nodemailer.createTransport({
			host: this.config.smtp.host,
			port: this.config.smtp.port,
			secure: this.config.smtp.secure,
			auth: {
				user: this.config.smtp.username,
				pass: initConfig?.smtp?.password ?? initConfig?.auth?.password ?? password
			},
			logger: {
				level: (level: string) => {
					if (this.debug) {
						console.log('SMTP[]:', level)
					}
				},
				trace: smtpLogger('TRACE'),
				debug: smtpLogger('DEBUG'),
				info: smtpLogger('INFO'),
				warn: smtpLogger('WARN'),
				error: smtpLogger('ERROR'),
				fatal: smtpLogger('FATAL'),
			}
		})
	}

	public static async getInstance(type: 'credo' | 'gti') {
		const items = {
			credo: {
				username: requireEnv('CREDO_MAIL_USER'),
				password: requireEnv('CREDO_MAIL_PASS'),
			},
			gti: {
				username: requireEnv('GTI_MAIL_USER'),
				password: requireEnv('GTI_MAIL_PASS'),
			}
		} as const
		const correct = items[type]
		const tmp = objectFind(EmailServer.instances, (_, key) => key === type)
		let instance = tmp?.value ?? undefined

		if (!instance) {
			instance = new EmailServer(correct.username, correct.password)
			EmailServer.instances[type] = instance
			await instance.connect()
		}

		return instance
	}

	public destroy() {
		delete EmailServer.instances[this.username]
		this.imap.end()
	}

	public listEmails(): Promise<Array<Email>> {
		return new Promise((res, rej) => {
			this.imap.search(['ALL'], (err, uids) => {
				if (err) {
					rej(err)
					return
				}
				res(uids.map((uid) => this.getEmail(uid)))
			})
		})
	}

	public getEmail(id: number) {
		if (!this.currentBox) {
			throw new Error('can\'t fetch a mail while out of a box')
		}
		return new Email(this.imap, this.currentBox, id)
	}

	/**
	 *
	 * @param content the email text content
	 * @param recipient the email recipient (who to send it to)
	 * @param subject the email subject
	 * @param footer the email footer
	 */
	// eslint-disable-next-line complexity
	public async sendEmail(content: string, recipient: string | Array<string>, subject: string, footer?: {path?: string, id?: string}, options: Mail.Options = {}) {
		if (typeof recipient !== 'string' && recipient.length === 0) {
			if (this.debug) {
				console.log('Email canceled, no recipient')
			}
			return
		}
		const domain = requireEnv('APP_URL')
		const footerTxt = `\nIdentifiant de conversation: {{${footer?.id}}}

${footer?.path ? `Votre lien vers le site internet: https://${domain}${footer?.path}` : '' }`

		const req: Mail.Options = Object.assign({
			bcc: recipient,
			from: getEnv('SMTP_FROM') ?? this.username,
			subject,
			text: content + (footer ? footerTxt : ''),
			html: footer ? htmlEmail(content, footer?.id, footer?.path ? `${domain}${footer?.path}` : undefined) : undefined
		}, options)

		if (this.debug) {
			console.log('------------------- SEND EMAIL DEBUG -------------------')
			console.log(req)
			console.log('------------------- SEND EMAIL DEBUG -------------------')
		} else {
			const res = await this.smtp.sendMail(req)
			if (this.debug) {
				console.log('------------------- SENT EMAIL DEBUG -------------------')
				console.log(res)
				console.log('------------------- SENT EMAIL DEBUG -------------------')
			}
		}
	}

	private connect() {
		console.log('Starting connection to IMAP')
		return new Promise<void>((res, rej) => {
			this.imap.once('ready', () => {
				console.log('connection to IMAP ready, opening box')
				this.imap.openBox(requireEnv('IMAP_INBOX', 'INBOX'), true, (err, box) => {
					if (err) {
						rej(err)
						return
					}
					this.currentBox = box
					console.log('inbox open, ready for queries!')
					res()
				})
			}).once('error', (err: Error) => {
				console.log('An error occured while connecting to the IMAP server', this.config.imap)
				rej(err)
			})
			this.imap.connect()
		})
	}
}
