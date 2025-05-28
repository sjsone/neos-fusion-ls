import { PhpClassMethod } from './PhpClassMethod'

export class PhpClass {
	constructor(
		public readonly fullyQualifiedClassName: string,
		public readonly methods: PhpClassMethod[],
		public readonly fileUri: string,
	) {
	}
	public getFullyQualifiedClassName() {
		return this.fullyQualifiedClassName
	}
	public getMethods() {
		return this.methods
	}
	public getFileUri() {
		return this.fileUri
	}
}