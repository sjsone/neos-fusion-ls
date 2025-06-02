import { AbstractNode } from 'ts-fusion-parser/out/common/AbstractNode';
import { FusionObjectValue } from 'ts-fusion-parser/out/fusion/nodes/FusionObjectValue';
import { PrototypePathSegment } from 'ts-fusion-parser/out/fusion/nodes/PrototypePathSegment';
import { CodeLens, CodeLensParams, CreateFile, DeleteFile, Position, PrepareRenameParams, Range, RenameFile, RenameParams, SymbolInformation, SymbolKind, TextDocumentEdit, TextEdit, WorkspaceEdit, WorkspaceSymbol, WorkspaceSymbolParams } from 'vscode-languageserver';
import { NodeTypeService } from '../common/NodeTypeService';
import { CapabilityContext } from './CapabilityContext';
import { Element } from './Element';
import { getPrototypeNameFromNode } from '../common/util';
import { LinePositionedNode } from '../common/LinePositionedNode';
import { FusionWorkspace } from '../fusion/FusionWorkspace';
import { ParsedFusionFile } from '../fusion/ParsedFusionFile';

export class NodeTypeElement extends Element<AbstractNode> {

	public async codeLensCapability(context: CapabilityContext<AbstractNode>, params: CodeLensParams): Promise<CodeLens[] | undefined> {
		const workspace = context.workspaces[0]!
		const parsedFusionFile = context.parsedFusionFile!
		return NodeTypeService.getNodeTypeDefinitionsFromFusionFile(workspace, parsedFusionFile).map(definition => ({
			range: definition.creation.getPositionAsRange(),
			command: {
				title: "NodeType Definition",
				command: 'vscode.open',
				arguments: [
					definition.nodeTypeDefinition.uri
				]
			}
		}))
	}

	public async workspaceSymbolCapability(context: CapabilityContext<AbstractNode>, params: WorkspaceSymbolParams): Promise<SymbolInformation[] | WorkspaceSymbol[] | undefined> {
		const symbols: WorkspaceSymbol[] = []

		for (const workspace of context.workspaces) {
			for (const neosPackage of workspace.neosWorkspace.getPackages().values()) {
				const nodeTypeDefinitions = neosPackage.configuration.nodeTypeDefinitions
				if (!nodeTypeDefinitions) continue
				for (const nodeTypeDefinition of nodeTypeDefinitions) {
					symbols.push({
						name: `NodeType: ${nodeTypeDefinition.nodeType} [${neosPackage?.getPackageName()}]`,
						location: { uri: nodeTypeDefinition.uri, range: Range.create(Position.create(0, 0), Position.create(0, 0)) },
						kind: SymbolKind.Struct,
					})
				}
			}
		}

		return symbols
	}

	public async renamePrepareCapability(context: CapabilityContext<PrototypePathSegment | FusionObjectValue>, params: PrepareRenameParams): Promise<Range | undefined> {
		const foundNodeByLine = context.foundNodeByLine!
		const node = foundNodeByLine.getNode()
		if (!node) return undefined

		if (!this.canNodeBeRenamed(node)) {
			this.logInfo(`Node of type "${node.constructor.name}" cannot be renamed`)
			return undefined
		}

		return foundNodeByLine.getPositionAsRange()
	}

	public async renameCapability(context: CapabilityContext<PrototypePathSegment | FusionObjectValue>, params: RenameParams): Promise<Array<TextDocumentEdit | CreateFile | RenameFile | DeleteFile> | undefined> {
		const workspace = context.workspaces[0]!
		const foundNodeByLine = context.foundNodeByLine!
		if (foundNodeByLine === undefined) return undefined

		const node = context.foundNodeByLine!.getNode()
		if (!this.canNodeBeRenamed(node)) return undefined

		const textDocumentEdits = this.renamePrototypeName(params.newName, foundNodeByLine, workspace)
		if (textDocumentEdits.length === 0) return undefined

		return textDocumentEdits
	}

	protected canNodeBeRenamed(node: AbstractNode): boolean {
		if (node instanceof PrototypePathSegment) return true
		if (node instanceof FusionObjectValue) return true
		return false
	}

	protected * getNodesOfOtherParsedFile(otherParsedFile: ParsedFusionFile) {
		const pathSegments = otherParsedFile.getNodesByType(PrototypePathSegment)
		if (pathSegments) for (const node of pathSegments) yield node

		const objectValues = otherParsedFile.getNodesByType(FusionObjectValue)
		if (objectValues) for (const node of objectValues) yield node
	}

	protected renamePrototypeName(newName: string, foundNodeByLine: LinePositionedNode<PrototypePathSegment | FusionObjectValue>, workspace: FusionWorkspace) {
		const textDocumentEdits: TextDocumentEdit[] = []

		const goToPrototypeName = getPrototypeNameFromNode(foundNodeByLine.getNode())
		if (goToPrototypeName === "") {
			this.logDebug("No PrototypeName found for this node")
			return textDocumentEdits
		}

		for (const otherParsedFile of workspace.parsedFiles) {
			const textEdits: TextEdit[] = []
			for (const otherNode of this.getNodesOfOtherParsedFile(otherParsedFile)) {
				if (getPrototypeNameFromNode(otherNode.getNode()) !== goToPrototypeName) continue
				textEdits.push(TextEdit.replace(otherNode.getPositionAsRange(), newName))
			}
			if (textEdits.length === 0) continue

			textDocumentEdits.push(TextDocumentEdit.create({ uri: otherParsedFile.uri, version: null }, textEdits))
		}

		return textDocumentEdits
	}
}