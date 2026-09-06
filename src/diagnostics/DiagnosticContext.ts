import { ClientCapabilities } from 'vscode-languageserver'

export interface DiagnosticContext {
	clientCapabilities: ClientCapabilities
}
