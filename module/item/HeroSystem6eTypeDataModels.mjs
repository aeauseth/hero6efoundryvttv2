//import { RoundFavorPlayerDown, RoundFavorPlayerUp } from "../utility/round.mjs";
import { HeroSystem6eActor } from "../actor/actor.mjs";
import { getPowerInfo } from "../utility/util.mjs";
//import { getSystemDisplayUnits } from "../utility/units.mjs";
import { HeroSystem6eItem } from "./item.mjs";
import { calculateVelocityInSystemUnits } from "../heroRuler.mjs";
import {
    getManueverEffectWithPlaceholdersReplaced,
    getFullyQualifiedEffectFormulaFromItem,
    combatSkillLevelsForAttack,
} from "../utility/damage.mjs";

const { NumberField, StringField, ObjectField, BooleanField, ArrayField, EmbeddedDataField, SchemaField } =
    foundry.data.fields;

class HeroItemModCommonModel extends foundry.abstract.DataModel {
    // constructor(data, context) {
    //     super(data, context);

    // }

    /** @inheritdoc */
    static defineSchema() {
        return {
            XMLID: new StringField(),
            xmlid: new StringField(),
            ID: new StringField(),
            BASECOST: new NumberField({ integer: false }),
            LEVELS: new NumberField({ integer: true }),
            ALIAS: new StringField(),
            POSITION: new NumberField({ integer: true }),
            MULTIPLIER: new StringField(),
            GRAPHIC: new StringField(),
            COLOR: new StringField(),
            SFX: new StringField(),
            SHOW_ACTIVE_COST: new BooleanField({ initial: null, nullable: true }),
            OPTION: new StringField(),
            OPTIONID: new StringField(),
            OPTION_ALIAS: new StringField(),
            INCLUDE_NOTES_IN_PRINTOUT: new BooleanField({ initial: null, nullable: true }),
            NAME: new StringField(),
            SHOWALIAS: new BooleanField({ initial: null, nullable: true }),
            PRIVATE: new BooleanField({ initial: null, nullable: true }),
            REQUIRED: new BooleanField({ initial: null, nullable: true }),
            INCLUDEINBASE: new BooleanField({ initial: null, nullable: true }),
            DISPLAYINSTRING: new BooleanField({ initial: null, nullable: true }),
            GROUP: new BooleanField({ initial: null, nullable: true }),
            SELECTED: new BooleanField({ initial: null, nullable: true }),
            _hdcXml: new StringField(),
            xmlTag: new StringField(),
            LVLCOST: new StringField(),
            FORCEALLOW: new BooleanField({ initial: null, nullable: true }),
            COMMENTS: new StringField(),
            LVLVAL: new StringField(),
            QUANTITY: new NumberField({ integer: true }),
            AFFECTS_TOTAL: new StringField(),
            PARENTID: new StringField(),
            INPUT: new StringField(),
            AFFECTS_PRIMARY: new BooleanField({ initial: null, nullable: true }),
            LINKED_ID: new StringField(),
            ROLLALIAS: new StringField(),
            TYPE: new StringField(),
            DISPLAY: new StringField(),
            SCALE: new StringField(),
            CLIPS_COST: new NumberField({ integer: false }),
        };
    }
    get hdcHTMLCollection() {
        try {
            return this._hdcXml ? new DOMParser().parseFromString(this._hdcXml, "text/xml") : null;
        } catch (e) {
            console.error(e);
        }
        return null;
    }

    // Make sure all the attributes in the HDC XML are in our data model
    debugModelProps() {
        try {
            if (this._hdcXml) {
                for (const attribute of this.hdcHTMLCollection.firstChild.attributes) {
                    if (this[attribute.name] === undefined) {
                        console.error(
                            `${this.xmlTag} HeroItemModCommonModel is missing ${attribute.name} property.  Fix then reload ${this.actor.name}.`,
                        );
                    }
                }

                for (const adder of this.ADDER || []) {
                    adder.debugModelProps();
                }
                for (const modifier of this.MODIFIER || []) {
                    modifier.debugModelProps();
                }
                for (const power of this.POWER || []) {
                    power.debugModelProps();
                }
            }
        } catch (e) {
            console.error(e);
        }
    }

    #baseInfo = null;

    get baseInfo() {
        // cache getPowerInfo
        this.#baseInfo ??= getPowerInfo({ XMLID: this.XMLID, item: this.item, xmlTag: this.xmlTag });
        // if (!this.#baseInfo) {
        //     debugger;
        // }
        return this.#baseInfo;
    }

    get item() {
        if (this.parent instanceof HeroSystem6eItem) {
            return this.parent;
        }
        if (!this.parent) {
            console.error("unable to find item");
            return null;
        }
        return this.parent.item;
    }

    get actor() {
        return this.item.actor;
    }

    get cost() {
        console.error(`Unhandled cost in ${this.constructor.toString()}`);
        return 0;
    }

    get BASECOST_total() {
        return this.cost;
    }

    get adders() {
        return this.ADDER || [];
    }

    get modifiers() {
        return this.MODIFIER || [];
    }

    get powers() {
        return this.POWER || [];
    }
}

