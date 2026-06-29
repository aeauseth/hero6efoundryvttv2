import { HEROSYS } from "../herosystem6e.mjs";
import { filterIgnoreCompoundAndFrameworkItems } from "../config.mjs";

import { calculateRequiredResourcesToUse, processActionToHit } from "../item/item-attack.mjs";
import { buildEffectiveObject } from "../item/item.mjs";
import { Attack } from "../utility/attack.mjs";
import {
    calculateReduceOrPushRealCost,
    combatSkillLevelsForAttack,
    isManeuverThatDoesNormalDamage,
    isRangedCombatManeuver,
} from "../utility/damage.mjs";
import {
    convertSystemUnitsToMetres,
    currentSceneUsesHexGrid,
    getSystemDisplayUnits,
    gridUnitsToMeters,
} from "../utility/units.mjs";

/**
 * 5e HEX type and NORMAL are converted to RADIUS
 */
const heroAoeTypeToFoundryAoeTypeConversions = Object.freeze({
    any: "rect",
    cone: "cone",
    line: "ray",
    radius: "circle",
    surface: "rect",
});

export class ItemAttackFormApplication extends FormApplication {
    #hookIds = {};

    constructor(data) {
        super();
        this.data = data;
        this.options.title = `${this.data.originalItem.actor?.name} roll to hit`;

        const _targetToken = async function () {
            // Necessary for situations where it is not possible
            // to properly wait for promises to resolve before refreshing the UI.
            window.setTimeout(() => this.refresh(), 1);
        };
        this.#hookIds.targetToken = Hooks.on("targetToken", _targetToken.bind(this));

        const _controlToken = async function () {
            // Necessary for situations where it is not possible
            // to properly wait for promises to resolve before refreshing the UI.
            window.setTimeout(() => this.refresh(), 1);
        };
        this.#hookIds.controlToken = Hooks.on("controlToken", _controlToken.bind(this));

        // If  CSLs change on the Actor we need to know
        const _updateItem = async function (item) {
            //, changes, options, userId) {
            if (this.data.actor?.id === item.actor?.id && item.baseInfo?.refreshAttackDialogWhenChanged) {
                this.refresh();
            }
        };
        this.#hookIds.updateItem = Hooks.on("updateItem", _updateItem.bind(this));
    }

