import { ObjectFunctionPathNode } from 'ts-fusion-parser/out/dsl/eel/nodes/ObjectFunctionPathNode'
import { ObjectNode } from 'ts-fusion-parser/out/dsl/eel/nodes/ObjectNode'
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver'
import { LegacyNodeService } from '../common/LegacyNodeService'
import { LinePositionedNode } from '../common/LinePositionedNode'
import { findParent } from '../common/util'
import { ParsedFusionFile } from '../fusion/ParsedFusionFile'
import { PhpClassMethodNode } from '../fusion/node/PhpClassMethodNode'
import { CommonDiagnosticHelper } from './CommonDiagnosticHelper'
import { IgnorableDiagnostic } from './IgnorableDiagnostic'

// TODO: Watch for php changes and re-diagnose all relevant FusionFiles

function* getDiagnosticFromEelHelper(positionedNode: LinePositionedNode<PhpClassMethodNode>, pathNode: ObjectFunctionPathNode, parsedFusionFile: ParsedFusionFile) {
	const node = positionedNode.getNode()

	const method = node.method
	if (!method) return

	if (LegacyNodeService.isNodeAffectedByIgnoreComment(findParent(node, ObjectNode)!, parsedFusionFile)) return

	for (const parameterIndex in method.parameters) {
		const parameter = method.parameters[parameterIndex]
		if (parameter.defaultValue !== undefined) break
		if (pathNode.args[parameterIndex] === undefined) {
			yield IgnorableDiagnostic.create(positionedNode.getPositionAsRange(), `Missing argument`, DiagnosticSeverity.Error, undefined, CommonDiagnosticHelper.Source)
		}
	}

	const hasTooManyArgs = pathNode.args.length > method.parameters.length
	const isLastParameterSpread = method.parameters[method.parameters.length - 1]?.spread

	if (hasTooManyArgs && isLastParameterSpread !== true) {
		for (const exceedingArgument of pathNode.args.slice(method.parameters.length)) {
			yield IgnorableDiagnostic.create(exceedingArgument.linePositionedNode.getPositionAsRange(), `Too many arguments provided`, DiagnosticSeverity.Warning, undefined, CommonDiagnosticHelper.Source)
		}
	}
}

export function diagnoseEelHelperArguments(parsedFusionFile: ParsedFusionFile) {
	const diagnostics: Diagnostic[] = []

	const positionedNodes = parsedFusionFile.getNodesByType(PhpClassMethodNode)
	if (!positionedNodes) return diagnostics

	for (const positionedNode of positionedNodes) {
		const node = positionedNode.getNode()
		const pathNode = node.pathNode
		if (!(pathNode instanceof ObjectFunctionPathNode)) continue

		for (const diagnostic of getDiagnosticFromEelHelper(positionedNode, pathNode, parsedFusionFile)) {
			diagnostics.push(diagnostic)
		}
	}

	return diagnostics
}