export class HeroAdderModelCommon extends HeroItemModCommonModel {
    get cost() {
        let _cost = 0;
        if (this.SELECTED !== false) {
            // Custom costs calculations
            if (this.baseInfo?.cost) {
                _cost = this.baseInfo.cost(this, this.item);
            } else {
                // Generic cost calculations
                _cost = parseFloat(this.BASECOST);

                let costPerLevel = this.baseInfo?.costPerLevel ? this.baseInfo?.costPerLevel(this) : 0;
                const levels = parseInt(this.LEVELS) || 0;
                // Override default costPerLevel?
                if (this.LVLCOST && levels > 0) {
                    const _costPerLevel = parseFloat(this.LVLCOST || 0) / parseFloat(this.LVLVAL || 1) || 1;
                    costPerLevel = _costPerLevel;
                }
                _cost += levels * costPerLevel;
            }
        }

        // Some parent modifiers need to override/tweak the adder costs (WEAPONSMITH)
        if (this.parent?.baseInfo?.adderCostAdjustment) {
            _cost = this.parent.baseInfo.adderCostAdjustment({ adder: this, adderCost: _cost });
        }

        // Some ADDERs have ADDERs (for example TRANSPORT_FAMILIARITY)
        for (const adder of this.adders) {
            _cost += adder.cost;
        }

        // TRANSPORT_FAMILIARITY (possibly others) may have a maximum cost per category
        if (this.SELECTED === false && this.item?.type === "skill") {
            const maxCost = parseFloat(this.BASECOST) || 0;
            if (maxCost > 0 && _cost > maxCost) {
                if (this.item?.system.XMLID !== "TRANSPORT_FAMILIARITY") {
                    console.warn(
                        `We found another example of a skill with category limitations ${this.item.system.XMLID}`,
                    );
                }
                _cost = Math.min(maxCost, _cost);
            }
        }

        return _cost;
    }
}

export class HeroAdderModel2 extends HeroAdderModelCommon {}

export class HeroAdderModel extends HeroAdderModelCommon {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            ADDER: new ArrayField(new EmbeddedDataField(HeroAdderModel2)),
            //MODIFIER: new ArrayField(new EmbeddedDataField(HeroModifierModel2)),
            //POWER: new ArrayField(new EmbeddedDataField(HeroPowerModel)),
        };
    }
}

class HeroModifierModelCommon extends HeroItemModCommonModel {
    get cost() {
        let _cost = 0;
        // Custom costs calculations
        if (this.baseInfo?.cost) {
            _cost = this.baseInfo.cost(this, this.item);
        } else {
            // Generic cost calculations
            _cost = parseFloat(this.BASECOST);

            let costPerLevel = this.baseInfo?.costPerLevel(this) || 0;
            const levels = parseInt(this.LEVELS) || 0;
            if (!costPerLevel && this.LVLCOST) {
                console.warn(
                    `${this.item?.actor.name}/${this.item?.detailedName()}/${this.XMLID}: is missing costPerLevel, using LVLCOST & LVLVAL`,
                );
                costPerLevel = parseFloat(this.LVLCOST || 0) / parseFloat(this.LVLVAL || 1) || 1;
            }
            _cost += levels * costPerLevel;
        }

        // Some MODIFIERs have ADDERs
        for (const adder of this.adders) {
            _cost += adder.cost;
        }

        // Some MODIFIERs have MODIFIERs (CONTINUOUSCONCENTRATION & ACTIVATEONLY)
        for (const modifier of this.modifiers) {
            _cost += modifier.cost;
        }

        // Some modifiers have a minimumLimitation (REQUIRESASKILLROLL)
        if (this.baseInfo?.minimumLimitation) {
            if (this.baseInfo?.minimumLimitation < 0) {
                _cost = Math.min(this.baseInfo?.minimumLimitation, _cost);
            } else {
                _cost = Math.max(this.baseInfo?.minimumLimitation, _cost);
            }
        }

        return _cost;
    }

    get addersDescription() {
        const textArray = [];
        for (const _adder of this.adders) {
            if (_adder.addersDescription) {
                textArray.push(_adder.addersDescription(_adder));
            } else {
                textArray.push(_adder.OPTION_ALIAS || _adder.ALIAS);
            }
        }
        return textArray.join(", ");
    }
}

class HeroModifierModel2 extends HeroModifierModelCommon {}

export class HeroModifierModel extends HeroModifierModelCommon {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            ADDER: new ArrayField(new EmbeddedDataField(HeroAdderModel)),
            MODIFIER: new ArrayField(new EmbeddedDataField(HeroModifierModel2)),
            //POWER: new ArrayField(new EmbeddedDataField(HeroPowerModel)),
        };
    }
}

class HeroPowerModel extends HeroItemModCommonModel {
    get cost() {
        let _cost = 0;

        // There may be confusion between a POWER and a POWER modifier (connecting power).
        // Errors may result in cost functions.
        try {
            // Custom costs calculations
            if (this.baseInfo?.cost) {
                _cost = this.baseInfo.cost(this);
            } else {
                // Generic cost calculations
                _cost = parseFloat(this.BASECOST);

                const costPerLevel = this.baseInfo?.costPerLevel(this) || 0;
                const levels = parseInt(this.LEVELS) || 0;
                _cost += levels * costPerLevel;
            }

            // POWER-adders do not have ADDER (that we are aware of)
            for (const adder of this.adders) {
                _cost += adder.cost;
            }
        } catch (e) {
            console.error(e);
        }

        return _cost;
    }
}

export class HeroSystem6eItemCharges extends foundry.abstract.DataModel {
    constructor(data, context) {
        super(data, context);

        // set initial value
        const CHARGES = this.parent.MODIFIER.find((m) => m.XMLID === "CHARGES");
        if (!CHARGES && data.value !== undefined) {
            this.value = undefined;
        }
        if (data.value === undefined) {
            if (CHARGES) {
                this.value = parseInt(CHARGES.OPTION_ALIAS);
                this.clips = Math.pow(2, parseInt((CHARGES.ADDER || []).find((o) => o.XMLID === "CLIPS")?.LEVELS || 0));
            }
        }
    }

    static defineSchema() {
        // Note that the return is just a simple object
        return {
            value: new NumberField({ integer: true, min: 0, initial: 0, nullable: false }),
            clips: new NumberField({ integer: true, min: 0, initial: 0, nullable: false }),
        };
    }

    get CHARGES() {
        return this.parent.MODIFIER.find((o) => o.XMLID === "CHARGES");
    }

    get item() {
        if (this.parent.parent instanceof HeroSystem6eItem) {
            return this.parent.parent;
        }
        return null;
    }

    get recoverable() {
        return !!this.CHARGES?.ADDER.find((o) => o.XMLID === "RECOVERABLE");
    }

