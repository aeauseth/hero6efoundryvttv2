// DAMAGE CLASS (DC)
//
// Different dice of damage are not the same – 2d6 of Killing
// Damage is much more likely to injure a target than a 2d6
// Normal Damage attack. For comparisons between damage
// types, Champions uses Damage Classes (“DC”).
//
// An attack’s DC is based on the number of Active Points in
// it divided by 5. Thus, a Blast 6d6 and an HKA 2d6 (each with
// 30 Active Points) each have 6 DCs; if added STR increases that
// HKA to 3d6+1, it counts as 10 DCs; and so on.
//
// For attacks with Advantages, determine the DCs by
// making a special Active Point calculation that only counts
// Advantages that directly affect how the victim takes damage.
// The GM makes the final call on which Advantages this includes,
// but typically, the following Advantages qualify: Area Of
// Effect, Armor Piercing, AVAD, Autofire, Charges (Boostable),
// Constant, Cumulative, Damage Over Time, Does BODY, Does
// Knockback, Double Knockback, Increased STUN Multiplier,
// MegaScale in some instances, Penetrating, Sticky, Time Limit,
// Transdimensional, Trigger, Uncontrolled, Usable As Attack,
// Variable Advantage, and Variable Special Effects.

import { HEROSYS } from "../herosystem6e.mjs";
import { RoundDc, RoundFavorPlayerDown } from "./round.mjs";

export function convertToDiceParts(value) {
    const dice = Math.floor(value / 5);
    const halfDice = value % 5 >= 2.5 ? 1 : 0;
    const plus1 = value % 5 < 2.5 && value % 5 > 0 ? 1 : 0;
    return { dice, halfDice, plus1 };
}

