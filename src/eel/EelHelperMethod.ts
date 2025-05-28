import { LinePosition } from '../common/LinePositionedNode'
import { ClassDefinition } from '../neos/NeosPackageNamespace'
import { PhpMethod, PhpMethodParameter, PhpTypeWithDescription } from './PhpMethod'


export class EelHelperMethod extends PhpMethod {
	protected normalizedName: string

	public classDefinition!: ClassDefinition

	constructor(uri: string, name: string, description: string | undefined, parameters: PhpMethodParameter[], position: { start: LinePosition, end: LinePosition }, returns: PhpTypeWithDescription | undefined) {
		super(uri, name, description, parameters, position, returns)

		const nameWithoutGetter = this.name.replace(/get/, '').trim()
		this.normalizedName = nameWithoutGetter ? nameWithoutGetter[0].toLowerCase() + nameWithoutGetter.substring(1) : name
	}

	getNormalizedName() {
		return this.normalizedName
	}

	valid(identifier: string) {
		if (identifier === this.name) return true
		if (identifier === this.normalizedName) return true
		return false
	}
}