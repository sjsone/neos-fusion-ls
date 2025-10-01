import { WorkerPoolManager } from '../WorkerPoolManager'
import { WorkerTaskResult } from '../WorkerTypes'
import { BaseWorkerTask } from '../WorkerTask'
import { Logger } from '../../common/Logging'

export interface ServiceAdapterConfig {
	workerType: string
	enableFallback?: boolean
	fallbackTimeout?: number
	retryOnError?: boolean
	maxRetries?: number
}

export abstract class ServiceAdapter<TInput = any, TOutput = any> extends Logger {
	protected workerPoolManager: WorkerPoolManager
	protected config: ServiceAdapterConfig

	constructor(config: ServiceAdapterConfig) {
		super(`ServiceAdapter[${config.workerType}]`)
		this.config = {
			enableFallback: true,
			fallbackTimeout: 30000,
			retryOnError: true,
			maxRetries: 3,
			...config
		}

		this.workerPoolManager = WorkerPoolManager.getInstance()
	}

	// Abstract method to create the appropriate task
	protected abstract createTask(input: TInput, options?: any): BaseWorkerTask

	// Abstract method for fallback processing
	protected abstract processFallback(input: TInput): Promise<TOutput>

	// Abstract method to process worker result
	protected abstract processWorkerResult(result: any): TOutput

	// Main processing method
	public async process(input: TInput, options?: {
		timeout?: number
		priority?: 'low' | 'normal' | 'high'
		forceFallback?: boolean
	}): Promise<TOutput> {
		const { forceFallback = false, timeout, priority } = options || {}

		// Force fallback if requested or workers are disabled
		if (forceFallback || !this.isWorkerPoolAvailable()) {
			this.logDebug(`Using fallback processing for ${this.config.workerType}`)
			return await this.processWithFallback(input, timeout)
		}

		try {
			return await this.processWithWorker(input, timeout, priority)
		} catch (error) {
			this.logWarn(`Worker processing failed for ${this.config.workerType}:`, error)

			// Try fallback if enabled
			if (this.config.enableFallback) {
				this.logInfo(`Falling back to sequential processing for ${this.config.workerType}`)
				return await this.processWithFallback(input, timeout)
			}

			throw error
		}
	}

	// Batch processing method
	public async processBatch(inputs: TInput[], options?: {
		timeout?: number
		priority?: 'low' | 'normal' | 'high'
		forceFallback?: boolean
		maxConcurrency?: number
	}): Promise<TOutput[]> {
		if (inputs.length === 0) return []

		const { forceFallback = false, maxConcurrency = 10 } = options || {}

		if (forceFallback || !this.isWorkerPoolAvailable()) {
			return await this.processBatchFallback(inputs, maxConcurrency)
		}

		try {
			return await this.processBatchWithWorkers(inputs, options)
		} catch (error) {
			this.logWarn(`Batch worker processing failed for ${this.config.workerType}:`, error)

			if (this.config.enableFallback) {
				this.logInfo(`Falling back to sequential batch processing for ${this.config.workerType}`)
				return await this.processBatchFallback(inputs, maxConcurrency)
			}

			throw error
		}
	}

