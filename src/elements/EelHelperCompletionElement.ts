import { ObjectNode } from 'ts-fusion-parser/out/dsl/eel/nodes/ObjectNode'
import { ObjectPathNode } from 'ts-fusion-parser/out/dsl/eel/nodes/ObjectPathNode'
import { Command, CompletionItem, CompletionItemKind, InsertTextFormat, InsertTextMode } from 'vscode-languageserver/node'
import { CapabilityContext } from './CapabilityContext'
import { Element } from './Element'

export class EelHelperCompletionElement extends Element<ObjectPathNode> {
	static readonly ParameterHintsCommand: Command = {
		title: "Trigger Parameter Hints",
		command: "editor.action.triggerParameterHints"
	}

	public async completionCapability(context: CapabilityContext<ObjectPathNode>): Promise<CompletionItem[] | undefined> {
		const foundNodeByLine = context.foundNodeByLine!
		if (!foundNodeByLine) return undefined

		const node = foundNodeByLine.getNode()
		if (!(node instanceof ObjectPathNode)) return undefined

		const workspace = context.workspaces[0]!
		const objectNode = <ObjectNode>node.parent
		const linePositionedObjectNode = objectNode.linePositionedNode

		return this.getEelHelperCompletionsForObjectPath(workspace, linePositionedObjectNode, true)
	}

	protected getEelHelperCompletionsForObjectPath(fusionWorkspace: any, foundNode: any, debug: boolean = false): CompletionItem[] {
		const node = foundNode.getNode()
		const objectNode = <ObjectNode>node.parent
		const linePositionedObjectNode = objectNode.linePositionedNode
		const fullPath = objectNode.path.reduce((parts: any[], part: any) => {
			if (!part.incomplete) parts.push(part.value)
			return parts
		}, []).join(".")
		const completions: CompletionItem[] = []

		const eelHelpers = fusionWorkspace.neosWorkspace.getEelHelperTokens()
		for (const eelHelper of eelHelpers) {
			for (const method of eelHelper.phpClass.methods) {
				if (method.getNormalizedName() === "allowsCallOfMethod") continue

				const fullName = eelHelper.name + "." + method.getNormalizedName()
				if (!fullName.startsWith(fullPath)) continue
				const newText = `${fullName}($1)`
				const completionItem = this.createCompletionItem(fullName, linePositionedObjectNode, CompletionItemKind.Method, newText, EelHelperCompletionElement.ParameterHintsCommand)
				completionItem.detail = method.description
				completions.push(completionItem)
			}
		}

		return completions
	}

	protected createCompletionItem(label: string, linePositionedNode: any, kind: CompletionItemKind, newText: string | undefined = undefined, command: Command | undefined = undefined): CompletionItem {
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
				newText: newText ?? label
			},
			command: command
		}
	}
}