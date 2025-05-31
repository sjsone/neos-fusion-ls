import { HandlerResult, Hover, HoverParams, ResponseError, TextDocumentPositionParams, WorkspaceSymbolParams } from 'vscode-languageserver'
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

	protected buildContext(params: TextDocumentPositionParams | WorkspaceSymbolParams): CapabilityContext | undefined {
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

	protected buildContextNodeByLine(params: TextDocumentPositionParams, parsedFusionFile: ParsedFusionFile | undefined) {
		if (parsedFusionFile === undefined) {
			return undefined
		}

		const line = params.position.line
		const column = params.position.character

		this.logDebug(`${line}/${column} ${params.textDocument.uri}`)

		return parsedFusionFile.getNodeByLineAndColumn(line, column)
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
			const hover = await element.hoverCapability(context, params)
			if (hover === undefined) continue

			if (typeof hover === "string") return {
				contents: { kind: "markdown", value: hover },
				range: context.foundNodeByLine!.getPositionAsRange()
			}

			return hover
		}

		return undefined
	}
}