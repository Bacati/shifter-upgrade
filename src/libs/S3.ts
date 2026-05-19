import type { APIRoute } from 'astro'
import fs from 'node:fs/promises'
import ResponseBuilder from './ResponseBuilder'


/**
 * Easily setup an S3 system right in your own API
 *
 * ex: (create a `[...path].ts` file and put this inside)
 * ```
 * import S3 from 'libs/S3'
 *
 * // root path of the storage
 * const s3 = new S3('./.data')
 *
 * export const GET = s3.GET
 * export const PUT = s3.PUT
 * export const DELETE = s3.DELETE
 * ```
 */
export default class S3 {
	public constructor(
		private readonly rootPath: string
	) {}

	public async getFile(path: string): Promise<Buffer> {
		return fs.readFile(this.getFullPath(path))
	}

	public async putFile(path: string, data: Buffer, overwrite = false): Promise<boolean> {
		const fullPath = this.getFullPath(path)
		if (!overwrite && await this.exists(fullPath)) {
			return false
		}

		const folder = fullPath.slice(0, fullPath.lastIndexOf('/'))
		await fs.mkdir(folder, { recursive: true })

		await fs.writeFile(this.getFullPath(path), data)

		return true
	}

	public async deleteFile(path: string): Promise<boolean> {
		await fs.rm(this.getFullPath(path))
		return true
	}

	public GET: APIRoute = async (ctx) => {
		const path = ctx.params.path!
		const file = await this.getFile(path)

		return new ResponseBuilder()
			.body(file)
			.addHeader('Content-Disposition', `attachment; filename="${path}"`)
			.status(200)
			.build()
	}

	public PUT: APIRoute = async (ctx) => {
		const path = ctx.params.path!
		const data = await ctx.request.arrayBuffer()
		const bfr = Buffer.from(data)
		const ok = await this.putFile(path, bfr)

		return new ResponseBuilder()
			.body({
				path: path,
				size: bfr.byteLength
			})
			.status(ok ? 201 : 400)
			.build()
	}

	public DELETE: APIRoute = async (ctx) => {
		const path = ctx.params.path!

		await this.deleteFile(path)

		return new ResponseBuilder()
			.status(200)
			.build()
	}

	private async exists(path: string): Promise<boolean> {
		try {
			await fs.stat(path)
			return true
		} catch {
			return false
		}
	}

	private getFullPath(path: string): string {
		return this.rootPath + '/' + path
	}
}
