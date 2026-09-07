import { FileEvent } from 'vscode-languageserver'
import { CacheManager } from '../cache/CacheManager'
import { AbstractFileChangeHandler } from './AbstractFileChangeHandler'
import { clearLineDataCacheForFile, isPathEqualOrInside, uriToPath } from '../common/util'

export class PhpFileChangeHandler extends AbstractFileChangeHandler {
	canHandleFileEvent(fileEvent: FileEvent): boolean {
		return fileEvent.uri.endsWith(".php")
	}

	public async handleChanged(fileEvent: FileEvent) {
		return this.handlePhpFileChange(fileEvent)
	}

	public async handleCreated(fileEvent: FileEvent) {
		return this.handlePhpFileChange(fileEvent)
	}

	public async handleDeleted(fileEvent: FileEvent) {
		return this.handlePhpFileChange(fileEvent)
	}

	protected async handlePhpFileChange(fileEvent: FileEvent) {
		clearLineDataCacheForFile(fileEvent.uri)
		this.logVerbose(`handle PHP file event: ${fileEvent.uri}`)
		const filePath = uriToPath(fileEvent.uri)

		for (const workspace of this.languageServer.fusionWorkspaces) {
			let workspaceWasAffected = false
			for (const neosPackage of workspace.neosWorkspace.getPackages().values()) {
				for (const namespace of neosPackage.namespaces.values()) {
					if (isPathEqualOrInside(namespace.path, filePath)) workspaceWasAffected = true
					namespace.clearKnownForFileUri(fileEvent.uri)
				}
			}

			if (!workspaceWasAffected) continue

			workspace.neosWorkspace.initEelHelpers()
			for (const parsedFile of workspace.parsedFiles) {
				const document = this.languageServer.getOpenDocument(parsedFile.uri)
				workspace.initParsedFile(parsedFile, document?.getText())
				CacheManager.clearByFusionFileUri(parsedFile.uri)
			}
			for (const parsedFile of workspace.parsedFiles) parsedFile.runPostProcessing()
			await workspace.diagnoseAllFusionFiles()
		}
	}
}
