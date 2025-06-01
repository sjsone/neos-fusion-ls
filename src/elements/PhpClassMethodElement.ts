import { HoverParams, Hover, SignatureHelpParams, SignatureHelp, ParameterInformation } from 'vscode-languageserver';
import { PhpClassMethodNode } from '../fusion/node/PhpClassMethodNode';
import { CapabilityContext } from './CapabilityContext';
import { Element } from './Element';
import { ObjectFunctionPathNode } from 'ts-fusion-parser/out/dsl/eel/nodes/ObjectFunctionPathNode';
import { ObjectNode } from 'ts-fusion-parser/out/dsl/eel/nodes/ObjectNode';
import { FusionFileProcessor } from '../fusion/FusionFileProcessor';

export class PhpClassMethodElement extends Element<PhpClassMethodNode | ObjectFunctionPathNode> {
	public async hoverCapability(context: CapabilityContext<PhpClassMethodNode>, params: HoverParams): Promise<string | Hover | undefined> {
		const node = context.foundNodeByLine!.getNode()
		if (!(node instanceof PhpClassMethodNode)) return undefined

		const header = `EEL-Helper *${node.eelHelper.identifier}*.**${node.identifier}** \n`

		const method = node.method
		if (!method) return header

		const phpParametersList = method.parameters.map(p => `    ${p.type ?? ''}${p.name}${p.defaultValue ?? ''}`)
		const phpParameters = "\n" + phpParametersList.join(", \n") + "\n"

		const descriptionParts: string[] = []
		if (method.description) {
			descriptionParts.push('##### Description:')
			descriptionParts.push(method.description?.replace("Example::", '##### Example:'))
		}

		return [
			'```php',
			`<?php`,
			`function ${method.name}(${phpParameters})${method.returns?.type ? ': ' + method.returns.type : ''}`,
			'```',
			...descriptionParts,
		].join('\n')

	}

	public async signatureHelpCapability(context: CapabilityContext<ObjectFunctionPathNode>, params: SignatureHelpParams): Promise<SignatureHelp | undefined> {
		const foundNodeByLine = context.foundNodeByLine!
		const node = foundNodeByLine?.getNode()
		if (!(node instanceof ObjectFunctionPathNode)) return undefined
		if (!(node.parent instanceof ObjectNode)) return undefined
		const workspace = context.workspaces[0]!

		const signatureHelp: SignatureHelp = {
			signatures: [],
			activeSignature: undefined,
			activeParameter: undefined
		}

		for (const {
			method,
			eelHelperNode,
			eelHelperMethodNode,
		} of FusionFileProcessor.ResolveEelHelpersForObjectNode(node.parent, workspace.neosWorkspace)) {
			const parameters: ParameterInformation[] = []
			if (method !== undefined) {
				for (const parameter of method.parameters) {
					const name = parameter.name.replace("$", "")
					parameters.push({
						label: name,
						documentation: `${parameter.type ?? ''}${name}`
					})
				}
			}

			if (method !== undefined && eelHelperNode !== undefined && eelHelperMethodNode !== undefined) {
				const signatureLabelIdentifier = `${eelHelperNode.identifier}.${eelHelperMethodNode.identifier}`
				const signatureLabelParameters = parameters.map(p => p.documentation).join(', ')
				signatureHelp.signatures.push({
					label: `${signatureLabelIdentifier}(${signatureLabelParameters})`,
					documentation: method.description,
					parameters
				})
			}
		}

		return signatureHelp
	}
}