    async close(options) {
        Hooks.off("targetToken", this.#hookIds.targetToken);
        Hooks.off("controlToken", this.#hookIds.controlToken);
        Hooks.off("updateItem", this.#hookIds.updateItem);

        return super.close(options);
    }

    refresh() {
        foundry.utils.debounce(this.render(), 100);
    }

    static get defaultOptions() {
        let options = super.defaultOptions;
        options = foundry.utils.mergeObject(options, {
            classes: ["form"],
            popOut: true,
            template: `systems/${HEROSYS.module}/templates/attack/item-attack-application.hbs`,
            id: "item-attack-form-application",
            closeOnSubmit: false, // do not close when submitted
            submitOnChange: true, // submit when any input changes
            width: "400",
        });

        return options;
    }

    async getData() {
        try {
            this.data.targets = Array.from(game.user.targets);

            if (
                this.data.targets.length === 0 &&
                this.data.originalItem.system.XMLID === "MINDSCAN" &&
                game.user.isGM
            ) {
                this.data.targets = foundry.utils
                    .deepClone(canvas.tokens.controlled)
                    .filter((t) => t.actor?.id !== this.data.originalItem.actor?.id);
            }

            // Initialize aim to the default option values
            this.data.aim ??= "none";
            this.data.aimSide ??= "none";

            // We are using the numberInput handlebar helper which requires NUMBERS, thus the parseInt
            // Set the initial values on the form
            this.data.ocvMod ??= parseInt(this.data.originalItem.system.ocv);
            this.data.dcvMod ??= parseInt(this.data.originalItem.system.dcv);
            this.data.omcvMod ??= parseInt(this.data.originalItem.system.ocv); //TODO: May need to make a distinction between OCV/OMCV
            this.data.dmcvMod ??= parseInt(this.data.originalItem.system.dcv);

            // PH: FIXME: Need to separate STR usage from TK usage. See collectActionDataBeforeToHitOptions.
            this.data.effectiveStr ??= parseInt(this.data.str);
            this.data.effectiveStr = Math.max(0, this.data.effectiveStr);

            // Spreading attack +1 OCV for -1 DC
            // Commenting out SPREAD code for now as it has issues with AP, MARTIAL, missing damage tags.
            // Likely rework to resource usage and checking for "spread" thru several functions.
            // this.data.spread ??= parseInt(this.data.spread) || 0;

            // PH: FIXME: Is this right? What should we be showing for something like strike with weapon or fist?
            this.data.effectiveRealCost ??= this.data.originalItem._realCost;
            this.data.pushedRealPoints ??= 0;

            // Penalty Skill Levels
            this.data.psls = this.item?.pslRangePenaltyOffsetItems;

            // Is there an ENTANGLE on any of the targets
            // If so assume we are targeting the entangle
            const entangles = [];
            for (const target of this.data.targets) {
                const ae = target.actor?.temporaryEffects.find((o) => o.flags[game.system.id]?.XMLID === "ENTANGLE");
                if (ae) {
                    entangles.push(ae);
                }
            }
            this.data.entangleExists = entangles.length > 0 ? true : false;

            // Entangle
            if (this.data.targetEntangle === undefined) {
                this.data.targetEntangle = this.data.entangleExists;

                const entangle = entangles?.[0];

                if (entangle) {
                    // Mental attacks typically bypass entangles
                    if (
                        this.data.originalItem.attackDefenseVs === "MD" &&
                        entangle.flags[game.system.id]?.entangleDefense.rMD === 0
                    ) {
                        this.data.targetEntangle = false;
                    }

                    // TAKESNODAMAGE
                    if (fromUuidSync(entangle.origin)?.findModsByXmlid("TAKESNODAMAGE")) {
                        this.data.targetEntangle = false;
                    }
                }
            }

            // But an ENTANGLE attack doesn't target an ENTANGLE, adjustment attacks, etc - anything that doesn't have hit locations
            if (this.data.originalItem.effectiveAttackItem.system.noHitLocations) {
                this.data.entangleExists = false;
                this.data.targetEntangle = false;
            }

            // Boostable Charges - a maximum of 4 can be spent
            this.data.boostableChargesAvailable =
                this.data.originalItem.system.chargeModifier?.BOOSTABLE && this.data.originalItem.system.numCharges > 1
                    ? Math.min(4, this.data.originalItem.system.numCharges - 1)
                    : 0;
            this.data.boostableChargesToUse ??= 0;

            // Autofire
            const autofire = this.data.originalItem.effectiveAttackItem.findModsByXmlid("AUTOFIRE");
            this.data.autofireShotsAvailable = autofire
                ? this.data.originalItem.effectiveAttackItem.calcMaxAutofireShots(autofire)
                : 1;
            this.data.autofireShotsToUse ??= this.data.autofireShotsAvailable;

            // MINDSCAN
            if (this.data.originalItem.system.XMLID === "MINDSCAN") {
                this.data.mindScanChoices = CONFIG.HERO.mindScanChoices;

                this.data.mindScanFamiliarOptions = [];
                this.data.mindScanFamiliarOptions.push({
                    label: `+0`,
                    key: 0,
                });
                for (let i = 1; i <= 5; i++) {
                    this.data.mindScanFamiliarOptions.push({
                        label: `+${i} Familiar mind`,
                        key: i,
                    });
                }
                for (let i = 1; i <= 5; i++) {
                    this.data.mindScanFamiliarOptions.push({
                        label: `${-i} Unfamiliar mind`,
                        key: -i,
                    });
                }
            }

            // Combat Skill Levels
            const csls = combatSkillLevelsForAttack(this.data.originalItem).details;
            this.data.csls = undefined;
            for (const csl of csls) {
                if (csl && csl.item) {
                    const entry = {
                        cslSkill: csl.item,
                        cslChoices: csl.item.cslChoices,
                        csl: [],
                    };

                    // Filter physical or mental choices based on the CSL type
                    // PH: FIXME: Don't we need to do this on updates as well as the attack could have changed type based on weapon?
                    const isRangedAttack = this.data.originalItem.isRanged;
                    const isMentalAttack = this.data.originalItem.usesOmcv;
                    if (isMentalAttack) {
                        delete entry.cslChoices.ocv;
                        delete entry.cslChoices.dcvRanged;
                        delete entry.cslChoices.dcvHth;
                    } else {
                        delete entry.cslChoices.omcv;
                        delete entry.cslChoices.dmcv;

                        // Filter DCV options based on the attack type. CSLs only permit defense against the type of attack that was used.
                        if (isRangedAttack) {
                            delete entry.cslChoices.dcvHth;
                        } else {
                            delete entry.cslChoices.dcvRanged;
                        }
                    }

                    // If there are now no choices left, skip this CSL. If there are only defensive options left, skip this CSL as well.
                    const numFilteredChoices = Object.keys(entry.cslChoices).length;
                    if (
                        Object.keys(entry.cslChoices).length === 0 ||
                        (numFilteredChoices === 1 &&
                            (entry.cslChoices.dcvHth || entry.cslChoices.dcvRanged || entry.cslChoices.dmcv))
                    ) {
                        continue;
                    }

                    // CSL radioBoxes names. If we have filtered out the active option, then attempt to pick a reasonable substitute.
                    for (let c = 0; c < csl.item.system.csl.length; c++) {
                        let value = csl.item.system.csl[c];
                        if (!Object.hasOwn(entry.cslChoices, value)) {
                            if (value === "ocv" && isMentalAttack) {
                                value = "omcv";
                            } else if (value === "omcv" && !isMentalAttack) {
                                value = "ocv";
                            } else if ((value === "dcvHth" || value === "dcvRanged") && isMentalAttack) {
                                value = "dmcv";
                            } else if (value === "dmcv" && !isMentalAttack) {
                                if (isRangedAttack) {
                                    value = "dcvRanged";
                                } else {
                                    value = "dcvHth";
                                }
                            } else {
                                // We seem to be missing an intelligent default. Just pick the first one.
                                value = Object.keys(entry.cslChoices)[0];
                            }
                        }

                        entry.csl.push({
                            name: `${csl.item.id}.system.csl.${c}`,
                            value: value,
                        });
                    }

                    this.data.csls ??= [];
                    this.data.csls.push(entry);
                }
            }

            // DEADLYBLOW
            const DEADLYBLOW = this.data.originalItem.actor.items.find((o) => o.system.XMLID === "DEADLYBLOW");
            if (DEADLYBLOW) {
                this.data.originalItem.system.conditionalAttacks ??= {};
                this.data.originalItem.system.conditionalAttacks[DEADLYBLOW.id] = DEADLYBLOW;
                this.data.originalItem.system.conditionalAttacks[DEADLYBLOW.id].system.checked ??= true;
            }

            // Hand-to-hand attacks only apply to things that are strength damage based
            if (isManeuverThatDoesNormalDamage(this.data.originalItem)) {
                const hthAttacks = this.data.originalItem.actor.items.filter(
                    (item) => item.system.XMLID === "HANDTOHANDATTACK" && !(item.system.CARRIED && !item.system.active),
                );
                this.data.hthAttackItems ??= hthAttacks.reduce((attacksObj, hthAttack) => {
                    // If already exists we're updating so no need to recreate.
                    if (attacksObj[hthAttack.uuid]) {
                        return attacksObj;
                    }

                    attacksObj[hthAttack.uuid] = {
                        _canUseForAttack: false,
                        reasonForCantUse: "",
                        description: hthAttack.system.description,
                        name: hthAttack.name,
                    };
                    return attacksObj;
                }, {});
            } else {
                this.data.hthAttackItems = {};
            }

            // Weapons can be used with HTH or ranged martial maneuvers. The user needs to have Weapon Element.
            // Weapons can also be used with ranged combat maneuvers.
            // TODO: confirm the found Weapon Elements matches against the possible weapons. HDC doesn't support this.
            this.data.maSelectedWeaponId ??= null;
            this.data.maPossibleWeapons = [];
            if (
                (this.data.originalItem.isMartialManeuver &&
                    this.data.originalItem.actor.items.some((item) => item.system.XMLID === "WEAPON_ELEMENT")) ||
                isRangedCombatManeuver(this.data.originalItem)
            ) {
                this.data.maPossibleWeapons = [
                    {
                        id: null,
                        label: "No Weapon",
                        description: "Use no weapon",
                    },
                    ...this.data.originalItem.actor.items
                        .filter(filterIgnoreCompoundAndFrameworkItems)
                        .filter((item) => {
                            // If a ranged maneuver, list all ranged weapons. Otherwise, it's a martial art
                            // and list all HTH or ranged weapons depending on the martial maneuver type
                            return (
                                item.baseInfo.type.includes("attack") && // Is attack?
                                (this.data.originalItem.isRanged // Has the same kind of range?
                                    ? item.isRanged
                                    : item.isHth) &&
                                !item.isMartialManeuver && // No martial maneuvers as weapons
                                !item.isCombatManeuver && // No combat maneuvers as weapons
                                !item.system.XMLID.startsWith("__") // No internal placeholder powers/items
                            );
                        })
                        .map((item) => {
                            return {
                                id: item.id,
                                label: item.name,
                                description: item.system.description,
                            };
                        }),
                ];
            }

            // PH: FIXME: Need to only get the Naked Advantages that apply to this item.
            // PH: FIXME: need to distinguish between single power and group power
            const nakedAdvantagesItems = this.data.originalItem.actor.items.filter(
                (item) => item.system.XMLID === "NAKEDMODIFIER",
            );
            this.data.nakedAdvantagesItems ??= nakedAdvantagesItems.reduce((naObj, naItem) => {
                // If already exists we're updating so no need to recreate.
                if (naObj[naItem.uuid]) {
                    return naObj;
                }

                naObj[naItem.uuid] = {
                    _canUseForAttack: false,
                    reasonForCantUse: "",
                    description: naItem.system.description,
                    name: naItem.name,
                    item: naItem,
                };
                return naObj;
            }, {});

            this.data.effectiveItem = await this.#buildEffectiveObjectFromOriginalAndData();
            this.data.effectiveItemResourceUsage = calculateRequiredResourcesToUse(
                [
                    this.data.effectiveItem,
                    ...(this.data.effectiveItem.system._active.linkedEnd || []).map(
                        (linkedEndInfo) => linkedEndInfo.item,
                    ),
                    ...(this.data.effectiveItem.system._active.linkedAssociated || []).map(
                        (linkedAssociatedInfo) => linkedAssociatedInfo.item,
                    ),

                    // PH: FIXME: This should probably be recursive as these linked items could have linked endurance
                    // only items or linked items of their own (presumably).
                    ...(this.data.effectiveItem.system._active.linked || []).map((linkedInfo) => linkedInfo.item),
                ],
                this.data.formData || this.data,
            );

            this.#setAoeAndHitLocationDataForEffectiveItem();

            this.data.action = Attack.buildActionInfo(
                this.data.effectiveItem,
                this.data.targets,
                { ...this.data.formData, token: this.data.token }, // use formData to include player options from the form
            );

            const manueverItem = this.data.effectiveItem;
            this.data.multiAttackItems ??= this.data.action.maneuver.isMultipleAttackManeuver
                ? this.data.originalItem.actor.items.filter(filterIgnoreCompoundAndFrameworkItems).filter((item) => {
                      return (
                          (item.baseInfo.type.includes("attack") || item.baseInfo.type.includes("maneuver")) && // Is attack or maneuver?
                          (manueverItem.system.XMLID === "MULTIPLEATTACK" || // 6e Multipleattack allows both HTH and Ranged
                              (manueverItem.system.XMLID === "SWEEP" && item.isHth) || // 5e Sweep is HTH only
                              (manueverItem.system.XMLID === "RAPIDFIRE" && item.isRanged)) && // 5e Rapid Fire is Ranged only
                          !item.system.XMLID.startsWith("__") // No internal placeholder powers/items
                      );
                  })
                : [];

            // the title seems to be fixed when the form is initialized,
            // and doesn't change afterwards even if we come through here again
            // todo: figure out how to adjust the title when we want it to
            if (this.data.action.maneuver.isMultipleAttack) {
                this.options.title = `${(this.data.token || this.data.actor).name} multiple attack`;
            } else if (this.data.action.maneuver.isSweep) {
                this.options.title = `${(this.data.token || this.data.actor).name} sweep attack`;
            } else if (this.data.action.maneuver.isRapidFire) {
                this.options.title = `${(this.data.token || this.data.actor).name} rapid fire attack`;
            } else {
                this.options.title = `${(this.data.token || this.data.actor).name} attack`;
            }
        } catch (error) {
            console.error(error);
        }

        return this.data;
    }

    activateListeners(html) {
        super.activateListeners(html);
        // add to multiattack
        html.find(".add-multiattack").click(this._onAddAttackToMultipleAttackManeuver.bind(this));
        html.find(".remove-multiattack").click(this._onRemoveAttackFromMultipleAttackManeuver.bind(this));
    }

    async _onAddAttackToMultipleAttackManeuver() {
        if (Attack.addMultipleAttack(this.data)) {
            this.render();
        }
    }

    async _onRemoveAttackFromMultipleAttackManeuver(event) {
        const multipleAttackKey = event.target.dataset.multiattack;
        if (Attack.removeMultipleAttack(this.data, multipleAttackKey)) {
            this.render();
        }
    }

    async _render(...args) {
        await super._render(...args);

        // CSL can cause differences in form size.
        if (this.position && this.rendered) {
            this.setPosition({ height: "auto" });
        }
    }

    /**
     * If there are no hit locations for the power or this is an AoE then the user cannot place a shot.
     * If they can't place a shot the only options should be "none"
     */
    #setAoeAndHitLocationDataForEffectiveItem() {
        const aoe = this.data.effectiveItem.effectiveAttackItem.aoeAttackParameters;
        this.data.hitLocationsEnabled = game.settings.get(HEROSYS.module, "hit locations");
        this.data.hitLocationSideEnabled =
            this.data.hitLocationsEnabled && game.settings.get(HEROSYS.module, "hitLocTracking") === "all";
        this.data.hitLocationsEnabled = game.settings.get(HEROSYS.module, "hit locations");

        // If there are no hit locations for the power or this is an AoE then the user cannot
        // place a shot. If they can't place a shot the only options should be "none"
        if (this.data.hitLocationsEnabled) {
            this.data.hitLoc = [];
            this.data.hitLocSide = [];

            if (!this.data.effectiveItem.effectiveAttackItem.system.noHitLocations && !aoe) {
                for (const [key, obj] of Object.entries(CONFIG.HERO.hitLocations)) {
                    this.data.hitLoc.push({ key: key, label: `${obj.label} (${obj.ocvMod})` });
                }

                if (this.data.hitLocationSideEnabled) {
                    for (const key of Object.keys(CONFIG.HERO.hitLocationSide)) {
                        this.data.hitLocSide.push({ key: key, label: key });
                    }
                }
            }

            const noneReason = this.data.effectiveItem.effectiveAttackItem.system.noHitLocations
                ? `does not allow hit locations`
                : aoe
                  ? `has an area of effect`
                  : undefined;

            const noneLabel = `None${noneReason ? ` - ${noneReason}` : ""}`;
            this.data.hitLoc = [{ key: "none", label: `${noneLabel}` }, ...this.data.hitLoc];
            this.data.hitLocSide = [{ key: "none", label: `${noneLabel}` }, ...this.data.hitLocSide];
        }

        if (aoe) {
            this.data.aoeText = aoe.type;
            const levels = aoe.value;
            if (levels) {
                this.data.aoeText += ` (${levels}${getSystemDisplayUnits(this.data.effectiveItem.actor.is5e)})`;
            }

            this.data.aoeFreeform = aoe.type === "any" || aoe.type === "surface";
            if (this.data.aoeFreeform) {
                this.data.aoeAllowedCount = this.data.effectiveItem.actor.is5e
                    ? `${levels} hex(es)`
                    : `${levels} 2m area(s)`;
            }

            if (this.getAoeTemplate() || game.user.targets.size > 0) {
                this.data.noTargets = false;
            } else {
                this.data.noTargets = true;
            }
        } else {
            this.data.noTargets = game.user.targets.size === 0;
            this.data.aoeText = null;
        }
    }

    // Create a new effectiveItem
    async #buildEffectiveObjectFromOriginalAndData() {
        const effectiveObjectParameters = {
            originalItem: this.data.originalItem,
            effectiveRealCost: this.data.effectiveRealCost,
            pushedRealPoints: this.data.pushedRealPoints,
            effectiveStr: this.data.effectiveStr,
            effectiveStrPushedRealPoints: this.data.effectiveStrPushedRealPoints,

            maWeaponId: this.data.maSelectedWeaponId,
            hthAttackItems: this.data.hthAttackItems,
            nakedAdvantagesItems: this.data.nakedAdvantagesItems,
            clubWeaponItem: this.data.clubWeaponItem,

            autofire: {
                shots: this.data.autofireShotsToUse,
                maxShots: this.data.autofireShotsAvailable,
            },
        };

        return buildEffectiveObject(effectiveObjectParameters);
    }

    /**
     * Can only push and reduce so much. Make sure we're not exceeding basic boundaries for strength or the item.
     *  PH: FIXME: Should not be able to push if the power is bought to 0 END, doesn't cost END, or use charges.
     *  PH: FIXME: Pushing for heroic has different rules than superheroic (which is what is implemented here)
     *  PH: FIXME: Allow pushing beyond 10 CP with override?
     *  PH: FIXME: How should pushing play with HTH Attack and Naked Advantages? I assume that they don't interact.
     * @param {Object} formData
     */
    #processReduceOrPush(formData) {
        // Limit the item's reduce or push
        const desiredEffectiveItemRealCost = formData.effectiveRealCost || 0;

        ({ effectiveRealCost: this.data.effectiveRealCost, pushedRealPoints: this.data.pushedRealPoints } =
            calculateReduceOrPushRealCost(this.data.originalItem._realCost, desiredEffectiveItemRealCost));

        if (this.data.effectiveRealCost < desiredEffectiveItemRealCost) {
            ui.notifications.warn(
                "Pushing a power is limited to the lesser of 10 character points or the original total character points",
            );
        } else if (this.data.effectiveRealCost > desiredEffectiveItemRealCost) {
            ui.notifications.warn("The minimum power cost is 1 character point");
        }

        // Limit strength's push
        // PH: FIXME: Should be working with limited strength and not desired strength
        const desiredStrengthRealCost = formData.effectiveStr || 0;
        if (this.data.effectiveStr > 0) {
            ({ effectiveRealCost: this.data.effectiveStr, pushedRealPoints: this.data.effectiveStrPushedRealPoints } =
                calculateReduceOrPushRealCost(this.data.str, desiredStrengthRealCost));

            if (this.data.effectiveStr < desiredStrengthRealCost) {
                ui.notifications.warn(
                    "Pushing strength is limited to the lesser of 10 character points or the original total character points",
                );
            }
        } else {
            this.data.effectiveStrPushedRealPoints = 0;
        }
    }

