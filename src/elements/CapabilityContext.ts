import { AbstractNode } from 'ts-fusion-parser/out/common/AbstractNode';
import { CodeLensParams, TextDocumentPositionParams } from 'vscode-languageserver';
import { LinePositionedNode } from '../common/LinePositionedNode';
import { FusionWorkspace } from '../fusion/FusionWorkspace';
import { ParsedFusionFile } from '../fusion/ParsedFusionFile';

export class CapabilityContext<Node extends AbstractNode = AbstractNode> {
	constructor(
		public readonly workspaces: Array<FusionWorkspace>,
		public readonly parsedFusionFile?: ParsedFusionFile,
		public readonly foundNodeByLine?: LinePositionedNode<Node>,
		public readonly params?: TextDocumentPositionParams | CodeLensParams,
	) { }
}