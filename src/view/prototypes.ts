import { type LinePositionedNode } from '../common/LinePositionedNode'
import { Logger } from '../common/Logging'
import { type FusionWorkspace } from '../fusion/FusionWorkspace'
import { type ParsedFusionFile } from '../fusion/ParsedFusionFile'
import { type PrototypePathSegment } from 'ts-fusion-parser/out/fusion/nodes/PrototypePathSegment'


export interface PrototypesViewPrototypeEntry {
	name: string,
	location: { uri: string, range: any }
	prototypeType: 'creation'
	packageName: string
}

export namespace PrototypesViewPrototypeEntry {
	export function create(prototypeNode: LinePositionedNode<PrototypePathSegment>, parsedFile: ParsedFusionFile): PrototypesViewPrototypeEntry {
		return {
			name: prototypeNode.getNode().identifier,
			location: {
				uri: parsedFile.uri,
				range: prototypeNode.getPositionAsRange()
			},
			prototypeType: 'creation',
			packageName: parsedFile.neosPackage.getPackageName()
		}
	}
}

interface PrototypesViewTreeEntryAbstract {
	name: string,
	type: string,
}

export interface PrototypesViewTreeEntryPrototype extends PrototypesViewTreeEntryAbstract {
	type: 'prototype',
	location: any,
	prototypeType: string
}

export interface PrototypesViewTreeEntryNamespace extends PrototypesViewTreeEntryAbstract {
	type: 'namespace',
	children: { [key: string]: PrototypesViewTreeEntry }
}

export type PrototypesViewTreeEntry = PrototypesViewTreeEntryPrototype | PrototypesViewTreeEntryNamespace

export interface PrototypeTreeNode {
	name: string
	type: 'namespace' | 'prototype'
	location?: { uri: string; range: any }
	prototypeType?: 'creation' | 'overwrite'
	children?: PrototypeTreeNode[]
}

export class PrototypesView extends Logger {
	public getAllPrototypes(workspaces: FusionWorkspace[]) {
		const allPrototypes: { [name: string]: PrototypesViewPrototypeEntry } = {}
		for (const workspace of workspaces) {
			for (const prototype of this.getPrototypesInWorkspace(workspace)) {
				allPrototypes[prototype.name] = prototype
			}
		}

		this.logVerbose(`Found ${Object.keys(allPrototypes).length} total prototypes: ${Object.keys(allPrototypes).join(', ')}`)

		const tree: { [packageName: string]: PrototypesViewTreeEntryNamespace } = {}

		for (const [uniqueKey, prototype] of Object.entries(allPrototypes)) {
			let current: { [packageName: string]: PrototypesViewTreeEntry } = tree
			if (!current[prototype.packageName]) {
				current[prototype.packageName] = {
					name: prototype.packageName,
					type: 'namespace',
					children: {}
				}
			}

			const currentPackage = current[prototype.packageName]
			if (!("children" in currentPackage)) continue

			current = currentPackage.children

			const prototypeNameWithoutPackage = prototype.name.includes(':')
				? prototype.name.split(':').slice(1).join(':')
				: prototype.name

			const parts = prototypeNameWithoutPackage.split('.')
			if (parts.length > 1) {
				for (let i = 0; i < parts.length - 1; i++) {
					const namespaceName = parts[i]
					if (!current[namespaceName]) {
						current[namespaceName] = {
							name: namespaceName,
							type: 'namespace',
							children: {}
						}
					}
					const currentPackage = current[namespaceName]
					if (!("children" in currentPackage)) continue

					current = currentPackage.children
				}
			}

			const prototypeName = parts[parts.length - 1]
			const treeKey = `${uniqueKey}_${prototypeName}`
			current[treeKey] = {
				name: prototype.name,
				type: 'prototype',
				location: prototype.location,
				prototypeType: prototype.prototypeType
			}
		}

		const result = this.convertToArray(tree)
		this.logInfo(`Returning ${result.length} root nodes with ${this.countAllPrototypes(result)} total prototypes`)
		return result
	}

	protected *getPrototypesInFile(parsedFile: ParsedFusionFile) {
		this.logDebug(`Processing file: ${parsedFile.uri}`)
		for (const prototypeNode of parsedFile.prototypeCreations) {
			const prototypeName = prototypeNode.getNode().identifier
			this.logDebug(`Found creation: ${prototypeName} in ${parsedFile.uri}`)
			yield PrototypesViewPrototypeEntry.create(prototypeNode, parsedFile)
		}
	}

	public *getPrototypesInWorkspace(workspace: FusionWorkspace) {
		try {
			this.logInfo(`Processing workspace ${workspace.name} with ${workspace.parsedFiles.length} parsed files`)
			for (const parsedFile of workspace.parsedFiles) {
				yield* this.getPrototypesInFile(parsedFile)
			}
		} catch (error) {

		}
	}

	protected convertToArray(node: PrototypesViewTreeEntry | { [packageName: string]: PrototypesViewTreeEntryNamespace }): any[] {
		if (node.type === 'prototype') return [node]

		const entries: any[] = []

		for (const child of Object.values(node)) {
			const entry: PrototypeTreeNode = {
				name: child.name,
				type: child.type,
			}

			if (child.type === 'prototype') {
				entry.location = child.location
				entry.prototypeType = child.prototypeType
			}

			if (child.children) {
				entry.children = this.convertToArray(child.children)
			}

			entries.push(entry)
		}

		entries.sort((a, b) => {
			if (a.type !== b.type) return a.type === 'namespace' ? -1 : 1
			return a.name.localeCompare(b.name)
		})

		return entries
	}

	private countAllPrototypes(nodes: any[]): number {
		let count = 0
		for (const node of nodes) {
			if (node.type === 'prototype') {
				count++
			}
			if (node.children) {
				count += this.countAllPrototypes(node.children)
			}
		}
		return count
	}
}