import { AbstractNode } from 'ts-fusion-parser/out/common/AbstractNode'
import { TagAttributeNode } from 'ts-fusion-parser/out/dsl/afx/nodes/TagAttributeNode'
import { TagNode } from 'ts-fusion-parser/out/dsl/afx/nodes/TagNode'
import { ObjectStatement } from 'ts-fusion-parser/out/fusion/nodes/ObjectStatement'
import { LocationLink } from 'vscode-languageserver/node'
import { ActionUriPartTypes, ActionUriService } from '../common/ActionUriService'
import { NodeService } from '../common/NodeService'
import { findParent } from '../common/util'
import { NeosFusionFormActionNode } from '../fusion/node/NeosFusionFormActionNode'
import { NeosFusionFormControllerNode } from '../fusion/node/NeosFusionFormControllerNode'
import { CapabilityContext } from './CapabilityContext'
import { Element } from './Element'

export class TagAttributeDefinitionElement extends Element<TagAttributeNode> {
	public async definitionCapability(context: CapabilityContext<TagAttributeNode>): Promise<LocationLink[] | undefined> {
		const foundNodeByLine = context.foundNodeByLine!
		if (!foundNodeByLine) return undefined

		const node = foundNodeByLine.getNode()
		if (!(node instanceof TagAttributeNode)) return undefined

		const workspace = context.workspaces[0]!
		const parsedFile = context.parsedFusionFile!
		if (!parsedFile) return undefined

		const tagNode = findParent(node, TagNode)
		if (!tagNode) return []

		const locationLinks: LocationLink[] = []
		const nodePositionBegin = foundNodeByLine.getBegin()
		const originSelectionRange = {
			start: nodePositionBegin,
			end: {
				line: nodePositionBegin.line,
				character: nodePositionBegin.character + node.name.length
			}
		}

		const prototypeFusionContext = NodeService.getFusionContextOfPrototype(tagNode.name, workspace)
		if (!prototypeFusionContext) return []

		for (const propertyName in prototypeFusionContext) {
			if (propertyName !== node.name) continue

			const nodes: undefined | Array<AbstractNode> = prototypeFusionContext?.[propertyName].__nodes
			if (!nodes) continue

			for (const node of nodes) {
				const statement = findParent(node, ObjectStatement)
				if (!statement) continue

				locationLinks.unshift({
					targetUri: statement.fileUri,
					targetRange: statement.linePositionedNode.getPositionAsRange(),
					targetSelectionRange: statement.linePositionedNode.getPositionAsRange(),
					originSelectionRange
				})

				// TODO: make it configurable if all definitions should be provided
				break
			}
		}

		if (!context.params || !('position' in context.params)) return locationLinks

		const foundNodes = parsedFile.getNodesByPosition(context.params.position)
		if (!foundNodes) return locationLinks

		const neosFusionFormPartNode = foundNodes.find(positionedNode =>
			(positionedNode.getNode() instanceof NeosFusionFormActionNode || positionedNode.getNode() instanceof NeosFusionFormControllerNode)
		)
		if (neosFusionFormPartNode !== undefined) {
			const neosFusionFormDefinitionNode = (neosFusionFormPartNode.getNode() as any).parent

			const definitionTargetName = (neosFusionFormPartNode.getNode() as any) instanceof NeosFusionFormActionNode
				? ActionUriPartTypes.Action
				: ActionUriPartTypes.Controller

			const resolvedDefinition = ActionUriService.resolveFusionFormDefinitionNode(node, neosFusionFormDefinitionNode, definitionTargetName, workspace, parsedFile)
			if (resolvedDefinition) locationLinks.push(...resolvedDefinition)
		}

		return locationLinks
	}
}