import * as NodeFs from 'fs'
import * as NodePath from 'path'
import { FileEvent } from 'vscode-languageserver'
import { CacheManager } from '../cache/CacheManager'
import { uriToPath } from '../common/util'
import { AbstractFileChangeHandler } from './AbstractFileChangeHandler'

export class FusionFileChangeHandler extends AbstractFileChangeHandler {
	canHandleFileEvent(fileEvent: FileEvent): boolean {
		return fileEvent.uri.endsWith(".fusion")
	}

	public async handleCreated(fileEvent: FileEvent) {
		return this.addOrUpdateFile(fileEvent, "created")
	}

	public async handleChanged(fileEvent: FileEvent) {
		if (this.languageServer.getOpenDocument(fileEvent.uri)) return
		return this.addOrUpdateFile(fileEvent, "changed")
	}

	protected async addOrUpdateFile(fileEvent: FileEvent, changeType: "created" | "changed") {
		const workspace = this.languageServer.getWorkspaceForFileUri(fileEvent.uri)
		if (!workspace) {
			this.logInfo(`${changeType} Fusion file corresponds to no workspace. ${fileEvent.uri}`)
			return
		}

		const filePath = uriToPath(fileEvent.uri)
		if (!NodeFs.existsSync(filePath)) {
			this.logDebug(`Ignoring ${changeType} Fusion file that no longer exists: ${fileEvent.uri}`)
			return
		}

		const neosPackage = workspace.neosWorkspace.getPackageByUri(fileEvent.uri)
		if (!neosPackage) {
			this.logInfo(`${changeType} Fusion file corresponds to no Neos package. ${fileEvent.uri}`)
			return
		}

		workspace.initPackageRootFusionFiles(neosPackage)

		const parsedFile = workspace.addParsedFileFromPath(filePath, neosPackage)
		if (!parsedFile) return
		workspace.buildMergedArrayTree(`FusionFileChangeHandler ${changeType}`)
		parsedFile.runPostProcessing()
		CacheManager.clearByFusionFileUri(parsedFile.uri)
		if (changeType === "created") {
			await workspace.diagnoseAllFusionFiles()
		} else {
			await workspace.diagnosePendingFusionFiles()
		}
		this.logDebug(`${changeType === "created" ? "Added" : "Updated"} ParsedFusionFile ${fileEvent.uri}`)
	}

	public async handleDeleted(fileEvent: FileEvent): Promise<void> {
		await super.handleDeleted(fileEvent)
		const workspace = this.languageServer.getWorkspaceForFileUri(fileEvent.uri)
		if (!workspace) {
			this.logInfo(`Deleted Fusion file corresponds to no workspace. ${fileEvent.uri}`)
			return
		}
		const removedParsedFile = workspace.removeParsedFile(fileEvent.uri)
		CacheManager.clearByFusionFileUri(fileEvent.uri)
		await this.languageServer.sendDiagnostics({ uri: fileEvent.uri, diagnostics: [] })

		const filePath = uriToPath(fileEvent.uri)
		const neosPackage = workspace.neosWorkspace.getPackageByUri(fileEvent.uri)
		let removedRootFusionPath = false
		if (neosPackage) {
			const rootFusionPaths = workspace.fusionParser.rootFusionPaths.get(neosPackage)
			if (rootFusionPaths?.some(rootPath => NodePath.resolve(rootPath) === NodePath.resolve(filePath))) {
				workspace.fusionParser.rootFusionPaths.set(neosPackage, rootFusionPaths.filter(rootPath => NodePath.resolve(rootPath) !== NodePath.resolve(filePath)))
				removedRootFusionPath = true
			}
		}

		if (removedParsedFile || removedRootFusionPath) {
			workspace.buildMergedArrayTree("FusionFileChangeHandler deleted")
			await workspace.diagnoseAllFusionFiles()
		}
	}
}
