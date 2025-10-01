import { ObjectNode } from 'ts-fusion-parser/out/dsl/eel/nodes/ObjectNode'
import { PathSegment } from 'ts-fusion-parser/out/fusion/nodes/PathSegment'
import { ObjectStatement } from 'ts-fusion-parser/out/fusion/nodes/ObjectStatement'
import { ObjectPathNode } from 'ts-fusion-parser/out/dsl/eel/nodes/ObjectPathNode'
import { Location } from 'vscode-languageserver/node'
import { findParent } from '../common/util'
import { NodeService } from '../common/NodeService'
import { CapabilityContext } from './CapabilityContext'
import { Element } from './Element'

export class PathSegmentDefinitionElement extends Element<PathSegment | ObjectPathNode> {
	public async definitionCapability(context: CapabilityContext<PathSegment | ObjectPathNode>): Promise<Location[] | undefined> {
		const foundNodeByLine = context.foundNodeByLine!
		if (!foundNodeByLine) return undefined

		const node = foundNodeByLine.getNode()
		if (!(node instanceof PathSegment) && !(node instanceof ObjectPathNode)) return undefined

		const workspace = context.workspaces[0]!
		const parsedFile = context.parsedFusionFile!
		if (!parsedFile) return undefined

		const relevantParentType = node instanceof ObjectPathNode ? ObjectNode : ObjectStatement

		const objectNodeOrStatement = findParent(node, relevantParentType)
		if (!objectNodeOrStatement) return undefined

		const segment = NodeService.findPropertyDefinitionSegment(objectNodeOrStatement, workspace, true, false)
		if (!segment) return undefined

		const firstSegment = segment.statement.path.segments[0]
		return [{
			uri: firstSegment.fileUri,
			range: firstSegment.linePositionedNode.getPositionAsRange()
		}]
	}
}