    get continuing() {
        return !!this.CHARGES?.ADDER.find((o) => o.XMLID === "CONTINUING")?.OPTIONID;
    }

    get boostable() {
        return !!this.CHARGES?.ADDER.find((o) => o.XMLID === "BOOSTABLE");
    }
    get fuel() {
        return !!this.CHARGES?.ADDER.find((o) => o.XMLID === "FUEL");
    }

    get max() {
        if (this.CHARGES) {
            return parseInt(this.CHARGES?.OPTION_ALIAS);
        }
        return null;
    }

    get CLIPS() {
        return this.CHARGES?.ADDER?.find((o) => o.XMLID === "CLIPS");
    }

    get clipsMax() {
        return Math.pow(2, this.CLIPS?.LEVELS || 0);
    }
}

export class HeroSystem6eItemTypeDataModelGetters extends foundry.abstract.TypeDataModel {
    get description() {
        try {
            return this.parent.getItemDescription();
        } catch (e) {
            console.error(e, this);
        }
        return null;
    }

    get hdcHTMLCollection() {
        try {
            return this._hdcXml ? new DOMParser().parseFromString(this._hdcXml, "text/xml") : null;
        } catch (e) {
            console.error(e);
        }
        return null;
    }

    get hdcJson() {
        return HeroSystem6eItem.itemDataFromXml(this._hdcXml, this.parent.actor);
    }

    get range() {
        let _range = this.baseInfo?.range;
        try {
            if (!_range) {
                // This should never happen, missing something from CONFIG.mjs?  Perhaps with super old actors?
                console.error(`Missing range`, this);
                this.system.range = CONFIG.HERO.RANGE_TYPES.SELF;
            }

            // Short circuit if there are no modifiers
            if (this.MODIFIER === undefined) {
                return _range;
            }

            // Range Modifiers "self", "no range", "standard", or "los" based on base power.
            // It is the modified up or down but the only other types that should be added are:
            // "range based on str" or "limited range"
            const RANGED = this.MODIFIER.find((o) => o.XMLID === "RANGED");
            const NORANGE = this.MODIFIER.find((o) => o.XMLID === "NORANGE");
            const limitedRange =
                RANGED?.OPTIONID === "LIMITEDRANGE" || // Advantage form
                !!this.MODIFIER.find((o) => o.XMLID === "LIMITEDRANGE"); // Limitation form
            const rangeBasedOnStrength =
                RANGED?.OPTIONID === "RANGEBASEDONSTR" || // Advantage form
                !!this.MODIFIER.find((o) => o.XMLID === "RANGEBASEDONSTR"); // Limitation form
            const LOS = this.MODIFIER.find((o) => o.XMLID === "LOS");
            const NORMALRANGE = this.MODIFIER.find((o) => o.XMLID === "NORMALRANGE");
            const UOO = this.MODIFIER.find((o) => o.XMLID === "UOO");
            const BOECV = this.MODIFIER.find((o) => o.XMLID === "BOECV");

            // Based on EGO combat value comes with line of sight
            if (BOECV) {
                _range = CONFIG.HERO.RANGE_TYPES.LINE_OF_SIGHT;
            }

            // Self only powers cannot be bought to have range unless they become usable on others at which point
            // they gain no range.
            if (_range === CONFIG.HERO.RANGE_TYPES.SELF) {
                if (UOO) {
                    _range = CONFIG.HERO.RANGE_TYPES.NO_RANGE;
                }
            }

            // No range can be bought to have range.
            if (_range === CONFIG.HERO.RANGE_TYPES.NO_RANGE) {
                if (RANGED) {
                    _range = CONFIG.HERO.RANGE_TYPES.STANDARD;
                }
            }

            // Standard range can be bought up or bought down.
            if (_range === CONFIG.HERO.RANGE_TYPES.STANDARD) {
                if (NORANGE) {
                    _range = CONFIG.HERO.RANGE_TYPES.NO_RANGE;
                } else if (LOS) {
                    _range = CONFIG.HERO.RANGE_TYPES.LINE_OF_SIGHT;
                } else if (limitedRange) {
                    _range = CONFIG.HERO.RANGE_TYPES.LIMITED_RANGE;
                } else if (rangeBasedOnStrength) {
                    _range = CONFIG.HERO.RANGE_TYPES.RANGE_BASED_ON_STR;
                }
            }

            // Line of sight can be bought down
            if (_range === CONFIG.HERO.RANGE_TYPES.LINE_OF_SIGHT) {
                if (NORMALRANGE) {
                    _range = CONFIG.HERO.RANGE_TYPES.STANDARD;
                } else if (rangeBasedOnStrength) {
                    _range = CONFIG.HERO.RANGE_TYPES.RANGE_BASED_ON_STR;
                } else if (limitedRange) {
                    _range = CONFIG.HERO.RANGE_TYPES.LIMITED_RANGE;
                } else if (NORANGE) {
                    _range = CONFIG.HERO.RANGE_TYPES.NO_RANGE;
                }
            }
        } catch (e) {
            console.error(e);
        }

        return _range;
    }

    get #rollProps() {
        if (!this.item.hasSuccessRoll()) {
            return {};
        }

        // TODO: Can this be simplified. Should we add some test cases?
        // TODO: Luck and unluck...

