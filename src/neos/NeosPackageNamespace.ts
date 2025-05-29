import * as NodeFs from "fs"
import * as NodePath from "path"
import { PhpClass } from '../common/php/PhpClass'
import { PhpFile } from '../common/php/PhpFile'
import { pathToUri } from '../common/util'


export class NeosPackageNamespace {
	public name: string
	protected path: string

	protected fileUriCache: Map<string, string> = new Map()
	protected fqcnCache: Map<string, { possibleFilePath: string, className: string, pathParts: string[] }> = new Map()

	protected phpClassByFQCN: Map<string, PhpClass> = new Map()

	constructor(name: string, path: string) {
		this.name = name
		this.path = path
	}

	getFileUriFromFullyQualifiedClassName(fullyQualifiedClassName: string) {
		const phpClass = this.getPhpClassFromFullyQualifiedClassName(fullyQualifiedClassName)
		if (phpClass === undefined) {
			return undefined
		}

		return phpClass.fileUri
	}

	getPhpClassFromFullyQualifiedClassName(fullyQualifiedClassName: string): undefined | PhpClass {
		if (this.phpClassByFQCN.has(fullyQualifiedClassName)) {
			return this.phpClassByFQCN.get(fullyQualifiedClassName)
		}

		const path = fullyQualifiedClassName.replace(this.name, "")

		const pathParts = path.split("\\")
		const className = pathParts.pop()!
		const possibleFilePath = NodePath.join(this.path, ...pathParts, className + ".php")
		if (!NodeFs.existsSync(possibleFilePath)) {
			return undefined
		}

		const phpClass = PhpClass.fromPath(fullyQualifiedClassName, possibleFilePath, this)
		if (phpClass === undefined) {
			return undefined
		}
		this.phpClassByFQCN.set(fullyQualifiedClassName, phpClass)

		return phpClass
	}
}
