import { EventEmitter } from 'events'
import { WorkerPoolManager } from '../WorkerPoolManager'
import { WorkerStats } from '../WorkerTypes'
import { Logger } from '../../common/Logging'

export interface WorkerMetrics {
	workerType: string
	timestamp: number
	poolStats: {
		totalWorkers: number
		activeWorkers: number
		idleWorkers: number
		queueLength: number
	}
	individualStats: WorkerStats[]
	aggregatedStats: {
		totalTasks: number
		completedTasks: number
		failedTasks: number
		successRate: number
		averageExecutionTime: number
		totalMemoryUsage: number
		averageMemoryUsage: number
		averageLoad: number
	}
}

export interface PerformanceAlert {
	type: 'warning' | 'error' | 'info'
	workerType: string
	message: string
	timestamp: number
	metrics?: WorkerMetrics
	threshold?: number
	value?: number
}

export interface MonitoringConfig {
	enabled: boolean
	metricsInterval: number
	enableAlerts: boolean
	alertThresholds: {
		highFailureRate: number // percentage
		longQueueLength: number
		highMemoryUsage: number // bytes
		lowSuccessRate: number // percentage
		highAverageExecutionTime: number // milliseconds
	}
	historyRetentionTime: number // milliseconds
}

export class WorkerMonitor extends Logger {
	private static instance: WorkerMonitor
	private workerPoolManager: WorkerPoolManager
	private config: MonitoringConfig
	private eventEmitter = new EventEmitter()
	private metricsInterval?: NodeJS.Timeout
	private metricsHistory: Map<string, WorkerMetrics[]> = new Map()
	private alerts: PerformanceAlert[] = []
	private isMonitoring = false

	private constructor(config?: Partial<MonitoringConfig>) {
		super('WorkerMonitor')
		this.workerPoolManager = WorkerPoolManager.getInstance()

		this.config = {
			enabled: true,
			metricsInterval: 30000, // 30 seconds
			enableAlerts: true,
			alertThresholds: {
				highFailureRate: 20, // 20%
				longQueueLength: 50,
				highMemoryUsage: 1024 * 1024 * 1024, // 1GB
				lowSuccessRate: 80, // 80%
				highAverageExecutionTime: 30000 // 30 seconds
			},
			historyRetentionTime: 24 * 60 * 60 * 1000, // 24 hours
			...config
		}
	}

	public static getInstance(config?: Partial<MonitoringConfig>): WorkerMonitor {
		if (!WorkerMonitor.instance) {
			WorkerMonitor.instance = new WorkerMonitor(config)
		}
		return WorkerMonitor.instance
	}

	public async start(): Promise<void> {
		if (this.isMonitoring || !this.config.enabled) {
			return
		}

		this.logInfo('Starting worker monitoring')
		this.isMonitoring = true

		// Start metrics collection
		this.startMetricsCollection()

		// Clean old metrics periodically
		this.startCleanupInterval()

		this.logInfo('Worker monitoring started')
	}

	public stop(): void {
		if (!this.isMonitoring) {
			return
		}

		this.logInfo('Stopping worker monitoring')
		this.isMonitoring = false

		if (this.metricsInterval) {
			clearInterval(this.metricsInterval)
			this.metricsInterval = undefined
		}

		this.logInfo('Worker monitoring stopped')
	}

	private startMetricsCollection(): void {
		this.metricsInterval = setInterval(() => {
			if (this.isMonitoring) {
				this.collectMetrics()
			}
		}, this.config.metricsInterval)

		// Collect initial metrics
		this.collectMetrics()
	}

	private startCleanupInterval(): void {
		// Clean old metrics every hour
		setInterval(() => {
			this.cleanupOldMetrics()
		}, 60 * 60 * 1000)
	}

	private collectMetrics(): void {
		try {
			const allStats = this.workerPoolManager.getAllStats()
			const pools = allStats.pools as any

			for (const [workerType, poolStats] of Object.entries(pools)) {
				const metrics = this.createMetrics(workerType, poolStats as any)
				this.storeMetrics(workerType, metrics)

				if (this.config.enableAlerts) {
					this.checkAlerts(metrics)
				}
			}

			// Emit metrics event
			this.eventEmitter.emit('metrics', this.getLatestMetrics())

		} catch (error) {
			this.logError('Error collecting metrics:', error)
		}
	}

