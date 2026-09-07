import { FileEvent } from 'vscode-languageserver'
import { AbstractFileChangeHandler } from './AbstractFileChangeHandler'
import { clearLineDataCacheForFile, isPathEqualOrInside, uriToPath } from '../common/util'
import { XLIFFTranslationFile } from '../translations/XLIFFTranslationFile'

export class XlfFileChangeHandler extends AbstractFileChangeHandler {
	canHandleFileEvent(fileEvent: FileEvent): boolean {
		return fileEvent.uri.endsWith(".xlf")
	}

	public async handleChanged(fileEvent: FileEvent) {
		clearLineDataCacheForFile(fileEvent.uri)
		for (const workspace of this.languageServer.fusionWorkspaces) {
			const translationFile = workspace.getTranslationFileByUri(fileEvent.uri)
			if (!translationFile) continue
			await translationFile.parse()
			await workspace.diagnoseAllFusionFiles()
		}
	}

	public async handleCreated(fileEvent: FileEvent) {
		const workspace = this.languageServer.getWorkspaceForFileUri(fileEvent.uri)
		if (!workspace) return
		if (workspace.getTranslationFileByUri(fileEvent.uri)) return this.handleChanged(fileEvent)

		const neosPackage = workspace.neosWorkspace.getPackageByUri(fileEvent.uri)
		if (!neosPackage) return

		const basePath = neosPackage.getTranslationsBasePath()
		const filePath = uriToPath(fileEvent.uri)
		if (!isPathEqualOrInside(basePath, filePath)) return

		const translationFile = XLIFFTranslationFile.FromFilePath(neosPackage, filePath, basePath)
		await translationFile.parse()
		workspace.translationFiles.push(translationFile)
		await workspace.diagnoseAllFusionFiles()
	}

	public async handleDeleted(fileEvent: FileEvent) {
		await super.handleDeleted(fileEvent)
		for (const workspace of this.languageServer.fusionWorkspaces) {
			const previousLength = workspace.translationFiles.length
			workspace.translationFiles = workspace.translationFiles.filter(translationFile => translationFile.uri !== fileEvent.uri)
			if (workspace.translationFiles.length < previousLength) await workspace.diagnoseAllFusionFiles()
		}
	}
}
