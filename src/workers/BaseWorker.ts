import { EventEmitter } from 'events'
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads'
import { Logger } from '../common/Logging'
import { MessageFactory, MessageValidator } from './WorkerMessage'
import { BaseWorkerTask } from './WorkerTask'
import { WorkerProgress, WorkerStats, WorkerStatus, WorkerTaskResult } from './WorkerTypes'

export interface BaseWorkerData {
	workerId: string
	workerType: string
	config?: {
		memoryLimit?: string
		maxTaskQueue?: number
		taskTimeout?: number
		maxRetries?: number
	}
}

export abstract class BaseWorker<TTask extends BaseWorkerTask = BaseWorkerTask> extends Logger {
	protected worker?: Worker
	protected workerId: string
	protected workerType: string
	protected config: BaseWorkerData['config']
	protected eventEmitter = new EventEmitter()
	protected currentTask?: TTask
	protected status: WorkerStatus = 'idle'
	protected stats: WorkerStats = {
		totalTasks: 0,
		completedTasks: 0,
		failedTasks: 0,
		averageExecutionTime: 0,
		currentLoad: 0,
		memoryUsage: 0
	}

	constructor(workerType: string, config?: BaseWorkerData['config']) {
		super(`Worker[${workerType}]`)
		this.workerType = workerType
		this.workerId = this.generateWorkerId(workerType)
		this.config = config
	}

	private generateWorkerId(workerType: string): string {
		return `worker_${workerType}_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`
	}

	// Main thread methods
	public async start(): Promise<void> {
		if (isMainThread) {
			await this.startMainThreadWorker()
		} else {
			await this.startWorkerThread()
		}
	}

	protected async startMainThreadWorker(): Promise<void> {
		this.logInfo(`Starting worker ${this.workerId}`)

		this.worker = new Worker(__filename, {
			workerData: {
				workerId: this.workerId,
				workerType: this.workerType,
				config: this.config
			}
		})

		this.worker.on('message', this.handleMessageFromWorker.bind(this))
		this.worker.on('error', this.handleWorkerError.bind(this))
		this.worker.on('exit', this.handleWorkerExit.bind(this))

		this.status = 'idle'
	}

	// Worker thread methods
	protected async startWorkerThread(): Promise<void> {
		const workerData = this.getWorkerData()
		if (!workerData) {
			throw new Error('Worker data not available in worker thread')
		}

		this.workerId = workerData.workerId
		this.workerType = workerData.workerType
		this.config = workerData.config

		this.logInfo(`Worker thread ${this.workerId} started`)

		if (parentPort) {
			parentPort.on('message', this.handleMessageFromMain.bind(this))
			parentPort.postMessage(MessageFactory.createReadyMessage(this.workerId))
		}
	}

	protected getWorkerData(): BaseWorkerData | undefined {
		try {
			return workerData as BaseWorkerData
		} catch {
			return undefined
		}
	}

	// Abstract methods to be implemented by concrete workers
	public abstract processTask(task: TTask): Promise<any>

	// Task execution
	protected async executeTask(task: TTask): Promise<WorkerTaskResult> {
		const startTime = Date.now()
		this.currentTask = task
		this.status = 'busy'

		try {
			this.logDebug(`Executing task ${task.id} of type ${task.type}`)
			const result = await Promise.race([
				this.processTask(task),
				this.createTaskTimeout(task)
			])

			const executionTime = Date.now() - startTime
			this.updateStats(true, executionTime)

			this.logDebug(`Task ${task.id} completed in ${executionTime}ms`)

			return task.createResult(true, result)

		} catch (error) {
			const executionTime = Date.now() - startTime
			this.updateStats(false, executionTime)

			this.logError(`Task ${task.id} failed:`, error)

			return task.createResult(false, undefined, error instanceof Error ? error.message : String(error))

		} finally {
			this.currentTask = undefined
			this.status = 'idle'
		}
	}

	protected async createTaskTimeout(task: TTask): Promise<never> {
		return new Promise((_, reject) => {
			setTimeout(() => {
				reject(new Error(`Task ${task.id} timed out after ${task.timeout}ms`))
			}, task.timeout)
		})
	}

	// Message handling (main thread)
	protected handleMessageFromWorker(message: any): void {
		if (!MessageValidator.isValidMessage(message)) {
			this.logInfo('Received invalid message from worker:', message)
			return
		}

		switch (message.type) {
			case 'ready':
				this.handleWorkerReady(message.data)
				break
			case 'result':
				this.handleTaskResult(message.data)
				break
			case 'error':
				this.handleTaskError(message.data)
				break
			case 'progress':
				this.handleTaskProgress(message.data)
				break
			default:
				this.logInfo(`Unknown message type: ${message.type}`)
		}
	}

