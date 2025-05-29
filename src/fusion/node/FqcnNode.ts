import { AbstractNode } from 'ts-fusion-parser/out/common/AbstractNode'
import { NodePosition } from 'ts-fusion-parser/out/common/NodePosition'
import { PhpClass } from '../../common/php/PhpClass'

export class FqcnNode extends AbstractNode {
	readonly realLength: number

	constructor(public identifier: string, public phpClass: PhpClass, position: NodePosition) {
		super(position)

		this.realLength = identifier.length + identifier.split('\\').length - 1
	}
}