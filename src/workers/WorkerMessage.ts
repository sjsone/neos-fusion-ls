import { WorkerMessage, WorkerTask, WorkerTaskResult, WorkerProgress } from './WorkerTypes'

export class MessageFactory {
	static createTaskMessage<T>(task: WorkerTask<T>): WorkerMessage<WorkerTask<T>> {
		return {
			id: task.id,
			type: 'task',
			data: task,
			timestamp: Date.now()
		}
	}

	static createResultMessage<TResult>(result: WorkerTaskResult<TResult>): WorkerMessage<WorkerTaskResult<TResult>> {
		return {
			id: result.taskId,
			type: 'result',
			data: result,
			timestamp: Date.now()
		}
	}

	static createErrorMessage(taskId: string, error: string): WorkerMessage<string> {
		return {
			id: taskId,
			type: 'error',
			data: error,
			timestamp: Date.now()
		}
	}

	static createProgressMessage(progress: WorkerProgress): WorkerMessage<WorkerProgress> {
		return {
			id: progress.taskId,
			type: 'progress',
			data: progress,
			timestamp: Date.now()
		}
	}

	static createReadyMessage(workerId: string): WorkerMessage<string> {
		return {
			id: workerId,
			type: 'ready',
			data: workerId,
			timestamp: Date.now()
		}
	}

	static createShutdownMessage(workerId: string): WorkerMessage<string> {
		return {
			id: workerId,
			type: 'shutdown',
			data: workerId,
			timestamp: Date.now()
		}
	}
}

export class MessageValidator {
	static isValidMessage(message: any): message is WorkerMessage {
		return message &&
			typeof message.id === 'string' &&
			typeof message.type === 'string' &&
			['task', 'result', 'error', 'progress', 'ready', 'shutdown'].includes(message.type) &&
			typeof message.timestamp === 'number'
	}

	static isValidTaskMessage(message: any): message is WorkerMessage<WorkerTask> {
		return this.isValidMessage(message) &&
			message.type === 'task' &&
			message.data &&
			typeof message.data.id === 'string' &&
			typeof message.data.type === 'string'
	}

	static isValidResultMessage(message: any): message is WorkerMessage<WorkerTaskResult> {
		return this.isValidMessage(message) &&
			message.type === 'result' &&
			message.data &&
			typeof message.data.taskId === 'string' &&
			typeof message.data.success === 'boolean'
	}
}