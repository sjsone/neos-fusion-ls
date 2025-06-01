import * as NodePath from 'path';
import { FusionObjectValue } from 'ts-fusion-parser/out/fusion/nodes/FusionObjectValue';
import { ObjectStatement } from 'ts-fusion-parser/out/fusion/nodes/ObjectStatement';
import { PropertyDocumentationDefinition } from 'ts-fusion-parser/out/fusion/nodes/PropertyDocumentationDefinition';
import { PrototypePathSegment } from 'ts-fusion-parser/out/fusion/nodes/PrototypePathSegment';
import { ValueAssignment } from 'ts-fusion-parser/out/fusion/nodes/ValueAssignment';
import { Hover, HoverParams, Location, SymbolInformation, SymbolKind, WorkspaceSymbol, WorkspaceSymbolParams } from 'vscode-languageserver';
import { LinePositionedNode } from '../common/LinePositionedNode';
import { abstractNodeToString, findParent, getPrototypeNameFromNode } from '../common/util';
import { CapabilityContext } from './CapabilityContext';
import { Element } from './Element';
import { AbstractNode } from 'ts-fusion-parser/out/common/AbstractNode';

// FusionObjectValue
// FusionObjectValue

export class FusionPrototypeElement extends Element<PrototypePathSegment | FusionObjectValue> {
	public async hoverCapability(context: CapabilityContext<PrototypePathSegment | FusionObjectValue>, params: HoverParams): Promise<string | Hover | undefined> {
		const node = context.foundNodeByLine!.getNode()
		if (!(node instanceof PrototypePathSegment) && !(node instanceof FusionObjectValue)) return undefined

		const prototypeName = getPrototypeNameFromNode(node)
		if (prototypeName === null) return undefined

		const workspace = context.workspaces[0]!

		const statementsNames: string[] = []
		for (const otherParsedFile of workspace.parsedFiles) {
			const statementsNamesFromFile: string[] = []
			for (const otherPositionedNode of [...otherParsedFile.prototypeCreations, ...otherParsedFile.prototypeOverwrites]) {
				for (const statementName of this.createStatementNamesFromPrototypeNode(prototypeName, otherPositionedNode)) {
					statementsNamesFromFile.push(statementName)
				}
			}
			if (statementsNamesFromFile.length === 0) continue

			const packageName = workspace.neosWorkspace.getPackageByUri(otherParsedFile.uri)?.getPackageName() ?? 'unknown package'
			statementsNames.push(`// [${packageName}] ${NodePath.basename(otherParsedFile.uri)}`)
			statementsNames.push(...statementsNamesFromFile)
		}

		const statementsNamesMarkdown = statementsNames.length > 0 ? "\n" + statementsNames.map(name => `  ${name}`).join("\n") + "\n" : " "
		return [
			"```",
			`prototype(${prototypeName}) {${statementsNamesMarkdown}}`,
			"```"
		].join("\n")
	}

	public async referenceCapability(context: CapabilityContext<PrototypePathSegment | FusionObjectValue>): Promise<Location[] | undefined> {
		const foundNodeByLine = context.foundNodeByLine!
		if (!foundNodeByLine) return undefined

		const workspace = context.workspaces[0]!

		const node = foundNodeByLine.getNode()
		this.logVerbose(`Found node type "${node.constructor.name}"`)

		const prototypeName = getPrototypeNameFromNode(node)
		if (!prototypeName) return undefined

		this.logDebug(`prototypeName "${prototypeName}"`)

		const locations: Location[] = []

		for (const otherParsedFile of workspace.parsedFiles) {
			for (const nodeType of [PrototypePathSegment, FusionObjectValue]) {
				const otherNodes = otherParsedFile.getNodesByType(<any>nodeType) ?? []
				for (const otherNode of otherNodes) {
					if (getPrototypeNameFromNode(otherNode.getNode()) !== prototypeName) continue
					locations.push({
						uri: otherParsedFile.uri,
						range: otherNode.getPositionAsRange()
					})
				}
			}
		}

		return locations
	}

	protected * createStatementNamesFromPrototypeNode(prototypeName: string, positionedPrototypeNode: LinePositionedNode<PrototypePathSegment>) {
		const prototypeNode = positionedPrototypeNode.getNode()
		if (prototypeNode.identifier !== prototypeName) return

		const otherObjectStatement = findParent(prototypeNode, ObjectStatement)
		if (!otherObjectStatement?.block) return

		for (const statement of otherObjectStatement.block.statementList.statements) {
			if (statement instanceof ObjectStatement) {
				let statementName = statement.path.segments.map(abstractNodeToString).filter(Boolean).join(".")
				if (statement.operation instanceof ValueAssignment) {
					statementName += ` = ${abstractNodeToString(statement.operation.pathValue)}`
				}
				yield statementName
				continue
			}
			if (statement instanceof PropertyDocumentationDefinition) {
				yield `/// ${statement.type} ${statement.text}`
			}
		}
	}

	public async workspaceSymbolCapability(context: CapabilityContext<AbstractNode>, params: WorkspaceSymbolParams): Promise<SymbolInformation[] | WorkspaceSymbol[] | undefined> {
		const symbols: WorkspaceSymbol[] = []

		for (const workspace of context.workspaces) {
			for (const parsedFile of workspace.parsedFiles) {

				// TODO: concept which workspace symbols should be shown
				for (const prototypePathSegment of parsedFile.prototypeCreations) {
					const node = prototypePathSegment.getNode()

					symbols.push({
						name: node.identifier,
						location: { uri: parsedFile.uri, range: prototypePathSegment.getPositionAsRange() },
						kind: SymbolKind.Class,
					})
				}


				const neosPackage = parsedFile.workspace.neosWorkspace.getPackageByUri(parsedFile.uri)

				for (const prototypePathSegment of parsedFile.prototypeOverwrites) {
					const node = prototypePathSegment.getNode()

					symbols.push({
						name: `${node.identifier} [${neosPackage?.getPackageName()}]`,
						location: { uri: parsedFile.uri, range: prototypePathSegment.getPositionAsRange() },
						kind: SymbolKind.Constructor,
					})
				}

			}
		}

		return symbols
	}
}