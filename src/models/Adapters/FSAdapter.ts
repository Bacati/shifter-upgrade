/* eslint-disable @typescript-eslint/no-unused-vars */
import { objectLoop } from '@dzeio/object-util'
import archiver from 'archiver'
import type Schema from 'libs/Schema'
import type { Model, ModelInfer } from 'libs/Schema'
import type SchemaBuffer from 'libs/Schema/Items/SchemaBuffer'
import type SchemaNumber from 'libs/Schema/Items/SchemaNumber'
import type SchemaString from 'libs/Schema/Items/SchemaString'
import fileSystem from 'node:fs'
import fs from 'node:fs/promises'
import type { Query } from '../Query'
import type DaoAdapter from './DaoAdapter'
import type { DBPull } from './DaoAdapter'

interface FS extends Model {
	filename: SchemaString
	path: SchemaString
	// eslint-disable-next-line no-undef
	data: SchemaBuffer
	type: SchemaString
	size: SchemaNumber
}

export default class FSAdapter<T extends FS> implements DaoAdapter<Schema<T>> {

	public constructor(
		public readonly schema: Schema<T>,
		public readonly basePath: string
	) {
		if (basePath.endsWith('/')) {
			console.warn('the base path should not end wiath a "/", removing it')
			basePath = basePath.slice(0, basePath.lastIndexOf('/'))
		}
	}

	// TODO: make it clearer what it does
	public async create(obj: Partial<ModelInfer<T>>): Promise<ModelInfer<T> | null> {
		const realPath = this.getFullPath(obj.path!)

		const finalFolder = realPath.slice(0, realPath.lastIndexOf('/'))

		console.log('making the directory', finalFolder)
		await fs.mkdir(finalFolder, { recursive: true })

		if (obj.type === 'file') {
			console.log('getting the data', finalFolder)
			const data = obj.data

			console.log('writing to', realPath)
			if ((data as any) instanceof Buffer) {
				await fs.writeFile(realPath, data as Buffer)
			} else {
				await fs.writeFile(realPath, data as string)
			}
			return obj as ModelInfer<T>
		}

		console.log('making the final directory', realPath)
		await fs.mkdir(realPath)
		return obj as ModelInfer<T>
	}

	public async createZippedBufferFromDirectory(directoryPath: string) {
		const archive = archiver('zip', {zlib: {level: 9}})
		archive.on('error', (err) => {
			throw err
		})
		archive.on('warning', (err) => {
			if (err.code === 'ENOENT') {
				console.log('warning: ', err)
			} else {
				throw err
			}
		})
		const fileName = `${this.basePath}/zip/${directoryPath.split(this.basePath)[1]}.zip`
		fs.mkdir(fileName.slice(0, fileName.lastIndexOf('/')), {recursive: true})
		const output = fileSystem.createWriteStream(fileName)
		archive.pipe(output)
		archive.directory(directoryPath, false)

		const timeout = (cb: (value: (value: unknown) => void) => void, interval: number) => () =>
			new Promise((resolve) => {
				setTimeout(() => cb(resolve), interval)
			})
		const onTimeout = (seconds: number) => timeout((resolve) =>
			resolve(`Timed out while zipping ${directoryPath}`), seconds * 1000)()
		const error = await Promise.race([archive.finalize(), onTimeout(60)])
		if (typeof error === 'string') {
			console.log('Error:', error)
			return null
		}
		return await fs.readFile(fileName)
	}

	// eslint-disable-next-line complexity
	public async read(query?: Query<ModelInfer<T>> | undefined): Promise<DBPull<Schema<T>>> {

		const localPath = query?.path as string ?? ''

		const realPath = this.getFullPath(localPath)

		console.log('get the full path', realPath)

		try {
			const stats = await fs.stat(realPath)

			const files: Array<ModelInfer<T>> = []
			if (stats.isDirectory()) {
				const dirFiles = await fs.readdir(realPath)
				// eslint-disable-next-line max-depth
				// if (toZip === true) { // put queried file/folder in a zip file
				// 	const buffer = await this.createZippedBufferFromDirectory(realPath)
				// 	// eslint-disable-next-line max-depth
				// 	if (buffer !== null) {
				// 		files.push({
				// 			path: localPath,
				// 			filename: localPath.slice(localPath.lastIndexOf('/') + 1),
				// 			data: buffer,
				// 			type: 'file',
				// 			size: buffer.length,
				// 		} as ModelInfer<T>)
				// 	}
				// } else { // return every sub files
				for await (const file of dirFiles) {
					files.push(await this.readFile(`${localPath}/${file}`))
				}
				// }
			} else {
				files.push(await this.readFile(localPath))
			}

			const pageLimit = query?.$limit ?? Infinity
			const pageOffset = query?.$offset ?? 0
			return {
				rows: files.length,
				rowsTotal: files.length,
				page: Math.floor(pageOffset / pageLimit),
				pageTotal: Math.max(1, Math.ceil(files.length / pageLimit)),
				data: files.slice(pageOffset, pageOffset + pageLimit)
			}
		} catch {
			return {
				rows: 0,
				rowsTotal: 0,
				page: 0,
				pageTotal: 0,
				data: []
			}
		}
	}

	public async update(_obj: ModelInfer<T>): Promise<ModelInfer<T> | null> {
		throw new Error('not implemented')
	}

	public async patch(_id: string, _obj: Partial<ModelInfer<T>>): Promise<ModelInfer<T> | null> {
		throw new Error('not implemented')

	}

	public async delete(obj: ModelInfer<T>): Promise<boolean> {
		const localPath = obj?.path as string ?? ''
		const realPath = this.getFullPath(localPath)

		try {
			const stats = await fs.stat(realPath)
			if (!stats) {
				return false
			}
			fs.rm(realPath, { recursive: true, force: true })
			return true
		} catch {
			console.error('Could not remove file', localPath)
			return false
		}
	}

	private getFullPath(localPath?: string): string {
		if (localPath && !localPath?.startsWith('/')) {
			console.warn('Your path should start with a "/", adding it')
			localPath = (`/${localPath}`)
		}

		let realPath = this.basePath + (localPath ? localPath : '')

		if (realPath.includes('\\')) {
			realPath = realPath.replace(/\\/g, '/')
		}

		return realPath
	}

	private async readFile(localPath: string): Promise<ModelInfer<T>> {

		const path = this.getFullPath(localPath)
		console.log('reading file at', path)
		const stats = await fs.stat(path)
		const type = stats.isFile() ? 'file' : 'directory'
		console.log('file is a', type)

		const obj: ModelInfer<T> = {
			path: localPath,
			filename: localPath.slice(localPath.lastIndexOf('/') + 1),
			data: type === 'file' ? await fs.readFile(path) : '',
			type: type,
			size: stats.size
		} as any

		objectLoop(this.schema.model, (item, key) => {
			if (item.attributes.includes('db:created')) {
				// @ts-expect-error things get validated anyway
				obj[key] = stats.ctime
			} else if (item.attributes.includes('db:updated')) {
				// @ts-expect-error things get validated anyway
				obj[key] = stats.mtime
			}
		})

		return obj
	}
}