        // No Characteristic = no roll (Skill Enhancers for example) except for FINDWEAKNESS
        const { roll, tags } = !this.CHARACTERISTIC
            ? this.item._getNonCharacteristicsBasedRollComponents(this)
            : this.item._getSkillRollComponents(this);
        return { roll, tags };
    }

    get roll() {
        return this.#rollProps.roll;
    }

    get tags() {
        return this.#rollProps.tags;
    }

    // Make sure all the attributes in the HDC XML are in our data model
    debugModelProps() {
        try {
            if (this._hdcXml) {
                for (const attribute of this.hdcHTMLCollection.firstChild.attributes) {
                    if (this[attribute.name] === undefined) {
                        console.error(
                            `${this.parent.type} HeroSystem6eItemTypeDataModelGetters is missing ${attribute.name} property.`,
                        );
                    }

                    if (this.ADDER) {
                        for (const adder of this.ADDER) {
                            adder.debugModelProps();
                        }
                    }

                    if (this.MODIFIER) {
                        for (const modifier of this.MODIFIER) {
                            modifier.debugModelProps();
                        }
                    }

                    if (this.POWER) {
                        for (const power of this.POWER) {
                            power.debugModelProps();
                        }
                    }
                }
                ``;
            }
        } catch (e) {
            console.error(e);
        }
    }

    #baseInfo = null;

    get baseInfo() {
        // cache getPowerInfo
        this.#baseInfo ??= getPowerInfo({ item: this.parent, xmlTag: this.xmlTag });
        if (!this.#baseInfo) {
            console.warn(`${this.item.name}/${this.XMLID} has no baseInfo`);
        }
        return this.#baseInfo;
    }

    get item() {
        return this.parent;
    }

    get actor() {
        return this.item.actor;
    }

    get activePoints() {
        return this.parent.calcItemPoints().activePoints;
    }

    get characterPointCost() {
        return this.parent.calcItemPoints().characterPointCost;
    }

    get realCost() {
        return this.parent.calcItemPoints().realCost;
    }

    get _activePointsWithoutEndMods() {
        return this.parent.calcItemPoints()._activePointsWithoutEndMods;
    }

    get _advantages() {
        return this.parent.calcItemPoints()._advantages;
    }

    get killing() {
        return this.parent.getMakeAttack().killing;
    }

    get knockbackMultiplier() {
        return this.parent.getMakeAttack().knockbackMultiplier;
    }

    get usesStrength() {
        return this.parent.getMakeAttack().usesStrength;
    }

    get piercing() {
        return this.parent.getMakeAttack().piercing;
    }

    get penetrating() {
        return this.parent.getMakeAttack().penetrating;
    }

    get stunBodyDamage() {
        return this.parent.getMakeAttack().stunBodyDamage;
    }

    get endEstimate() {
        // STR (or any other characteristic only cost end when the native STR is used)
        if (this.item.baseInfo?.type.includes("characteristic")) return null;

        return this.item.end;
    }

    // get aoeShortDescription() {
    //     if (!this.item.system.areaOfEffect || this.item.system.areaOfEffect.type === "none") {
    //         return "-";
    //     }
    //     return `${this.item.system.areaOfEffect.type}`;
    // }

    get ocvEstimated() {
        console.error("depricated ocvEstimated");
        return 0;
    }

    get dcvEstimated() {
        console.error("depricated dcvEstimated");
        return 0;
    }

    #genericDetails = function (prop) {
        const propUpper = prop.toUpperCase();
        const propLower = prop.toLowerCase();
        const _details = {
            tags: [],
        };

        if (!propUpper || this[propUpper] === "--") {
            return {};
        }

        const cv = parseInt(this.actor?.system.characteristics[propLower]?.value || 0);
        if (cv !== 0) {
            _details.tags.push({ name: propUpper, value: cv });
        }

        if ((parseInt(this[propUpper]) || 0) !== 0) {
            _details.tags.push({ name: this.item.name, value: parseInt(this[propUpper]) });
        }

        if (this[propUpper] === "-v/10") {
            // Educated guess for token
            const token =
                this.actor.getActiveTokens().find((t) => canvas.tokens.controlled.find((c) => c.id === t.id)) ||
                this.actor.getActiveTokens()[0];
            const velocity = calculateVelocityInSystemUnits(this.actor, token);
            if (velocity !== 0) {
                _details.tags.push({ name: "Velocity", value: -parseInt(velocity / 10) });
            }
        }

        const csls = combatSkillLevelsForAttack(this.item);
        for (const csl of csls) {
            if (csl[propLower]) {
                _details.tags.push({ name: csl.item.name, value: parseInt(csl[propLower]) });
            }
        }

        _details.value = _details.tags.reduce((accum, currItem) => accum + currItem.value, 0);
        _details.tooltip = _details.tags.map((m) => `${m.value.signedStringHero()} ${m.name}`).join("<br>");

        return _details;
    };

    get ocvDetails() {
        return this.#genericDetails(this.uses);
    }

    get dcvDetails() {
        return this.#genericDetails(this.targets);
    }

    get damage() {
        return getFullyQualifiedEffectFormulaFromItem(this.item, {});
    }

    get effect() {
        let _effect = this.USEWEAPON ? this.WEAPONEFFECT : this.EFFECT;
        if (!_effect) return null;

        const maneuverEffect = getManueverEffectWithPlaceholdersReplaced(this.item);

        return maneuverEffect;
    }

    get uses() {
        let _uses = "ocv";

        if (this.baseInfo.type.includes("mental")) {
            _uses = "omcv";
        }

        // Alternate Combat Value (uses OMCV against DCV)
        const acv = this.item.findModsByXmlid("ACV");
        if (acv) {
            _uses = (acv.OPTION_ALIAS.match(/uses (\w+)/)?.[1] || _uses).toLowerCase();
        }

        return _uses;
    }

    get targets() {
        let _targets = "dcv";

        if (this.baseInfo.type.includes("mental")) {
            _targets = "dmcv";
        }

        // Alternate Combat Value (uses OMCV against DCV)
        const acv = this.item.findModsByXmlid("ACV");
        if (acv) {
            _targets = (acv.OPTION_ALIAS.match(/against (\w+)/)?.[1] || _targets).toLowerCase();
        }

        return _targets;
    }
}

