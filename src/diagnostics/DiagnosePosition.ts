import { MetaPathSegment } from 'ts-fusion-parser/out/fusion/nodes/MetaPathSegment'
import { ObjectStatement } from 'ts-fusion-parser/out/fusion/nodes/ObjectStatement'
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver'
import { ParsedFusionFile } from '../fusion/ParsedFusionFile'
import { CommonDiagnosticHelper } from './CommonDiagnosticHelper'
import { ValueAssignment } from 'ts-fusion-parser/out/fusion/nodes/ValueAssignment'
import { DiagnosticContext } from './DiagnosticContext'
import { findParent } from '../common/util'

type PositionValidationResult = { isValid: true } | { isValid: false; reason: string }
namespace PositionValidationResult {
	export const Valid = (): PositionValidationResult => ({ isValid: true })
	export const InValid = (reason: string): PositionValidationResult => ({ isValid: false, reason })
}

function validateFusionPosition(position: unknown): PositionValidationResult {
	if (typeof position === 'number') {
		if (!Number.isFinite(position)) return PositionValidationResult.InValid('Numeric position must be a finite number')
		return PositionValidationResult.Valid()
	}

	if (typeof position !== 'string') return PositionValidationResult.InValid('Position must be a string or number')

	const value = position.trim()
	if (!value) return PositionValidationResult.InValid('Position string cannot be empty')

	const isNumeric = (val: string) => /^-?\d+(\.\d+)?$/.test(val)

	if (isNumeric(value)) return PositionValidationResult.Valid()

	const parts = value.split(/\s+/)
	const keyword = parts[0]

	switch (keyword) {
		case 'start':
		case 'end': {
			if (parts.length > 2) {
				return PositionValidationResult.InValid(`Too many arguments for '${keyword}' statement`)
			}
			if (parts.length === 2 && !isNumeric(parts[1])) {
				return PositionValidationResult.InValid(`Invalid priority '${parts[1]}' for '${keyword}' (must be a number)`)
			}
			return PositionValidationResult.Valid()
		}

		case 'before':
		case 'after': {
			if (parts.length < 2) return PositionValidationResult.InValid(`Missing target element for '${keyword}'`)
			if (parts.length > 3) return PositionValidationResult.InValid(`Too many arguments for '${keyword}' statement`)
			if (parts.length === 3 && !isNumeric(parts[2])) return PositionValidationResult.InValid(`Invalid priority '${parts[2]}' for '${keyword}' (must be a number)`)
			return PositionValidationResult.Valid()
		}

		default:
			return PositionValidationResult.InValid(`Unrecognized position keyword or format '${keyword}'.\n\n## Possible values\n\`start [priority]\`    \n\`[numeric ordering]\`    \n\`end [priority] positions\`    \n\`before [namedElement] <optionalPriority>\`    \n\`after [namedElement] <optionalPriority>\``)
	}
}

export function diagnosePosition(parsedFusionFile: ParsedFusionFile, context: DiagnosticContext) {
	const diagnostics: Diagnostic[] = []

	const metaPathSegmentNodes = parsedFusionFile.getNodesByType(MetaPathSegment)
	if (metaPathSegmentNodes === undefined) return diagnostics

	for (const metaPathSegmentNode of metaPathSegmentNodes) {
		const node = metaPathSegmentNode.getNode()

		if (node.identifier !== "position") continue

		const objectStatement = findParent(node, ObjectStatement)
		if (objectStatement === undefined) continue

		const operation = objectStatement.operation
		if (!(operation instanceof ValueAssignment)) continue

		const validationResult = validateFusionPosition(operation.pathValue.value)

		if (validationResult.isValid) continue


		const linePositionedOperationValue = operation.pathValue.linePositionedNode

		const supportsMarkupMessage = context.clientCapabilities.textDocument?.diagnostic?.markupMessageSupport === true

		const diagnostic: Diagnostic = {
			severity: DiagnosticSeverity.Error,
			range: linePositionedOperationValue.getPositionAsRange(),
			message: supportsMarkupMessage ? {
				kind: "markdown",
				value: validationResult.reason
			} : validationResult.reason,
			source: CommonDiagnosticHelper.Source,
		}

		diagnostics.push(diagnostic)
	}

	return diagnostics
}
