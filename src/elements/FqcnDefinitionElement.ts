import { LocationLink } from 'vscode-languageserver'
import { FqcnNode } from '../fusion/node/FqcnNode'
import { CapabilityContext } from './CapabilityContext'
import { Element } from './Element'

export class FqcnDefinitionElement extends Element<FqcnNode> {
	public async definitionCapability(context: CapabilityContext<FqcnNode>): Promise<LocationLink[] | undefined> {
		const foundNodeByLine = context.foundNodeByLine!
		if (!foundNodeByLine) return undefined

		const node = foundNodeByLine.getNode()
		if (!(node instanceof FqcnNode)) return undefined

		const phpClass = node.phpClass
		if (phpClass === undefined) return undefined

		return [{
			targetUri: phpClass.fileUri,
			targetRange: phpClass.position,
			targetSelectionRange: phpClass.position,
			originSelectionRange: {
				start: foundNodeByLine.getBegin(),
				end: {
					character: foundNodeByLine.getBegin().character + node.realLength,
					line: foundNodeByLine.getBegin().line
				}
			}
		}]
	}
}