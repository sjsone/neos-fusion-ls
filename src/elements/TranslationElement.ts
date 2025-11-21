import { CompletionItem, CompletionItemKind, Hover, HoverParams } from 'vscode-languageserver';
import { XLIFFService } from '../common/XLIFFService';
import { TranslationShortHandNode } from '../fusion/node/TranslationShortHandNode';
import { CapabilityContext } from './CapabilityContext';
import { Element } from './Element';

export class TranslationElement extends Element<TranslationShortHandNode> {
	public async hoverCapability(context: CapabilityContext<TranslationShortHandNode>, params: HoverParams): Promise<string | Hover | undefined> {
		const workspace = context.workspaces[0]!
		const linePositionedNode = context.foundNodeByLine!
		if (!(linePositionedNode.getNode() instanceof TranslationShortHandNode)) return undefined

		const shortHandIdentifier = XLIFFService.readShortHandIdentifier(linePositionedNode.getNode().getValue())
		const translationFiles = await XLIFFService.getMatchingTranslationFiles(workspace, shortHandIdentifier)

		const translationMarkdowns: { isSource: boolean, markdown: string }[] = []
		for (const translationFile of translationFiles) {
			const transUnit = await translationFile.getId(shortHandIdentifier.translationIdentifier)
			if (!transUnit) continue

			const isSource = transUnit.target === undefined
			const position = transUnit.position
			const uri = translationFile.uri + '#L' + (position.line + 1) + ',' + (position.character + 1)

			translationMarkdowns.push({
				isSource,
				markdown: [
					`**[${translationFile.language}](${uri})** ${isSource ? "Source" : ""}`,
					"```\n" + (isSource ? transUnit.source : transUnit.target) + "\n```\n---\n"
				].join("\n")
			})
		}

		translationMarkdowns.sort((a, b) => {
			if (a.isSource && !b.isSource) return -1
			if (!a.isSource && b.isSource) return 1
			return 0
		})

		return translationMarkdowns.map(translationMarkdowns => translationMarkdowns.markdown).join("\n")
	}

	public async completionCapability(context: CapabilityContext<TranslationShortHandNode>): Promise<CompletionItem[] | undefined> {
		const foundNode = context.foundNodeByLine
		if (foundNode === undefined) return undefined

		const node = foundNode.getNode()
		if (!(node instanceof TranslationShortHandNode)) return undefined

		const workspace = context.workspaces[0]!

		const shortHandIdentifier = node.getShortHandIdentifier()
		if (!shortHandIdentifier.packageName) {
			const completions = new Map<string, CompletionItem>()
			for (const translationFile of workspace.translationFiles) {
				const packageName = translationFile.neosPackage.getPackageName()
				if (!completions.has(packageName)) completions.set(packageName, {
					label: packageName,
					kind: CompletionItemKind.Module,
					insertText: packageName + ':',
					command: Element.SuggestCommand
				})
			}
			return Array.from(completions.values())
		}

		const neosPackage = workspace.neosWorkspace.getPackage(shortHandIdentifier.packageName)
		if (!neosPackage) return []

		if (!shortHandIdentifier.sourceName) {
			const completions = new Map<string, CompletionItem>()
			for (const translationFile of workspace.translationFiles) {
				if (translationFile.neosPackage.getPackageName() !== shortHandIdentifier.packageName) continue
				const source = translationFile.sourceParts.join('.')
				if (!completions.has(source)) completions.set(source, {
					label: source,
					kind: CompletionItemKind.Class,
					insertText: source + ':',
					command: Element.SuggestCommand
				})
			}
			return Array.from(completions.values())
		}

		if (!shortHandIdentifier.translationIdentifier) {
			const completions = new Map<string, CompletionItem>()
			for (const translationFile of workspace.translationFiles) {
				if (translationFile.neosPackage.getPackageName() !== shortHandIdentifier.packageName) continue
				if (translationFile.sourceParts.join('.') !== shortHandIdentifier.sourceName) continue
				for (const transUnit of translationFile.transUnits.values()) {
					if (!completions.has(transUnit.id)) completions.set(transUnit.id, {
						label: transUnit.id,
						kind: CompletionItemKind.Class,
						insertText: transUnit.id,
					})
				}
			}
			return Array.from(completions.values())
		}

		return []
	}
}