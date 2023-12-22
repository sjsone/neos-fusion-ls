import { TextDocument } from "vscode-languageserver-textdocument"
import {
    Position,
    ProposedFeatures,
    Range,
    TextDocuments,
    createConnection
} from "vscode-languageserver/node"
import { LanguageServer } from './LanguageServer'
import { CodeLensCapability } from './capabilities/CodeLensCapability'
import { CompletionCapability } from './capabilities/CompletionCapability'
import { DefinitionCapability } from './capabilities/DefinitionCapability'
import { DocumentSymbolCapability } from './capabilities/DocumentSymbolCapability'
import { HoverCapability } from './capabilities/HoverCapability'
import { ReferenceCapability } from './capabilities/ReferenceCapability'
import { WorkspaceSymbolCapability } from './capabilities/WorkspaceSymbolCapability'
import { InlayHintLanguageFeature } from './languageFeatures/InlayHintLanguageFeature'
import { SemanticTokensLanguageFeature } from './languageFeatures/SemanticTokensLanguageFeature'
import { RenameCapability } from './capabilities/RenameCapability'
import { RenamePrepareCapability } from './capabilities/RenamePrepareCapability'

export interface FusionDocument extends TextDocument { }

// TODO: define and handle some arguments like [`showDefaultConfiguration`, `showDefaultInitialization`, `--logFile`, ...] to improve usability as a standalone server

// INFO: https://github.com/microsoft/vscode/issues/135453

const connection = createConnection(ProposedFeatures.all)
const documents: TextDocuments<FusionDocument> = new TextDocuments(TextDocument)

const languageserver = new LanguageServer(connection, documents)


connection.onInitialize(params => languageserver.onInitialize(params))
connection.onDidChangeConfiguration(params => { languageserver.onDidChangeConfiguration(params) })

documents.onDidOpen(event => languageserver.onDidOpen(event))
documents.onDidChangeContent(change => languageserver.onDidChangeContent(change))
connection.onDidChangeWatchedFiles(params => { languageserver.onDidChangeWatchedFiles(params) })

// TODO: connection.onSignatureHelp
// TODO: connection.onDocumentHighlight
// TODO: connection.onDocumentOnTypeFormatting : for fusion assignments and eel in afx attributes (spaces)

connection.onDefinition(params => languageserver.runCapability(DefinitionCapability, params))
connection.onReferences(params => languageserver.runCapability(ReferenceCapability, params))
connection.onCompletion(params => languageserver.runCapability(CompletionCapability, params))
connection.onCompletionResolve(item => item)
connection.onHover(params => languageserver.runCapability(HoverCapability, params))
connection.onDocumentSymbol(params => languageserver.runCapability(DocumentSymbolCapability, params))
connection.onWorkspaceSymbol(params => languageserver.runCapability(WorkspaceSymbolCapability, params))
connection.onCodeLens(params => languageserver.runCapability(CodeLensCapability, params))
connection.onPrepareRename(params => languageserver.runCapability(RenamePrepareCapability, params))
connection.onRenameRequest(params => languageserver.runCapability(RenameCapability, params))
connection.onCodeAction(params => languageserver.onCodeAction(params))

connection.languages.semanticTokens.on(params => languageserver.runLanguageFeature(SemanticTokensLanguageFeature, params))
connection.languages.inlayHint.on(params => languageserver.runLanguageFeature(InlayHintLanguageFeature, params))



documents.listen(connection)
connection.listen()
