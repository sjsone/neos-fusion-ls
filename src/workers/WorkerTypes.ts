export interface WorkerTask<TData = any, TResult = any> {
	id: string
	type: string
	data: TData
	priority?: 'low' | 'normal' | 'high'
	timeout?: number
	retryAttempts?: number
}

export interface WorkerTaskResult<TResult = any> {
	taskId: string
	success: boolean
	result?: TResult
	error?: string
	executionTime: number
}

export interface WorkerMessage<T = any> {
	id: string
	type: 'task' | 'result' | 'error' | 'progress' | 'ready' | 'shutdown'
	data: T
	timestamp: number
}

export interface WorkerProgress {
	taskId: string
	progress: number
	message?: string
}

export interface WorkerStats {
	totalTasks: number
	completedTasks: number
	failedTasks: number
	averageExecutionTime: number
	currentLoad: number
	memoryUsage: number
}

export interface WorkerPoolConfig {
	size: number
	memoryLimit?: string
	maxTaskQueue?: number
	taskTimeout?: number
	maxRetries?: number
}

export interface WorkerTypeConfig {
	workerClass: string
	defaultPoolSize: number
	taskFactory: string
	priority?: 'low' | 'normal' | 'high'
	config?: WorkerPoolConfig
}

export type WorkerStatus = 'idle' | 'busy' | 'error' | 'shutting-down'