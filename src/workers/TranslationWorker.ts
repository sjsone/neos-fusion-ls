import { XMLParser } from 'fast-xml-parser'
import * as NodeFsPromises from 'fs/promises'
import * as NodePath from 'path'
import { BaseWorker, BaseWorkerData } from './BaseWorker'
import { BatchParseTranslationsTask, BatchParseTranslationsTaskData, BatchParseTranslationsTaskResult } from './tasks/BatchParseTranslationsTask'
import { ParseXliffTask, ParseXliffTaskData, ParseXliffTaskResult } from './tasks/ParseXliffTask'
import { BaseWorkerTask } from './WorkerTask'

interface XLIFFTransUnit {
	source: string
	target?: string
	'@_id': string
}

interface XLIFFData {
	file: {
		body: {
			["trans-unit"]: XLIFFTransUnit | XLIFFTransUnit[]
		}
	}
}

export class TranslationWorker extends BaseWorker {
	private static xmlParser = new XMLParser({ ignoreAttributes: false })

	constructor(data?: BaseWorkerData['config']) {
		super('translation', data)
	}

	public async processTask(task: BaseWorkerTask): Promise<any> {
		if (task instanceof ParseXliffTask) {
			return await this.parseXliffFile(task.data)
		}

		if (task instanceof BatchParseTranslationsTask) {
			return await this.batchParseTranslations(task.data)
		}

		throw new Error(`Unknown task type: ${task.type}`)
	}

	protected async parseXliffFile(data: ParseXliffTaskData): Promise<ParseXliffTaskResult> {
		const startTime = Date.now()
		this.logDebug(`Parsing XLIFF file: ${data.filePath}`)

		try {
			// Read file
			const xmlTextBuffer = await NodeFsPromises.readFile(data.filePath)
			const xmlText = xmlTextBuffer.toString()

			// Parse XML
			const parsedData = TranslationWorker.xmlParser.parse(xmlTextBuffer) as { xliff: XLIFFData }

			// Extract path information
			const relativePath = NodePath.relative(data.basePath, data.filePath)
			const sourceParts = relativePath.split(NodePath.sep)
			const language = sourceParts.shift()!
			const translationFileName = sourceParts.pop()!
			sourceParts.push(NodePath.parse(translationFileName).name)

			const sourcePath = `${NodePath.basename(data.packagePath)}:${sourceParts.join('.')}`
			const uri = `file://${data.filePath}`

			// Extract trans-units
			const transUnits = this.extractTransUnits(parsedData, xmlText, uri, language, sourcePath)

			const parseTime = Date.now() - startTime

			this.logDebug(`Parsed ${transUnits.length} translation units from ${data.filePath} in ${parseTime}ms`)

			return {
				transUnits,
				metadata: {
					packagePath: data.packagePath,
					basePath: data.basePath,
					language,
					sourceParts,
					filePath: data.filePath,
					uri,
					parseTime
				}
			}

		} catch (error) {
			this.logError(`Failed to parse XLIFF file ${data.filePath}:`, error)
			throw error
		}
	}

	protected async batchParseTranslations(data: BatchParseTranslationsTaskData): Promise<BatchParseTranslationsTaskResult> {
		const startTime = Date.now()
		this.logInfo(`Batch parsing translations for ${data.packages.length} packages`)

		const results = []
		let totalFiles = 0
		let successfulFiles = 0

		for (const pkg of data.packages) {
			this.logDebug(`Processing package ${pkg.packagePath} with ${pkg.translationFilePaths.length} files`)

			for (const filePath of pkg.translationFilePaths) {
				totalFiles++

				try {
					const taskData: ParseXliffTaskData = {
						filePath,
						packagePath: pkg.packagePath,
						basePath: pkg.basePath
					}

					const result = await this.parseXliffFile(taskData)
					successfulFiles++

					results.push({
						success: true,
						filePath,
						result
					})

				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error)
					this.logError(`Failed to parse ${filePath}: ${errorMessage}`)

					results.push({
						success: false,
						filePath,
						error: errorMessage
					})
				}
			}
		}

		const totalParseTime = Date.now() - startTime
		const failedFiles = totalFiles - successfulFiles

		this.logInfo(`Batch parsing completed: ${successfulFiles}/${totalFiles} files successful in ${totalParseTime}ms`)

		return {
			results,
			summary: {
				totalFiles,
				successfulFiles,
				failedFiles,
				totalParseTime
			}
		}
	}

	private extractTransUnits(parsedData: { xliff: XLIFFData }, xmlText: string, uri: string, language: string, sourcePath: string) {
		const transUnits: ParseXliffTaskResult['transUnits'] = []

		if (!parsedData.xliff?.file?.body?.["trans-unit"]) {
			return transUnits
		}

		const rawTransUnits = Array.isArray(parsedData.xliff.file.body["trans-unit"])
			? parsedData.xliff.file.body["trans-unit"]
			: [parsedData.xliff.file.body["trans-unit"]]

		for (const transUnit of rawTransUnits) {
			const offset = xmlText.indexOf(`id="${transUnit["@_id"]}"`)
			if (offset === -1) continue

			const position = this.getLinePositionFromOffset(xmlText, offset)

			transUnits.push({
				id: transUnit["@_id"],
				source: this.extractTextFromSourceOrTarget(transUnit.source)!,
				target: this.extractTextFromSourceOrTarget(transUnit.target),
				position,
				language,
				sourcePath,
				uri
			})
		}

		return transUnits
	}

	private extractTextFromSourceOrTarget(sourceOrTarget: string | { '#text': string, '@_state': string } | undefined): string | undefined {
		if (sourceOrTarget === undefined) return undefined
		if (typeof sourceOrTarget === "string") return sourceOrTarget
		return sourceOrTarget['#text']
	}

	private getLinePositionFromOffset(text: string, offset: number): { line: number; character: number } {
		const beforeOffset = text.substring(0, offset)
		const lines = beforeOffset.split('\n')
		return {
			line: lines.length - 1,
			character: lines[lines.length - 1].length
		}
	}

	protected createTaskFromData(taskData: any): BaseWorkerTask {
		switch (taskData.type) {
			case 'parse-xliff':
				return new ParseXliffTask(taskData.data, taskData.options)

			case 'batch-parse-translations':
				return new BatchParseTranslationsTask(taskData.data, taskData.options)

			default:
				throw new Error(`Unknown task type: ${taskData.type}`)
		}
	}
}