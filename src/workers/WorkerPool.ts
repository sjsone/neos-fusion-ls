import { EventEmitter } from 'events'
import { Logger } from '../common/Logging'
import { BaseWorker } from './BaseWorker'
import { BaseWorkerTask } from './WorkerTask'
import { WorkerPoolConfig, WorkerStats, WorkerTaskResult } from './WorkerTypes'

export interface WorkerPoolOptions {
	type: string
	workerClass: new (type: string, config?: any) => BaseWorker
	config?: WorkerPoolConfig
}

interface QueuedTask {
	task: BaseWorkerTask
	resolve: (result: WorkerTaskResult) => void
	reject: (error: Error) => void
	submitTime: number
	timeout?: NodeJS.Timeout
}

export class WorkerPool extends Logger {
	protected readonly type: string
	protected readonly workerClass: new (type: string, config?: any) => BaseWorker
	protected readonly config: WorkerPoolConfig
	protected workers: BaseWorker[] = []
	protected taskQueue: QueuedTask[] = []
	protected eventEmitter = new EventEmitter()
	protected isShuttingDown = false

	constructor(options: WorkerPoolOptions) {
		super(`WorkerPool[${options.type}]`)
		this.type = options.type
		this.workerClass = options.workerClass
		this.config = {
			size: options.config?.size ?? 2,
			memoryLimit: options.config?.memoryLimit,
			maxTaskQueue: options.config?.maxTaskQueue ?? 100,
			taskTimeout: options.config?.taskTimeout ?? 30000,
			maxRetries: options.config?.maxRetries ?? 3,
			...options.config
		}
	}

	public async initialize(): Promise<void> {
		this.logInfo(`Initializing worker pool with ${this.config.size} workers`)

		for (let i = 0; i < this.config.size; i++) {
			const worker = new this.workerClass(this.type, this.config)
			this.setupWorkerEventHandlers(worker)
			await worker.start()
			this.workers.push(worker)
		}

		this.logInfo(`Worker pool initialized with ${this.workers.length} workers`)
	}

	protected setupWorkerEventHandlers(worker: BaseWorker): void {
		worker.on('ready', () => {
			this.logDebug(`Worker ${worker.getWorkerId()} is ready`)
			this.processNextTask()
		})

		worker.on('result', (result: WorkerTaskResult) => {
			this.handleTaskResult(result)
		})

		worker.on('error', (error: string) => {
			this.logError(`Worker ${worker.getWorkerId()} error: ${error}`)
			this.handleWorkerError(worker, error)
		})

		worker.on('progress', (progress) => {
			this.eventEmitter.emit('progress', progress)
		})

		worker.on('worker-error', (error: Error) => {
			this.handleWorkerError(worker, error.message)
		})

		worker.on('exit', (code: number) => {
			this.handleWorkerExit(worker, code)
		})
	}

	public async submitTask(task: BaseWorkerTask): Promise<WorkerTaskResult> {
		if (this.isShuttingDown) {
			throw new Error('Worker pool is shutting down')
		}

		if (this.taskQueue.length >= this.config.maxTaskQueue!) {
			throw new Error('Task queue is full')
		}

		return new Promise<WorkerTaskResult>((resolve, reject) => {
			const queuedTask: QueuedTask = {
				task,
				resolve,
				reject,
				submitTime: Date.now()
			}

			// Set timeout for the task
			queuedTask.timeout = setTimeout(() => {
				const index = this.taskQueue.indexOf(queuedTask)
				if (index > -1) {
					this.taskQueue.splice(index, 1)
				}
				reject(new Error(`Task ${task.id} timed out in queue`))
			}, task.timeout)

			this.taskQueue.push(queuedTask)
			this.processNextTask()
		})
	}

	public async submitBatch(tasks: BaseWorkerTask[]): Promise<WorkerTaskResult[]> {
		this.logInfo(`Submitting batch of ${tasks.length} tasks`)

		const promises = tasks.map(task => this.submitTask(task))
		const results = await Promise.allSettled(promises)

		return results.map(result => {
			if (result.status === 'fulfilled') {
				return result.value
			} else {
				return {
					taskId: '',
					success: false,
					error: result.reason?.message ?? 'Unknown error',
					executionTime: 0
				}
			}
		})
	}

