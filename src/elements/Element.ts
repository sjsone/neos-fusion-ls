import { AbstractNode } from 'ts-fusion-parser/out/common/AbstractNode';
import { Hover, HoverParams } from 'vscode-languageserver';
import { Logger } from '../common/Logging';
import { CapabilityContext } from './CapabilityContext';

export abstract class Element<Node extends AbstractNode = AbstractNode> extends Logger {

	public async codeLensCapability() {

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

	public async referenceCapability() {

	}

	public async renameCapability() {

	}

	public async renamePrepareCapability() {

	}

	public async signatureHelpCapability() {

	}

	public async workspaceSymbolCapability() {

	}

}