    /**
     * Determine what Hand-to-Hand and Naked Advantages should be enabled.
     *
     * @param {Object} formData
     */
    #processFormDataForHthAndNa(formData) {
        // Restructure HTH Attacks
        Object.entries(formData).forEach(([key, value]) => {
            const match = key.match(/^hthAttackItems.(.*)._canUseForAttack$/);
            if (!match) {
                return;
            }

            this.data.hthAttackItems[match[1]]._canUseForAttack = value;
        });

        // Restructure Naked Advantages
        Object.entries(formData).forEach(([key, value]) => {
            const match = key.match(/^nakedAdvantagesItems.(.*)._canUseForAttack$/);
            if (!match) {
                return;
            }

            this.data.nakedAdvantagesItems[match[1]]._canUseForAttack = value;
        });
    }

    async _updateObject(event, formData) {
        const extendedFormData = foundry.utils.expandObject(formData);

        // PH: FIXME: There has to be a better way than this?
        delete extendedFormData.effectiveRealCost;

        // HTH Attacks and Naked Advantages format includes the UUID which has periods in it so we can't use extendedFormData. Do a custom merge.
        delete extendedFormData.hthAttackItems;
        delete extendedFormData.nakedAdvantagesItems;

        // CSL & PSL format is non-standard, need to deal with those
        const updates = [];
        for (const key of Object.keys(extendedFormData)) {
            if (key.length === 16) {
                const extendedItem = this.data.actor.items.find((o) => o.id === key);
                if (extendedItem) {
                    updates.push({ _id: key, ...extendedFormData[key] });
                    delete extendedFormData[key];
                }
            }
        }
        if (updates.length > 0) {
            await this.data.actor.updateEmbeddedDocuments("Item", updates);
        }

        // Spreading -1 DC
        // if (this.data.spread) {
        //     formData.spread = Math.min(formData.spread, formData.effectiveRealCost / 5);
        //     formData.effectiveRealCost = Math.min(
        //         formData.effectiveRealCost,
        //         this.data.originalItem._realCost - formData.spread * 5,
        //     );
        // }

        // Take all the data we updated in the form and apply it.
        this.data = foundry.utils.mergeObject(this.data, extendedFormData);

        this.#processReduceOrPush(formData);

        this.#processFormDataForHthAndNa(formData);

        // PH: FIXME: Build the item to use. Is there a way to only have this code once in getData?
        this.data.effectiveItem = await this.#buildEffectiveObjectFromOriginalAndData();
        this.data.effectiveItemResourceUsage = calculateRequiredResourcesToUse(
            [
                this.data.effectiveItem,
                ...(this.data.effectiveItem.system._active.linkedEnd || []).map((linkedEndInfo) => linkedEndInfo.item),

                // PH: FIXME: This should probably be recursive as these linked items could have linked endurance
                // only items or linked items of their own (presumably).
                ...(this.data.effectiveItem.system._active.linked || []).map((linkedInfo) => linkedInfo.item),
            ],
            formData,
        );

        this.#setAoeAndHitLocationDataForEffectiveItem();

        if (event.submitter?.name === "roll") {
            canvas.tokens.activate();
            await this.close();

            return processActionToHit(this.data.effectiveItem, formData, { token: this.data.token });
        }

        if (event.submitter?.name === "rollManualTarget") {
            formData.aoeManualTargeting = true;
            canvas.tokens.activate();
            await this.close();

            return processActionToHit(this.data.effectiveItem, formData, { token: this.data.token });
        }

        this.data.formData ??= {};

        if (event.submitter?.name === "continueMultiattack") {
            this.data.formData.continueMultiattack = true;
        } else if (event.submitter?.name === "executeMultiattack") {
            const begin = this.data.action.current.execute === undefined;
            // we pressed the button to execute multiple attacks
            // the first time does not get a roll, but sets up the first attack
            if (begin) {
                this.data.formData.execute = 0;
            } else {
                // the subsequent presses will roll the attack and set up the next attack
                // TODO: if any roll misses, the multiattack ends, and the end cost for the remainding attacks are forfeit

                // this is the roll:
                await processActionToHit(this.data.effectiveItem, this.data.formData, { token: this.data.token });

                this.data.formData.execute = this.data.action.current.execute + 1;
            }

            // Is this is the last step?
            const end = this.data.formData.execute >= this.data.action.maneuver.attackKeys.length;
            if (end) {
                canvas.tokens.activate();
                await this.close();
            } else {
                return this.render();
            }
        } else if (event.submitter?.name === "missedMultiattack") {
            // TODO: charge user the end cost for the remaining attacks
            canvas.tokens.activate();
            await this.close();
            return;
        } else if (event.submitter?.name === "cancelMultiattack") {
            this.data.formData.continueMultiattack = false;

            // PH: FIXME: Do we have to do anything to action to clear it out? Should we just "delete" it?

            canvas.tokens.activate();
            await this.close();

            return;
        } else if (event.submitter?.name === "aoe") {
            return this._spawnAreaOfEffect();
        }

        // A max of 4 boostable charges may be used and a min of 0.
        if (formData.boostableChargesToUse) {
            this.data.boostableChargesToUse = formData.boostableChargesToUse = Math.max(
                0,
                Math.min(formData.boostableChargesToUse, 4),
            );
        }

        // A minimum of 1 shot and a maximum of max autofire charges can be used.
        this.data.autofireShotsToUse = formData.autofireShotsToUse = Math.max(
            1,
            Math.min(formData.autofireShotsToUse, this.data.autofireShotsAvailable),
        );

        // Can only push so much
        if (formData.effectiveActivePoints) {
            const desiredEffectiveActivePoints = formData.effectiveActivePoints;
            // PH: FIXME: Is this right? What should we be showing for something like stike with weapon or fist?
            this.data.effectiveActivePoints = Math.min(
                desiredEffectiveActivePoints,
                this.data.originalItem.activePoints + Math.min(10, this.data.originalItem.activePoints),
            );

            if (this.data.effectiveActivePoints < desiredEffectiveActivePoints) {
                ui.notifications.warn(
                    `Pushing is limited to the lesser of 10 active points or the original total active points`,
                );
            }
        }

        // collect the changed data; all of these changes can go into get data
        this.data.formData = { ...this.data.formData, ...formData };

        // Save conditionalAttack check
        // PH: FIXME: Is originalItem use here correct?
        const expandedData = foundry.utils.expandObject(formData);
        for (const ca in expandedData?.system?.conditionalAttacks) {
            await this.data.originalItem.system.conditionalAttacks[ca].update({
                [`system.checked`]: expandedData.system.conditionalAttacks[ca].system.checked,
            });
        }

        // Show any changes
        this.render();
    }

    /**
     *
     * 5e is a hex based system with defined AOE templates. The first hex is the target hex (even though it's only a 0.5" radius).
     * 6e is a gridless system with distances and AOE templates defined by the grid/gridless system being used for this scene.
     *
     */
    async _spawnAreaOfEffect() {
        const item = this.data.effectiveItem;

        const areaOfEffect = item.effectiveAttackItem.aoeAttackParameters;
        if (!areaOfEffect) return;

        const aoeType = areaOfEffect.type;
        const aoeValue = areaOfEffect.value;

        // TODO: Remove when V13 support is dropped. Freeform shapes need drawable Regions (V14+); the V13
        // MeasuredTemplate path can't represent them, so refuse cleanly rather than throwing.
        if (aoeType === "any" || aoeType === "surface") {
            return ui.notifications.warn(
                `Placing a template for a "${aoeType}" Area Of Effect is not supported in this version of Foundry. Use "Use manual token targeting (skip template)" instead.`,
            );
        }

        const actor = item.actor;
        const token = actor.getActiveTokens()[0] || canvas.tokens.controlled[0];
        if (!token) {
            return ui.notifications.error(`${actor.name} has no token in this scene.  Unable to place AOE template.`);
        }

        // Close all windows except us
        for (let id of Object.keys(ui.windows)) {
            if (id != this.appId) {
                ui.windows[id].close();
            }
        }

        const templateType = heroAoeTypeToFoundryAoeTypeConversions[aoeType];

        const sizeConversionToMeters = convertSystemUnitsToMetres(1, actor.is5e);

        const hexTemplates = game.settings.get(HEROSYS.module, "HexTemplates");
        const hexGrid = currentSceneUsesHexGrid();

        // NOTE: If we're using hex templates (i.e. 5e), the target hex is in should count as a distance of 1". This means that to convert to what FoundryVTT expects
        //       for distance we need to subtract 0.5"/1m from the radius.
        // NOTE: MeasuredTemplates assume that the distance is in grid units.
        const distanceInMeters = aoeValue * sizeConversionToMeters - (hexTemplates && hexGrid ? 1 : 0);
        const distanceInGridUnits = distanceInMeters / gridUnitsToMeters();

        const effectiveAttackItemOriginalItemId = getEffectiveItemOriginalItemId(item.effectiveAttackItem);
        const templateData = {
            t: templateType,
            author: game.user.id,
            distance: distanceInGridUnits,
            direction: -token.document?.rotation || 0 + 90, // Top down tokens typically face south
            fillColor: game.user.color,
            flags: {
                [game.system.id]: {
                    purpose: "AoE",
                    itemId: effectiveAttackItemOriginalItemId,
                    item,
                    actor,
                    aoeType,
                    aoeValue,
                    sizeConversionToMeters,
                    usesHexTemplate: hexTemplates && hexGrid,
                    is5e: item.effectiveAttackItem.is5e,
                },
            },
        };

        switch (templateType) {
            case "circle":
                break;

            case "cone":
                {
                    if ((areaOfEffect.ADDER || []).find((adder) => adder.XMLID === "THINCONE")) {
                        templateData.angle = 30;
                    } else {
                        templateData.angle = 60;
                    }
                }

                break;

            case "ray":
                {
                    templateData[game.system.id] = {};
                    templateData.width = sizeConversionToMeters * areaOfEffect.width;
                    templateData.flags[game.system.id].width = areaOfEffect.width;
                    templateData.flags[game.system.id].height = areaOfEffect.height;
                }
                break;

            case "rect": {
                // if (areaOfEffect.type === "surface" && item.findModsByXmlid("CONTINUOUS")) {
                //     // This is likely a damage shield
                // }

                // rectangle templates are defined as a distance/hypotenuse and an angle
                templateData.direction = areaOfEffect.direction;
                templateData.distance = sizeConversionToMeters * areaOfEffect.distance;
                break;
            }

            default:
                console.error(`unsupported template type ${templateType}`);
                break;
        }

        templateData.x = token.center.x;
        templateData.y = token.center.y;

        const existingTemplate = this.getAoeTemplate();
        if (existingTemplate) {
            // reuse exiting template, just update position
            await existingTemplate.update({
                x: templateData.x,
                y: templateData.y,
            });
        } else {
            canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [templateData]);
        }

        canvas.templates.activate({ tool: templateType });
        canvas.templates.selectObjects({
            x: templateData.x,
            y: templateData.y,
            releaseOthers: true,
            control: true,
            toggle: false,
        });
    }

    /**
     * Find the first matching template for the effective attack item.
     *
     * @returns
     */
    getAoeTemplate() {
        const effectiveAttackItemOriginalItemId = getEffectiveItemOriginalItemId(this.data.effectiveItem);

        return Array.from(canvas.templates.getDocuments()).find(
            (template) =>
                template.author.id === game.user.id &&
                template.flags[game.system.id]?.purpose === "AoE" &&
                template.flags[game.system.id]?.itemId === effectiveAttackItemOriginalItemId,
        );
    }
}

/**
 * From an item, find the original item id for its effectiveAttackItem.
 *
 * @param {*} item
 * @returns
 */
function getEffectiveItemOriginalItemId(item) {
    //const effectiveAttackItem = item.effectiveAttackItem;
    const effectiveAttackItemUuid = item.system._active.__originalUuid;

    // Is the effective attack item an temporary effective item?
    if (effectiveAttackItemUuid) {
        return foundry.utils.parseUuid(effectiveAttackItemUuid)?.id;
    }

    // Is the effective attack item an actual original item?
    if (item.id) {
        return item.id;
    }

    console.error(
        `${item.detailedName()} doesn't have an originating UUID stored and the effective item doesn't have an id`,
    );

    return null;
}

window.ItemAttackFormApplication = ItemAttackFormApplication;
