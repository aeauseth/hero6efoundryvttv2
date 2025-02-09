import { getModifierInfo } from "../utility/util.mjs";
import { HeroSystem6eItem } from "./item.mjs";
import { HeroSystem6eAdder } from "./adder.mjs";

export class HeroSystem6eModifier {
    #baseInfo = null;
    constructor(json, options) {
        // Item first so we can get baseInfo
        this.item = options?.item;
        this.#baseInfo = getModifierInfo({
            xmlid: json.XMLID,
            actor: this.item?.actor,
            is5e: this.item?.is5e,
            xmlTag: "MODIFIER",
        });

        for (const key of Object.keys(json)) {
            if (foundry.utils.hasProperty(this, key)) {
                this[`_${key}`] = json[key];
            } else {
                this[key] = json[key];
            }
        }

        // for (const key of Object.keys(options)) {
        //     this[key] = options[key];
        // }

        if (!(this.item instanceof HeroSystem6eItem)) {
            console.warn(`${this.XMLID} item not found`);
        }

        if (!this.#baseInfo && !this.BASECOST) {
            if (!window.warnAdder?.includes(this.XMLID)) {
                console.info(
                    `${this.item?.actor.name}/${this.item?.name}/${this.item?.system.XMLID}/${this.XMLID}: missing baseInfo.`,
                    this,
                );
                window.warnAdder ??= [];
                window.warnAdder.push(this.XMLID);
            }
        }
    }

    // get item() {
    //     return fromUuidSync(this._itemUuid);
    // }

    get baseInfo() {
        // if (!this.#baseInfo) {
        //     this.#baseInfo = getModifierInfo({ xmlid: this.XMLID, actor: this.item?.actor, is5e: this.item?.is5e });
        // }
        return this.#baseInfo;
    }

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
                    `${this.item?.actor.name}/${this.item?.name}/${this.item?.system.XMLID}/${this.XMLID}: is missing costPerLevel, using LVLCOST & LVLVAL`,
                );
                costPerLevel = parseFloat(this.LVLCOST || 0) / parseFloat(this.LVLVAL || 1) || 1;
            }
            _cost += levels * costPerLevel;
        }

        // Some MODIFIERs have ADDERs
        for (const adder of this.adders) {
            _cost += adder.cost;
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

    get adders() {
        const _addres = [];
        for (const _adderJson of this.ADDER || []) {
            _addres.push(new HeroSystem6eAdder(_adderJson, { item: this.item, parent: this }));
        }
        return _addres;
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

    get BASECOST_total() {
        if (this._BASECOST_total !== undefined) {
            if (this._BASECOST_total !== this.cost) {
                console.error(`BASECOST_total (${this.cost}) did not match cost ${this._BASECOST_total}`);
            }
        }
        return this.cost;
    }

    set BASECOST_total(value) {
        if (this.cost != value) {
            //debugger;
            console.error(
                `${this.item?.actor.name}/${this.item?.name}/${this.item?.system.XMLID}/${this.XMLID} BASECOST_total (${value}) did not match cost ${this.BASECOST_total}`,
            );
        }
    }
}
