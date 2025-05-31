import { AbstractNode } from 'ts-fusion-parser/out/common/AbstractNode';
import { CodeLens, CodeLensParams } from 'vscode-languageserver';
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
}