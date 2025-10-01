import { TaskFactory } from '../WorkerRegistry'
import { BaseWorkerTask } from '../WorkerTask'
import { ParseXliffTask } from '../tasks/ParseXliffTask'
import { BatchParseTranslationsTask } from '../tasks/BatchParseTranslationsTask'

export class TranslationTaskFactory implements TaskFactory {
	createTask(type: string, data: any, options?: any): BaseWorkerTask {
		switch (type) {
			case 'parse-xliff':
				return new ParseXliffTask(data, options)

			case 'batch-parse-translations':
				return new BatchParseTranslationsTask(data, options)

			default:
				throw new Error(`Unknown translation task type: ${type}`)
		}
	}
}