	private createMetrics(workerType: string, poolStats: any): WorkerMetrics {
		const pool = poolStats.pool
		const individualStats = poolStats.workers || []

		// Calculate aggregated statistics
		const totalTasks = individualStats.reduce((sum: number, stat: WorkerStats) => sum + stat.totalTasks, 0)
		const completedTasks = individualStats.reduce((sum: number, stat: WorkerStats) => sum + stat.completedTasks, 0)
		const failedTasks = individualStats.reduce((sum: number, stat: WorkerStats) => sum + stat.failedTasks, 0)
		const successRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 100
		const averageExecutionTime = individualStats.length > 0
			? individualStats.reduce((sum: number, stat: WorkerStats) => sum + stat.averageExecutionTime, 0) / individualStats.length
			: 0
		const totalMemoryUsage = individualStats.reduce((sum: number, stat: WorkerStats) => sum + stat.memoryUsage, 0)
		const averageMemoryUsage = individualStats.length > 0 ? totalMemoryUsage / individualStats.length : 0
		const averageLoad = individualStats.length > 0
			? individualStats.reduce((sum: number, stat: WorkerStats) => sum + stat.currentLoad, 0) / individualStats.length
			: 0

		return {
			workerType,
			timestamp: Date.now(),
			poolStats: {
				totalWorkers: pool.totalWorkers,
				activeWorkers: pool.activeWorkers,
				idleWorkers: pool.idleWorkers,
				queueLength: pool.queueLength
			},
			individualStats,
			aggregatedStats: {
				totalTasks,
				completedTasks,
				failedTasks,
				successRate,
				averageExecutionTime,
				totalMemoryUsage,
				averageMemoryUsage,
				averageLoad
			}
		}
	}

	private storeMetrics(workerType: string, metrics: WorkerMetrics): void {
		if (!this.metricsHistory.has(workerType)) {
			this.metricsHistory.set(workerType, [])
		}

		const history = this.metricsHistory.get(workerType)!
		history.push(metrics)

		// Limit history size to prevent memory leaks
		if (history.length > 1000) {
			history.splice(0, history.length - 1000)
		}
	}

	private checkAlerts(metrics: WorkerMetrics): void {
		const { aggregatedStats, poolStats, workerType } = metrics
		const thresholds = this.config.alertThresholds

		// Check failure rate
		const failureRate = aggregatedStats.totalTasks > 0
			? (aggregatedStats.failedTasks / aggregatedStats.totalTasks) * 100
			: 0

		if (failureRate > thresholds.highFailureRate) {
			this.createAlert('warning', workerType,
				`High failure rate: ${failureRate.toFixed(1)}% (threshold: ${thresholds.highFailureRate}%)`,
				metrics, thresholds.highFailureRate, failureRate)
		}

		// Check queue length
		if (poolStats.queueLength > thresholds.longQueueLength) {
			this.createAlert('warning', workerType,
				`Long queue length: ${poolStats.queueLength} (threshold: ${thresholds.longQueueLength})`,
				metrics, thresholds.longQueueLength, poolStats.queueLength)
		}

		// Check memory usage
		if (aggregatedStats.averageMemoryUsage > thresholds.highMemoryUsage) {
			this.createAlert('error', workerType,
				`High memory usage: ${(aggregatedStats.averageMemoryUsage / 1024 / 1024).toFixed(1)}MB (threshold: ${(thresholds.highMemoryUsage / 1024 / 1024).toFixed(1)}MB)`,
				metrics, thresholds.highMemoryUsage, aggregatedStats.averageMemoryUsage)
		}

		// Check success rate
		if (aggregatedStats.successRate < thresholds.lowSuccessRate && aggregatedStats.totalTasks > 10) {
			this.createAlert('warning', workerType,
				`Low success rate: ${aggregatedStats.successRate.toFixed(1)}% (threshold: ${thresholds.lowSuccessRate}%)`,
				metrics, thresholds.lowSuccessRate, aggregatedStats.successRate)
		}

		// Check execution time
		if (aggregatedStats.averageExecutionTime > thresholds.highAverageExecutionTime) {
			this.createAlert('warning', workerType,
				`High average execution time: ${aggregatedStats.averageExecutionTime.toFixed(0)}ms (threshold: ${thresholds.highAverageExecutionTime}ms)`,
				metrics, thresholds.highAverageExecutionTime, aggregatedStats.averageExecutionTime)
		}
	}

