import * as NodePath from 'path';
import { Hover, HoverParams } from 'vscode-languageserver';
import * as YAML from 'yaml';
import { FlowConfigurationPathPartNode } from '../fusion/FlowConfigurationPathPartNode';
import { CapabilityContext } from './CapabilityContext';
import { Element } from './Element';

export class FlowConfigurationElement extends Element<FlowConfigurationPathPartNode> {
	public async hoverCapability(context: CapabilityContext<FlowConfigurationPathPartNode>, params: HoverParams): Promise<string | Hover | undefined> {
		const workspace = context.workspaces[0]!
		const linePositionedNode = context.foundNodeByLine!
		const partNode = linePositionedNode.getNode()
		const node = partNode.parent

		const partIndex = node["path"].indexOf(partNode)
		if (partIndex === -1) return undefined

		const pathParts = node["path"].slice(0, partIndex + 1)
		const searchPath = pathParts.map(part => part["value"]).join(".")
		this.logDebug("searching for ", searchPath)

		const results: string[] = []
		for (const result of workspace.neosWorkspace["configurationManager"].search(searchPath)) {
			const fileUri = result.file["uri"]
			const neosPackage = workspace.neosWorkspace.getPackageByUri(fileUri)
			const packageName = neosPackage?.getPackageName() ?? 'Project Configuration'
			results.push(`# [${packageName}] ${NodePath.basename(fileUri)}`)
			results.push(YAML.stringify(result.value, undefined, 3))
		}
		if (results.length === 0) return `_no value found_`

		return [
			"```yaml",
			...results,
			"```"
		].join("\n")
	}
}