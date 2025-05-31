import { HoverParams, Hover } from 'vscode-languageserver';
import { PhpClassMethodNode } from '../fusion/node/PhpClassMethodNode';
import { CapabilityContext } from './CapabilityContext';
import { Element } from './Element';

export class PhpClassMethodElement extends Element<PhpClassMethodNode> {
	public async hoverCapability(context: CapabilityContext<PhpClassMethodNode>, params: HoverParams): Promise<string | Hover | undefined> {
		const node = context.foundNodeByLine!.getNode()
		if (!(node instanceof PhpClassMethodNode)) return undefined

		const header = `EEL-Helper *${node.eelHelper.identifier}*.**${node.identifier}** \n`

		const method = node.method
		if (!method) return header

		const phpParametersList = method.parameters.map(p => `    ${p.type ?? ''}${p.name}${p.defaultValue ?? ''}`)
		const phpParameters = "\n" + phpParametersList.join(", \n") + "\n"

		const descriptionParts: string[] = []
		if (method.description) {
			descriptionParts.push('##### Description:')
			descriptionParts.push(method.description?.replace("Example::", '##### Example:'))
		}

		return [
			'```php',
			`<?php`,
			`function ${method.name}(${phpParameters})${method.returns?.type ? ': ' + method.returns.type : ''}`,
			'```',
			...descriptionParts,
		].join('\n')

	}
}