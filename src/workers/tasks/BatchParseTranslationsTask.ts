import { BaseWorkerTask } from '../WorkerTask'
import { ParseXliffTaskData } from './ParseXliffTask'

export interface BatchParseTranslationsTaskData {
	packages: Array<{
		packagePath: string
		basePath: string
		translationFilePaths: string[]
	}>
}

export interface BatchParseTranslationsTaskResult {
	results: Array<{
		success: boolean
		filePath: string
		result?: any
		error?: string
	}>
	summary: {
		totalFiles: number
		successfulFiles: number
		failedFiles: number
		totalParseTime: number
	}
}

export class BatchParseTranslationsTask extends BaseWorkerTask<BatchParseTranslationsTaskData, BatchParseTranslationsTaskResult> {
	constructor(data: BatchParseTranslationsTaskData, options?: {
		priority?: 'low' | 'normal' | 'high'
		timeout?: number
		retryAttempts?: number
	}) {
		super('batch-parse-translations', data, options)
	}
}