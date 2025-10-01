import { WorkerRegistry } from './WorkerRegistry'
import { WorkerPoolConfig, WorkerTaskResult } from './WorkerTypes'
import { BaseWorkerTask } from './WorkerTask'
import { Logger } from '../common/Logging'

export interface WorkerPoolManagerConfig {
	defaultPoolSize?: number
	maxTaskTimeout?: number
	maxRetries?: number
	enableAutoScaling?: boolean
	healthCheckInterval?: number
}

export class WorkerPoolManager extends Logger {
	private static instance: WorkerPoolManager
	private registry: WorkerRegistry
	private config: WorkerPoolManagerConfig
	private healthCheckInterval?: NodeJS.Timeout
	private isInitialized = false

	private constructor(config: WorkerPoolManagerConfig = {}) {
		super('WorkerPoolManager')
		this.registry = WorkerRegistry.getInstance()
		this.config = {
			defaultPoolSize: config.defaultPoolSize ?? 2,
			maxTaskTimeout: config.maxTaskTimeout ?? 30000,
			maxRetries: config.maxRetries ?? 3,
			enableAutoScaling: config.enableAutoScaling ?? false,
			healthCheckInterval: config.healthCheckInterval ?? 30000,
			...config
		}
	}

	public static getInstance(config?: WorkerPoolManagerConfig): WorkerPoolManager {
		if (!WorkerPoolManager.instance) {
			WorkerPoolManager.instance = new WorkerPoolManager(config)
		}
		return WorkerPoolManager.instance
	}

	public async initialize(): Promise<void> {
		if (this.isInitialized) {
			this.logInfo('WorkerPoolManager is already initialized')
			return
		}

		this.logInfo('Initializing WorkerPoolManager')

		// Start health check interval
		if (this.config.healthCheckInterval! > 0) {
			this.startHealthCheck()
		}

		this.isInitialized = true
		this.logInfo('WorkerPoolManager initialized successfully')
	}

	public registerWorkerType(
		type: string,
		config: {
			workerClass: any
			taskFactory: any
			defaultPoolSize?: number
			priority?: 'low' | 'normal' | 'high'
			poolConfig?: WorkerPoolConfig
		}
	): void {
		this.logInfo(`Registering worker type: ${type}`)

		const poolConfig: WorkerPoolConfig = {
			size: config.defaultPoolSize ?? this.config.defaultPoolSize!,
			taskTimeout: this.config.maxTaskTimeout!,
			maxRetries: this.config.maxRetries!,
			...config.poolConfig
		}

		this.registry.registerWorkerType(type, {
			workerClass: config.workerClass,
			defaultPoolSize: poolConfig.size,
			taskFactory: config.taskFactory,
			priority: config.priority,
			config: poolConfig
		})
	}

	public async submitTask<T = any>(
		type: string,
		data: any,
		options?: {
			priority?: 'low' | 'normal' | 'high'
			timeout?: number
			retryAttempts?: number
		}
	): Promise<T> {
		this.ensureInitialized()

		try {
			const result = await this.registry.submitTask(type, data, options)
			return result as T
		} catch (error) {
			this.logError(`Task submission failed for type ${type}:`, error)
			throw error
		}
	}

	public async submitBatch<T = any>(
		type: string,
		tasksData: any[],
		options?: {
			priority?: 'low' | 'normal' | 'high'
			timeout?: number
			retryAttempts?: number
		}
	): Promise<T[]> {
		this.ensureInitialized()

		if (tasksData.length === 0) {
			return []
		}

		this.logInfo(`Submitting batch of ${tasksData.length} tasks of type ${type}`)

		try {
			const results = await this.registry.submitBatch(type, tasksData, options)
			return results as T[]
		} catch (error) {
			this.logError(`Batch submission failed for type ${type}:`, error)
			throw error
		}
	}

	public getPoolStats(type?: string) {
		return this.registry.getPoolStats(type)
	}

	public getAllStats() {
		return {
			registry: this.registry.getRegistryInfo(),
			pools: this.getPoolStats(),
			manager: {
				isInitialized: this.isInitialized,
				config: this.config,
				healthCheckActive: !!this.healthCheckInterval
			}
		}
	}

	public getAvailableWorkerTypes(): string[] {
		return this.registry.getRegisteredTypes()
	}

	public isWorkerTypeRegistered(type: string): boolean {
		return this.registry.isRegistered(type)
	}

	public async resizePool(type: string, newSize: number): Promise<void> {
		this.ensureInitialized()

		try {
			await this.registry.resizePool(type, newSize)
			this.logInfo(`Resized pool ${type} to ${newSize} workers`)
		} catch (error) {
			this.logError(`Failed to resize pool ${type}:`, error)
			throw error
		}
	}

	public async shutdownPool(type: string): Promise<void> {
		try {
			await this.registry.unregisterWorkerType(type)
			this.logInfo(`Shutdown pool ${type}`)
		} catch (error) {
			this.logError(`Failed to shutdown pool ${type}:`, error)
			throw error
		}
	}

