import { Location } from 'vscode-languageserver/node'
import { PhpClassMethodNode } from '../fusion/node/PhpClassMethodNode'
import { PhpClassNode } from '../fusion/node/PhpClassNode'
import { CapabilityContext } from './CapabilityContext'
import { Element } from './Element'

export class EelHelperDefinitionElement extends Element<PhpClassNode | PhpClassMethodNode> {
	public async definitionCapability(context: CapabilityContext<PhpClassNode | PhpClassMethodNode>): Promise<Location[] | undefined> {
		const foundNodeByLine = context.foundNodeByLine!
		if (!foundNodeByLine) return undefined

		const node = foundNodeByLine.getNode()
		const workspace = context.workspaces[0]!

		if (node instanceof PhpClassNode) {
			return this.getEelHelperDefinitions(workspace, foundNodeByLine as any)
		}

		if (node instanceof PhpClassMethodNode) {
			return this.getEelHelperMethodDefinitions(workspace, foundNodeByLine as any)
		}

		return undefined
	}

	getEelHelperDefinitions(workspace: any, foundNodeByLine: any): Location[] | undefined {
		const node = foundNodeByLine.getNode()
		for (const eelHelper of workspace.neosWorkspace.getEelHelperTokens()) {
			if (eelHelper.name === node.identifier) {
				return [{
					uri: eelHelper.phpClass.fileUri,
					range: eelHelper.phpClass.position
				}]
			}
		}

		return undefined
	}

	getEelHelperMethodDefinitions(workspace: any, foundNodeByLine: any): Location[] {
		const node = foundNodeByLine.getNode()

		return [{
			uri: node.method.phpClass.fileUri,
			range: node.method.position
		}]
	}
}