// Determine DC solely from item/attack
export function convertToDcFromItem(item, options) {
    let actor = item.actor;
    let dc = 0;
    let tags = [];
    let end = 0;
    let baseDcParts = {};
    let tooltip = "";

    // MartialArts & Maneuvers have DC
    dc = parseInt(item.system.DC) || 0;

    // 5E Martial DC, EXTRADC, and CSL DCs are halved for killing attacks.  STR/5 DCs are unchanged.
    // pg 400 (+1 Damage Class); pg 406
    if (
        item.is5e &&
        item.system.killing &&
        (item.system.XMLID === "MANEUVER" || ["maneuver", "martialart"].includes(item.type))
    ) {
        dc = Math.floor(dc / 2);
        tooltip = "It takes two Extra DCs to add +1 DC to a Killing Damage attack";
    }

    // NND (the DC should be halved; suspect because of AVAD/NND implied limitation; Nerve Strike)
    if (item.system.EFFECT?.includes("NND")) {
        dc = Math.floor(dc / 2);
        tooltip = "AVAD/NND implied limitation";
    }

    // Powers use LEVELS, which we will convert to DCs
    if (dc === 0) {
        dc = parseInt(item.system.LEVELS) || 0;
        if (item.system.killing) {
            dc *= 3;
        }
    }

    // Check for DC override (TELEKINESIS for example)
    if (typeof item.baseInfo?.dc === "function") {
        dc = item.baseInfo.dc(item, options);
    } else {
        // If the item.baseInfo.dc supports PIP adders then Peter thinks the PIP handling shoudld be done there.

        // Killing Attack
        if (item.system.killing) {
            if (item.findModsByXmlid("PLUSONEPIP")) {
                dc += 1;
            } else if (item.findModsByXmlid("PLUSONEHALFDIE")) {
                dc += 2;
            } else if (item.findModsByXmlid("MINUSONEPIP")) {
                // +1d6-1 is equal to +1/2 d6 DC-wise but is uncommon.
                dc += 2;
            }
        } else {
            if (item.findModsByXmlid("PLUSONEPIP")) {
                dc += 0.2;
            } else if (item.findModsByXmlid("PLUSONEHALFDIE")) {
                dc += 0.5;
            } else if (item.findModsByXmlid("MINUSONEPIP")) {
                // +1d6-1 is equal to +1/2 d6 DC-wise but is uncommon.
                dc += 0.5;
            }
        }
    }

    let displayName = "";
    // XMLID != Name tooltip
    if (item.name != item.system.XMLID) {
        if (item.system.XMLID != "MANEUVER") {
            displayName = item.system.XMLID;
        } else {
            if (item.name != item.system.DISPLAY) {
                displayName = item.system.DISPLAY;
            }
        }
    }

    tags.push({
        value: `${getDiceFormulaFromItemDC(item, dc)}`,
        name: item.name,
        title: `${dc.signedString()}DC${displayName ? `\n${displayName}` : ""}${tooltip ? `\n${tooltip}` : ""}`,
    });

    baseDcParts.item = dc;

    // Make sure we have activepointsdc
    // item.calcActivePoints();

    // Active Point to CP ratio of base attack.
    // We need this to properly calculate the DC of STR.
    // For some reason we don't "adjust" MartialArts with advantages
    // Also some things like REDUCED END do not impact the damage taken by the victim.
    const apRatio =
        item.type === "martialart" || !item.system.basePointsPlusAdders
            ? 1
            : item.system.basePointsPlusAdders / (item.system.activePointsDc || item.system.activePoints);

    // Add in STR
    if (item.system.usesStrength) {
        let str = parseInt(
            options?.effectivestr != undefined ? options?.effectivestr : actor?.system.characteristics.str.value || 0,
        );

        // MOVEBY halves STR
        if (item.system.XMLID === "MOVEBY") {
            str = str / 2;
        }

        // STRMINIMUM
        // A character using a weapon only adds damage for every full 5 points of STR he has above the weapon’s STR Minimum
        const STRMINIMUM = item.findModsByXmlid("STRMINIMUM");
        if (STRMINIMUM) {
            const strMinimum = parseInt(STRMINIMUM.OPTION_ALIAS.match(/\d+/)?.[0] || 0);
            //if (strMinimum && str > strMinimum) {
            const strMinDc = Math.ceil(strMinimum / 5);
            dc -= strMinDc;
            tags.push({
                value: `-${strMinDc}DC`,
                name: "STR Minimum",
                title: `${STRMINIMUM.OPTION_ALIAS} ${STRMINIMUM.ALIAS}`,
            });
            //}
        }

        const str5 = RoundDc(str / 5);
        const str5Dc = RoundDc(str5 * apRatio);

        dc += str5Dc;
        end += Math.max(1, RoundFavorPlayerDown(str / 10));

        if (str5Dc != 0) {
            tags.push({
                value: `${getDiceFormulaFromItemDC(item, str5Dc)}`, //`${str5.signedString()}DC`,
                name: "STR",
                title: `${str5.signedString()}DC${
                    str5Dc != str5
                        ? `\n${getDiceFormulaFromItemDC(item, str5)} reduced to ${getDiceFormulaFromItemDC(
                              item,
                              str5Dc,
                          )} due to advantages`
                        : ""
                }${item.system.XMLID === "MOVEBY" ? "\nMoveBy is half STR" : ""}`,
            });
        }
    }

    baseDcParts.str = dc - baseDcParts.item;

    // Boostable Charges
    if (options?.boostableCharges) {
        const boostCharges = parseInt(options.boostableCharges);
        const boostDc = RoundDc(boostCharges * apRatio);
        dc += boostDc;
        //tags.push({ value: `${_value.signedString()}DC`, name: "boostable" });
        tags.push({
            value: `${getDiceFormulaFromItemDC(item, boostDc)}`,
            name: "boostable",
            title: `${boostDc.signedString()}DC${
                boostDc != boostCharges
                    ? `\n${getDiceFormulaFromItemDC(item, boostCharges)} reduced to ${getDiceFormulaFromItemDC(
                          item,
                          boostDc,
                      )} due to advantages`
                    : ""
            }`,
        });
    }

    // Combat Skill Levels
    for (const csl of CombatSkillLevelsForAttack(item)) {
        if (csl && csl.dc > 0) {
            const cslDc = RoundDc(csl.dc * apRatio);
            // Simple +1 DC for now (checking on discord to found out rules for use AP ratio)
            dc += cslDc;

            // Each DC should roughly be 5 active points
            // let dcPerAp =  ((dc * 5) / (item.system.activePointsDc || item.system.activePoints)) || 1;
            // let ratio = (dcPerAp || 5) / 5;  // Typically 1 to 1 radio
            // dc += (csl.dc * dcPerAp);
            // console.log(dcPerAp, dc, csl.dc)

            // tags.push({
            //     value: `${csl.dc.signedString()}DC`,
            //     name: csl.item.name,
            // });

            tags.push({
                value: `${getDiceFormulaFromItemDC(item, cslDc)}`,
                name: csl.item.name,
                title: `${csl.dc.signedString()}DC${
                    cslDc != csl.dc
                        ? `\n+${getDiceFormulaFromItemDC(item, csl.dc)} reduced to +${
                              getDiceFormulaFromItemDC(item, cslDc) || 0
                          } due to advantages`
                        : ""
                }`,
            });
        }
    }

    // Only Martial Arts, generic maneuvers do not get the EXTRADC purchased in the Martial Arts tab
    let extraDcLevels = 0;
    //if (item.system.XMLID === "MANEUVER") {
    if (item.type === "martialart") {
        const EXTRADC = item.actor.items.find((o) => o.system?.XMLID === "EXTRADC");
        if (EXTRADC) {
            extraDcLevels = parseInt(EXTRADC.system.LEVELS);

            // 5E extraDCLevels are halved for killing attacks
            if (item.system.is5e && item.system.killing) {
                extraDcLevels = Math.floor(extraDcLevels / 2);
            }

            // For some reason we do not "adjust" martial attacks with advantages.
            const adjustedExtraDc = extraDcLevels; //RoundFavorPlayerUp(extraDcLevels * apRatio);

            tags.push({
                value: `${getDiceFormulaFromItemDC(item, adjustedExtraDc)}`,
                name: EXTRADC.name.replace(/\+\d+ HTH/, "").trim(),
                title: `${adjustedExtraDc.signedString()}DC${
                    adjustedExtraDc != extraDcLevels
                        ? `\n${getDiceFormulaFromItemDC(item, extraDcLevels)} reduced to ${getDiceFormulaFromItemDC(
                              item,
                              adjustedExtraDc,
                          )} due to advantages`
                        : ""
                }${tooltip ? `\n${tooltip}` : ""}`,
            });
            dc += extraDcLevels;
        }
    }

    // Move By (add in velocity)
    // ((STR/2) + (v/10))d6; attacker takes 1/3 damage
    //
    // A character can accelerate at a rate of 5m per meter, up to their
    // maximum normal Combat Movement in meters per Phase. Thus
    // a character with 50m of Flight would be moving at a velocity of
    // 5m after traveling one meter, 10m after traveling two meters,
    // 15m after traveling three meters, and so on, up to 50m after
    // traveling ten meters.
    //
    // Currently assuming token starts at 0 velocity and ends at 0 velocity.
    // Under this assumption the max velocity is half the speed.

    let velocityDC = 0;
    // [NORMALDC] +v/5 Strike, FMove
    // ((STR/2) + (v/10))d6; attacker takes 1/3 damage
    if ((item.system.EFFECT || "").match(/v\/\d/)) {
        //if (["MOVEBY", "MOVETHROUGH"].includes(item.system.XMLID)) {
        if (!options) {
            options = {};
        }
        options.velocity = parseInt(options?.velocity || 0);
        let divisor = parseInt(item.system.EFFECT.match(/v\/(\d+)/)[1]); //10;
        // if (item.system.XMLID === "MOVETHROUGH") {
        //     divisor = 6;
        // }
        velocityDC = Math.floor(options.velocity / divisor);
        const velocityAdjustedDC = RoundDc(velocityDC * apRatio);

        if (velocityAdjustedDC > 0) {
            dc += velocityAdjustedDC;
            tags.push({
                value: `${getDiceFormulaFromItemDC(item, velocityAdjustedDC)}`,
                name: "Velocity",
                title: `Velocity (${options.velocity}) / ${divisor}${
                    velocityAdjustedDC != velocityDC
                        ? `\n${getDiceFormulaFromItemDC(item, velocityDC)} reduced to ${getDiceFormulaFromItemDC(
                              item,
                              velocityAdjustedDC,
                          )} due to advantages`
                        : ""
                }`,
            });
        }
    }

    // ActiveEffects
    if (item.actor) {
        for (const ae of item.actor.appliedEffects.filter((o) => !o.disabled && o.flags?.target === item.uuid)) {
            for (const change of ae.changes.filter((o) => o.key === "system.value" && o.value != 0 && o.mode === 2)) {
                const _value = parseInt(change.value);
                dc += _value;
                tags.push({
                    value: `${_value.signedString()}DC`,
                    name: ae.name,
                });
            }
        }
    }

    // Add in Haymaker to any non-maneuver attack DCV based attack
    if (item.actor) {
        const haymakerManeuver = item.actor.items.find(
            (o) => o.type == "maneuver" && o.name === "Haymaker" && o.system.active,
        );
        if (haymakerManeuver) {
            // && item.type != 'maneuver' && item.system.targets == 'dcv')
            if (item.name == "Strike" || item.type != "maneuver") {
                if (item.system.targets == "dcv") {
                    const haymakerDc = RoundDc(4 * apRatio);

                    dc += haymakerDc;
                    tags.push({
                        value: `${getDiceFormulaFromItemDC(item, haymakerDc)}`,
                        name: "Haymaker",
                        title: `${
                            haymakerDc != 4
                                ? `\n${getDiceFormulaFromItemDC(item, 4)} reduced to ${getDiceFormulaFromItemDC(
                                      item,
                                      haymakerDc,
                                  )} due to advantages`
                                : ""
                        }`,
                    });
                } else {
                    if (options?.isAction)
                        ui.notifications.warn("Haymaker can only be used with attacks targeting DCV.", {
                            localize: true,
                        });
                }
            } else {
                if (options?.isAction)
                    ui.notifications.warn("Haymaker cannot be combined with another maneuver (except for Strike).", {
                        localize: true,
                    });
            }
        }
    }

    // WEAPON MASTER (also check that item is present as a custom ADDER)
    if (item.actor) {
        const WEAPON_MASTER = item.actor.items.find((o) => o.system.XMLID === "WEAPON_MASTER");
        if (WEAPON_MASTER) {
            const weaponMatch = (WEAPON_MASTER.system.ADDER || []).find(
                (o) => o.XMLID === "ADDER" && o.ALIAS === item.name,
            );
            if (weaponMatch) {
                const dcPlus = 3 * Math.max(1, parseInt(WEAPON_MASTER.system.LEVELS) || 1);
                const masterDc = RoundDc(dcPlus * apRatio);
                dc += masterDc;
                tags.push({
                    value: `${getDiceFormulaFromItemDC(item, masterDc)}`,
                    name: "WeaponMaster",
                    title: `${dcPlus.signedString()}DC${
                        masterDc != dcPlus
                            ? `\n${getDiceFormulaFromItemDC(item, dcPlus)} reduced to ${getDiceFormulaFromItemDC(
                                  item,
                                  masterDc,
                              )} due to advantages`
                            : ""
                    }`,
                });
            }
        }
    }

    // DEADLYBLOW
    // Only check if it has been turned off

    const DEADLYBLOW = item.actor?.items.find((o) => o.system.XMLID === "DEADLYBLOW");
    if (DEADLYBLOW) {
        item.system.conditionalAttacks ??= {};
        item.system.conditionalAttacks[DEADLYBLOW.id] = DEADLYBLOW;
        item.system.conditionalAttacks[DEADLYBLOW.id].system.checked ??= true;
    }

    if (item.actor) {
        for (const key in item.system.conditionalAttacks) {
            const conditionalAttack = item.actor.items.find((o) => o.id === key);
            if (!conditionalAttack) {
                // Quench and other edge cases where item.id is null
                if (item.id) {
                    console.warn("conditionalAttack is empty");
                    delete item.system.conditionalAttacks[key];
                    // NOTE: typically we await here, but this isn't an async function.
                    // Shouldn't be a problem.
                    item.update({
                        [`system.conditionalAttacks`]: item.system.conditionalAttacks,
                    });
                }
                continue;
            }

            // If unchecked or missing then assume it is enabled
            if (!conditionalAttack.system.checked) continue;

            // Make sure conditionalAttack applies (only for DEADLYBLOW at the moment)
            if (typeof conditionalAttack.baseInfo?.appliesTo === "function") {
                if (!conditionalAttack.baseInfo.appliesTo(item)) continue;
            }

            switch (conditionalAttack.system.XMLID) {
                case "DEADLYBLOW": {
                    if (!options?.ignoreDeadlyBlow) {
                        const dcPlus = 3 * Math.max(1, parseInt(conditionalAttack.system.LEVELS) || 1);
                        const deadlyDc = RoundDc(dcPlus * apRatio);
                        dc += deadlyDc;
                        tags.push({
                            value: `${getDiceFormulaFromItemDC(item, deadlyDc)}`,
                            name: "DeadlyBlow",
                            title:
                                conditionalAttack.system.OPTION_ALIAS +
                                `${
                                    deadlyDc != dcPlus
                                        ? `\n${getDiceFormulaFromItemDC(
                                              item,
                                              dcPlus,
                                          )} reduced to ${getDiceFormulaFromItemDC(item, deadlyDc)} due to advantages`
                                        : ""
                                }`,
                        });
                    }

                    break;
                }
                default:
                    console.warn("Unhandled conditionalAttack", conditionalAttack);
            }
        }
    }

    if (item.actor?.statuses?.has("underwater")) {
        dc = Math.max(0, dc - 2);
        tags.push({ value: `-2DC`, name: "Underwater" });
    }

    // Max Killing Doubling Damage
    // A character cannot more than
    // double the Damage Classes of his base attack, no
    // matter how many different methods he uses to add
    // damage.

    const DoubleDamageLimit = game.settings.get(HEROSYS.module, "DoubleDamageLimit");
    if (DoubleDamageLimit) {
        // BaseDC
        let baseDC = baseDcParts.str;
        if (["HA", "HKA"].includes(item.system.XMLID) || item.system.CATEGORY === "Hand To Hand") {
            baseDC = baseDcParts.item;
        }
        if (item.system.XMLID === "MANEUVER" && !item.type.USEWEAPON) {
            baseDC += extraDcLevels;
        }

        // NOTE: baseDC > 0 is not great - need to consider things with effect rolls like mind scan and illusions
        if (baseDC > 0 && dc > baseDC * 2) {
            const backOutDc = Math.floor(baseDC * 2 - dc);
            tags.push({
                value: `${backOutDc}DC`,
                name: "DoubleDamageLimit",
                title: `BASEDC=${baseDC}. DC=${dc}. ${game.i18n.localize("Settings.DoubleDamageLimit.Hint")}`,
            });
            dc = Math.max(0, dc + backOutDc);
        }
    }

    // Programmer warning
    // if (dc <= 0) {
    //     console.warn("DC <= 0", dc, item);
    // }

    return { dc: dc, tags: tags, end: end };
}

