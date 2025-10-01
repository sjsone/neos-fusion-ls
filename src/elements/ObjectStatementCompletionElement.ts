import { ObjectStatement } from 'ts-fusion-parser/out/fusion/nodes/ObjectStatement'
import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node'
import { ExternalObjectStatement, NodeService } from '../common/NodeService'
import { RoutingControllerNode } from '../fusion/node/RoutingControllerNode'
import { CapabilityContext } from './CapabilityContext'
import { Element } from './Element'

export class ObjectStatementCompletionElement extends Element<ObjectStatement> {
	public async completionCapability(context: CapabilityContext<ObjectStatement>): Promise<CompletionItem[] | undefined> {
		const foundNodeByLine = context.foundNodeByLine!
		if (!foundNodeByLine) return undefined

		const node = foundNodeByLine.getNode()
		if (!(node instanceof ObjectStatement)) return undefined

		const workspace = context.workspaces[0]!
		const parsedFile = context.parsedFusionFile!
		if (!parsedFile) return undefined

		const routingActionsCompletions = this.getObjectStatementRoutingActionsCompletions(workspace, parsedFile, node)
		if (routingActionsCompletions) return routingActionsCompletions

		if (!(node.operation === null || node.operation.position.begin !== node.operation.position.end)) {
			return this.getPropertyDefinitionSegments(node, workspace)
		}

		return []
	}

	protected getObjectStatementRoutingActionsCompletions(workspace: any, parsedFile: any, node: ObjectStatement) {
		if (!(node.parent?.parent?.parent instanceof ObjectStatement)) return undefined

		const routingControllerNode = node.parent?.parent?.parent.routingControllerNode
		if (!routingControllerNode) return undefined

		const classDefinition = RoutingControllerNode.getClassDefinitionFromRoutingControllerNode(parsedFile, workspace, routingControllerNode)
		if (!classDefinition) return undefined

		return classDefinition.methods.map((method: any) => ({
			label: method.name,
			insertText: method.name.replace("Action", ""),
			kind: CompletionItemKind.Method
		}))
	}

	protected getPropertyDefinitionSegments(objectNode: ObjectStatement, workspace?: any) {
		const completions: CompletionItem[] = []

		for (const segmentOrExternalStatement of NodeService.findPropertyDefinitionSegments(objectNode, workspace, true)) {
			const segment = segmentOrExternalStatement instanceof ExternalObjectStatement
				? segmentOrExternalStatement.statement.path.segments[0]
				: segmentOrExternalStatement
			completions.push({
				label: segment.identifier,
				kind: CompletionItemKind.Property
			})
		}

		return completions
	}
}