	// Worker processing
	protected async processWithWorker(input: TInput, timeout?: number, priority?: 'low' | 'normal' | 'high'): Promise<TOutput> {
		const task = this.createTask(input, { timeout, priority })

		let attempts = 0
		const maxAttempts = this.config.retryOnError ? this.config.maxRetries! + 1 : 1

		while (attempts < maxAttempts) {
			try {
				const result = await this.workerPoolManager.submitTask(
					this.config.workerType,
					task.data,
					{
						timeout: timeout || task.timeout,
						priority: priority || task.priority,
						retryAttempts: this.config.retryOnError ? this.config.maxRetries : 0
					}
				)

				return this.processWorkerResult(result)

			} catch (error) {
				attempts++
				if (attempts >= maxAttempts) {
					throw error
				}

				this.logDebug(`Retrying worker processing for ${this.config.workerType} (attempt ${attempts}/${maxAttempts})`)
				// Exponential backoff
				await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000))
			}
		}

		throw new Error(`Failed to process ${this.config.workerType} after ${maxAttempts} attempts`)
	}

	// Fallback processing
	protected async processWithFallback(input: TInput, timeout?: number): Promise<TOutput> {
		if (timeout) {
			return await Promise.race([
				this.processFallback(input),
				this.createTimeoutPromise(timeout)
			])
		}

		return await this.processFallback(input)
	}

	// Batch processing with workers
	protected async processBatchWithWorkers(inputs: TInput[], options?: {
		timeout?: number
		priority?: 'low' | 'normal' | 'high'
		maxConcurrency?: number
	}): Promise<TOutput[]> {
		const { timeout, priority, maxConcurrency = 10 } = options || {}

		// Split into chunks to manage concurrency
		const chunks = this.chunkArray(inputs, maxConcurrency)
		const results: TOutput[] = []

		for (const chunk of chunks) {
			const tasks = chunk.map(input => {
				const task = this.createTask(input, { timeout, priority })
				return task.data
			})

			const chunkResults = await this.workerPoolManager.submitBatch(
				this.config.workerType,
				tasks,
				{
					timeout: timeout,
					priority: priority,
					retryAttempts: this.config.retryOnError ? this.config.maxRetries : 0
				}
			)

			const processedResults = chunkResults.map(result => {
				if (result.success) {
					return this.processWorkerResult(result.result)
				} else {
					throw new Error(result.error || 'Unknown batch processing error')
				}
			})

			results.push(...processedResults)
		}

		return results
	}

	// Batch fallback processing
	protected async processBatchFallback(inputs: TInput[], maxConcurrency: number): Promise<TOutput[]> {
		const chunks = this.chunkArray(inputs, maxConcurrency)
		const results: TOutput[] = []

		for (const chunk of chunks) {
			const chunkResults = await Promise.allSettled(
				chunk.map(input => this.processFallback(input))
			)

			const processedResults = chunkResults.map(result => {
				if (result.status === 'fulfilled') {
					return result.value
				} else {
					this.logError('Batch fallback processing error:', result.reason)
					throw result.reason
				}
			})

			results.push(...processedResults)
		}

		return results
	}

	// Utility methods
	protected isWorkerPoolAvailable(): boolean {
		return this.workerPoolManager.isWorkerTypeRegistered(this.config.workerType)
	}

	protected chunkArray<T>(array: T[], chunkSize: number): T[][] {
		const chunks: T[][] = []
		for (let i = 0; i < array.length; i += chunkSize) {
			chunks.push(array.slice(i, i + chunkSize))
		}
		return chunks
	}

	protected createTimeoutPromise(timeout: number): Promise<never> {
		return new Promise((_, reject) => {
			setTimeout(() => reject(new Error(`Processing timeout after ${timeout}ms`)), timeout)
		})
	}

	// Monitoring and statistics
	public getAdapterStats() {
		const poolStats = this.workerPoolManager.getPoolStats(this.config.workerType)
		return {
			workerType: this.config.workerType,
			config: this.config,
			poolAvailable: this.isWorkerPoolAvailable(),
			poolStats
		}
	}

	// Health check
	public async healthCheck(): Promise<{
		healthy: boolean
		workerPoolAvailable: boolean
		lastTestResult?: 'success' | 'failed'
		error?: string
	}> {
		const workerPoolAvailable = this.isWorkerPoolAvailable()

		if (!workerPoolAvailable) {
			return {
				healthy: this.config.enableFallback,
				workerPoolAvailable: false
			}
		}

		// Test worker pool with a simple task
		try {
			const testInput = this.createTestInput()
			await this.processWithWorker(testInput, 5000) // 5 second timeout for health check

			return {
				healthy: true,
				workerPoolAvailable: true,
				lastTestResult: 'success'
			}
		} catch (error) {
			return {
				healthy: this.config.enableFallback,
				workerPoolAvailable: true,
				lastTestResult: 'failed',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	}

	// Abstract method to create test input for health checks
	protected abstract createTestInput(): TInput
}