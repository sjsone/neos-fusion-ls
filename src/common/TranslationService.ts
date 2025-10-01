import * as NodeFs from 'fs'
import { NeosPackage } from '../neos/NeosPackage'
import { XLIFFTranslationFile } from '../translations/XLIFFTranslationFile'
import { getFiles } from './util'
import { WorkerPoolManager } from '../workers/WorkerPoolManager'
import { TranslationWorker } from '../workers/TranslationWorker'
import { TranslationTaskFactory } from '../workers/factories/TranslationTaskFactory'
import { WorkerConfigManager } from '../workers/WorkerConfig'

interface TranslationServiceConfig {
	useWorkerPool?: boolean
	enableFallback?: boolean
}

class TranslationService {
	private static workerPoolManager: WorkerPoolManager | null = null
	private static config: TranslationServiceConfig = {
		useWorkerPool: true,
		enableFallback: true
	}

	public static configure(config: Partial<TranslationServiceConfig>): void {
		TranslationService.config = { ...TranslationService.config, ...config }
	}

	public static async initializeWorkerPool(): Promise<void> {
		if (TranslationService.workerPoolManager) {
			return
		}

		// Check if workers are enabled in configuration
		if (!WorkerConfigManager.isPoolEnabled('translation')) {
			console.log('Translation workers are disabled in configuration')
			return
		}

		const poolConfig = WorkerConfigManager.getPoolConfig('translation')

		TranslationService.workerPoolManager = WorkerPoolManager.getInstance({
			defaultPoolSize: poolConfig.poolSize,
			maxTaskTimeout: poolConfig.taskTimeout || 60000,
			maxRetries: poolConfig.maxRetries || 3
		})

		await TranslationService.workerPoolManager.initialize()

		// Register translation worker type
		TranslationService.workerPoolManager.registerWorkerType('translation', {
			workerClass: TranslationWorker,
			taskFactory: new TranslationTaskFactory(),
			defaultPoolSize: poolConfig.poolSize,
			priority: poolConfig.priority,
			poolConfig: {
				size: poolConfig.poolSize,
				taskTimeout: poolConfig.taskTimeout,
				maxRetries: poolConfig.maxRetries,
				memoryLimit: poolConfig.memoryLimit,
				maxTaskQueue: poolConfig.maxTaskQueue
			}
		})
	}

	public static async shutdownWorkerPool(): Promise<void> {
		if (TranslationService.workerPoolManager) {
			await TranslationService.workerPoolManager.shutdown()
			TranslationService.workerPoolManager = null
		}
	}

	async readTranslationsFromPackage(neosPackage: NeosPackage) {
		const basePath = neosPackage.getTranslationsBasePath()
		if (!NodeFs.existsSync(basePath)) return []

		const translationFilePaths = Array.from(getFiles(basePath, ".xlf"))

		// Use worker pool if enabled and available
		if (TranslationService.config.useWorkerPool && TranslationService.workerPoolManager) {
			return await this.readTranslationsFromPackageWithWorkers(neosPackage, translationFilePaths, basePath)
		}

		// Fallback to sequential processing
		return await this.readTranslationsFromPackageSequential(neosPackage, translationFilePaths, basePath)
	}

	private async readTranslationsFromPackageWithWorkers(
		neosPackage: NeosPackage,
		translationFilePaths: string[],
		basePath: string
	) {
		try {
			// Ensure worker pool is initialized
			await TranslationService.initializeWorkerPool()

			// Submit batch parsing task
			const result = await TranslationService.workerPoolManager!.submitTask('translation', {
				packages: [{
					packagePath: neosPackage.path,
					basePath,
					translationFilePaths
				}]
			}, {
				timeout: 60000, // 60 seconds for batch processing
				priority: 'normal'
			})

			// Convert worker results to XLIFFTranslationFile objects
			const translationFiles: XLIFFTranslationFile[] = []

			for (const fileResult of result.results) {
				if (fileResult.success && fileResult.result) {
					const translationFile = this.createXliffFileFromWorkerResult(
						neosPackage,
						fileResult.result
					)
					translationFiles.push(translationFile)
				} else {
					// If worker processing fails, try fallback processing
					if (TranslationService.config.enableFallback) {
						try {
							const fallbackFile = await this.createXliffFileFromPath(
								neosPackage,
								fileResult.filePath,
								basePath
							)
							translationFiles.push(fallbackFile)
						} catch (fallbackError) {
							console.error(`Failed to process ${fileResult.filePath} with both worker and fallback:`, fallbackError)
						}
					}
				}
			}

			return translationFiles

		} catch (error) {
			console.error('Worker pool processing failed, falling back to sequential processing:', error)

			// Fallback to sequential processing if enabled
			if (TranslationService.config.enableFallback) {
				return await this.readTranslationsFromPackageSequential(neosPackage, translationFilePaths, basePath)
			}

			throw error
		}
	}

	private async readTranslationsFromPackageSequential(
		neosPackage: NeosPackage,
		translationFilePaths: string[],
		basePath: string
	) {
		const translationFiles = translationFilePaths.map(async filePath => {
			return await this.createXliffFileFromPath(neosPackage, filePath, basePath)
		})

		return Promise.all(translationFiles)
	}

	private createXliffFileFromWorkerResult(neosPackage: NeosPackage, workerResult: any): XLIFFTranslationFile {
		const { metadata, transUnits } = workerResult

		// Create XLIFFTranslationFile instance
		const translationFile = new XLIFFTranslationFile(
			neosPackage,
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

	private async createXliffFileFromPath(
		neosPackage: NeosPackage,
		filePath: string,
		basePath: string
	): Promise<XLIFFTranslationFile> {
		const translationFile = XLIFFTranslationFile.FromFilePath(neosPackage, filePath, basePath)
		await translationFile.parse()
		return translationFile
	}

	public static getWorkerStats() {
		return TranslationService.workerPoolManager?.getAllStats() || null
	}

	public static async getPoolHealth(): Promise<boolean> {
		if (!TranslationService.workerPoolManager) return false

		try {
			const stats = TranslationService.workerPoolManager.getAllStats()
			return stats.registry.activePools.length > 0
		} catch {
			return false
		}
	}
}

const TranslationServiceInstance = new TranslationService
export {
	TranslationServiceInstance as TranslationService
}
