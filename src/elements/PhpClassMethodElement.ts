import { HoverParams, Hover, SignatureHelpParams, SignatureHelp, ParameterInformation, InlayHint, InlayHintKind, MarkupKind } from 'vscode-languageserver';
import { PhpClassMethodNode } from '../fusion/node/PhpClassMethodNode';
import { CapabilityContext } from './CapabilityContext';
import { Element } from './Element';
import { ObjectFunctionPathNode } from 'ts-fusion-parser/out/dsl/eel/nodes/ObjectFunctionPathNode';
import { ObjectNode } from 'ts-fusion-parser/out/dsl/eel/nodes/ObjectNode';
import { FusionFileProcessor } from '../fusion/FusionFileProcessor';
import { LanguageFeatureContext } from './LanguageFeatureContext';
import { AbstractNode } from 'ts-fusion-parser/out/common/AbstractNode';
import { AbstractLiteralNode } from 'ts-fusion-parser/out/dsl/eel/nodes/AbstractLiteralNode';
import { LiteralArrayNode } from 'ts-fusion-parser/out/dsl/eel/nodes/LiteralArrayNode';
import { LiteralNullNode } from 'ts-fusion-parser/out/dsl/eel/nodes/LiteralNullNode';
import { LiteralNumberNode } from 'ts-fusion-parser/out/dsl/eel/nodes/LiteralNumberNode';
import { LiteralObjectEntryNode } from 'ts-fusion-parser/out/dsl/eel/nodes/LiteralObjectEntryNode';
import { LiteralObjectNode } from 'ts-fusion-parser/out/dsl/eel/nodes/LiteralObjectNode';
import { LiteralStringNode } from 'ts-fusion-parser/out/dsl/eel/nodes/LiteralStringNode';
import { PhpClassMethod } from '../common/php/PhpClassMethod';
import { InlayHintDepth } from '../ExtensionConfiguration';
import { FusionWorkspace } from '../fusion/FusionWorkspace';

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

	public async inlayHintLanguageFeature(context: LanguageFeatureContext): Promise<InlayHint[] | undefined> {
		const workspace = context.workspaces[0]!
		const parsedFusionFile = context.parsedFusionFile!
		const phpMethodNodes = parsedFusionFile.getNodesByType(PhpClassMethodNode)
		if (!phpMethodNodes) return []

		const inlayHints: InlayHint[] = []
		for (const phpMethodNode of phpMethodNodes) {
			const node = phpMethodNode.getNode()
			if (!(node.pathNode instanceof ObjectFunctionPathNode)) continue


			const method = node.method

			for (const hint of this.getInlayHintsFromPhpClassMethodNode(node, method, workspace)) {
				inlayHints.push(hint)
			}
		}

		return inlayHints
	}

	protected * getInlayHintsFromPhpClassMethodNode(node: PhpClassMethodNode, method: PhpClassMethod, workspace: FusionWorkspace) {
		if (!(node.pathNode instanceof ObjectFunctionPathNode)) return

		// TODO: improve spread parameter label 
		let spreadParameterIndex: undefined | number = undefined
		for (const index in node.pathNode.args) {
			const arg = node.pathNode.args[index]
			if (!this.canShowInlayHintForArgumentNode(workspace, arg)) continue

			let parameter = method.parameters[index]
			if (!parameter && spreadParameterIndex === undefined) continue
			if (parameter?.spread) {
				spreadParameterIndex = parseInt(index)
			} else if (spreadParameterIndex !== undefined) {
				parameter = method.parameters[spreadParameterIndex]
			}

			const linePositionedArg = arg.linePositionedNode
			const isSpread = parameter.spread
			const spreadOffset = isSpread ? parseInt(index) - spreadParameterIndex! : 0
			const showParameterName = !isSpread || spreadOffset < 1
			const parameterName = parameter.name.replace("$", "")
			if (method.parameters.length === 1 && parameterName === method.name) continue

			const labelPrefix = isSpread ? '...' : ''
			const label = showParameterName ? parameterName : ''
			const labelSuffix = isSpread ? `[${spreadOffset}]` : ''
			yield {
				label: `${labelPrefix}${label}${labelSuffix}:`,
				kind: InlayHintKind.Parameter,
				tooltip: {
					kind: MarkupKind.Markdown,
					value: [
						"```php",
						`<?php`,
						`${parameter.type ?? ""}${parameter.name}${parameter.defaultValue ?? ""}`,
						"```"
					].join("\n")
				},
				paddingRight: true,
				position: linePositionedArg.getBegin()
			} as InlayHint
		}
	}

	protected canShowInlayHintForArgumentNode(workspace: FusionWorkspace, argumentNode: AbstractNode) {
		if (workspace.getConfiguration().inlayHint.depth === InlayHintDepth.Always) return true

		// TODO: if the node is an Operation and the first operand is and AbstractLiteralNode it should be shown as well
		// TODO: it should be just `AbstractLiteralNode` once "ts-fusion-parser" is updated
		return argumentNode instanceof AbstractLiteralNode
			|| argumentNode instanceof LiteralObjectNode
			|| argumentNode instanceof LiteralArrayNode
			|| argumentNode instanceof LiteralNumberNode
			|| argumentNode instanceof LiteralStringNode
			|| argumentNode instanceof LiteralNullNode
			|| argumentNode instanceof LiteralObjectEntryNode
	}
}