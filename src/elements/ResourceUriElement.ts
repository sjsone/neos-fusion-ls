import * as NodeFs from 'fs';
import * as NodePath from 'path';
import { Hover, HoverParams } from 'vscode-languageserver';
import { ResourceUriNode } from '../fusion/node/ResourceUriNode';
import { CapabilityContext } from './CapabilityContext';
import { Element } from './Element';

export class ResourceUriElement extends Element<ResourceUriNode> {
	public async hoverCapability(context: CapabilityContext<ResourceUriNode>, params: HoverParams): Promise<string | Hover | undefined> {
		const node = context.foundNodeByLine!.getNode()
		if (!node.canBeFound()) return undefined

		const workspace = context.workspaces[0]!

		const path = workspace.neosWorkspace.getResourceUriPath(node.getNamespace(), node.getRelativePath())
		if (!path || !NodeFs.existsSync(path)) return `**Could not find Resource**`

		const basename = NodePath.basename(path)
		const isImage = (/\.(gif|jpe?g|tiff?|png|webp|bmp|svg|ico|icns)$/i).test(basename)

		if (isImage) return `![${basename}](${path})`
		return `Resource: ${basename}`
	}
}