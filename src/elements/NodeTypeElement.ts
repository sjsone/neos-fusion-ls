import { AbstractNode } from 'ts-fusion-parser/out/common/AbstractNode';
import { CodeLens, CodeLensParams, Position, Range, SymbolInformation, SymbolKind, WorkspaceSymbol, WorkspaceSymbolParams } from 'vscode-languageserver';
import { NodeTypeService } from '../common/NodeTypeService';
import { CapabilityContext } from './CapabilityContext';
import { Element } from './Element';

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
}