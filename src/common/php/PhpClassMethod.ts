export class PhpClassMethod {
	constructor(
		public readonly name: string,
		public readonly parameters: any[],
	) {
	}
	public getName() {
		return this.name
	}
	public getParameters() {
		return this.parameters
	}
}