import { PathSegment } from 'ts-fusion-parser/out/fusion/nodes/PathSegment';
import { Hover, HoverParams } from 'vscode-languageserver';
import { CapabilityContext } from './CapabilityContext';
import { Element } from './Element';
import { AbstractNode } from 'ts-fusion-parser/out/common/AbstractNode';
import { ObjectStatement } from 'ts-fusion-parser/out/fusion/nodes/ObjectStatement';
import { MergedArrayTreeService } from '../common/MergedArrayTreeService';
import { NodeService } from '../common/NodeService';
import { findParent } from '../common/util';

export class FusionPathSegmentElement extends Element<PathSegment> {
	public async hoverCapability(context: CapabilityContext<PathSegment>, params: HoverParams): Promise<string | Hover | undefined> {
		const node = context.foundNodeByLine!.getNode()
		if (!(node instanceof PathSegment)) return undefined

		const workspace = context.workspaces[0]!
		const objectStatement = findParent(node, ObjectStatement)
		if (!objectStatement) return undefined

		const pathForNode = MergedArrayTreeService.buildPathForNode(node).slice(1)

		const configurationList = NodeService.getFusionConfigurationListUntilNode(node, workspace)
		const configuration = configurationList[0]?.configuration
		if (!configuration) return undefined

		let relevantConfiguration = configuration
		for (const part of pathForNode) {
			if (!(part in relevantConfiguration)) return undefined
			relevantConfiguration = relevantConfiguration[part]
		}

		const relevantNodes = relevantConfiguration?.__nodes as Array<AbstractNode>
		if (!relevantNodes) return undefined

		for (const relevantNode of relevantNodes) {
			const relevantObjectStatement = findParent(relevantNode, ObjectStatement)
			if (!relevantObjectStatement) continue
			const documentationDefinition = relevantObjectStatement.documentationDefinition
			if (!documentationDefinition) continue

			return [
				`\`${documentationDefinition.type}\` ${documentationDefinition.text}`,
			].join("\n")
		}


		return undefined
	}
}