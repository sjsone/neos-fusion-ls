import { ObjectNode } from 'ts-fusion-parser/out/dsl/eel/nodes/ObjectNode';
import { ObjectPathNode } from 'ts-fusion-parser/out/dsl/eel/nodes/ObjectPathNode';
import { ObjectStatement } from 'ts-fusion-parser/out/fusion/nodes/ObjectStatement';
import { PathSegment } from 'ts-fusion-parser/out/fusion/nodes/PathSegment';
import { ValueAssignment } from 'ts-fusion-parser/out/fusion/nodes/ValueAssignment';
import { Hover, HoverParams } from 'vscode-languageserver';
import { NodeService } from '../common/NodeService';
import { findParent } from '../common/util';
import { CapabilityContext } from './CapabilityContext';
import { Element } from './Element';

export class EelElement extends Element<ObjectPathNode> {
	public async hoverCapability(context: CapabilityContext<ObjectPathNode>, params: HoverParams): Promise<string | Hover | undefined> {
		const node = context.foundNodeByLine!.getNode()
		const workspace = context.workspaces[0]!
		const objectNode = node.parent
		if (!(objectNode instanceof ObjectNode)) return undefined
		if ((objectNode.path[0].value !== "this" && objectNode.path[0].value !== "props") || objectNode.path.length < 2) return undefined

		const externalObjectStatement = NodeService.findPropertyDefinitionSegment(objectNode, workspace, true)
		const segment = <PathSegment>externalObjectStatement?.statement.path.segments[0]
		if (segment && segment instanceof PathSegment) {
			const statement = findParent(segment, ObjectStatement)
			if (!statement) return undefined
			if (!(statement.operation instanceof ValueAssignment)) return undefined

			const documentationDefinition = statement.documentationDefinition
			if (!documentationDefinition) return `EEL **${node['value']}**`

			return [
				documentationDefinition.text,
				"```fusion",
				`/// ${documentationDefinition.type}`,
				"```"
			].join("\n")
		}

		return `EEL **${node['value']}**`
	}
}