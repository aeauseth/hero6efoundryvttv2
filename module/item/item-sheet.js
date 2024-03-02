import { HeroSystem6eItem } from "./item.js";
import { editSubItem, deleteSubItem } from "../powers/powers.js";
import {
    adjustmentSourcesPermissive,
    adjustmentSourcesStrict,
} from "../utility/adjustment.js";
import { getPowerInfo } from "../utility/util.js";

/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheet}
 */
export class HeroSystem6eItemSheet extends ItemSheet {
    /** @override */
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["herosystem6e", "sheet", "item"],
            width: 520,
            height: 660,
            scrollY: [".sheet-body"],
        });
    }

    /** @override */
    get template() {
        const path = "systems/hero6efoundryvttv2/templates/item";

        if (
            [
                "ABSORPTION",
                "AID",
                "DISPEL",
                "DRAIN",
                "HEALING",
                "SUPPRESS",
                "TRANSFER",
            ].includes(this.item.system.XMLID)
        ) {
            return `${path}/item-${this.item.type}-adjustment-sheet.hbs`;
        }

        if (["ENDURANCERESERVE"].includes(this.item.system.XMLID)) {
            return `${path}/item-${
                this.item.type
            }-${this.item.system.XMLID.toLowerCase()}-sheet.hbs`;
        }

        if (
            ["MENTAL_COMBAT_LEVELS", "COMBAT_LEVELS"].includes(
                this.item.system.XMLID,
            )
        ) {
            return `${path}/item-${this.item.type}-combat-levels-sheet.hbs`;
        }

        return `${path}/item-${this.item.type}-sheet.hbs`;
    }

    /* -------------------------------------------- */

    /** @override */
    getData() {
        const data = super.getData();

        // Grab the item's data.
        //const itemData = data.data

        // Re-define the template data references.
        // data.item = itemData
        // data.data = itemData.data
        // data.config = CONFIG.HERO

        // Grab the item
        const item = data.item;

        // Re-define the template data references.
        //data.item = item
        data.system = item.system;
        data.config = CONFIG.HERO;
        data.alphaTesting = game.settings.get(game.system.id, "alphaTesting");

        // Easy reference to ActiveEffects with an origin of this item
        if (this.actor) {
            data.effects = this.actor.effects.filter(
                (o) => o.origin === item.uuid,
            );
        } else {
            data.effects = this.document.effects;
        }

        // Signed OCV and DCV
        if (data.system.ocv != undefined) {
            data.system.ocv = ("+" + parseInt(data.system.ocv)).replace(
                "+-",
                "-",
            );
        }
        if (data.system.dcv != undefined) {
            data.system.dcv = ("+" + parseInt(data.system.dcv)).replace(
                "+-",
                "-",
            );
        }

        const configPowerInfo = getPowerInfo({
            xmlid: item.system.XMLID,
            actor: item?.actor,
        });
        data.sheet = { ...(configPowerInfo?.sheet || {}) };

        // SFX
        const sfx = [
            "Default",
            "Acid",
            "Alien",
            "Air/Wind",
            "Animal",
            "Body Control",
            "Chi",
            "Cosmic Energy",
            "Cyberkinesis",
            "Darkness",
            "Density Alteration",
            "Dimensional Manipulation",
            "Earth/Stone",
            "Electricity",
            "Emotion Control",
            "Fire/Heat",
            "Force",
            "Gravity",
            "Ice/Cold",
            "Illusion",
            "Kinetic Energy",
            "Light",
            "Luck",
            "Magic/Mystic",
            "Magnetism",
            "Martial Arts",
            "Matter Manipulation",
            "Mental/Psionic",
            "Metamorphic",
            "Precognition",
            "Radiation",
            "Serum Based",
            "Shape Alteration",
            "Size Alteration",
            "Sleep/Dream",
            "Solar/Celestial",
            "Sonic",
            "Speedster",
            "Strength/Toughness",
            "Stretching",
            "Telekinetic",
            "Teleportation",
            "Time",
            "Vibration",
            "Water",
            "Weather",
            "Wood/Plant",
            "Miscellaneous",
        ];

        data.sheet.SFX = {
            selectOptions: sfx.reduce((current, item) => {
                current[item] = item;
                return current;
            }, {}),
        };

        // A select list of possible adjustment targets on the character
        if (
            item.system.XMLID === "ABSORPTION" ||
            item.system.XMLID === "AID" ||
            item.system.XMLID === "HEALING" ||
            item.system.XMLID === "DISPEL" ||
            item.system.XMLID === "DRAIN" ||
            item.system.XMLID === "SUPPRESS" ||
            item.system.XMLID === "TRANSFER"
        ) {
            const { enhances, reduces } = item.splitAdjustmentSourceAndTarget();

            const enhancesValidator =
                item.system.XMLID === "AID" ||
                item.system.XMLID === "ABSORPTION" ||
                item.system.XMLID === "TRANSFER"
                    ? adjustmentSourcesStrict
                    : adjustmentSourcesPermissive;

            data.possibleEnhances = enhancesValidator(this.actor);
            data.possibleReduces = adjustmentSourcesPermissive(this.actor);

            data.enhances = enhances
                ? enhances
                      .split(",")
                      .map((target) => target.toUpperCase().trim())
                : [];
            data.reduces = reduces
                ? reduces
                      .split(",")
                      .map((target) => target.toUpperCase().trim())
                : [];
        }

        // Combat Skill Levels & Mental Combat Levels
        if (
            ["MENTAL_COMBAT_LEVELS", "COMBAT_LEVELS"].includes(
                this.item.system.XMLID,
            )
        ) {
            let _ocv = "ocv";
            let _dcv = "dcv";
            if (this.item.system.XMLID === "MENTAL_COMBAT_LEVELS") {
                _ocv = "omcv";
                _dcv = "dmcv";
            }
            data.cslChoices = { [_ocv]: _ocv };
            if (this.item.system.OPTION != "SINGLE") {
                data.cslChoices[_dcv] = _dcv;
                data.cslChoices.dc = "dc";
            }

            // Make sure CSL's are defined
            if (!item.system.csl) {
                item.system.csl = {};
                for (let c = 0; c < parseInt(item.system.LEVELS || 0); c++) {
                    item.system.csl[c] = _ocv;
                }
                item.update({ "system.csl": item.system.csl });
            }

            // CSL radioBoxes names
            data.csl = [];
            for (let c = 0; c < parseInt(item.system.LEVELS || 0); c++) {
                data.csl.push({
                    name: `system.csl.${c}`,
                    value: item.system.csl[c],
                });
            }

            // Enumerate attacks
            data.attacks = [];
            if (!item.system.attacks) item.system.attacks = {};
            for (let attack of item.actor.items.filter(
                (o) =>
                    (o.type == "attack" || o.system.subType == "attack") &&
                    o.system.uses === _ocv,
            )) {
                if (!item.system.attacks[attack.id])
                    item.system.attacks[attack.id] = false;
                data.attacks.push({
                    name: attack.name,
                    id: attack.id,
                    checked: item.system.attacks[attack.id],
                });
            }
        }

        // ENDURANCERESERVE has a REC rate
        if (item.system.XMLID == "ENDURANCERESERVE") {
            const power = item.system.POWER.find(
                (o) => o.XMLID === "ENDURANCERESERVEREC",
            );
            data.rec = parseInt(power?.LEVELS) || 0;
        }

        return data;
    }

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);

        // Everything below here is only needed if the sheet is editable
        if (!this.options.editable) return;

        // Roll handlers, click handlers, etc. would go here.
        html.find(".rollable").click(this._onSheetAction.bind(this));

        // Add sub 'Item'
        html.find(".item-create").click(this._onSubItemCreate.bind(this));

        // Update Inventory Item
        html.find(".item-edit").click(this._onEditItem.bind(this));

        // Delete Inventory Item
        html.find(".item-delete").click(this._onDeleteItem.bind(this));

        // Active Effects
        html.find(".effect-create").click(this._onEffectCreate.bind(this));
        html.find(".effect-delete").click(this._onEffectDelete.bind(this));
        html.find(".effect-edit").click(this._onEffectEdit.bind(this));
        html.find(".effect-toggle").click(this._onEffectToggle.bind(this));
    }

    /**
     * Handle mouse click events for character sheet actions
     * @param {MouseEvent} event    The originating click event
     * @private
     */
    _onSheetAction(event) {
        event.preventDefault();
        const button = event.currentTarget;
        switch (button.dataset.action) {
            case "hit-roll":
                return Dialog.confirm({
                    title: `${game.i18n.localize("DND5E.CurrencyConvert")}`,
                    content: `<p>${game.i18n.localize(
                        "DND5E.CurrencyConvertHint",
                    )}</p>`,
                    yes: () => this.actor.convertCurrency(),
                });
            case "rollDeathSave":
                return this.actor.rollDeathSave({ event });
            case "rollInitiative":
                return this.actor.rollInitiative({ createCombatants: true });
        }
    }

    async _updateObject(event, formData) {
        event.preventDefault();

        const expandedData = foundry.utils.expandObject(formData);

        const clickedElement = $(event.currentTarget);
        const form = clickedElement.closest("form[data-id]");
        const id = form.data()?.id;

        if (!id) {
            return;
        }

        // Endurance Reserve
        if (expandedData.rec) {
            const ENDURANCERESERVEREC = this.item.findModsByXmlid(
                "ENDURANCERESERVEREC",
            );
            if (ENDURANCERESERVEREC) {
                this.item.system.value = parseInt(expandedData.rec) || 1;
                await this.item.update({
                    "system.value": this.item.system.value,
                });
            }
        }

        // A select list of possible adjustment targets on the character
        if (
            (expandedData.reduces || expandedData.enhances) &&
            (this.item.system.XMLID === "ABSORPTION" ||
                this.item.system.XMLID === "AID" ||
                this.item.system.XMLID === "HEALING" ||
                this.item.system.XMLID === "DISPEL" ||
                this.item.system.XMLID === "DRAIN" ||
                this.item.system.XMLID === "SUPPRESS" ||
                this.item.system.XMLID === "TRANSFER")
        ) {
            let newInputStr;

            if (this.item.system.XMLID === "TRANSFER") {
                newInputStr = `${Object.values(expandedData.reduces).join(
                    ", ",
                )} -> ${Object.values(expandedData.enhances).join(", ")}`;
            } else {
                newInputStr = Object.values(
                    expandedData.reduces || expandedData.enhances,
                ).join(", ");
            }

            await this.item.update({ "system.INPUT": newInputStr });
        }

        let description = this.item.system.description;

        await super._updateObject(event, formData);

        // If Description changed, update it
        this.item.updateItemDescription();
        if (description != this.item.system.description) {
            this.item.update({
                "system.description": this.item.system.description,
            });
        }
    }

    async _onSubItemCreate(event) {
        event.preventDefault();
        const header = event.currentTarget;
        // Get the type of item to create.
        const type = header.dataset.type;
        // Grab any data associated with this control.
        const data = foundry.utils.duplicate(header.dataset);
        // Initialize a default name.
        const name = `New ${type.capitalize()}`;

        if (type === "effect") {
            if (!this.actor) {
                return ui.notifications.warn(
                    `Active Effects not handled on items not associated with an actor.`,
                );
            }

            // Active Effects are quirky.
            // It appears in v10 that you cannot createEmbeddedDocuments on an Item already
            // embedded in an Actor.
            // If an Item with AEs is added to an actor, all the AEs on that item
            // are transferred to the actor.
            // Only AEs on actors are used.
            // If you modify an AE on an item already embedded to an actor
            // the actor doesn't receive the updates.
            // The AEs on actor/item are not linked.
            // There is a work around, by keeping track of the AE origin

            let activeEffect = new ActiveEffect().toObject();
            activeEffect.label = "New Effect";
            activeEffect.origin = this.item.uuid;

            await this.actor.createEmbeddedDocuments("ActiveEffect", [
                activeEffect,
            ]);

            // This will update the AE effects on an Item that is attached to an actor
            // but since the updated AEs don't transfer to the actor automatically, seems pointless.
            // You could manually update the corresponding actor as well, perhaps a future feature.
            // await this.item.update({
            //   effects:
            //     [
            //       activeEffect
            //     ]
            // })

            return;
        }

        // Prepare the item object.
        const itemData = {
            name,
            type,
            data,
        };
        const newItem = new HeroSystem6eItem(itemData);

        const id =
            Date.now().toString(32) + Math.random().toString(16).substring(2);
        const changes = {};
        changes[`system.subItems.${type}.${id}.system`] = newItem.system;
        changes[`system.subItems.${type}.${id}.img`] = this.item.img;
        changes[`system.subItems.${type}.${id}.name`] = name;
        changes[`system.subItems.${type}.${id}._id`] = this.item._id + "-" + id;

        return await this.item.update(changes);
    }

    async _onEditItem(event) {
        await editSubItem(event, this.item);
    }

    async _onDeleteItem(event) {
        await deleteSubItem(event, this.item);
    }

    async _onEffectCreate(event) {
        event.preventDefault();
        return await this.actor.createEmbeddedDocuments("ActiveEffect", [
            {
                label: "New Effect",
                icon: "icons/svg/aura.svg",
                origin: this.actor.uuid,
                //"duration.rounds": li.dataset.effectType === "temporary" ? 1 : undefined,
                disabled: true,
            },
        ]);
    }

    async _onEffectDelete(event) {
        event.preventDefault();
        const effectId = $(event.currentTarget)
            .closest("[data-effect-id]")
            .data().effectId;
        const effect = this.item.effects.get(effectId);

        if (!effect) return;

        const confirmed = await Dialog.confirm({
            title: game.i18n.localize(
                "HERO6EFOUNDRYVTTV2.confirms.deleteConfirm.Title",
            ),
            content: game.i18n.localize(
                "HERO6EFOUNDRYVTTV2.confirms.deleteConfirm.Content",
            ),
        });

        if (confirmed) {
            await effect.delete();
            this.render();
        }
    }

    async _onEffectToggle() {
        return this.item.toggle();
    }

    async _onEffectEdit(event) {
        event.preventDefault();
        const effectId = $(event.currentTarget)
            .closest("[data-effect-id]")
            .data().effectId;
        let effect = this.document.effects.get(effectId);
        if (!effect && this.document.actor) {
            effect = this.document.actor.effects.get(effectId);
        }

        effect.sheet.render(true);
    }
}