/**
 * This is not perfect as it has to make a guess at if the 2 DC chunks are a 1/2d6 or 1d6-1. Make a guess by looking
 * at the extraDice for a hint if available. Otherwise default to 1/2d6
 */
// TODO: Does 0.2, 0.5, and 1 as partials for 5AP/DC scale correctly when the costs are > 5AP/die?/
export function calculateDiceFormulaParts(item, dc) {
    const usesDieLessOne = item.system.extraDice === "one-pip";
    let d6Count = 0;
    let halfDieCount = 0;
    let constant = 0;

    if (dc) {
        // Normal Attack
        if (!item.system.killing) {
            // NOTE: This is ugly because with floating point calculations we need to use epsilon comparisons (see https://randomascii.wordpress.com/2012/02/25/comparing-floating-point-numbers-2012-edition/ for instance)
            //       However due to the fact that Number.EPSILON doesn't scale based on input we're going to make our tolerances based on the fact that we
            //       can only have 3 possible values x.0, x.2, and x.5 for any whole number x >= 0. If we make our epsilon 0.1 it'll more than do for
            //       values of x < a few million.
            const ourEpsilon = 0.1;

            d6Count = Math.floor(dc);
            // d3Count = DC % 1 >= 0.5 ? 1 : 0
            halfDieCount = (dc % 1) - 0.5 >= -ourEpsilon ? 1 : 0;
            // constant = (DC % 1 >= 0.2 && DC % 1 < 0.5) ? 1 : 0
            constant = (dc % 1) - 0.2 >= -ourEpsilon && (dc % 1) - 0.5 < -ourEpsilon ? 1 : 0;
        }

        // Killing Attack
        else {
            d6Count = Math.floor(dc / 3);
            halfDieCount = Math.floor((dc % 3) / 2);
            constant = Math.floor((dc % 3) % 2);
        }
    }

    return {
        isKilling: item.system.killing,
        d6Count,
        halfDieCount: usesDieLessOne ? 0 : halfDieCount,
        d6Less1DieCount: usesDieLessOne ? halfDieCount : 0,
        constant,
    };
}

