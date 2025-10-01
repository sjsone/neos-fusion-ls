import { Position, LocationLink, Location } from 'vscode-languageserver/node'
import { FlowConfigurationPathPartNode } from '../fusion/FlowConfigurationPathPartNode'
import { CapabilityContext } from './CapabilityContext'
import { Element } from './Element'

export class ConfigurationDefinitionElement extends Element<FlowConfigurationPathPartNode> {
	public async definitionCapability(context: CapabilityContext<FlowConfigurationPathPartNode>): Promise<LocationLink[] | undefined> {
		const foundNodeByLine = context.foundNodeByLine!
		if (!foundNodeByLine) return undefined

		const node = foundNodeByLine.getNode()
		if (!(node instanceof FlowConfigurationPathPartNode)) return undefined

		const workspace = context.workspaces[0]!
		const partNode = node
		const parentNode = partNode.parent

		const partIndex = parentNode["path"].indexOf(partNode)
		if (partIndex === -1) return []

		const pathParts = parentNode["path"].slice(0, partIndex + 1)
		const searchPath = pathParts.map(part => part["value"]).join(".")
		this.logDebug("searching for ", searchPath)

		const nodeBegin = parentNode.linePositionedNode.getBegin()
		const originSelectionRange = {
			start: Position.create(nodeBegin.line, nodeBegin.character + 1),
			end: foundNodeByLine.getEnd()
		}

		const locationLinks: LocationLink[] = []
		for (const result of workspace.neosWorkspace.configurationManager.search(searchPath)) {
			locationLinks.push({
				targetUri: result.file["uri"],
				targetRange: result.range,
				targetSelectionRange: result.range,
				originSelectionRange
			})
		}
		return locationLinks
	}
}