export class HeroSystem6eItemTypeDataModelProps extends HeroSystem6eItemTypeDataModelGetters {
    static defineSchema() {
        return {
            AFFECTS_TOTAL: new BooleanField({ initial: null, nullable: true }),
            ADD_MODIFIERS_TO_BASE: new StringField(),
            OPTION: new StringField(),
            OPTIONID: new StringField(),
            OPTION_ALIAS: new StringField(),
            ADDER: new ArrayField(new EmbeddedDataField(HeroAdderModel)),
            ALIAS: new StringField(),
            BASECOST: new StringField(),
            COLOR: new StringField(),
            GRAPHIC: new StringField(),
            ID: new StringField(),
            INPUT: new StringField(),
            LEVELS: new NumberField({ integer: true }),
            MODIFIER: new ArrayField(new EmbeddedDataField(HeroModifierModel)),
            MULTIPLIER: new StringField(),
            NAME: new StringField(),
            NOTES: new StringField(),
            PARENTID: new StringField(),
            POSITION: new NumberField({ integer: true }),
            POWER: new ArrayField(new EmbeddedDataField(HeroPowerModel)),
            SFX: new StringField(),
            XMLID: new StringField(),
            xmlid: new StringField(),
            SHOW_ACTIVE_COST: new BooleanField({ initial: null, nullable: true }),
            INCLUDE_NOTES_IN_PRINTOUT: new BooleanField({ initial: null, nullable: true }),
            _active: new ObjectField(), // action  (consider renaming)
            _hdcXml: new StringField(),
            is5e: new BooleanField({ initial: null, nullable: true }),
            xmlTag: new StringField(),
            USE_END_RESERVE: new BooleanField({ initial: null, nullable: true }),
            FREE_POINTS: new NumberField({ integer: true }),
            value: new NumberField({ integer: true }), // ENEDURANCERESERVE
            //max: new NumberField({ integer: true }), // ENEDURANCERESERVE (use LEVELS instead)
            active: new BooleanField({ initial: null, nullable: true }), // is power,skill,equipment active (consider renaming)
            charges: new EmbeddedDataField(HeroSystem6eItemCharges),
        };
    }
}

export class HeroSystem6eItemPower extends HeroSystem6eItemTypeDataModelProps {
    /// https://foundryvtt.wiki/en/development/api/DataModel

    static defineSchema() {
        // Note that the return is just a simple object
        return {
            ...super.defineSchema(),
            AFFECTS_PRIMARY: new BooleanField({ initial: null, nullable: true }),
            AFFECTS_TOTAL: new BooleanField({ initial: null, nullable: true }),
            ACTIVE: new StringField(), // XMLID=DETECT
            BODYLEVELS: new StringField(),
            DEFENSE: new StringField(),
            DOESBODY: new StringField(),
            DOESDAMAGE: new StringField(),
            DOESKNOCKBACK: new StringField(),
            DURATION: new StringField(),
            ED: new StringField(),
            EDLEVELS: new NumberField({ integer: true }),
            END: new StringField(),
            ENDCOLUMNOUTPUT: new StringField(),
            FDLEVELS: new StringField(),
            GROUP: new StringField(),
            HEIGHTLEVELS: new StringField(),
            INT: new StringField(),
            KILLING: new StringField(),
            LENGTHLEVELS: new StringField(),
            MDLEVELS: new NumberField({ integer: true }),
            NUMBER: new StringField(),
            OCV: new StringField(),
            OPTION: new StringField(),
            OPTIONID: new StringField(),
            OPTION_ALIAS: new StringField(),
            PD: new StringField(),
            PDLEVELS: new NumberField({ integer: true }),
            POINTS: new StringField(),
            POWDLEVELS: new NumberField({ integer: true }),
            PRE: new StringField(),
            QUANTITY: new StringField(),
            RANGE: new StringField(),
            STR: new StringField(),
            TARGET: new StringField(),
            USECUSTOMENDCOLUMN: new StringField(),
            USESTANDARDEFFECT: new BooleanField({ initial: null, nullable: true }),
            ULTRA_SLOT: new StringField(),
            VISIBLE: new StringField(),
            WIDTHLEVELS: new StringField(),

            // Skill
            CHARACTERISTIC: new StringField(),
            EVERYMAN: new BooleanField({ initial: null, nullable: true }),
            FAMILIARITY: new BooleanField({ initial: null, nullable: true }),
            INTBASED: new StringField(),
            LEVELSONLY: new BooleanField({ initial: null, nullable: true }),
            PROFICIENCY: new BooleanField({ initial: null, nullable: true }),
            ROLL: new StringField(),
            TEXT: new StringField(),
            TYPE: new StringField(),

            // Perk
            BASEPOINTS: new StringField(),
            DISADPOINTS: new StringField(),

            charges: new EmbeddedDataField(HeroSystem6eItemCharges),
        };
    }
}

export class HeroSystem6eItemEquipment extends HeroSystem6eItemPower {
    /// https://foundryvtt.wiki/en/development/api/DataModel

    static defineSchema() {
        // Note that the return is just a simple object
        return {
            ...super.defineSchema(),
            CARRIED: new StringField(),
            EVER: new StringField(),
            PRICE: new StringField(),
            SKILL: new StringField(),
            WEIGHT: new StringField(),
        };
    }
}

export class HeroSystem6eItemSkill extends HeroSystem6eItemTypeDataModelProps {
    /// https://foundryvtt.wiki/en/development/api/DataModel

    static defineSchema() {
        // Note that the return is just a simple object
        return {
            ...super.defineSchema(),
            CHARACTERISTIC: new StringField(),
            EVERYMAN: new BooleanField({ initial: null, nullable: true }),
            FAMILIARITY: new BooleanField({ initial: null, nullable: true }),
            INTBASED: new BooleanField({ initial: null, nullable: true }),
            LEVELSONLY: new BooleanField({ initial: null, nullable: true }),
            OPTION: new StringField(),
            OPTIONID: new StringField(),
            OPTION_ALIAS: new StringField(),
            PROFICIENCY: new BooleanField({ initial: null, nullable: true }),
            ROLL: new StringField(),
            TEXT: new StringField(),
            TYPE: new StringField(),
            NATIVE_TONGUE: new BooleanField({ initial: null, nullable: true }),
            //charges: new EmbeddedDataField(HeroSystem6eItemCharges), // unusual, but possible
            active: new BooleanField({ initial: null, nullable: true }), // should be part of  HeroSystem6eItemTypeDataModelProps and not needed here
        };
    }
}

