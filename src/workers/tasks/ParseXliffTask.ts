import { BaseWorkerTask } from '../WorkerTask'

export interface ParseXliffTaskData {
	filePath: string
	packagePath: string
	basePath: string
}

export interface ParseXliffTaskResult {
	transUnits: Array<{
		id: string
		source: string
		target?: string
		position: {
			line: number
			character: number
		}
		language: string
		sourcePath: string
		uri: string
	}>
	metadata: {
		packagePath: string
		basePath: string
		language: string
		sourceParts: string[]
		filePath: string
		uri: string
		parseTime: number
	}
}

export class ParseXliffTask extends BaseWorkerTask<ParseXliffTaskData, ParseXliffTaskResult> {
	constructor(data: ParseXliffTaskData, options?: {
		priority?: 'low' | 'normal' | 'high'
		timeout?: number
		retryAttempts?: number
	}) {
		super('parse-xliff', data, options)
	}
}