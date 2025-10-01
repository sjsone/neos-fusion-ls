import { Location, LocationLink } from 'vscode-languageserver/node'
import { RoutingControllerNode } from '../fusion/node/RoutingControllerNode'
import { RoutingActionNode } from '../fusion/node/RoutingActionNode'
import { CapabilityContext } from './CapabilityContext'
import { Element } from './Element'

export class RoutingDefinitionElement extends Element<RoutingControllerNode | RoutingActionNode> {
	public async definitionCapability(context: CapabilityContext<RoutingControllerNode | RoutingActionNode>): Promise<Location[] | undefined> {
		const foundNodeByLine = context.foundNodeByLine!
		if (!foundNodeByLine) return undefined

		const node = foundNodeByLine.getNode()
		const workspace = context.workspaces[0]!
		const parsedFile = context.parsedFusionFile!
		if (!parsedFile) return undefined

		if (node instanceof RoutingControllerNode) {
			return this.getRoutingControllerNode(parsedFile, workspace, foundNodeByLine as any)
		}

		if (node instanceof RoutingActionNode) {
			const result = this.getRoutingActionNode(parsedFile, workspace, foundNodeByLine as any)
			return result ? [result] : undefined
		}

		return undefined
	}

	getRoutingControllerNode(parsedFile: any, workspace: any, foundNodeByLine: any): Location[] | undefined {
		const node = foundNodeByLine.getNode()

		const phpClass = RoutingControllerNode.getClassDefinitionFromRoutingControllerNode(parsedFile, workspace, node)
		if (!phpClass) return undefined

		return [{
			uri: phpClass.fileUri,
			range: phpClass.position
		}]
	}

	getRoutingActionNode(parsedFile: any, workspace: any, foundNodeByLine: any): Location | undefined {
		const node = foundNodeByLine.getNode()

		const phpClass = RoutingControllerNode.getClassDefinitionFromRoutingControllerNode(parsedFile, workspace, node.parent)
		if (!phpClass) return undefined

		const actionName = node.name + "Action"
		for (const method of phpClass.methods) {
			if (method.name !== actionName) continue

			return {
				uri: phpClass.fileUri,
				range: method.position
			}
		}

		return undefined
	}
}