	public async shutdown(): Promise<void> {
		this.logInfo('Shutting down WorkerPoolManager')

		// Stop health check
		if (this.healthCheckInterval) {
			clearInterval(this.healthCheckInterval)
			this.healthCheckInterval = undefined
		}

		// Shutdown all pools
		await this.registry.shutdown()

		this.isInitialized = false
		this.logInfo('WorkerPoolManager shutdown complete')
	}

	private startHealthCheck(): void {
		this.healthCheckInterval = setInterval(() => {
			this.performHealthCheck()
		}, this.config.healthCheckInterval!)

		this.logInfo(`Health check started with interval ${this.config.healthCheckInterval}ms`)
	}

	private performHealthCheck(): void {
		try {
			const stats = this.getAllStats()
			const unhealthyPools: string[] = []

			// Check each pool for health issues
			for (const [poolType, poolStats] of Object.entries(stats.pools as { [key: string]: any })) {
				if (poolStats.pool.totalWorkers === 0) {
					unhealthyPools.push(poolType)
					this.logInfo(`Pool ${poolType} has no workers`)
				}

				// Check for high error rates
				const totalTasks = poolStats.pool.totalWorkers > 0
					? poolStats.workers.reduce((sum: number, worker: any) => sum + worker.totalTasks, 0)
					: 0
				const failedTasks = poolStats.pool.totalWorkers > 0
					? poolStats.workers.reduce((sum: number, worker: any) => sum + worker.failedTasks, 0)
					: 0

				if (totalTasks > 10 && failedTasks / totalTasks > 0.5) {
					unhealthyPools.push(poolType)
					this.logInfo(`Pool ${poolType} has high error rate: ${failedTasks}/${totalTasks}`)
				}

				// Check for long queues
				if (poolStats.pool.queueLength > 50) {
					this.logInfo(`Pool ${poolType} has long queue: ${poolStats.pool.queueLength} tasks`)
				}
			}

			// Auto-scaling logic if enabled
			if (this.config.enableAutoScaling && unhealthyPools.length > 0) {
				this.handleUnhealthyPools(unhealthyPools)
			}

		} catch (error) {
			this.logError('Health check failed:', error)
		}
	}

	private handleUnhealthyPools(unhealthyPools: string[]): void {
		for (const poolType of unhealthyPools) {
			this.logInfo(`Attempting to recover unhealthy pool: ${poolType}`)

			// Try to restart the pool
			this.registry.unregisterWorkerType(poolType)
		}
	}

	private ensureInitialized(): void {
		if (!this.isInitialized) {
			throw new Error('WorkerPoolManager is not initialized. Call initialize() first.')
		}
	}

	// Utility methods for common operations
	public async submitWithTimeout<T = any>(
		type: string,
		data: any,
		timeout: number
	): Promise<T> {
		return this.submitTask<T>(type, data, { timeout })
	}

	public async submitHighPriority<T = any>(type: string, data: any): Promise<T> {
		return this.submitTask<T>(type, data, { priority: 'high' })
	}

	public async submitLowPriority<T = any>(type: string, data: any): Promise<T> {
		return this.submitTask<T>(type, data, { priority: 'low' })
	}

	// Convenience method for common pattern of submitting one task and waiting for result
	public async executeTask<T = any>(
		type: string,
		data: any,
		options?: {
			priority?: 'low' | 'normal' | 'high'
			timeout?: number
			retryAttempts?: number
		}
	): Promise<T> {
		return this.submitTask<T>(type, data, options)
	}

	// Method to get detailed status for monitoring dashboards
	public getDetailedStatus() {
		const stats = this.getAllStats()
		const now = Date.now()

		return {
			timestamp: now,
			uptime: this.isInitialized ? now - (this as any)._initTime : 0,
			registry: stats.registry,
			pools: stats.pools,
			manager: stats.manager,
			health: {
				unhealthyPools: this.identifyUnhealthyPools(stats.pools),
				totalQueuedTasks: this.calculateTotalQueuedTasks(stats.pools),
				totalActiveWorkers: this.calculateTotalActiveWorkers(stats.pools)
			}
		}
	}

	private identifyUnhealthyPools(pools: any): string[] {
		const unhealthy: string[] = []
		for (const [poolType, poolStats] of Object.entries(pools)) {
			const stats = poolStats as any
			if (stats.pool.totalWorkers === 0 || stats.pool.queueLength > 100) {
				unhealthy.push(poolType)
			}
		}
		return unhealthy
	}

	private calculateTotalQueuedTasks(pools: any): number {
		return Object.values(pools).reduce((total: number, pool: any) =>
			total + (pool as any).pool.queueLength, 0)
	}

	private calculateTotalActiveWorkers(pools: any): number {
		return Object.values(pools).reduce((total: number, pool: any) =>
			total + (pool as any).pool.activeWorkers, 0)
	}
}