import { AbstractNode } from 'ts-fusion-parser/out/common/AbstractNode';
import { CodeLens, CodeLensParams, CreateFile, DeleteFile, Hover, HoverParams, InlayHint, InlayHintParams, Location, PrepareRenameParams, Range, ReferenceParams, RenameFile, RenameParams, SignatureHelp, SignatureHelpParams, SymbolInformation, TextDocumentEdit, WorkspaceEdit, WorkspaceSymbol, WorkspaceSymbolParams } from 'vscode-languageserver';
import { Logger } from '../common/Logging';
import { CapabilityContext } from './CapabilityContext';
import { LanguageFeatureContext } from './LanguageFeatureContext';

export abstract class Element<Node extends AbstractNode = AbstractNode> extends Logger {

	public async codeLensCapability(context: CapabilityContext<AbstractNode>, params: CodeLensParams): Promise<CodeLens[] | undefined> {
		return undefined
	}

	public async completionCapability() {

	}

	public async definitionCapability() {

	}

	public async documentSymbolCapability() {

	}

	public async hoverCapability(context: CapabilityContext<Node>, params: HoverParams): Promise<string | Hover | undefined> {
		return undefined
	}

	public async referenceCapability(context: CapabilityContext<Node>, params: ReferenceParams): Promise<Location[] | undefined> {
		return undefined
	}

	public async renameCapability(context: CapabilityContext<Node>, params: RenameParams): Promise<Array<TextDocumentEdit | CreateFile | RenameFile | DeleteFile> | undefined> {
		return undefined
	}

	public async renamePrepareCapability(context: CapabilityContext<Node>, params: PrepareRenameParams): Promise<Range | undefined> {
		return undefined
	}

	public async signatureHelpCapability(context: CapabilityContext<Node>, params: SignatureHelpParams): Promise<SignatureHelp | undefined> {
		return undefined
	}

	public async workspaceSymbolCapability(context: CapabilityContext<Node>, params: WorkspaceSymbolParams): Promise<SymbolInformation[] | WorkspaceSymbol[] | undefined> {
		return undefined
	}

	public async inlayHintLanguageFeature(context: LanguageFeatureContext<Node>, params: InlayHintParams): Promise<InlayHint[] | undefined> {
		return undefined
	}
}