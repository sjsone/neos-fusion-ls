import { AbstractNode } from 'ts-fusion-parser/out/common/AbstractNode';
import { CodeLens, CodeLensParams, Hover, HoverParams, Location, ReferenceParams, SignatureHelp, SignatureHelpParams, SymbolInformation, WorkspaceSymbol, WorkspaceSymbolParams } from 'vscode-languageserver';
import { Logger } from '../common/Logging';
import { CapabilityContext } from './CapabilityContext';

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

	public async renameCapability() {

	}

	public async renamePrepareCapability() {

	}

	public async signatureHelpCapability(context: CapabilityContext<Node>, params: SignatureHelpParams): Promise<SignatureHelp | undefined> {
		return undefined
	}

	public async workspaceSymbolCapability(context: CapabilityContext<AbstractNode>, params: WorkspaceSymbolParams): Promise<SymbolInformation[] | WorkspaceSymbol[] | undefined> {
		return undefined
	}
}