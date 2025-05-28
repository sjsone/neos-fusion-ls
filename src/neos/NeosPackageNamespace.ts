import * as NodeFs from "fs"
import * as NodePath from "path"
import { getLineNumberOfChar, pathToUri } from '../common/util'
import { EelHelperMethod } from '../eel/EelHelperMethod'
import { PhpMethodParameter, PhpTypeWithDescription } from '../eel/PhpMethod'
import { PhpFile } from '../common/php/PhpFile'

export interface ClassDefinition {
	uri: string
	methods: EelHelperMethod[],
	namespace: NeosPackageNamespace
	className: string
	pathParts: string[]
	position: {
		start: { line: number, character: number }
		end: { line: number, character: number }
	},
}

export class NeosPackageNamespace {
	public name: string
	protected path: string

	protected fileUriCache: Map<string, string> = new Map()
	protected fqcnCache: Map<string, { possibleFilePath: string, className: string, pathParts: string[] }> = new Map()

	constructor(name: string, path: string) {
		this.name = name
		this.path = path
	}

	getFileUriFromFullyQualifiedClassName(fullyQualifiedClassName: string) {
		if (this.fileUriCache.has(fullyQualifiedClassName)) return this.fileUriCache.get(fullyQualifiedClassName)
		const path = fullyQualifiedClassName.replace(this.name, "")

		const pathParts = path.split("\\")
		const className = pathParts.pop()
		const possibleFilePath = NodePath.join(this.path, ...pathParts, className + ".php")

		if (!NodeFs.existsSync(possibleFilePath)) return undefined

		const phpFile = PhpFile.fromPath(possibleFilePath)
		phpFile.getNamespace()
		if (phpFile.getNamespace() !== this.name + pathParts.join("\\")) return undefined

		if (phpFile.getClassName() !== className) return undefined

		const fileUri = pathToUri(possibleFilePath)

		this.fileUriCache.set(fullyQualifiedClassName, fileUri)

		return fileUri
	}

	getClassDefinitionFromFilePathAndClassName(filePath: string, className: string, pathParts: string[]): undefined | ClassDefinition {
		const classDefinition: ClassDefinition = {
			uri: "",
			methods: [],
			namespace: this,
			pathParts,
			className,
			position: {
				start: { line: 0, character: 0 },
				end: { line: 0, character: 0 },
			}
		}

		const fileUri = pathToUri(filePath)
		const phpFileSource = NodeFs.readFileSync(filePath).toString()

		const namespace = this.name + pathParts.join("\\")
		const namespaceRegex = new RegExp(`namespace\\s+${(namespace).split("\\").join("\\\\")};`)
		if (!namespaceRegex.test(phpFileSource)) return undefined

		const classRegex = new RegExp(`class\\s+${className}`)

		const classMatch = classRegex.exec(phpFileSource)
		if (classMatch === null) return undefined

		const begin = phpFileSource.indexOf(classMatch[0])
		const end = begin + classMatch[0].length

		const methodsRegex = /(public\s+(static\s+)?function\s+([a-zA-Z0-9]+)\s?\((?: *([^)]*?) *\))?)(?::\s+([a-zA-Z0-9| ?\\_-]+)\s*)?/g
		let lastIndex = 0
		const rest = phpFileSource
		// if (className == "TranslationParameterToken") console.log("rest", rest)

		let match = methodsRegex.exec(rest)
		const useStatements = this.parseUseStatements(phpFileSource)


		while (match != null) {
			const fullDefinition = match[1]
			// const isStatic = !!match[2]
			const name = match[3]
			const rawParameters = (match[4] ?? '').trim() + ')'
			const parameters = this.parseMethodParameters(rawParameters)

			const rawReturnType = match[5] ?? ''
			const returnType = this.parseMethodReturnType(namespace, useStatements, rawReturnType)

			const identifierIndex = rest.substring(lastIndex).indexOf(fullDefinition) + lastIndex
			const { description, returns } = this.parseMethodComment(identifierIndex, phpFileSource)

			const method = new EelHelperMethod(fileUri, name, description, parameters, {
				start: getLineNumberOfChar(phpFileSource, identifierIndex, fileUri),
				end: getLineNumberOfChar(phpFileSource, identifierIndex + fullDefinition.length, fileUri)
			}, {
				type: returns?.type ? this.parseClassType(namespace, useStatements, returns.type) : returnType[0],
				description: returns?.description
			})

			method.classDefinition = classDefinition

			classDefinition.methods.push(method)

			lastIndex = identifierIndex + fullDefinition.length
			match = methodsRegex.exec(rest)
		}

