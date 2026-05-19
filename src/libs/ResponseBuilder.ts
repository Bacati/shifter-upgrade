import { objectLoop } from '@dzeio/object-util'
import StatusCode from './HTTP/StatusCode'

/**
 * Simple builde to create a new Response object
 */
export default class ResponseBuilder {
	public static redirect(location: string, statusCode: number = StatusCode.FOUND) {
		const resp = new ResponseBuilder()
		resp.addHeader('Location', location)
		resp.status(statusCode)
		return resp.build()
	}

	private _body: BodyInit | null | undefined
	public body(body: string | Buffer | object | null | undefined) {
		if (typeof body === 'object' && !(body instanceof Buffer)) {
			this._body = JSON.stringify(body)
			this.addHeader('Content-Type', 'application/json')
		} else if (body instanceof Buffer) {
			this._body = body.toString()
		} else {
			this._body = body
		}
		return this
	}

	private _headers: Record<string, string> = {}
	public headers(headers: Record<string, string>) {
		this._headers = headers
		return this
	}

	public addHeader(key: string, value: string) {
		this._headers[key] = value
		return this
	}

	public addHeaders(headers: Record<string, string>) {
		objectLoop(headers, (value, key) => {
			this.addHeader(key, value)
		})
		return this
	}

	public removeHeader(key: string) {
		delete this._headers[key]
		return this
	}

	private _status?: number
	public status(status: StatusCode | number) {
		this._status = status
		return this
	}

	public build(): Response {
		const init: ResponseInit = {
			headers: this._headers
		}
		if (this._status) {
			init.status = this._status
		}
		return new Response(this._body, init)
	}
}
