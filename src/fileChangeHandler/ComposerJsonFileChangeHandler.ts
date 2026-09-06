import { FileEvent } from 'vscode-languageserver'
import { AbstractFileChangeHandler } from './AbstractFileChangeHandler'

export class ComposerJsonFileChangeHandler extends AbstractFileChangeHandler {
	protected rerunAgain: boolean = false
	protected running: boolean = false

	canHandleFileEvent(fileEvent: FileEvent): boolean {
		return fileEvent.uri.endsWith("/composer.json")
	}

	public async handleCreated(fileEvent: FileEvent) {
		return this.handleComposerJsonChange(fileEvent)
	}

	public async handleChanged(fileEvent: FileEvent) {
		return this.handleComposerJsonChange(fileEvent)
	}

	public async handleDeleted(fileEvent: FileEvent) {
		return this.handleComposerJsonChange(fileEvent)
	}

	protected async handleComposerJsonChange(fileEvent: FileEvent) {
		this.logInfo(`composer.json change detected: ${fileEvent.uri}`)
		if (this.running) {
			this.logInfo("  Reinitialization already in progress, will re-run after completion")
			this.rerunAgain = true
			return
		}

		this.running = true
		try {
			await this.reinitializeAffectedWorkspaces(fileEvent)
			if (this.rerunAgain) {
				this.logInfo("  Re-running reinitialization for pending changes")
				this.rerunAgain = false
				await this.reinitializeAffectedWorkspaces(fileEvent)
			}
		} finally {
			this.running = false
		}
	}

	protected async reinitializeAffectedWorkspaces(fileEvent: FileEvent) {
		for (const fusionWorkspace of this.languageServer.fusionWorkspaces) {
			if (!fusionWorkspace.isResponsibleForUri(fileEvent.uri)) continue
			this.logInfo(`  Reinitializing workspace: ${fusionWorkspace.name}`)
			await fusionWorkspace.reinitialize()
		}
	}
}