		classDefinition.uri = fileUri
		classDefinition.position = {
			start: getLineNumberOfChar(phpFileSource, begin, fileUri),
			end: getLineNumberOfChar(phpFileSource, end, fileUri)
		}

		return classDefinition
	}

	getClassDefinitionFromFullyQualifiedClassName(fullyQualifiedClassName: string): undefined | ClassDefinition {
		if (this.fqcnCache.has(fullyQualifiedClassName)) {
			const { possibleFilePath, className, pathParts } = this.fqcnCache.get(fullyQualifiedClassName)!
			if (!NodeFs.existsSync(possibleFilePath)) return undefined
			return this.getClassDefinitionFromFilePathAndClassName(possibleFilePath, className, pathParts)
		}

		const path = fullyQualifiedClassName.replace(this.name, "")

		const pathParts = path.split("\\")
		const className = pathParts.pop()!
		const possibleFilePath = NodePath.join(this.path, ...pathParts, className + ".php")

		this.fqcnCache.set(fullyQualifiedClassName, { possibleFilePath, className, pathParts })

		if (!NodeFs.existsSync(possibleFilePath)) return undefined
		return this.getClassDefinitionFromFilePathAndClassName(possibleFilePath, className, pathParts)
	}

	protected parseMethodParameters(rawParameters: string): PhpMethodParameter[] {
		const parametersRegex = /(\w+ )?(\.\.\.\s*?)?(\$\w*)( ?= ?.*?)?(?:[,)])/g
		let match = parametersRegex.exec(rawParameters)
		const parameters = []
		let runAwayPrevention = 0
		while (match != null && runAwayPrevention++ < 1000) {
			parameters.push({
				name: match[3],
				defaultValue: match[4],
				spread: !!match[2],
				type: match[1]
			})
			match = parametersRegex.exec(rawParameters)
		}
		return parameters
	}

	protected parseUseStatements(code: string) {
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

	protected parseMethodReturnType(namespace: string, useStatements: string[], rawReturnType: string): Array<string | undefined> {
		if (rawReturnType === "") {
			return []
		}
		// console.log("parseMethodReturnType", rawReturnType)
		if (rawReturnType.startsWith('?')) {
			rawReturnType = rawReturnType.substring(1)
		}

		const phpReturnTypes: string[] = [
			'int',
			'float',
			'double',
			'string',
			'bool',
			'boolean',
			'array',
			'object',
			'callable',
			'iterable',
			'resource',
			'null',
			'mixed',
			'void'
		];

		if (phpReturnTypes.includes(rawReturnType)) {
			return [rawReturnType]
		}

		if (['self', 'parent', 'static'].includes(rawReturnType)) {
			// TODO: handle 'self', 'parent', 'static' return types
			return [undefined]
		}

		return [
			this.parseClassType(namespace, useStatements, rawReturnType)
		]
	}

	protected parseClassType(namespace: string, useStatements: string[], rawReturnType: string) {
		for (const useStatement of useStatements) {
			if (useStatement.endsWith('\\' + rawReturnType)) {
				return useStatement
			}
		}

		return namespace + '\\' + rawReturnType
	}

	protected parseMethodComment(offset: number, code: string, debug: boolean = false) {
		const reversed = code.substring(0, offset).split('').reverse().join('')

		const reversedDescriptionRegex = /^\s*\/\*([\s\S]*?)\s*\*\*\//
		const reversedDescriptionMatch = reversedDescriptionRegex.exec(reversed)

		const typeWithDescriptionRegex = /^(\w+) *(.*)$/

		const descriptionParts = []
		let returns: PhpTypeWithDescription | undefined = undefined
		if (reversedDescriptionMatch) {
			const fullDocBlock = reversedDescriptionMatch[1].split('').reverse().join('')
			if (debug) console.log(fullDocBlock)
			const docLineRegex = /^\s*\* ?(@\w+)?(.+)?$/gm
			let docLineMatch = docLineRegex.exec(fullDocBlock)
			let runAwayPrevention = 0
			while (docLineMatch && runAwayPrevention++ < 1000) {
				if (docLineMatch[1] === "@return") {
					const res = typeWithDescriptionRegex.exec(docLineMatch[2].trim())
					if (res) returns = {
						type: res[1] ?? undefined,
						description: res[2] ?? undefined
					}
				} else {
					const line = docLineMatch[2] ?? "\n";
					if (debug) console.log(`Line: <${line}>`)
					descriptionParts.push(line.trim() === "Examples::" ? "Examples:" : line)
				}

				docLineMatch = docLineRegex.exec(fullDocBlock)
			}
		}
		return {
			description: descriptionParts.join("\n"),
			returns
		}
	}
}
