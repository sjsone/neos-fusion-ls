import { TagNode } from 'ts-fusion-parser/out/dsl/afx/nodes/TagNode'
import { PrototypePathSegment } from 'ts-fusion-parser/out/fusion/nodes/PrototypePathSegment'
import { CompletionItem, CompletionItemKind, InsertTextMode } from 'vscode-languageserver/node'
import { CapabilityContext } from './CapabilityContext'
import { Element } from './Element'

export class TagCompletionElement extends Element<TagNode> {
	public async completionCapability(context: CapabilityContext<TagNode>): Promise<CompletionItem[] | undefined> {
		const foundNodeByLine = context.foundNodeByLine!
		if (!foundNodeByLine) return undefined

		const node = foundNodeByLine.getNode()
		if (!(node instanceof TagNode)) return undefined

		const workspace = context.workspaces[0]!
		const completions: CompletionItem[] = []

		const foundNodes = workspace.getNodesByType(PrototypePathSegment)
		if (!foundNodes) return []

		for (const fileNodes of foundNodes) {
			for (const fileNode of fileNodes.nodes) {
				const label = fileNode.getNode().identifier
				if (!completions.find(completion => completion.label === label)) {
					const foundNodeTagStart = { line: foundNodeByLine.getBegin().line, character: foundNodeByLine.getBegin().character + 1 }
					completions.push({
						label,
						kind: CompletionItemKind.Class,
						insertTextMode: InsertTextMode.adjustIndentation,
						insertText: label,
						textEdit: {
							insert: {
								start: foundNodeTagStart,
								end: foundNodeByLine.getEnd(),
							},
							replace: {
								start: foundNodeTagStart,
								end: { line: foundNodeByLine.getEnd().line, character: foundNodeByLine.getEnd().character + label.length },
							},
							newText: label
						}
					})
				}
			}
		}

		return completions
	}
}