export function getDiceFormulaFromItemDC(item, DC) {
    const formulaParts = calculateDiceFormulaParts(item, DC);

    return `${
        formulaParts.d6Count + formulaParts.d6Less1DieCount + formulaParts.halfDieCount > 0
            ? `${
                  formulaParts.d6Count + formulaParts.d6Less1DieCount
                      ? `${formulaParts.d6Count + formulaParts.d6Less1DieCount}`
                      : ""
              }${formulaParts.halfDieCount ? `½` : ""}d6`
            : ""
    }${
        formulaParts.constant
            ? formulaParts.d6Count + formulaParts.d6Less1DieCount + formulaParts.halfDieCount > 0
                ? "+1"
                : "1"
            : `${formulaParts.d6Less1DieCount > 0 ? "-1" : ""}`
    }`;
}

export function CombatSkillLevelsForAttack(item) {
    let results = [];

    // Guard
    if (!item.actor) return results;

    const cslSkills = item.actor.items.filter(
        (o) =>
            ["MENTAL_COMBAT_LEVELS", "COMBAT_LEVELS"].includes(o.system.XMLID) &&
            (o.system.ADDER || []).find((p) => p.ALIAS === item.system.ALIAS || p.ALIAS === item.name) &&
            o.isActive != false,
    );

    for (const cslSkill of cslSkills) {
        let result = {
            ocv: 0,
            dcv: 0,
            dmcv: 0,
            omcv: 0,
            dc: 0,
            skill: cslSkill,
        };

        if (result.skill && result.skill.system.csl) {
            for (let i = 0; i < parseInt(result.skill.system.LEVELS || 0); i++) {
                result[result.skill.system.csl[i]] = (result[result.skill.system.csl[i]] || 0) + 1;
            }
            result.item = result.skill;

            // Takes 2 CLS for +1 DC
            result.dc = Math.floor(result.dc / 2);

            results.push(result);
        }
    }

    return results;
}

export function PenaltySkillLevelsForAttack(item) {
    let results = [];

    // Guard
    if (!item.actor) return results;

    const psls = item.actor.items.filter(
        (o) =>
            ["PENALTY_SKILL_LEVELS"].includes(o.system.XMLID) &&
            (o.system.ADDER || []).find((p) => p.ALIAS === item.system.ALIAS || p.ALIAS === item.name) &&
            o.isActive != false,
    );

    return psls;
}