	// Message handling (worker thread)
	protected handleMessageFromMain(message: any): void {
		if (!MessageValidator.isValidTaskMessage(message)) {
			this.logInfo('Received invalid task message from main:', message)
			return
		}

		this.processTaskFromMain(message.data)
	}

	protected async processTaskFromMain(taskData: any): Promise<void> {
		try {
			const task = this.createTaskFromData(taskData)
			const result = await this.executeTask(task)

			if (parentPort) {
				parentPort.postMessage(MessageFactory.createResultMessage(result))
			}

		} catch (error) {
			if (parentPort) {
				parentPort.postMessage(MessageFactory.createErrorMessage(taskData.id,
					error instanceof Error ? error.message : String(error)))
			}
		}
	}

	// Abstract factory method
	protected abstract createTaskFromData(taskData: any): TTask

	// Event handlers
	protected handleWorkerReady(workerId: string): void {
		this.logInfo(`Worker ${workerId} is ready`)
		this.eventEmitter.emit('ready', workerId)
	}

	protected handleTaskResult(result: WorkerTaskResult): void {
		this.logDebug(`Task ${result.taskId} result received`)
		this.eventEmitter.emit('result', result)
	}

	protected handleTaskError(error: string): void {
		this.logError(`Worker error: ${error}`)
		this.eventEmitter.emit('error', error)
	}

	protected handleTaskProgress(progress: WorkerProgress): void {
		this.eventEmitter.emit('progress', progress)
	}

	protected handleWorkerError(error: Error): void {
		this.logError(`Worker error:`, error)
		this.status = 'error'
		this.eventEmitter.emit('worker-error', error)
	}

	protected handleWorkerExit(code: number): void {
		this.logInfo(`Worker ${this.workerId} exited with code ${code}`)
		this.status = 'shutting-down'
		this.eventEmitter.emit('exit', code)
	}

	// Public API
	public async submitTask(task: TTask): Promise<WorkerTaskResult> {
		if (!this.worker || this.status !== 'idle') {
			throw new Error(`Worker ${this.workerId} is not available`)
		}

		this.stats.totalTasks++

		return new Promise((resolve, reject) => {
			const message = MessageFactory.createTaskMessage(task)

			const onResult = (result: WorkerTaskResult) => {
				if (result.taskId === task.id) {
					this.eventEmitter.off('result', onResult)
					this.eventEmitter.off('error', onError)
					resolve(result)
				}
			}

			const onError = (error: string) => {
				if (error.includes(task.id)) {
					this.eventEmitter.off('result', onResult)
					this.eventEmitter.off('error', onError)
					reject(new Error(error))
				}
			}

			this.eventEmitter.on('result', onResult)
			this.eventEmitter.on('error', onError)

			this.worker!.postMessage(message)
		})
	}

	public getStats(): WorkerStats {
		// Update memory usage if available
		if (typeof process !== 'undefined' && process.memoryUsage) {
			this.stats.memoryUsage = process.memoryUsage().heapUsed
		}
		return { ...this.stats }
	}

	public getStatus(): WorkerStatus {
		return this.status
	}

	public getWorkerId(): string {
		return this.workerId
	}

	public getWorkerType(): string {
		return this.workerType
	}

	public async shutdown(): Promise<void> {
		this.logInfo(`Shutting down worker ${this.workerId}`)
		this.status = 'shutting-down'

		if (this.worker) {
			this.worker.postMessage(MessageFactory.createShutdownMessage(this.workerId))

			// Wait for graceful shutdown or force terminate
			setTimeout(() => {
				if (this.worker) {
					this.worker.terminate()
				}
			}, 5000)
		}
	}

	// Stats management
	protected updateStats(success: boolean, executionTime: number): void {
		if (success) {
			this.stats.completedTasks++
		} else {
			this.stats.failedTasks++
		}

		// Update average execution time
		const totalCompleted = this.stats.completedTasks + this.stats.failedTasks
		this.stats.averageExecutionTime =
			(this.stats.averageExecutionTime * (totalCompleted - 1) + executionTime) / totalCompleted

		// Update current load (0-1 scale)
		this.stats.currentLoad = this.currentTask ? 1 : 0
	}

	// Event listeners
	public on(event: 'ready' | 'result' | 'error' | 'progress' | 'worker-error' | 'exit', listener: (...args: any[]) => void): void {
		this.eventEmitter.on(event, listener)
	}

	public off(event: 'ready' | 'result' | 'error' | 'progress' | 'worker-error' | 'exit', listener: (...args: any[]) => void): void {
		this.eventEmitter.off(event, listener)
	}
}