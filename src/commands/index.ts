import fs from "node:fs/promises"

interface Context {
	args: Array<string>
	commands: Array<Command>
	command: string
}

interface Response {
	code: number
}

export interface Command {
	run(input: Context): Promise<Response> | Response
	name: string
	description?: string
}

const builtinCommands: Array<Command> = [
	{
		name: "help",
		run({ commands }) {
			console.table(
				commands.map((command) => ({
					name: command.name,
					description: command.description ?? "no description",
				})),
			);
			return {
				code: 0,
			};
		},
	},
];

async function createContext(): Promise<Context> {
	const ctx = {
		args: process.argv.slice(3),
		commands: await getCommands(),
		command: process.argv[2] ?? "help",
	};
	return ctx
}

async function listfiles(folder: string): Promise<Array<string>> {
	const files = await fs.readdir(folder)
	const res: Array<string> = [];
	for (const file of files) {
		const path = `${folder}/${file}`
		if ((await fs.stat(path)).isDirectory()) {
			res.push(...(await listfiles(path)))
		} else {
			res.push(path)
		}
	}
	return res
}

async function getCommands(): Promise<Array<Command>> {
	const files = (await listfiles(__dirname))
		.filter((it) => it !== `${__dirname}/index.ts`)
		.map((it) => import(it).then((it) => it.default))
	return builtinCommands.concat(await Promise.all(files))
}

;(async () => {
	const context = await createContext()
	for (const command of context.commands) {
		if (command.name === context.command) {
			const res = await command.run(context)
			process.exit(res.code)
		}
	}

	console.log(
		`command "${context.command}" not found, please use "help" to get the list of commands`,
	)
})()
