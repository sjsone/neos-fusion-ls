import { AbstractNode } from 'ts-fusion-parser/out/common/AbstractNode'
import { NodePosition } from 'ts-fusion-parser/out/common/NodePosition'
import { ObjectNode } from 'ts-fusion-parser/out/dsl/eel/nodes/ObjectNode'
import { PhpClass } from '../../common/php/PhpClass'
import { PhpClassMethodNode } from './PhpClassMethodNode'

export class PhpClassNode extends AbstractNode {
	public identifier: string
	public method: PhpClassMethodNode | null = null
	public objectNode: ObjectNode

	constructor(public phpClass: PhpClass, identifier: string, objectNode: ObjectNode, position: NodePosition) {
		super(position)
		this.identifier = identifier
		this.objectNode = objectNode
		this.parent = objectNode
	}

	setMethod(method: PhpClassMethodNode) {
		this.method = method
		this.method.eelHelper = this
		this.method.parent = this
	}
}