	private createAlert(type: PerformanceAlert['type'], workerType: string, message: string, metrics?: WorkerMetrics, threshold?: number, value?: number): void {
		const alert: PerformanceAlert = {
			type,
			workerType,
			message,
			timestamp: Date.now(),
			metrics,
			threshold,
			value
		}

		this.alerts.push(alert)
		this.logInfo(`[ALERT] ${message}`)
		this.eventEmitter.emit('alert', alert)

		// Limit alerts history
		if (this.alerts.length > 1000) {
			this.alerts.splice(0, this.alerts.length - 1000)
		}
	}

	private cleanupOldMetrics(): void {
		const cutoffTime = Date.now() - this.config.historyRetentionTime

		for (const [workerType, history] of this.metricsHistory) {
			const filtered = history.filter(metrics => metrics.timestamp > cutoffTime)
			this.metricsHistory.set(workerType, filtered)
		}

		// Clean old alerts
		this.alerts = this.alerts.filter(alert => alert.timestamp > cutoffTime)
	}

	// Public API methods
	public getLatestMetrics(): Map<string, WorkerMetrics> {
		const latest = new Map<string, WorkerMetrics>()

		for (const [workerType, history] of this.metricsHistory) {
			if (history.length > 0) {
				latest.set(workerType, history[history.length - 1])
			}
		}

		return latest
	}

	public getMetricsHistory(workerType?: string): Map<string, WorkerMetrics[]> {
		if (workerType) {
			const history = this.metricsHistory.get(workerType)
			return history ? new Map([[workerType, history]]) : new Map()
		}

		return new Map(this.metricsHistory)
	}

	public getAlerts(workerType?: string, type?: PerformanceAlert['type']): PerformanceAlert[] {
		let alerts = this.alerts

		if (workerType) {
			alerts = alerts.filter(alert => alert.workerType === workerType)
		}

		if (type) {
			alerts = alerts.filter(alert => alert.type === type)
		}

		return alerts.sort((a, b) => b.timestamp - a.timestamp)
	}

	public clearAlerts(workerType?: string): void {
		if (workerType) {
			this.alerts = this.alerts.filter(alert => alert.workerType !== workerType)
		} else {
			this.alerts = []
		}
	}

	public getMonitoringStatus(): {
		enabled: boolean
		isMonitoring: boolean
		config: MonitoringConfig
		metricsCollected: number
		alertsCount: number
		workerTypes: string[]
	} {
		return {
			enabled: this.config.enabled,
			isMonitoring: this.isMonitoring,
			config: this.config,
			metricsCollected: Array.from(this.metricsHistory.values())
				.reduce((total, history) => total + history.length, 0),
			alertsCount: this.alerts.length,
			workerTypes: Array.from(this.metricsHistory.keys())
		}
	}

	public updateConfig(config: Partial<MonitoringConfig>): void {
		this.config = { ...this.config, ...config }

		// Restart monitoring if interval changed
		if (config.metricsInterval && this.isMonitoring) {
			if (this.metricsInterval) {
				clearInterval(this.metricsInterval)
			}
			this.startMetricsCollection()
		}
	}

	// Event listeners
	public on(event: 'metrics' | 'alert', listener: (...args: any[]) => void): void {
		this.eventEmitter.on(event, listener)
	}

	public off(event: 'metrics' | 'alert', listener: (...args: any[]) => void): void {
		this.eventEmitter.off(event, listener)
	}
}