export class HeroSystem6eItemPerk extends HeroSystem6eItemTypeDataModelProps {
    /// https://foundryvtt.wiki/en/development/api/DataModel

    static defineSchema() {
        //const { ObjectField, StringField, ArrayField, EmbeddedDataField } = foundry.data.fields;
        // Note that the return is just a simple object
        return {
            ...super.defineSchema(),
            BASEPOINTS: new StringField(),
            DISADPOINTS: new StringField(),
            INTBASED: new StringField(),
            NUMBER: new StringField(),
            OPTION: new StringField(),
            OPTIONID: new StringField(),
            ROLL: new StringField(),
            TEXT: new StringField(),
        };
    }
}
export class HeroSystem6eItemManeuver extends HeroSystem6eItemTypeDataModelGetters {
    /// https://foundryvtt.wiki/en/development/api/DataModel

    static defineSchema() {
        const { StringField } = foundry.data.fields;
        // Note that the return is just a simple object
        return {
            ADDSTR: new BooleanField({ initial: null, nullable: true }),
            DC: new StringField(),
            DCV: new StringField(),
            DISPLAY: new StringField(),
            EFFECT: new StringField(),
            OCV: new StringField(),
            PHASE: new StringField(),
            USEWEAPON: new BooleanField({ initial: null, nullable: true }),
            WEAPONEFFECT: new StringField(),
            XMLID: new StringField(),
            _active: new ObjectField(), // action
            is5e: new BooleanField({ initial: null, nullable: true }),
            active: new BooleanField({ initial: null, nullable: true }),
        };
    }
}

export class HeroSystem6eItemMartialArt extends HeroSystem6eItemTypeDataModelProps {
    /// https://foundryvtt.wiki/en/development/api/DataModel

    static defineSchema() {
        //const { ObjectField, StringField, ArrayField, EmbeddedDataField } = foundry.data.fields;
        // Note that the return is just a simple object
        return {
            ...super.defineSchema(),

            ACTIVECOST: new StringField(),
            ADDSTR: new BooleanField({ initial: null, nullable: true }),
            CATEGORY: new StringField(),
            CUSTOM: new StringField(),
            DAMAGETYPE: new StringField(),
            DC: new StringField(),
            DCV: new StringField(),
            DISPLAY: new StringField(),
            EFFECT: new StringField(),
            MAXSTR: new StringField(),
            OCV: new StringField(),
            PHASE: new StringField(),
            RANGE: new StringField(),
            STRMULT: new StringField(),
            USEWEAPON: new BooleanField({ initial: null, nullable: true }),
            WEAPONEFFECT: new StringField(),
        };
    }

    get killing() {
        return this.parent.getMakeAttack().killing;
    }

    get knockbackMultiplier() {
        return this.parent.getMakeAttack().knockbackMultiplier;
    }

    get usesStrength() {
        return this.parent.getMakeAttack().usesStrength;
    }

    get piercing() {
        return this.parent.getMakeAttack().piercing;
    }

    get penetrating() {
        return this.parent.getMakeAttack().penetrating;
    }

    get stunBodyDamage() {
        return this.parent.getMakeAttack().stunBodyDamage;
    }

    get damage() {
        return getFullyQualifiedEffectFormulaFromItem(this.item, { ignoreDeadlyBlow: true });
    }
}

export class HeroSystem6eItemDisadvantage extends HeroSystem6eItemTypeDataModelProps {
    /// https://foundryvtt.wiki/en/development/api/DataModel

    static defineSchema() {
        //const { ObjectField, StringField, ArrayField, EmbeddedDataField } = foundry.data.fields;
        // Note that the return is just a simple object
        return { ...super.defineSchema() };
    }
}

export class HeroSystem6eItemTalent extends HeroSystem6eItemTypeDataModelProps {
    /// https://foundryvtt.wiki/en/development/api/DataModel

    static defineSchema() {
        //const { ObjectField, StringField, ArrayField, EmbeddedDataField } = foundry.data.fields;
        // Note that the return is just a simple object
        return {
            ...super.defineSchema(),

            AFFECTS_PRIMARY: new BooleanField({ initial: null, nullable: true }),
            CHARACTERISTIC: new StringField(),
            GROUP: new StringField(),

            QUANTITY: new StringField(),
            ROLL: new StringField(),
            TEXT: new StringField(),
        };
    }
}

export class HeroSystem6eItemComplication extends HeroSystem6eItemTypeDataModelProps {
    /// https://foundryvtt.wiki/en/development/api/DataModel

    static defineSchema() {
        //const { ObjectField, StringField, ArrayField, EmbeddedDataField } = foundry.data.fields;
        // Note that the return is just a simple object
        return { ...super.defineSchema() };
    }
}

export class HeroSystem6eItemMisc extends HeroSystem6eItemTypeDataModelProps {
    /// https://foundryvtt.wiki/en/development/api/DataModel

    static defineSchema() {
        //const { ObjectField, StringField, ArrayField, EmbeddedDataField } = foundry.data.fields;
        // Note that the return is just a simple object
        return { ...super.defineSchema() };
    }
}

export class HeroItemCharacteristic extends foundry.abstract.DataModel {
    static defineSchema() {
        return {
            XMLID: new StringField(),
            ID: new StringField(),
            BASECOST: new NumberField({ integer: false }),
            LEVELS: new NumberField({ integer: true }),
            ALIAS: new StringField(),
            POSITION: new NumberField({ integer: true }),
            MULTIPLIER: new NumberField({ integer: false }),
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
            // value: new NumberField({ integer: true }),
            // core: new NumberField({ integer: true }),
            // max: new NumberField({ integer: true }),
        };
    }

    // native characteristics don't use _active as we don't currently allow
    // them to be modified, although perhaps _STRENGTHDAMAGE can be reworked to do so.
    get _active() {
        return {};
    }

    get active() {
        return true;
    }

    #baseInfo = null;

