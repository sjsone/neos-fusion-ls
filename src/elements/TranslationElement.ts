import { Hover, HoverParams } from 'vscode-languageserver';
import { XLIFFService } from '../common/XLIFFService';
import { TranslationShortHandNode } from '../fusion/node/TranslationShortHandNode';
import { CapabilityContext } from './CapabilityContext';
import { Element } from './Element';

export class TranslationElement extends Element<TranslationShortHandNode> {
	public async hoverCapability(context: CapabilityContext<TranslationShortHandNode>, params: HoverParams): Promise<string | Hover | undefined> {
		const workspace = context.workspaces[0]!
		const linePositionedNode = context.foundNodeByLine!

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
}