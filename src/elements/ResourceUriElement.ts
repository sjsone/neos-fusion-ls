import * as NodeFs from 'fs';
import * as NodePath from 'path';
import { Command, CompletionItem, CompletionItemKind, Hover, HoverParams } from 'vscode-languageserver';
import { ResourceUriNode } from '../fusion/node/ResourceUriNode';
import { CapabilityContext } from './CapabilityContext';
import { Element } from './Element';
import { NeosPackage } from '../neos/NeosPackage';

export class ResourceUriElement extends Element<ResourceUriNode> {
	public async hoverCapability(context: CapabilityContext<ResourceUriNode>, params: HoverParams): Promise<string | Hover | undefined> {
		const node = context.foundNodeByLine!.getNode()
		if (!(node instanceof ResourceUriNode)) return undefined
		if (!node.canBeFound()) return undefined

		const workspace = context.workspaces[0]!

		const path = workspace.neosWorkspace.getResourceUriPath(node.getNamespace(), node.getRelativePath())
		if (!path || !NodeFs.existsSync(path)) return `**Could not find Resource**`

		const basename = NodePath.basename(path)
		const isImage = (/\.(gif|jpe?g|tiff?|png|webp|bmp|svg|ico|icns)$/i).test(basename)

		if (isImage) return `![${basename}](${path})`
		return `Resource: ${basename}`
	}

	public async completionCapability(context: CapabilityContext<ResourceUriNode>): Promise<CompletionItem[] | undefined> {
		const foundNode = context.foundNodeByLine
		if (foundNode === undefined) return undefined

		const node = foundNode.getNode()
		if (!(node instanceof ResourceUriNode)) return undefined

		const workspace = context.workspaces[0]!

		const identifierMatch = /resource:\/\/(.*?)\//.exec(node.identifier)
		if (identifierMatch === null) {
			return Array.from(workspace.neosWorkspace.getPackages().values()).map((neosPackage: NeosPackage) => {
				return {
					label: neosPackage.getPackageName(),
					kind: CompletionItemKind.Module,
					insertText: neosPackage.getPackageName() + '/',
					command: Element.SuggestCommand
				}
			})
		}
		const packageName = identifierMatch[1]

		const neosPackage = workspace.neosWorkspace.getPackage(packageName)
		if (!neosPackage) return []

		const nextPath = NodePath.join(neosPackage.path, "Resources", node.getRelativePath())
		if (!NodeFs.existsSync(nextPath)) return []

		const completions: CompletionItem[] = []
		const thingsInFolder = NodeFs.readdirSync(nextPath, { withFileTypes: true })
		for (const thing of thingsInFolder) {
			if (thing.isFile()) completions.push({
				label: thing.name,
				kind: CompletionItemKind.File,
				insertText: thing.name,
			})

			if (thing.isDirectory()) completions.push({
				label: thing.name,
				kind: CompletionItemKind.Folder,
				insertText: thing.name + '/',
				command: Element.SuggestCommand
			})
		}

		return completions
	}
}