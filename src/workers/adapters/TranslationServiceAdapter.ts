import { ServiceAdapter, ServiceAdapterConfig } from './ServiceAdapter'
import { ParseXliffTask } from '../tasks/ParseXliffTask'
import { NeosPackage } from '../../neos/NeosPackage'
import { XLIFFTranslationFile } from '../../translations/XLIFFTranslationFile'
import { getFiles } from '../../common/util'
import * as NodeFs from 'fs'

export interface TranslationInput {
	package: NeosPackage
	filePath?: string
	basePath?: string
}

export interface TranslationOutput {
	translationFiles: XLIFFTranslationFile[]
	processedWith: 'worker' | 'fallback'
	processingTime: number
}

export class TranslationServiceAdapter extends ServiceAdapter<TranslationInput, TranslationOutput> {
	constructor(config?: Partial<ServiceAdapterConfig>) {
		super({
			workerType: 'translation',
			enableFallback: true,
			fallbackTimeout: 60000,
			retryOnError: true,
			maxRetries: 2,
			...config
		})
	}

	protected createTask(input: TranslationInput, options?: any): ParseXliffTask {
		const { package: neosPackage, filePath, basePath } = input

		if (!filePath) {
			throw new Error('filePath is required for single file processing')
		}

		if (!basePath) {
			throw new Error('basePath is required for single file processing')
		}

		return new ParseXliffTask({
			filePath,
			packagePath: neosPackage.path,
			basePath
		}, options)
	}

	protected async processFallback(input: TranslationInput): Promise<TranslationOutput> {
		const startTime = Date.now()
		const { package: neosPackage, filePath, basePath } = input

		if (filePath && basePath) {
			// Process single file
			this.logDebug(`Processing single translation file with fallback: ${filePath}`)

			const translationFile = XLIFFTranslationFile.FromFilePath(neosPackage, filePath, basePath)
			await translationFile.parse()

			return {
				translationFiles: [translationFile],
				processedWith: 'fallback',
				processingTime: Date.now() - startTime
			}
		} else {
			// Process all files for package
			this.logDebug(`Processing all translation files for package with fallback: ${neosPackage.getName()}`)

			const translationsBasePath = neosPackage.getTranslationsBasePath()
			if (!NodeFs.existsSync(translationsBasePath)) {
				return {
					translationFiles: [],
					processedWith: 'fallback',
					processingTime: Date.now() - startTime
				}
			}

			const translationFilePaths = Array.from(getFiles(translationsBasePath, ".xlf"))
			const translationFiles = await Promise.all(
				translationFilePaths.map(filePath => {
					const translationFile = XLIFFTranslationFile.FromFilePath(neosPackage, filePath, translationsBasePath)
					return translationFile.parse().then(() => translationFile)
				})
			)

			return {
				translationFiles,
				processedWith: 'fallback',
				processingTime: Date.now() - startTime
			}
		}
	}

	protected processWorkerResult(result: any): TranslationOutput {
		const startTime = Date.now()

		// Handle single file result
		if (result.metadata) {
			const translationFile = this.createXliffFileFromWorkerResult(result)
			return {
				translationFiles: [translationFile],
				processedWith: 'worker',
				processingTime: Date.now() - startTime
			}
		}

		// Handle batch result
		if (result.results) {
			const translationFiles = result.results
				.filter((fileResult: any) => fileResult.success && fileResult.result)
				.map((fileResult: any) => this.createXliffFileFromWorkerResult(fileResult.result))

			return {
				translationFiles,
				processedWith: 'worker',
				processingTime: Date.now() - startTime
			}
		}

		throw new Error('Unknown worker result format')
	}

	private createXliffFileFromWorkerResult(workerResult: any): XLIFFTranslationFile {
		const { metadata, transUnits } = workerResult

		// Reconstruct NeosPackage from metadata (this is a simplified approach)
		const mockNeosPackage = {
			getPackageName: () => metadata.packagePath.split('/').pop() || 'unknown',
			path: metadata.packagePath
		} as NeosPackage

		// Create XLIFFTranslationFile instance
		const translationFile = new XLIFFTranslationFile(
			mockNeosPackage,
			metadata.filePath,
			metadata.language,
			metadata.sourceParts
		)

		// Populate transUnits from worker result
		for (const transUnit of transUnits) {
			translationFile.transUnits.set(transUnit.id, {
				id: transUnit.id,
				source: transUnit.source,
				target: transUnit.target,
				position: transUnit.position,
				language: transUnit.language
			})
		}

		return translationFile
	}

	protected createTestInput(): TranslationInput {
		// Create a minimal test input
		const mockPackage = {
			getPackageName: () => 'test-package',
			getTranslationsBasePath: () => '/tmp/test',
			path: '/tmp/test'
		} as NeosPackage

		return {
			package: mockPackage,
			filePath: '/tmp/test/test.xlf',
			basePath: '/tmp/test'
		}
	}

	// Convenience methods for common operations
	public async processPackage(neosPackage: NeosPackage, options?: {
		timeout?: number
		priority?: 'low' | 'normal' | 'high'
		forceFallback?: boolean
	}): Promise<TranslationOutput> {
		return this.process({
			package: neosPackage
		}, options)
	}

	public async processSingleFile(
		neosPackage: NeosPackage,
		filePath: string,
		basePath: string,
		options?: {
			timeout?: number
			priority?: 'low' | 'normal' | 'high'
			forceFallback?: boolean
		}
	): Promise<TranslationOutput> {
		return this.process({
			package: neosPackage,
			filePath,
			basePath
		}, options)
	}

	public async processMultiplePackages(
		packages: NeosPackage[],
		options?: {
			timeout?: number
			priority?: 'low' | 'normal' | 'high'
			maxConcurrency?: number
		}
	): Promise<TranslationOutput[]> {
		const inputs = packages.map(pkg => ({ package: pkg }))
		return this.processBatch(inputs, {
			...options,
			maxConcurrency: Math.min(options?.maxConcurrency || 5, packages.length)
		})
	}
}