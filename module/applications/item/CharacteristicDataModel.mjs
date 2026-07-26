/**
 * Faithful Hero Designer XML aligned Item DataModel for Characteristics.
 * Targets Foundry V14 exclusively.
 */
export class CharacteristicItemDataModel extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const { StringField, BooleanField } = foundry.data.fields;

        return {
            ...super.defineSchema(),
            // --- Your Authentic HDC/XML Schema Properties ---
            XMLID: new StringField(),
            ID: new HeroNumberField({ integer: true }),
            BASECOST: new HeroNumberField({ integer: false }),
            LEVELS: new HeroNumberField({ integer: true }),
            ALIAS: new StringField(),
            POSITION: new HeroNumberField({ integer: true }),
            MULTIPLIER: new HeroNumberField({ integer: false }),
            GRAPHIC: new StringField(),
            COLOR: new StringField(),
            SFX: new StringField(),
            SHOW_ACTIVE_COST: new BooleanField({ initial: null, nullable: true }),
            INCLUDE_NOTES_IN_PRINTOUT: new BooleanField({ initial: null, nullable: true }),
            NAME: new StringField(),
            AFFECTS_PRIMARY: new BooleanField({ initial: null, nullable: true }),
            AFFECTS_TOTAL: new BooleanField({ initial: null, nullable: true }),
            _hdcXml: new StringField(),
            is5e: new BooleanField({ initial: null, nullable: true }),
            xmlTag: new StringField(),
        };
    }

    /**
     * Aggregates HDC levels, system baselines, and active effect modifiers inline.
     * @override
     */
    prepareDerivedData() {
        super.prepareDerivedData();

        const levels = parseInt(this.LEVELS) || 0;
        const computedMax = this.rulebookBase + levels + this.figuredModifiers + this.temporalModifiers;

        this.max = computedMax;
        this.value = computedMax; // Resource pools will handle value separately
    }
}
