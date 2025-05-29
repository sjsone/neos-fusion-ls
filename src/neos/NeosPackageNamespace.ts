import * as NodeFs from "fs"
import * as NodePath from "path"
import { PhpClass } from '../common/php/PhpClass'
import { Logger } from '../common/Logging'


export class NeosPackageNamespace extends Logger {
	protected phpClassByFQCN: Map<string, PhpClass> = new Map()

	constructor(public readonly name: string, public readonly path: string) {
		super(name)
		this.name = name
		this.path = path
	}

	clearKnownForFileUri(fileUri: string) {
		let wasAffected: boolean = false
		for (const phpClass of this.phpClassByFQCN.values()) {
			if (phpClass.fileUri === fileUri) {
				this.phpClassByFQCN.delete(phpClass.fullyQualifiedClassName)
				this.logVerbose("Removed PHP Class entry for ", fileUri)
				wasAffected = true
			}
		}
		return wasAffected
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