    get baseInfo() {
        // cache getPowerInfo
        this.#baseInfo ??= getPowerInfo({ item: this, xmlTag: this.xmlTag });
        // if (!this.#baseInfo) {
        //     debugger;
        // }
        return this.#baseInfo;
    }

    get actor() {
        if (this.parent instanceof HeroSystem6eActor) {
            return this.parent;
        }
        if (this.parent.parent instanceof HeroSystem6eActor) {
            return this.parent.parent;
        }
        return null;
    }

    get hdcHTMLCollection() {
        try {
            return this._hdcXml ? new DOMParser().parseFromString(this._hdcXml, "text/xml") : null;
        } catch (e) {
            console.error(e);
        }
        return null;
    }

    debugModelProps() {
        try {
            if (this._hdcXml) {
                for (const attribute of this.hdcHTMLCollection.firstChild.attributes) {
                    if (this[attribute.name] === undefined) {
                        console.error(`${this.xmlTag} HeroItemCharacteristic is missing ${attribute.name} property.`);
                    }
                }
            }
        } catch (e) {
            console.error(e);
        }
    }
}

export class HeroActorCharacteristic extends foundry.abstract.DataModel {
    static defineSchema() {
        return {
            //core: new NumberField({ integer: true }),
            max: new NumberField({ integer: true }),
            //realCost: new NumberField({ integer: true }),
            //roll: new NumberField({ integer: true }),
            value: new NumberField({ integer: true }),
            characteristicMax: new NumberField({ integer: true }),
        };
    }

    get levels() {
        return this.actor.system[this.KEY]?.LEVELS || 0;
    }

    get core() {
        //console.error(`core is depricated`);
        try {
            // Some 5e characteristics are calcuated
            if (this.actor.is5e) {
                if (this.baseInfo?.behaviors.includes("calculated")) {
                    if (this.#baseInfo.calculated5eCharacteristic) {
                        return this.#baseInfo.calculated5eCharacteristic(this.actor, "core");
                    }
                } else if (this.baseInfo?.behaviors.includes("figured")) {
                    return (
                        this.actor.system[this.KEY].LEVELS + this.baseInfo.figured5eCharacteristic(this.actor, "core")
                    );
                }
            }
            return parseInt(this.item?.LEVELS || 0) + this.baseInfo?.base || 0;
        } catch (e) {
            console.error(e);
        }
        return 0;
    }
    // set core(value) {
    //     console.warn(`setter is not awaitable, consider updating LEVELS instead`);
    //     this.item.LEVELS = value - (this.item?.baseInfo?.base || 0);

    //     // Update Database, prefer to update LEVELS directly
    //     // the lack of async/await is concerning.
    //     if (this.item._id) {
    //         this.item.update({ [`system.LEVELS`]: this.item.LEVELS });
    //     }
    // }

    // get max() {
    //     const key = this.schema.name?.toUpperCase();
    //     if (!key) {
    //         console.error(`key is undefined`);
    //     }
    //     return parseInt(this.parent.parent[key]?.LEVELS);
    // }
    // set max(value) {
    //     //if (this.parent.)
    //     //debugger;
    // }

    get realCost() {
        const cost = Math.round(this.levels * (this.baseInfo?.costPerLevel(this.item) || 0));
        return cost;
    }

    get roll() {
        if (this.baseInfo?.behaviors.includes("success")) {
            const newRoll = Math.round(9 + this.value * 0.2);
            if (!this.actor.is5e && this.value < 0) {
                return 9;
            }
            return newRoll;
        }
        return null;
    }

    get valueTitle() {
        // Active Effects may be blocking updates
        const ary = [];
        const activeEffects = Array.from(this.actor.allApplicableEffects()).filter(
            (ae) => ae.changes.find((p) => p.key === `system.characteristics.${this.key}.value`) && !ae.disabled,
        );
        let _valueTitle = "";
        for (const ae of activeEffects) {
            ary.push(`<li>${ae.name}</li>`);
        }
        if (ary.length > 0) {
            _valueTitle = "<b>PREVENTING CHANGES</b>\n<ul class='left'>";
            _valueTitle += ary.join("\n ");
            _valueTitle += "</ul>";
            _valueTitle += "<small><i>Click to unblock</i></small>";
        }
        return _valueTitle;
    }

    get maxTitle() {
        // Active Effects may be blocking updates
        const ary = [];
        const activeEffects = Array.from(this.actor.allApplicableEffects()).filter(
            (ae) => ae.changes.find((p) => p.key === `system.characteristics.${this.key}.max`) && !ae.disabled,
        );

        for (const ae of activeEffects) {
            ary.push(`<li>${ae.name}</li>`);
            // if (ae._prepareDuration().duration) {
            //     const change = ae.changes.find((o) => o.key === `system.characteristics.${this.key}.max`);
            //     if (change.mode === CONST.ACTIVE_EFFECT_MODES.ADD) {
            //         characteristic.delta += parseInt(change.value);
            //     }
            //     if (change.mode === CONST.ACTIVE_EFFECT_MODES.MULTIPLY) {
            //         characteristic.delta += parseInt(this.max) * parseInt(change.value) - parseInt(this.max);
            //     }
            // }
        }
        let _maxTitle = "";
        if (ary.length > 0) {
            _maxTitle = "<b>PREVENTING CHANGES</b>\n<ul class='left'>";
            _maxTitle += ary.join("\n ");
            _maxTitle += "</ul>";
            _maxTitle += "<small><i>Click to unblock</i></small>";
        }
        return _maxTitle;
    }

    get notes() {
        if (this.baseInfo?.notes) {
            return this.baseInfo.notes(this);
        }
        return null;
    }

    get XMLID() {
        return this.key?.toUpperCase();
    }

    get key() {
        return this.schema.name;
    }

    get KEY() {
        return this.schema.name.toUpperCase();
    }

    get item() {
        if (this.parent instanceof HeroActorCharacteristic) {
            return this.parent;
        }
        if (this.parent.parent[this.XMLID]) {
            return this.parent.parent[this.XMLID];
        }
        return null;
    }

