import * as NodeFs from 'fs'
import { type NeosPackageNamespace } from '../../neos/NeosPackageNamespace'
import { LinePosition } from '../LinePositionedNode'
import { getLineNumberOfChar, pathToUri } from '../util'
import { PhpClassMethod, PhpClassMethodRegExp } from './PhpClassMethod'

export class PhpClass {
	protected constructor(
		public readonly fullyQualifiedClassName: string,
		public readonly methods: PhpClassMethod[],
		public readonly fileUri: string,
		public readonly namespace: NeosPackageNamespace,
		public readonly position: { start: LinePosition, end: LinePosition }
	) {
		for (const method of this.methods) {
			method.phpClass = this
		}
	}

	public getClassName() {
		const parts = this.fullyQualifiedClassName.split("\\")
		return parts.pop()!
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

	static fromPath(fqcn: string, filePath: string, namespace: NeosPackageNamespace): PhpClass | undefined {
		const fileUri = pathToUri(filePath)
		const phpFileSource = NodeFs.readFileSync(filePath).toString()

		const path = fqcn.replace(namespace.name, "")

		const pathParts = path.split("\\")
		const className = pathParts.pop()!

		const classNamespace = namespace.name + pathParts.join("\\")
		const namespaceRegex = new RegExp(`namespace\\s+${(classNamespace).split("\\").join("\\\\")};`)
		if (!namespaceRegex.test(phpFileSource)) {
			return undefined
		}

		const classRegex = new RegExp(`class\\s+${className}`)

		const classMatch = classRegex.exec(phpFileSource)
		if (classMatch === null) {
			return undefined
		}

		const begin = phpFileSource.indexOf(classMatch[0])
		const end = begin + classMatch[0].length

		const methodsRegex = PhpClassMethodRegExp()
		let lastIndex = 0
		const rest = phpFileSource

		let match = methodsRegex.exec(rest)
		const useStatements = PhpClass.parseUseStatements(phpFileSource)

		const methods: PhpClassMethod[] = []
		while (match != null) {
			const fullDefinition = match[1]
			const identifierIndex = rest.substring(lastIndex).indexOf(fullDefinition) + lastIndex

			const method = PhpClassMethod.fromRegExpMatch(match, useStatements, classNamespace, identifierIndex, phpFileSource, fileUri)
			if (method) {
				methods.push(method)
			}

			lastIndex = identifierIndex + fullDefinition.length
			match = methodsRegex.exec(rest)
		}


		const classPosition = {
			start: getLineNumberOfChar(phpFileSource, begin, fileUri),
			end: getLineNumberOfChar(phpFileSource, end, fileUri)
		}
		return new PhpClass(fqcn, methods, fileUri, namespace, classPosition)
	}

	protected static parseUseStatements(code: string) {
		const useStatementRegex = /use\s+([^;]+);/g;
		let match = useStatementRegex.exec(code)
		const uses = []
		let runAwayPrevention = 0
		while (match != null && runAwayPrevention++ < 1000) {
			uses.push(match[1])
			match = useStatementRegex.exec(code)
		}
		return uses
	}
}