	protected async processNextTask(): Promise<void> {
		if (this.taskQueue.length === 0) return

		const availableWorker = this.getAvailableWorker()
		if (!availableWorker) return

		const queuedTask = this.taskQueue.shift()
		if (!queuedTask) return

		// Clear queue timeout
		if (queuedTask.timeout) {
			clearTimeout(queuedTask.timeout)
		}

		const { task, resolve, reject } = queuedTask

		try {
			const result = await availableWorker.submitTask(task)
			resolve(result)
		} catch (error) {
			reject(error instanceof Error ? error : new Error(String(error)))
		}
	}

	protected getAvailableWorker(): BaseWorker | undefined {
		return this.workers.find(worker => worker.getStatus() === 'idle')
	}

	protected handleTaskResult(result: WorkerTaskResult): void {
		this.eventEmitter.emit('result', result)
		this.processNextTask() // Process next task in queue
	}

	protected handleWorkerError(worker: BaseWorker, error: string): void {
		this.logError(`Worker ${worker.getWorkerId()} error: ${error}`)
		this.eventEmitter.emit('worker-error', { workerId: worker.getWorkerId(), error })

		// Try to restart the worker
		this.restartWorker(worker)
	}

	protected async restartWorker(failedWorker: BaseWorker): Promise<void> {
		this.logInfo(`Restarting worker ${failedWorker.getWorkerId()}`)

		// Remove failed worker
		const index = this.workers.indexOf(failedWorker)
		if (index > -1) {
			this.workers.splice(index, 1)
		}

		// Shutdown failed worker
		try {
			await failedWorker.shutdown()
		} catch (error) {
			this.logError(`Error shutting down failed worker:`, error)
		}

		// Create new worker
		try {
			const newWorker = new this.workerClass(this.type, this.config)
			this.setupWorkerEventHandlers(newWorker)
			await newWorker.start()
			this.workers.push(newWorker)

			this.logInfo(`Worker ${newWorker.getWorkerId()} restarted successfully`)
		} catch (error) {
			this.logError(`Failed to restart worker:`, error)
		}
	}

	protected handleWorkerExit(worker: BaseWorker, code: number): void {
		this.logInfo(`Worker ${worker.getWorkerId()} exited with code ${code}`)
		this.eventEmitter.emit('worker-exit', { workerId: worker.getWorkerId(), code })

		if (code !== 0 && !this.isShuttingDown) {
			// Restart worker if it exited unexpectedly
			this.restartWorker(worker)
		}
	}

	public getStats(): {
		pool: {
			type: string
			totalWorkers: number
			activeWorkers: number
			idleWorkers: number
			queueLength: number
		}
		workers: WorkerStats[]
	} {
		const activeWorkers = this.workers.filter(w => w.getStatus() === 'busy').length
		const idleWorkers = this.workers.filter(w => w.getStatus() === 'idle').length

		return {
			pool: {
				type: this.type,
				totalWorkers: this.workers.length,
				activeWorkers,
				idleWorkers,
				queueLength: this.taskQueue.length
			},
			workers: this.workers.map(worker => worker.getStats())
		}
	}

	public getPoolType(): string {
		return this.type
	}

	public getQueueLength(): number {
		return this.taskQueue.length
	}

	public getWorkerCount(): number {
		return this.workers.length
	}

	public isHealthy(): boolean {
		// Pool is healthy if at least one worker is active
		return this.workers.length > 0 && !this.isShuttingDown
	}

	public async shutdown(): Promise<void> {
		this.logInfo('Shutting down worker pool')
		this.isShuttingDown = true

		// Reject all queued tasks
		const queuedTasks = this.taskQueue.splice(0)
		queuedTasks.forEach(({ reject, task }) => {
			reject(new Error('Worker pool is shutting down'))
		})

		// Shutdown all workers
		const shutdownPromises = this.workers.map(worker => worker.shutdown())
		await Promise.allSettled(shutdownPromises)

		this.workers = []
		this.logInfo('Worker pool shutdown complete')
	}

	// Event listeners
	public on(event: 'result' | 'progress' | 'worker-error' | 'worker-exit', listener: (...args: any[]) => void): void {
		this.eventEmitter.on(event, listener)
	}

	public off(event: 'result' | 'progress' | 'worker-error' | 'worker-exit', listener: (...args: any[]) => void): void {
		this.eventEmitter.off(event, listener)
	}
}