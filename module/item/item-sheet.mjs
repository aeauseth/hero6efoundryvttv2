import { HEROSYS } from "../herosystem6e.mjs";
import {
    createModifierOrAdderFromXml,
    replaceBaseCostForHalfDieAdderXml,
    replaceBaseCostForPipAdderXml,
} from "./item.mjs";
import { adjustmentSourcesPermissive, adjustmentSourcesStrict } from "../utility/adjustment.mjs";
import { ItemModifierFormApplication } from "../item/item-modifier-application.mjs";
import { HeroAdderModel, HeroModifierModel } from "./HeroSystem6eTypeDataModels.mjs";

// v13 has namespaced this. Remove when support is no longer provided. Also remove from eslint template.
const FoundryVttItemSheet = foundry.appv1?.sheets?.ItemSheet || ItemSheet;
const FoundryVttFormDataExtended = foundry.applications?.ux?.FormDataExtended || FormDataExtended;

/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheet}
 */
export class HeroSystem6eItemSheet extends FoundryVttItemSheet {
    /** @override */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["herosystem6e", "sheet", "item"],
            width: 520,
            height: 660,
            scrollY: [".sheet-body"],
        });
    }

    /** @override */
    get template() {
        const path = `systems/${HEROSYS.module}/templates/item`;

        if (
            ["ABSORPTION", "AID", "DISPEL", "DRAIN", "HEALING", "SUCCOR", "SUPPRESS", "TRANSFER"].includes(
                this.item.system.XMLID,
            )
        ) {
            return `${path}/item-power-adjustment-sheet.hbs`;
        }

        if (["ENDURANCERESERVE"].includes(this.item.system.XMLID)) {
            return `${path}/item-${this.item.type}-${this.item.system.XMLID.toLowerCase()}-sheet.hbs`;
        }

        // Trying to see if we can get most items to use the generic power sheet
        if (["skill"].includes(this.item.type)) {
            return `${path}/item-power-sheet.hbs`;
        }

        return `${path}/item-${this.item.type}-sheet.hbs`;
    }

    /* -------------------------------------------- */

    /** @override */
    getData() {
        const data = super.getData();
        this.data = data;

        try {
            // Grab the item
            const item = data.item;

            // Re-define the template data references.
            //data.item = item
            data.system = item.system;
            data.config = CONFIG.HERO;
            data.alphaTesting = game.settings.get(game.system.id, "alphaTesting");

            // Easy reference to ActiveEffects with an origin of this item
            if (this.actor) {
                data.effects = this.actor.effects.filter((o) => o.origin === item.uuid);
            } else {
                data.effects = this.document.effects;
            }

            const configPowerInfo = item.baseInfo;
            data.sheet = { ...(configPowerInfo?.sheet || {}) };
            data.editOptions = configPowerInfo?.editOptions;

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
                item.system.XMLID === "SUCCOR" ||
                item.system.XMLID === "SUPPRESS" ||
                item.system.XMLID === "TRANSFER"
            ) {
                const { enhances, reduces } = item.splitAdjustmentSourceAndTarget();

                const enhancesValidator =
                    item.system.XMLID === "AID" ||
                    item.system.XMLID === "ABSORPTION" ||
                    item.system.XMLID === "SUCCOR" ||
                    item.system.XMLID === "TRANSFER"
                        ? adjustmentSourcesStrict
                        : adjustmentSourcesPermissive;

                data.possibleEnhances = enhancesValidator(this.actor, this.item.is5e, this.item);
                data.possibleReduces = adjustmentSourcesPermissive({
                    actor: this.actor,
                    is5e: this.item.is5e,
                    item: this.item,
                });

                data.enhances = enhances ? enhances.split(",").map((target) => target.toUpperCase().trim()) : [];
                data.reduces = reduces ? reduces.split(",").map((target) => target.toUpperCase().trim()) : [];
            }

            if (configPowerInfo?.editOptions?.showAttacks?.(item)) {
                // Enumerate attacks
                data.attacks = [];
                if (item.actor) {
                    const cslChoices = item.cslChoices;

                    // Actual items
                    for (const attackOrFramework of item.actor.cslItems) {
                        // Make no attempt to disqualify frameworks although we could enumerate and exclude if nothing matches
                        if (attackOrFramework.type !== "framework" && item.system.XMLID !== "WEAPON_MASTER") {
                            // Is this attack a potentially good match? CSL needs to provide ocv to match attacks that use ocv
                            // and omcv for attacks that use omcv.
                            // If it matches neither, then it's probably a purely defensive CSL and it's ok to show no items.
                            const attacksWith = attackOrFramework.system.attacksWith;
                            if (!cslChoices[attacksWith]) {
                                continue;
                            }
                        }

                        // Check if there is an adder (if so attack is checked)
                        const adder = this.item.adders.find(
                            (a) => a.ALIAS == attackOrFramework.name && a.targetId === attackOrFramework.id,
                        );

                        data.attacks.push({
                            id: attackOrFramework.id,
                            name: attackOrFramework.name,
                            checked: adder ? true : false,
                            title: `${
                                attackOrFramework.system.XMLID +
                                (attackOrFramework.system.DISPLAY ? " (" + attackOrFramework.system.DISPLAY + ")" : "")
                            }: ${attackOrFramework.system.description.replace(/"/g, "&quot;")}`,
                        });
                    }

                    // If there are any custom adders which don't point to real powers include in the list so that
                    // users can uncheck it and make the custom adder go away without having to delete the adder directly
                    // as that's not intuitive.
                    for (const incorrectCustomAdder of item.customLinkAddersWithoutItems) {
                        const name = `${incorrectCustomAdder.ALIAS} (Invalid)`;
                        data.attacks.push({
                            id: null,
                            name: name,
                            checked: true,
                            title: `The ${name} is invalid. Perhaps it was mispelt in Hero Designer or you have since deleted the linked item? Delete or edit the adder with this name from the ADDER section below.`,
                        });
                    }
                }
            }

            // PENALTY_SKILL_LEVELS
            data.penaltyChoices = item.baseInfo?.editOptions?.penaltyChoices;

            // ENDURANCERESERVE has a REC rate
            if (item.system.XMLID == "ENDURANCERESERVE") {
                const power = item.system.POWER.find((o) => o.XMLID === "ENDURANCERESERVEREC");
                data.rec = parseInt(power?.LEVELS) || 0;
            }

            if (item.isMartialManeuver) {
                data.martialArtsDamageTypeChoices = CONFIG.HERO.martialArtsDamageTypeChoices;
            }

            // Debugging
            window.item = item;
        } catch (e) {
            console.error(e);
        }

        return data;
    }

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);

        // Everything below here is only needed if the sheet is editable
        if (!this.options.editable) return;

        // Active Effects
        html.find(".effect-create").click(this._onEffectCreate.bind(this));
        html.find(".effect-delete").click(this._onEffectDelete.bind(this));
        html.find(".effect-edit").click(this._onEffectEdit.bind(this));
        html.find(".effect-toggle").click(this._onEffectToggle.bind(this));

        // Modifiers
        html.find(".modifier-create").click(this._onModifierCreate.bind(this));
        html.find(".modifier-edit").click(this._onModifierEdit.bind(this));
        html.find(".modifier-delete").click(this._onModifierDelete.bind(this));

        // Misc
        html.find("button.convert-to-power").click(this._onConvertToPower.bind(this));
        html.find("button.convert-to-equipment").click(this._onConvertToEquipment.bind(this));
    }

    async _onModifierCreate(event) {
        event.preventDefault();
        const action = $(event.currentTarget).closest(".modifier-create").data().action;

        if (!action) {
            return ui.notifications.error(`Unable to add adder/modifier.`);
        }

        // Options associated with TYPE (excluding enhancers for now)
        const powers = this.item.actor.system.is5e ? CONFIG.HERO.powers5e : CONFIG.HERO.powers6e;

        const adderOrModifier = action.replace("create", "").toLowerCase();
        const item = this.item;

        const powersOfType = powers.filter((o) => o.behaviors.includes(adderOrModifier) && o.xml);

        // Make sure we have options
        if (powersOfType.length === 0) {
            ui.notifications.warn(`Creating a new ${adderOrModifier.toUpperCase()} is currently unsupported`);
            return;
        }

        const optionHTML = powersOfType
            .sort((a, b) => {
                const parserA = new DOMParser();
                const xmlA = parserA.parseFromString(a.xml.trim(), "text/xml");
                const parserB = new DOMParser();
                const xmlB = parserB.parseFromString(b.xml.trim(), "text/xml");
                const nameA = xmlA.children[0].getAttribute("ALIAS");
                const nameB = xmlB.children[0].getAttribute("ALIAS");
                if (nameA < nameB) {
                    return -1;
                }
                if (nameA > nameB) {
                    return 1;
                }

                // names must be equal
                return 0;
            })
            .map(function (a) {
                const parserA = new DOMParser();
                const xmlA = parserA.parseFromString(a.xml.trim(), "text/xml");
                const alias = xmlA.children[0].getAttribute("ALIAS");

                // Make sure XMLIDs match, if not then skip
                if (a.key != xmlA.children[0].getAttribute("XMLID")) {
                    console.warn(`XMLID mismatch`, a, xmlA.children[0]);
                    return "";
                }

                return `<option value='${a.key}'>${alias}</option>`;
            });

        // Need to select a specific XMLID
        const form = `
            <form>
            <p>
                Adding ADDERs and MODIFIERs is limited and has not been fully vetted.  
                Invalid adders/modifiers are likely to be ignored and may cause automation issues.
                Cost and Active Points may not be updated.
            </p>
            <p>
            <label>Select ${adderOrModifier}:</label>
            <br>
                <select name="xmlid">
                    ${optionHTML}
                </select>
            </p>
            </form>`;

        const d = new Dialog({
            title: `Create ${adderOrModifier.toUpperCase()} for ${this.item.system.XMLID}`,
            content: form,
            buttons: {
                create: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Create",
                    callback: async function (html) {
                        const formElement = html[0].querySelector("form");
                        const formData = new FoundryVttFormDataExtended(formElement);
                        const formDataObject = formData.object;
                        if (formDataObject.xmlid === "none") return;

                        const power = powers.find((o) => o.key == formDataObject.xmlid);
                        if (!power) {
                            ui.notifications.error(`Creating new ${adderOrModifier.toUpperCase()} failed`);
                            return;
                        }

                        // Warn if xml is missing as the item is likely missing properties that we are expecting
                        if (!power.xml) {
                            ui.notifications.warn(
                                `${power.key.toUpperCase()} is missing default properties.  This may cause issues with automation and cost calculations.`,
                            );
                        }

                        // We need special exceptions for 1d6-1, 1/2d6, and +1 modifiers as their BASECOST changes
                        // based on what they're being added to.
                        let xml = power.xml;
                        if (formDataObject.xmlid === "MINUSONEPIP" || formDataObject.xmlid === "PLUSONEHALFDIE") {
                            xml = replaceBaseCostForHalfDieAdderXml(item, xml);
                        } else if (formDataObject.xmlid === "PLUSONEPIP") {
                            xml = replaceBaseCostForPipAdderXml(item, xml);
                        }

                        const modifierOrAdderData = createModifierOrAdderFromXml(xml);

                        // Track when added manually for diagnostic purposes
                        modifierOrAdderData.versionHeroSystem6eManuallyCreated = game.system.version;

                        let dataModelObject = null;
                        if (modifierOrAdderData.xmlTag === "ADDER") {
                            dataModelObject = new HeroAdderModel(modifierOrAdderData, { parent: item });
                        } else if (modifierOrAdderData.xmlTag === "MODIFIER") {
                            dataModelObject = new HeroModifierModel(modifierOrAdderData, { parent: item });
                        }

                        if (!dataModelObject || !dataModelObject.XMLID) {
                            ui.notifications.error(`unable to create ${adderOrModifier}`);
                            return;
                        }

                        // Add the MODIFIER or ADDER to the array
                        await item.update({
                            [`system.${adderOrModifier.toUpperCase()}`]:
                                item.system[adderOrModifier.toUpperCase()].concat(dataModelObject),
                        });
                        return;
                    },
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancel",
                    callback: () => console.log(`Cancel ${adderOrModifier.capitalize()} ${adderOrModifier} create`),
                },
            },
        });
        d.render(true);
    }

    async _onModifierEdit(event) {
        event.preventDefault();
        const xmlid = $(event.currentTarget).closest("[data-xmlid]").data().xmlid;
        const adderId = $(event.currentTarget).closest("[data-adder]")?.data()?.adder;
        const modifierId = $(event.currentTarget).closest("[data-modifier]")?.data()?.modifier;
        if (!adderId && !modifierId) {
            return ui.notifications.error(`Unable to edit adder/modifier.`);
        }

        const adderOrModifier =
            this.item.system.ADDER.find((m) => m.ID == adderId) ||
            this.item.system.MODIFIER.find((m) => m.ID == modifierId);
        if (!adderOrModifier || adderOrModifier.XMLID !== xmlid) {
            return ui.notifications.error(`Unable to edit adder/modifier.`);
        }

        const templateData = {
            item: this.item,
            mod: adderOrModifier,
        };
        await new ItemModifierFormApplication(templateData).render(true);
    }

    async _onModifierDelete(event) {
        event.preventDefault();
        const xmlid = $(event.currentTarget).closest("[data-xmlid]").data().xmlid;
        const adderId = $(event.currentTarget).closest("[data-adder]")?.data()?.adder;
        const modifierId = $(event.currentTarget).closest("[data-modifier]")?.data()?.modifier;
        if (!adderId && !modifierId) {
            return ui.notifications.error(`Unable to edit adder/modifier.`);
        }

        const adderOrModifier =
            this.item.system.ADDER.find((m) => m.ID == adderId) ||
            this.item.system.MODIFIER.find((m) => m.ID == modifierId);
        if (!adderOrModifier || adderOrModifier.XMLID !== xmlid) {
            return ui.notifications.error(`Unable to edit adder/modifier.`);
        }

        const confirmed = await Dialog.confirm({
            title:
                game.i18n.localize("HERO6EFOUNDRYVTTV2.confirms.deleteConfirm.Title") +
                ` ${adderOrModifier.ALIAS ?? adderOrModifier.XMLID}`,
            content: game.i18n.localize("HERO6EFOUNDRYVTTV2.confirms.deleteConfirm.Content"),
        });

        if (confirmed) {
            await this.item.update({
                [`system.${adderOrModifier.xmlTag}`]: this.item.system[adderOrModifier.xmlTag]
                    .filter((o) => o.ID != adderOrModifier.ID)
                    .map((o) => o._source),
            });

            this.render();
        }
    }

    async _updateObject(event, formData) {
        event.preventDefault();

        // Remove NaN properties, which should revert back to original value
        const keys = Object.keys(formData);
        for (const key of keys) {
            if (isNaN(formData[key]) && typeof formData[key] !== "string") {
                delete formData[key];
            }
        }

        const expandedData = foundry.utils.expandObject(formData);

        const clickedElement = $(event.currentTarget);
        const form = clickedElement.closest("form[data-id]");
        const id = form.data()?.id;

        if (!id) {
            return;
        }

        // Update item.name (done in item.mjs:_preUpdate)
        // const newName = expandedData.system.NAME || expandedData.system.ALIAS || this.item.system.XMLID;
        // if (newName !== this.name) {
        //     formData.name = newName;
        // }

        const previousOPTIONID = this.item.system.OPTIONID;

        // Do all the standard things like updating item properies that match the name of input boxes
        await super._updateObject(event, formData);

        // Were there editOptions and did any of those system values change? If so, update the selected option
        const choices = this.data.item.baseInfo?.editOptions?.choices;
        if (choices) {
            // Deal with OPTION which might have changed
            const choice = choices.find((choice) => choice.OPTION === expandedData.system.OPTION);
            // Only overwrite OPTION_ALIAS, etc if the OPTIONID has changed
            if (previousOPTIONID !== choice.OPTIONID) {
                for (const key of Object.keys(choice)) {
                    if (this.data.system[key] !== choice[key]) {
                        // Update everything and we're done with the loop.
                        await this.item.update(
                            Object.keys(choice).reduce((accum, key) => {
                                accum[`system.${key}`] = choice[key];
                                return accum;
                            }, {}),
                        );

                        break;
                    }
                }
            }
        }

        // Endurance Reserve
        if (expandedData.rec) {
            const ENDURANCERESERVEREC = this.item.findModsByXmlid("ENDURANCERESERVEREC");
            if (ENDURANCERESERVEREC) {
                ENDURANCERESERVEREC.LEVELS = parseInt(expandedData.rec) || 1;
                await this.item.update({ [`system.POWER`]: this.item.system.POWER });
            }
        }

        // Turn attack toggles into adders
        if (expandedData.attacks) {
            // Loop thru all the attacks that were checkboxes on the sheet
            for (const [attackId, checked] of Object.entries(expandedData.attacks)) {
                const attackItem = this.actor.items.find((o) => o.id === attackId);
                if (!attackItem) {
                    console.error(`Attack not found`);
                    continue;
                }
                const adder = this.item.system.ADDER.find(
                    (adder) => adder.XMLID === "ADDER" && adder.targetId === attackItem.id,
                );

                // Create a custom adders that matches attack name
                if (!adder && checked) {
                    const newAdder = {
                        XMLID: "ADDER",
                        ID: new Date().getTime(),
                        ALIAS: attackItem.name,
                        BASECOST: "0.0",
                        LEVELS: "0",
                        NAME: "",
                        PRIVATE: false,
                        SELECTED: true,
                        BASECOST_total: 0,
                        targetId: attackItem.id,
                        xmlTag: "ADDER",
                    };

                    const newAdderArray = [...foundry.utils.deepClone(this.item.system._source.ADDER), newAdder];
                    await this.item.update({ [`system.ADDER`]: newAdderArray });
                } else if (adder && !checked) {
                    // Delete custom adders that matches attack name
                    await this.item.update({
                        [`system.ADDER`]: foundry.utils
                            .deepClone(this.item.system._source.ADDER)
                            .filter((o) => o.targetId !== attackItem.id),
                    });
                }
            }
        }

        // SKILLS (LEVELSONLY, FAMILIARITY, EVERYMAN, PROFICIENCY)
        // Generally rely on HBS to enforce valid combinations.
        if (this.item.system.EVERYMAN && !this.item.system.FAMILIARITY) {
            await this.item.update({ "system.FAMILIARITY": true });
        }

        // CHARGES
        if (expandedData.system?.numCharges) {
            await this.item.system.setChargesAndSave(expandedData.system.numCharges);
        }

        // CLIPS
        if (expandedData.system?.clips) {
            await this.item.system.setClipsAndSave(expandedData.system.clips);
        }
    }

    async _onEffectCreate(event) {
        event.preventDefault();
        return await this.actor.createEmbeddedDocuments("ActiveEffect", [
            {
                label: "New Effect",
                img: "icons/svg/aura.svg",
                origin: this.actor.uuid,
                //"duration.rounds": li.dataset.effectType === "temporary" ? 1 : undefined,
                disabled: true,
            },
        ]);
    }

    async _onEffectDelete(event) {
        event.preventDefault();
        const effectId = $(event.currentTarget).closest("[data-effect-id]").data().effectId;
        const effect = this.item.effects.get(effectId);

        if (!effect) return;

        const confirmed = await Dialog.confirm({
            title: game.i18n.localize("HERO6EFOUNDRYVTTV2.confirms.deleteConfirm.Title"),
            content: game.i18n.localize("HERO6EFOUNDRYVTTV2.confirms.deleteConfirm.Content"),
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
        const effectId = $(event.currentTarget).closest("[data-effect-id]").data().effectId;
        let effect = this.document.effects.get(effectId);
        if (!effect && this.document.actor) {
            effect = this.document.actor.effects.get(effectId);
        }

        effect.sheet.render(true);
    }

    async _onConvertToPower(event) {
        event.preventDefault();

        if (this.item.parentItem) {
            return ui.notifications.error(
                `<b>${this.item.name}</b> is a child of <b>${this.item.parentItem.name}</b>.  Converting a child item type is not supported.`,
            );
        }

        const confirmed = await Dialog.confirm({
            title: `Confirm ${this.item.name} type change`,
            content: `Convert ${this.item.name} from a ${this.item.type} to a POWER`,
        });

        if (!confirmed) {
            return;
        }

        // Also need to use force replace ==items for this to work in v13
        await this.item.update({ [`type`]: "power", [`==system`]: this.item.system }, { recursive: false });
        for (const childItem of this.item.childItems) {
            await childItem.update({ [`type`]: "power", [`==system`]: childItem.system }, { recursive: false });
        }
    }

    async _onConvertToEquipment(event) {
        event.preventDefault();

        if (this.item.parentItem) {
            return ui.notifications.error(
                `<b>${this.item.name}</b> is a child of <b>${this.item.parentItem.name}</b>.  Converting a child item type is not supported.`,
            );
        }

        const confirmed = await Dialog.confirm({
            title: `Confirm ${this.item.name} type change`,
            content: `Convert ${this.item.name} from a ${this.item.type} to EQUIPMENT`,
        });

        if (!confirmed) {
            return;
        }

        // Also need to use force replace ==items for this to work in v13
        await this.item.update({ [`type`]: "equipment", [`==system`]: this.item.system }, { recursive: false });
        for (const childItem of this.item.childItems) {
            await childItem.update({ [`type`]: "equipment", [`==system`]: childItem.system }, { recursive: false });
        }
    }
}
