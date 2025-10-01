import { AbstractNode } from 'ts-fusion-parser/out/common/AbstractNode';
import { LinePositionedNode } from '../common/LinePositionedNode';
import { FusionWorkspace } from '../fusion/FusionWorkspace';
import { ParsedFusionFile } from '../fusion/ParsedFusionFile';
import { TextDocumentPositionParams, CodeLensParams } from 'vscode-languageserver';

export class CapabilityContext<Node extends AbstractNode = AbstractNode> {
	constructor(
		public readonly workspaces: Array<FusionWorkspace>,
		public readonly parsedFusionFile?: ParsedFusionFile,
		public readonly foundNodeByLine?: LinePositionedNode<Node>,
		public readonly params?: TextDocumentPositionParams | CodeLensParams,
	) { }
}