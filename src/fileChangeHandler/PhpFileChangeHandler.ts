import { FileChangeType, FileEvent } from 'vscode-languageserver'
import { AbstractFileChangeHandler } from './AbstractFileChangeHandler'
import { clearLineDataCacheForFile, uriToPath } from '../common/util'

export class PhpFileChangeHandler extends AbstractFileChangeHandler {
	canHandleFileEvent(fileEvent: FileEvent): boolean {
		this.logVerbose(`canHandleFileEvent: ${fileEvent.type === FileChangeType.Changed}`)
		return fileEvent.type === FileChangeType.Changed && fileEvent.uri.endsWith(".php")
	}

	public async handleChanged(fileEvent: FileEvent) {
		clearLineDataCacheForFile(fileEvent.uri)
		this.logVerbose(`handle change of file: ${fileEvent.uri}`)

		let wasAffected: boolean = false
		for (const workspace of this.languageServer.fusionWorkspaces) {
			for (const neosPackage of workspace.neosWorkspace.getPackages().values()) {
				for (const namespace of neosPackage.namespaces.values()) {
					if (namespace.clearKnownForFileUri(fileEvent.uri)) {
						wasAffected = true
					}
				}
			}
		}

		// FIXME: diagnosing fusion files has no effect because each PhpClassMethodNode holds its own reference to the PhpClassMethod. The files should be re-processed instead but for that we need the list of potentially affected nodes instead of all
		if (wasAffected) {
			Promise.all(this.languageServer.fusionWorkspaces.map(workspace => workspace.diagnoseAllFusionFiles()))
		}
	}

	public async handleCreated(fileEvent: FileEvent) {
		this.logError('handleCreated: Method not implemented.')
	}

	public async handleDeleted(fileEvent: FileEvent) {
		this.logError('handleDeleted: Method not implemented.')
	}
}