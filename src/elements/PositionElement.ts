import { Hover, HoverParams } from 'vscode-languageserver'
import { CapabilityContext } from './CapabilityContext'

import { Element } from './Element'
import { MetaPathSegment } from 'ts-fusion-parser/out/fusion/nodes/MetaPathSegment'

export class PositionElement extends Element<MetaPathSegment> {
	public async hoverCapability(context: CapabilityContext<MetaPathSegment>, params: HoverParams): Promise<string | Hover | undefined> {
		const positionedNode = context.foundNodeByLine
		if (positionedNode === undefined) return undefined

		const node = positionedNode.getNode()
		if (!(node instanceof MetaPathSegment)) return undefined

		return {
			contents: {
				kind: "markdown",
				value: [
					'`@position` can be used with sequential processed decorators and objects where the order is relevant.',
					'These include:',
					'- `@process`',
					'- `@if`',
					'- inside `Neos.Fusion:Case`',
					'- inside `Neos.Fusion:Join`',
					'',
					'When the position of a prop is set, it uses the given position instead of the order they were defined in the document.',
					'',
					'---',
					'',
					'[Neos Fusion Reference](https://neos.readthedocs.io/en/stable/References/NeosFusionReference.html#neos-fusion-join)'
				].join('\n')
			},
			range: positionedNode.getPositionAsRange()
		}
	}
}