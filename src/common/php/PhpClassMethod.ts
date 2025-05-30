import { getLineNumberOfChar } from '../util'
import { type PhpClass } from './PhpClass'

export interface PhpTypeWithDescription {
	type?: string
	description?: string
}
export interface PhpMethodParameter extends PhpTypeWithDescription {
	name: string,
	defaultValue?: string
	spread: boolean,
}

export const PhpClassMethodRegExp = () => /(public\s+(static\s+)?function\s+([a-zA-Z0-9]+)\s?\((?: *([^)]*?) *\))?)(?::\s+([a-zA-Z0-9| ?\\_-]+)\s*)?/g

export class PhpClassMethod {
	public phpClass!: PhpClass

	protected normalizedName: string

	constructor(
		public readonly name: string,
		public readonly isStatic: boolean,
		public readonly parameters: PhpMethodParameter[],
		public readonly description: string,
		public readonly returns: {
			type: string | undefined,
			description: string | undefined
		},
		public readonly position: {
			start: { line: number, character: number }
			end: { line: number, character: number }
		}
	) {
		const nameWithoutGetter = this.name.replace(/get/, '').trim()
		this.normalizedName = nameWithoutGetter ? nameWithoutGetter[0].toLowerCase() + nameWithoutGetter.substring(1) : this.name
	}

	public getName() {
		return this.name
	}
	public getParameters() {
		return this.parameters
	}

	public getNormalizedName() {
		return this.normalizedName
	}

	public valid(identifier: string) {
		// TODO: rename and make better
		if (identifier === this.name) return true
		if (identifier === this.normalizedName) return true
		return false
	}

	public static fromRegExpMatch(match: RegExpExecArray, useStatements: string[], classNamespace: string, identifierIndex: number, phpFileSource: string, fileUri: string): undefined | PhpClassMethod {
		const fullDefinition = match[1]

		const isStatic = !!match[2]
		const name = match[3]
		const rawParameters = (match[4] ?? '').trim() + ')'
		const parameters = PhpClassMethod.parseMethodParameters(rawParameters)

		const rawReturnType = match[5] ?? ''
		const returnType = PhpClassMethod.parseMethodReturnType(classNamespace, useStatements, rawReturnType)

		const { description, returns } = PhpClassMethod.parseMethodComment(identifierIndex, phpFileSource)

		const position = {
			start: getLineNumberOfChar(phpFileSource, identifierIndex, fileUri),
			end: getLineNumberOfChar(phpFileSource, identifierIndex + fullDefinition.length, fileUri)
		}

		const methodReturn = {
			type: returns?.type ? PhpClassMethod.parseMethodReturnType(classNamespace, useStatements, returns.type) : returnType,
			description: returns?.description
		}

		return new PhpClassMethod(name, isStatic, parameters, description, methodReturn, position)
	}

	protected static parseMethodParameters(rawParameters: string): PhpMethodParameter[] {
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

	protected static parseMethodReturnType(classNamespace: string, useStatements: string[], rawReturnType: string): string | undefined {
		if (rawReturnType === "") {
			return undefined
		}

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
			return rawReturnType
		}

		if (['self', 'parent', 'static'].includes(rawReturnType)) {
			// TODO: handle 'self', 'parent', 'static' return types
			return undefined
		}

		return PhpClassMethod.parseClassType(classNamespace, useStatements, rawReturnType)
	}

	protected static parseClassType(classNamespace: string, useStatements: string[], rawReturnType: string) {
		for (const useStatement of useStatements) {
			if (useStatement.endsWith('\\' + rawReturnType)) {
				return useStatement
			}
		}

		return classNamespace + '\\' + rawReturnType
	}

	protected static parseMethodComment(offset: number, code: string, debug: boolean = false) {
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
					let line = "\n"
					if (docLineMatch[2]) {
						if (docLineMatch[1]) {
							line = `_${docLineMatch[1]}_${docLineMatch[2]}\n`
						} else {
							line = docLineMatch[2]
						}
					}
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