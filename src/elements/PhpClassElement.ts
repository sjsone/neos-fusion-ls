import { HoverParams, Hover } from 'vscode-languageserver';
import { PhpClassNode } from '../fusion/node/PhpClassNode';
import { CapabilityContext } from './CapabilityContext';
import { Element } from './Element';

export class PhpClassElement extends Element<PhpClassNode> {
	public async hoverCapability(context: CapabilityContext<PhpClassNode>, params: HoverParams): Promise<string | Hover | undefined> {
		const node = context.foundNodeByLine!.getNode()

		if (!(node instanceof PhpClassNode)) {
			return undefined
		}

		const className = node.phpClass.getClassName()
		const namespace = node.phpClass.fullyQualifiedClassName.replace('\\' + className, "")

		return [
			'```php',
			`<?php`,
			`namespace ${namespace};`,
			'',
			`class ${className} { }`,
			'```'
		].join('\n')

	}
}