    #baseInfo = null;
    get baseInfo() {
        // cache getPowerInfo
        const key = this.schema.name?.toUpperCase();
        this.#baseInfo ??= getPowerInfo({ XMLID: key, is5e: this.actor?.is5e, xmlTag: key });
        return this.#baseInfo;
    }

    get actor() {
        if (this.parent.parent.parent instanceof HeroSystem6eActor) {
            return this.parent.parent.parent;
        }
        return null;
    }
}

export class HeroCharacteristicsModel extends foundry.abstract.DataModel {
    static defineSchema() {
        return {
            str: new EmbeddedDataField(HeroActorCharacteristic),
            dex: new EmbeddedDataField(HeroActorCharacteristic),
            con: new EmbeddedDataField(HeroActorCharacteristic),
            int: new EmbeddedDataField(HeroActorCharacteristic),
            ego: new EmbeddedDataField(HeroActorCharacteristic),
            pre: new EmbeddedDataField(HeroActorCharacteristic),
            com: new EmbeddedDataField(HeroActorCharacteristic),
            ocv: new EmbeddedDataField(HeroActorCharacteristic),
            dcv: new EmbeddedDataField(HeroActorCharacteristic),
            omcv: new EmbeddedDataField(HeroActorCharacteristic),
            dmcv: new EmbeddedDataField(HeroActorCharacteristic),
            spd: new EmbeddedDataField(HeroActorCharacteristic),
            pd: new EmbeddedDataField(HeroActorCharacteristic),
            ed: new EmbeddedDataField(HeroActorCharacteristic),
            rec: new EmbeddedDataField(HeroActorCharacteristic),
            end: new EmbeddedDataField(HeroActorCharacteristic),
            body: new EmbeddedDataField(HeroActorCharacteristic),
            stun: new EmbeddedDataField(HeroActorCharacteristic),
            running: new EmbeddedDataField(HeroActorCharacteristic),
            swimming: new EmbeddedDataField(HeroActorCharacteristic),
            leaping: new EmbeddedDataField(HeroActorCharacteristic),

            flight: new EmbeddedDataField(HeroActorCharacteristic),
            ftl: new EmbeddedDataField(HeroActorCharacteristic), // Faster Than Light
            swinging: new EmbeddedDataField(HeroActorCharacteristic),
            gliding: new EmbeddedDataField(HeroActorCharacteristic),
            teleportation: new EmbeddedDataField(HeroActorCharacteristic),
            tunneling: new EmbeddedDataField(HeroActorCharacteristic),
        };
    }
}

// class HeroActorCharacteristicSpd extends HeroCharacteristicsModel {
//     static defineSchema() {
//         return {
//             value: new NumberField({ integer: false }),
//         };
//     }
// }

export class HeroActorModel extends foundry.abstract.DataModel {
    static defineSchema() {
        //const { ObjectField, StringField, ArrayField, EmbeddedDataField } = foundry.data.fields;
        // Note that the return is just a simple object
        return {
            CHARACTER: new ObjectField(),

            // Plan is to eventually use the Actor.Item version of these
            STR: new EmbeddedDataField(HeroItemCharacteristic),
            DEX: new EmbeddedDataField(HeroItemCharacteristic),
            CON: new EmbeddedDataField(HeroItemCharacteristic),
            INT: new EmbeddedDataField(HeroItemCharacteristic),
            EGO: new EmbeddedDataField(HeroItemCharacteristic),
            PRE: new EmbeddedDataField(HeroItemCharacteristic),
            COM: new EmbeddedDataField(HeroItemCharacteristic),
            OCV: new EmbeddedDataField(HeroItemCharacteristic),
            DCV: new EmbeddedDataField(HeroItemCharacteristic),
            OMCV: new EmbeddedDataField(HeroItemCharacteristic),
            DMCV: new EmbeddedDataField(HeroItemCharacteristic),
            SPD: new EmbeddedDataField(HeroItemCharacteristic),
            PD: new EmbeddedDataField(HeroItemCharacteristic),
            ED: new EmbeddedDataField(HeroItemCharacteristic),
            REC: new EmbeddedDataField(HeroItemCharacteristic),
            END: new EmbeddedDataField(HeroItemCharacteristic),
            BODY: new EmbeddedDataField(HeroItemCharacteristic),
            STUN: new EmbeddedDataField(HeroItemCharacteristic),
            RUNNING: new EmbeddedDataField(HeroItemCharacteristic),
            SWIMMING: new EmbeddedDataField(HeroItemCharacteristic),
            LEAPING: new EmbeddedDataField(HeroItemCharacteristic),
            hap: new SchemaField({
                value: new NumberField({ integer: true, nullable: true }),
            }),

            characteristics: new EmbeddedDataField(HeroCharacteristicsModel),
            versionHeroSystem6eUpload: new StringField(),
            is5e: new BooleanField({ initial: null, nullable: true }),
            heroicIdentity: new BooleanField({ initial: null, nullable: true }),
            _hdcXml: new StringField(),
        };
    }

    get hdcHTMLCollection() {
        try {
            return this._hdcXml ? new DOMParser().parseFromString(this._hdcXml, "text/xml") : null;
        } catch (e) {
            console.error(e);
        }
        return null;
    }

    get actor() {
        return this.parent;
    }

    debugModelProps() {
        try {
            // Not sure what to do here as we don't follow the XML -> JSON -> DataModel exacly the same
            // if (this._hdcXml) {
            //     for (const attribute of this.hdcHTMLCollection.children[0].attributes) {
            //         if (this[attribute.name] === undefined) {
            //             console.error(`${this.xmlTag} HeroActorModel is missing ${attribute.name} property.`);
            //         }
            //     }
            // }
            for (const item of this.actor.items) {
                if (item.system.debugModelProps) {
                    item.system.debugModelProps();
                }
            }
        } catch (e) {
            console.error(e);
        }
    }
}
