import { TagAttributeNode } from 'ts-fusion-parser/out/dsl/afx/nodes/TagAttributeNode'
import { TagNode } from 'ts-fusion-parser/out/dsl/afx/nodes/TagNode'
import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node'
import { NodeService } from '../common/NodeService'
import { findParent } from '../common/util'
import { CapabilityContext } from './CapabilityContext'
import { Element } from './Element'

export class TagAttributeCompletionElement extends Element<TagAttributeNode> {
	public async completionCapability(context: CapabilityContext<TagAttributeNode>): Promise<CompletionItem[] | undefined> {
		const foundNodeByLine = context.foundNodeByLine!
		if (!foundNodeByLine) return undefined

		const attributeNode = foundNodeByLine.getNode()
		if (!(attributeNode instanceof TagAttributeNode)) return undefined

		if (attributeNode.value) return []

		const workspace = context.workspaces[0]!
		const tagNode = findParent(attributeNode, TagNode)
		if (!tagNode) return []

		const labels: string[] = []

		const prototypeFusionContext = NodeService.getFusionContextOfPrototype(tagNode.name, workspace)
		if (!prototypeFusionContext) return []

		for (const propertyName in prototypeFusionContext) {
			if (propertyName.startsWith('__')) continue
			if (!labels.includes(propertyName)) labels.push(propertyName)
		}

		return labels.map(label => ({ label, kind: CompletionItemKind.Property }))
	}
}