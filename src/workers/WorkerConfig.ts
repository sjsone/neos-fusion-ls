export interface WorkerConfig {
	// Global worker settings
	enabled: boolean
	defaultPoolSize: number
	maxTaskTimeout: number
	maxRetries: number
	enableAutoScaling: boolean
	healthCheckInterval: number

	// Pool-specific settings
	pools: {
		[workerType: string]: {
			poolSize: number
			priority: 'low' | 'normal' | 'high'
			memoryLimit?: string
			maxTaskQueue?: number
			taskTimeout?: number
			maxRetries?: number
			enabled: boolean
		}
	}

	// Performance settings
	performance: {
		enableMetrics: boolean
		metricsInterval: number
		enableProfiling: boolean
	}
}

export const DefaultWorkerConfig: WorkerConfig = {
	enabled: true,
	defaultPoolSize: 2,
	maxTaskTimeout: 30000,
	maxRetries: 3,
	enableAutoScaling: false,
	healthCheckInterval: 30000,
	pools: {
		translation: {
			poolSize: 4,
			priority: 'normal',
			memoryLimit: '512MB',
			maxTaskQueue: 100,
			taskTimeout: 60000,
			maxRetries: 3,
			enabled: true
		}
	},
	performance: {
		enableMetrics: true,
		metricsInterval: 60000,
		enableProfiling: false
	}
}

export class WorkerConfigManager {
	private static config: WorkerConfig = DefaultWorkerConfig

	public static getConfig(): WorkerConfig {
		return { ...WorkerConfigManager.config }
	}

	public static updateConfig(updates: Partial<WorkerConfig>): void {
		WorkerConfigManager.config = this.mergeConfig(WorkerConfigManager.config, updates)
	}

	public static getPoolConfig(workerType: string): WorkerConfig['pools'][string] {
		return WorkerConfigManager.config.pools[workerType] || {
			poolSize: WorkerConfigManager.config.defaultPoolSize,
			priority: 'normal',
			enabled: true
		}
	}

	public static updatePoolConfig(workerType: string, updates: Partial<WorkerConfig['pools'][string]>): void {
		const currentConfig = WorkerConfigManager.getPoolConfig(workerType)
		WorkerConfigManager.config.pools[workerType] = { ...currentConfig, ...updates }
	}

	public static isWorkerTypeEnabled(workerType: string): boolean {
		if (!WorkerConfigManager.config.enabled) return false
		return WorkerConfigManager.getPoolConfig(workerType).enabled
	}

	public static isPoolEnabled(workerType: string): boolean {
		return WorkerConfigManager.isWorkerTypeEnabled(workerType)
	}

	private static mergeConfig(base: WorkerConfig, updates: Partial<WorkerConfig>): WorkerConfig {
		return {
			...base,
			...updates,
			pools: {
				...base.pools,
				...updates.pools
			},
			performance: {
				...base.performance,
				...updates.performance
			}
		}
	}

	public static reset(): void {
		WorkerConfigManager.config = DefaultWorkerConfig
	}

	public static validateConfig(config: Partial<WorkerConfig>): string[] {
		const errors: string[] = []

		if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
			errors.push('enabled must be a boolean')
		}

		if (config.defaultPoolSize !== undefined) {
			if (typeof config.defaultPoolSize !== 'number' || config.defaultPoolSize < 1) {
				errors.push('defaultPoolSize must be a positive number')
			}
		}

		if (config.maxTaskTimeout !== undefined) {
			if (typeof config.maxTaskTimeout !== 'number' || config.maxTaskTimeout < 1000) {
				errors.push('maxTaskTimeout must be a number >= 1000')
			}
		}

		if (config.pools) {
			for (const [poolName, poolConfig] of Object.entries(config.pools)) {
				if (typeof poolConfig.poolSize !== 'number' || poolConfig.poolSize < 1) {
					errors.push(`Pool ${poolName}: poolSize must be a positive number`)
				}

				if (!['low', 'normal', 'high'].includes(poolConfig.priority)) {
					errors.push(`Pool ${poolName}: priority must be one of: low, normal, high`)
				}

				if (poolConfig.taskTimeout !== undefined && poolConfig.taskTimeout < 1000) {
					errors.push(`Pool ${poolName}: taskTimeout must be >= 1000`)
				}
			}
		}

		return errors
	}
}