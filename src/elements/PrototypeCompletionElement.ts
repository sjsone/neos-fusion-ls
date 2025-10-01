import { FusionObjectValue } from 'ts-fusion-parser/out/fusion/nodes/FusionObjectValue'
import { PrototypePathSegment } from 'ts-fusion-parser/out/fusion/nodes/PrototypePathSegment'
import { CompletionItem, CompletionItemKind, InsertTextFormat, InsertTextMode } from 'vscode-languageserver/node'
import { CapabilityContext } from './CapabilityContext'
import { Element } from './Element'

export class PrototypeCompletionElement extends Element<FusionObjectValue | PrototypePathSegment> {
	public async completionCapability(context: CapabilityContext<FusionObjectValue | PrototypePathSegment>): Promise<CompletionItem[] | undefined> {
		const foundNodeByLine = context.foundNodeByLine!
		if (!foundNodeByLine) return undefined

		const node = foundNodeByLine.getNode()
		if (!(node instanceof FusionObjectValue) && !(node instanceof PrototypePathSegment)) return undefined

		const workspace = context.workspaces[0]!
		const completions: CompletionItem[] = []

		const foundNodes = workspace.getNodesByType(PrototypePathSegment)
		if (!foundNodes) return []

		for (const fileNodes of foundNodes) {
			for (const fileNode of fileNodes.nodes) {
				const label = fileNode.getNode().identifier
				if (!completions.find(completion => completion.label === label)) {
					completions.push(this.createCompletionItem(label, foundNodeByLine, CompletionItemKind.Class))
				}
			}
		}

		return completions
	}

	protected createCompletionItem(label: string, linePositionedNode: any, kind: CompletionItemKind): CompletionItem {
		return {
			label,
			kind,
			insertText: label,
			insertTextMode: InsertTextMode.adjustIndentation,
			insertTextFormat: InsertTextFormat.Snippet,
			textEdit: {
				insert: linePositionedNode.getPositionAsRange(),
				replace: {
					start: linePositionedNode.getBegin(),
					end: { line: linePositionedNode.getEnd().line, character: linePositionedNode.getEnd().character + label.length },
				},
				newText: label
			}
		}
	}
}