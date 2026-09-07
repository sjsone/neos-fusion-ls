import { FileEvent } from 'vscode-languageserver'
import { AbstractFileChangeHandler } from './AbstractFileChangeHandler'
import { LanguageServer } from '../LanguageServer'

export class YamlFileChangeHandler extends AbstractFileChangeHandler {

	protected rerunAgain: boolean = false
	protected running: boolean = false

	protected debounceTimeout: any = undefined

	constructor(languageServer: LanguageServer) {
		super(languageServer)
	}

	canHandleFileEvent(fileEvent: FileEvent): boolean {
		// TODO: check if yaml file is relevant (FlowConfiguration.responsibleFor(fileEvent.uri) ?)
		return fileEvent.uri.endsWith(".yaml") || fileEvent.uri.endsWith(".yml")
	}

	public handleChanged(fileEvent: FileEvent) {
		return this.handleConfigurationFileChanged(fileEvent)
	}

	public handleCreated(fileEvent: FileEvent) {
		return this.handleConfigurationFileChanged(fileEvent)
	}

	public handleDeleted(fileEvent: FileEvent) {
		return this.handleConfigurationFileChanged(fileEvent)
	}

	protected async handleConfigurationFileChanged(fileEvent: FileEvent) {
		this.logInfo("|handleConfigurationFileChanged")
		if (this.running) {
			this.logInfo("  Ignored but will rerun again...")
			this.rerunAgain = true
			return
		}

		await this.rebuildConfiguration(fileEvent)
		this.logInfo("  Build configuration")
		if (this.rerunAgain) {
			this.logInfo("  will rerun")
			await this.rebuildConfiguration(fileEvent)
			this.rerunAgain = false
		}

		this.logInfo("  will finish")
		this.running = false
	}

	protected async rebuildConfiguration(fileEvent: FileEvent) {
		const diagnostics: Array<Promise<void>> = []
		for (const fusionWorkspace of this.languageServer.fusionWorkspaces) {
			if (!fusionWorkspace.isResponsibleForUri(fileEvent.uri)) {
				continue
			}

			diagnostics.push(fusionWorkspace.rebuildConfiguration())
		}

		return Promise.all(diagnostics)
	}
}
