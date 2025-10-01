import { WorkerTask, WorkerTaskResult, WorkerProgress } from './WorkerTypes'

export abstract class BaseWorkerTask<TData = any, TResult = any> implements WorkerTask<TData, TResult> {
	public readonly id: string
	public readonly type: string
	public readonly data: TData
	public readonly priority: 'low' | 'normal' | 'high'
	public readonly timeout: number
	public readonly retryAttempts: number
	public readonly createdAt: number

	constructor(type: string, data: TData, options: {
		priority?: 'low' | 'normal' | 'high'
		timeout?: number
		retryAttempts?: number
	} = {}) {
		this.id = this.generateId()
		this.type = type
		this.data = data
		this.priority = options.priority ?? 'normal'
		this.timeout = options.timeout ?? 30000 // 30 seconds default
		this.retryAttempts = options.retryAttempts ?? 3
		this.createdAt = Date.now()
	}

	private generateId(): string {
		return 'task_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9)
	}

	public createResult(success: boolean, result?: TResult, error?: string): WorkerTaskResult<TResult> {
		return {
			taskId: this.id,
			success,
			result,
			error,
			executionTime: Date.now() - this.createdAt
		}
	}

	public createProgress(progress: number, message?: string): WorkerProgress {
		return {
			taskId: this.id,
			progress,
			message
		}
	}

	public isExpired(): boolean {
		return Date.now() - this.createdAt > this.timeout
	}
}

export class TaskBatch<TData = any, TResult = any> {
	public readonly id: string
	public readonly tasks: BaseWorkerTask<TData, TResult>[]
	public readonly createdAt: number

	constructor(tasks: BaseWorkerTask<TData, TResult>[]) {
		this.id = 'batch_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9)
		this.tasks = tasks
		this.createdAt = Date.now()
	}

	public isCompleted(): boolean {
		return this.tasks.every(task => task instanceof CompletedTask)
	}

	public getResults(): TResult[] {
		return this.tasks
			.filter((task): task is CompletedTask<TResult> => task instanceof CompletedTask)
			.map(task => task.result)
	}
}

export class CompletedTask<TResult> extends BaseWorkerTask<any, TResult> {
	constructor(
		taskId: string,
		type: string,
		public readonly result: TResult,
		public readonly executionTime: number
	) {
		super(type, null as any)
		; (this as any).id = taskId
	}
}