import * as NodeFs from "fs"

const namespaceRegex = /namespace\s+([^;]+);/


export class PhpFile {
	protected namespace: string | undefined = undefined
	protected className: string | undefined = undefined

	constructor(
		protected readonly path: string,
		protected readonly content: string,
	) {
	}

	public getNamespace() {
		if (this.namespace === undefined) {
			this.namespace = PhpFile.extractNamespace(this.content)
		}
		return this.namespace
	}

	public getClassName() {
		if (this.className === undefined) {
			this.className = PhpFile.extractClassName(this.content)
		}
		return this.className
	}

	public getContent() {
		return this.content
	}

	public static fromPath(path: string) {
		const content = NodeFs.readFileSync(path).toString()

		return new PhpFile(path, content)
	}

	protected static extractNamespace(content: string) {
		const match = content.match(namespaceRegex)
		return match ? match[1] : undefined
	}

	protected static extractClassName(content: string) {
		const match = content.match(/class\s+([^\s]+)/)
		return match ? match[1] : undefined
	}
}