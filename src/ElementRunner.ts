import { CodeLens, CodeLensParams, Hover, HoverParams, ResponseError, TextDocumentPositionParams, WorkspaceSymbolParams } from 'vscode-languageserver'
import { type LanguageServer } from './LanguageServer'
import { Logger } from './common/Logging'
import { CapabilityContext } from './elements/CapabilityContext'
import { Element } from './elements/Element'
import { ParsedFusionFile } from './fusion/ParsedFusionFile'

export class ElementRunner extends Logger {
	protected elements: Element[] = []

	public constructor(
		protected readonly languageServer: LanguageServer
	) {
		super()
	}

	public addElement(element: Element) {
		this.elements.push(element)
	}

	protected buildContext(params: TextDocumentPositionParams | WorkspaceSymbolParams | CodeLensParams): CapabilityContext | undefined {
		const workspaces = this.languageServer.fusionWorkspaces
		if (!('textDocument' in params)) {
			return new CapabilityContext(workspaces)
		}

		const uri = params.textDocument.uri

		const workspace = this.languageServer.getWorkspaceForFileUri(uri)
		if (workspace === undefined) {
			this.logDebug(`Could not find workspace for URI: ${uri}`)
			return undefined
		}

		const parsedFusionFile = workspace.getParsedFileByUri(uri)
		const foundNodeByLine = this.buildContextNodeByLine(params, parsedFusionFile)

		return new CapabilityContext(workspaces, parsedFusionFile, foundNodeByLine)
	}

	protected buildContextNodeByLine(params: TextDocumentPositionParams | CodeLensParams, parsedFusionFile: ParsedFusionFile | undefined) {
		if (parsedFusionFile === undefined) {
			return undefined
		}

		if (!('position' in params)) {
			return undefined
		}

		const line = params.position.line
		const column = params.position.character

		this.logDebug(`${line}/${column} ${params.textDocument.uri}`)

		return parsedFusionFile.getNodeByLineAndColumn(line, column)
	}

	public async codeLensCapability(params: CodeLensParams): Promise<CodeLens[] | ResponseError<void> | undefined> {
		const context = this.buildContext(params)
		if (context === undefined) {
			return undefined
		}

		if (context.foundNodeByLine === undefined) {
			return undefined
		}

		const codeLenses: Array<CodeLens> = []
		for (const element of this.elements) {
			try {
				const elementCodeLenses = await element.codeLensCapability(context, params)
				if (elementCodeLenses === undefined) continue

				codeLenses.push(...elementCodeLenses)
			} catch (error) {
				this.logError(error)
			}
		}

		if (codeLenses.length === 0) {
			return undefined
		}

		return codeLenses
	}

	public async hoverCapability(params: HoverParams): Promise<Hover | ResponseError<void> | undefined> {
		const context = this.buildContext(params)
		if (context === undefined) {
			return undefined
		}

		if (context.foundNodeByLine === undefined) {
			return undefined
		}

		for (const element of this.elements) {
			try {
				const hover = await element.hoverCapability(context, params)
				if (hover === undefined) continue

				if (typeof hover === "string") return {
					contents: { kind: "markdown", value: hover },
					range: context.foundNodeByLine!.getPositionAsRange()
				}

				return hover
			} catch (error) {
				this.logError(error)
			}
		}

		return undefined
	}
}