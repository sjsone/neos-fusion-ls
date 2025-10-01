import { ValueAssignment } from 'ts-fusion-parser/out/fusion/nodes/ValueAssignment'
import { ObjectStatement } from 'ts-fusion-parser/out/fusion/nodes/ObjectStatement'
import { LocationLink } from 'vscode-languageserver'
import { ActionUriService, ActionUriPartTypes } from '../common/ActionUriService'
import { CapabilityContext } from './CapabilityContext'
import { Element } from './Element'
import { ActionUriActionNode } from '../fusion/node/ActionUriActionNode'
import { ActionUriControllerNode } from '../fusion/node/ActionUriControllerNode'

export class ActionUriDefinitionElement extends Element<ObjectStatement> {
	public async definitionCapability(context: CapabilityContext<ObjectStatement>): Promise<LocationLink[] | undefined> {
		const foundNodeByLine = context.foundNodeByLine!
		if (!foundNodeByLine) return undefined

		const node = foundNodeByLine.getNode()
		if (!(node instanceof ObjectStatement)) return undefined

		const workspace = context.workspaces[0]!
		const parsedFile = context.parsedFusionFile!
		if (!parsedFile) return undefined

		if (!(node.operation instanceof ValueAssignment)) return undefined

		if (!context.params || !('position' in context.params)) return undefined

		const foundNodes = parsedFile.getNodesByPosition(context.params.position)
		if (!foundNodes) return undefined

		const actionUriPartNode = foundNodes.find((positionedNode: any) =>
			(positionedNode.getNode() instanceof ActionUriActionNode || positionedNode.getNode() instanceof ActionUriControllerNode)
		)
		if (actionUriPartNode === undefined) return undefined

		const actionUriDefinitionNode = (actionUriPartNode.getNode() as any).parent
		const definitionTargetName = (actionUriPartNode.getNode() as any) instanceof ActionUriControllerNode
			? ActionUriPartTypes.Controller
			: ActionUriPartTypes.Action

		return ActionUriService.resolveActionUriDefinitionNode(node, actionUriDefinitionNode, definitionTargetName, workspace, parsedFile)
	}
}