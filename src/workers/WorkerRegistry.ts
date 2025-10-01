import { WorkerPool } from './WorkerPool'
import { BaseWorker } from './BaseWorker'
import { BaseWorkerTask } from './WorkerTask'
import { WorkerPoolConfig, WorkerTypeConfig } from './WorkerTypes'
import { Logger } from '../common/Logging'

interface RegisteredWorkerType {
	workerClass: new (type: string, config?: any) => BaseWorker
	defaultPoolSize: number
	taskFactory: TaskFactory
	priority?: 'low' | 'normal' | 'high'
	config?: WorkerPoolConfig
	pool?: WorkerPool
}

export interface TaskFactory {
	createTask(type: string, data: any, options?: any): BaseWorkerTask
}

export class WorkerRegistry extends Logger {
	private static instance: WorkerRegistry
	private registeredTypes = new Map<string, RegisteredWorkerType>()
	private pools = new Map<string, WorkerPool>()

	private constructor() {
		super('WorkerRegistry')
	}

	public static getInstance(): WorkerRegistry {
		if (!WorkerRegistry.instance) {
			WorkerRegistry.instance = new WorkerRegistry()
		}
		return WorkerRegistry.instance
	}

	public registerWorkerType(
		type: string,
		config: {
			workerClass: new (type: string, config?: any) => BaseWorker
			defaultPoolSize: number
			taskFactory: TaskFactory
			priority?: 'low' | 'normal' | 'high'
			config?: WorkerPoolConfig
		}
	): void {
		this.logInfo(`Registering worker type: ${type}`)

		if (this.registeredTypes.has(type)) {
			this.logWarn(`Worker type ${type} is already registered. Overwriting...`)
		}

		this.registeredTypes.set(type, {
			workerClass: config.workerClass,
			defaultPoolSize: config.defaultPoolSize,
			taskFactory: config.taskFactory,
			priority: config.priority ?? 'normal',
			config: config.config
		})
	}

	public unregisterWorkerType(type: string): boolean {
		this.logInfo(`Unregistering worker type: ${type}`)

		const registered = this.registeredTypes.get(type)
		if (!registered) {
			this.logWarn(`Worker type ${type} is not registered`)
			return false
		}

		// Shutdown pool if it exists
		const pool = this.pools.get(type)
		if (pool) {
			pool.shutdown().catch(error => {
				this.logError(`Error shutting down pool for type ${type}:`, error)
			})
			this.pools.delete(type)
		}

		this.registeredTypes.delete(type)
		return true
	}

	public getRegisteredTypes(): string[] {
		return Array.from(this.registeredTypes.keys())
	}

	public isRegistered(type: string): boolean {
		return this.registeredTypes.has(type)
	}

	public async getPool(type: string, config?: Partial<WorkerPoolConfig>): Promise<WorkerPool> {
		const registered = this.registeredTypes.get(type)
		if (!registered) {
			throw new Error(`Worker type ${type} is not registered`)
		}

		// Return existing pool if already created
		if (this.pools.has(type)) {
			return this.pools.get(type)!
		}

		// Create new pool
		this.logInfo(`Creating new worker pool for type: ${type}`)

		const poolConfig: WorkerPoolConfig = {
			size: config?.size ?? registered.defaultPoolSize,
			...registered.config,
			...config
		}

		const pool = new WorkerPool({
			type,
			workerClass: registered.workerClass,
			config: poolConfig
		})

		await pool.initialize()

		this.pools.set(type, pool)
		return pool
	}

	public async submitTask(
		type: string,
		data: any,
		options?: {
			priority?: 'low' | 'normal' | 'high'
			timeout?: number
			retryAttempts?: number
		}
	): Promise<any> {
		const registered = this.registeredTypes.get(type)
		if (!registered) {
			throw new Error(`Worker type ${type} is not registered`)
		}

		const pool = await this.getPool(type)
		const task = registered.taskFactory.createTask(type, data, options)

		const result = await pool.submitTask(task)

		if (!result.success) {
			throw new Error(result.error ?? 'Task failed without error message')
		}

		return result.result
	}

	public async submitBatch(
		type: string,
		tasksData: any[],
		options?: {
			priority?: 'low' | 'normal' | 'high'
			timeout?: number
			retryAttempts?: number
		}
	): Promise<any[]> {
		const registered = this.registeredTypes.get(type)
		if (!registered) {
			throw new Error(`Worker type ${type} is not registered`)
		}

		const pool = await this.getPool(type)
		const tasks = tasksData.map(data =>
			registered.taskFactory.createTask(type, data, options)
		)

		const results = await pool.submitBatch(tasks)

		return results.map(result => {
			if (!result.success) {
				throw new Error(result.error ?? 'Task failed without error message')
			}
			return result.result
		})
	}

	public getPoolStats(type?: string) {
		if (type) {
			const pool = this.pools.get(type)
			return pool ? pool.getStats() : null
		}

		const stats: { [key: string]: any } = {}
		for (const [poolType, pool] of this.pools) {
			stats[poolType] = pool.getStats()
		}
		return stats
	}

	public async shutdown(): Promise<void> {
		this.logInfo('Shutting down all worker pools')

		const shutdownPromises = Array.from(this.pools.values()).map(pool =>
			pool.shutdown().catch(error => {
				this.logError('Error shutting down pool:', error)
			})
		)

		await Promise.allSettled(shutdownPromises)
		this.pools.clear()

		this.logInfo('All worker pools shutdown complete')
	}

	public async resizePool(type: string, newSize: number): Promise<void> {
		const registered = this.registeredTypes.get(type)
		if (!registered) {
			throw new Error(`Worker type ${type} is not registered`)
		}

		const existingPool = this.pools.get(type)
		if (existingPool) {
			await existingPool.shutdown()
			this.pools.delete(type)
		}

		const pool = new WorkerPool({
			type,
			workerClass: registered.workerClass,
			config: {
				...registered.config,
				size: newSize
			}
		})

		await pool.initialize()
		this.pools.set(type, pool)

		this.logInfo(`Resized pool ${type} to ${newSize} workers`)
	}

	public getWorkerTypesByPriority(): { type: string, priority: string }[] {
		return Array.from(this.registeredTypes.entries())
			.map(([type, config]) => ({
				type,
				priority: config.priority || 'normal'
			}))
			.sort((a, b) => {
				const priorityOrder = { high: 0, normal: 1, low: 2 }
				return priorityOrder[a.priority] - priorityOrder[b.priority]
			})
	}

	public async waitForHealthyPool(type: string, timeout = 30000): Promise<void> {
		const startTime = Date.now()

		while (Date.now() - startTime < timeout) {
			const pool = this.pools.get(type)
			if (pool && pool.isHealthy()) {
				return
			}

			await new Promise(resolve => setTimeout(resolve, 100))
		}

		throw new Error(`Pool ${type} did not become healthy within ${timeout}ms`)
	}

	public getRegistryInfo() {
		return {
			registeredTypes: Array.from(this.registeredTypes.keys()),
			activePools: Array.from(this.pools.keys()),
			workerTypesByPriority: this.getWorkerTypesByPriority()
		}
	}
}