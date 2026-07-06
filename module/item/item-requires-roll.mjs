import { HEROSYS } from "../herosystem6e.mjs";

import { HeroRoll, HeroRoller } from "../heroRoller/dice.mjs";
import { calculateDicePartsForItem } from "../utility/damage.mjs";
import { roundFavorPlayerTowardsZero } from "../utility/round.mjs";
import { doSuccessRoll, emphasizeSuccessFailureFlavour, generateSuccessChatCard } from "../utility/success-card.mjs";
import { tokenEducatedGuess } from "../utility/util.mjs";

const BACKGROUND_SKILL_XMLID_TO_KEY = Object.freeze({
    KNOWLEDGE_SKILL: "KS",
    PROFESSIONAL_SKILL: "PS",
    SCIENCE_SKILL: "SS",
});

const RSR_ROLL_TYPE = Object.freeze({
    ACTIVATION_ROLL: "activation roll",
    ATTACK_ROLL: "attack roll",
    CHARACTERISTIC_ROLL: "characteristic roll",
    LUCK_ROLL: "luck roll",
    ITEM_ROLL: "item roll", // Skill, background skill, power
});

const RSR_ROLL_CATEGORY = Object.freeze({
    ATTACK: "attack category",
    BACKGROUNDSKILL: "background category",
    CHAR: "characteristic category",
    PER: "perception category",
    SKILL: "skill category",
});

const TYPE_TO_ROLL_TYPE = Object.freeze({
    0: RSR_ROLL_CATEGORY.SKILL,
    1: RSR_ROLL_CATEGORY.BACKGROUNDSKILL,
    2: RSR_ROLL_CATEGORY.CHAR,
    3: RSR_ROLL_CATEGORY.PER,
});

function filterOutNonSkillRollItems(item) {
    if (!item.isRollable()) {
        return false;
    }

    return (
        item.baseInfo?.type?.includes("skill") && // is a skill
        !item.baseInfo?.type?.includes("enhancer") && // is not an enhancer (scholar, scientist, etc.)
        item.system.XMLID !== "SKILL_LEVELS" && // is not a bonus to skills
        item.system.XMLID !== "COMBAT_LEVELS" // is not a bonus to combat
    );
}

/**
 * Narrow down an array of skills to the one chosen skill.
 * If there is just one skill in the array (a non variable RSR) then it's simple and you shouldn't call this function.
 * If there are more than one skill, then prompt the user and have them decide.
 *
 * @param {Array<Object>} skillArray
 *
 * @returns {Object | null} - returns the info about the item that is selected or null if the user has chosen to cancel the operation at this point by closing the dialog.
 */
async function userSelectsASkill(skillArray) {
    const radios = skillArray
        .map(
            (skillObject, i) => `
                <label style="display:flex; align-items:center; gap:0.5em; margin-bottom:4px;">
                <input type="radio" name="skill" value="${i}" ${i === 0 ? "checked" : ""}>
                ${skillObject.name}${skillObject.activeItems.length === 0 ? ` (has no active items)` : ""}
                </label>
            `,
        )
        .join("");

    const arrayIndex = await foundry.applications.api.DialogV2.wait({
        window: { title: "Choose Your Variable Skill" },
        content: `<fieldset><legend>Skills</legend>${radios}</fieldset>`,
        buttons: [
            {
                action: "choose",
                label: "Confirm",
                default: true,
                callback: (event, button) => button.form.elements.skill.value,
            },
        ],
        rejectClose: false, // returns null instead of throwing if the user closes the dialog
    });

    // null is returned if the user is closing the dialog.
    return arrayIndex == null ? null : skillArray[arrayIndex];
}

/**
 * Test Only version of userSelectsASkill: Narrow down an array of skills to the one chosen skill.
 * If there is just one skill in the array (a non variable RSR) then it's simple.
 * If there are more than one skill, then prompt the user and have them decide.
 *
 * @param {Array<Object>} skillArray
 * @param {Number | null} selectedIndex
 *
 * @returns {Object | null} - returns the info about the item that is selected or null if the user has chosen to cancel the operation at this point by closing the dialog.
 */
async function testOnlyUserSelectsASkill(skillArray, arrayIndex) {
    // null is returned if the user is closing the dialog.
    return arrayIndex == null ? null : skillArray[arrayIndex];
}

/**
 * Extract skill items from the actor for a given roll alias. There can be multiple skills in the case of 5e variable skills but typically will be only 1.
 *
 * @param {HeroSystem6eActor} actor
 * @param {String} rollAlias
 * @param {Boolean} wantBackgroundSkill
 *
 * @returns {Array<Object>} - Array of skill objects
 */
function extractSkills(actor, rollAlias, wantBackgroundSkill) {
    const variableSkillsAliasMatch = rollAlias.match(/^([\S\s]+?)((?:\s+or\s+)([\S\s]+))?$/i);
    if (variableSkillsAliasMatch == null) {
        console.error(`RSR extractSkills: ${rollAlias} didn't match regex`);
        return [
            {
                name: rollAlias,
                wantBackgroundSkill: wantBackgroundSkill,
                activeItems: [],
                items: [],
            },
        ];
    }

    const requiredSkillNames = [variableSkillsAliasMatch[1]];

    // Is this a variable roll alias with 2 skills separated by " or ".
    if (variableSkillsAliasMatch[3] != null) {
        requiredSkillNames.push(variableSkillsAliasMatch[3]);
    }

    return requiredSkillNames.map((requiredSkillName) => {
        const skillItems = findSkills(actor, requiredSkillName);

        return {
            name: requiredSkillName,
            wantBackgroundSkill: wantBackgroundSkill,
            activeItems: skillItems.filter((skill) => skill.isActive),
            items: skillItems,
        };
    });
}

function findSkills(actor, skillName) {
    const skillsToMatchAgainst = actor.items.filter(filterOutNonSkillRollItems);

    // Case insensitive comparison
    return skillsToMatchAgainst.filter(
        (potentialMatchingSkillItem) => potentialMatchingSkillItem.name.toLowerCase() === skillName.toLowerCase(),
    );
}

/**
 * What is the penalty divisor? -1 per X AP.
 *
 * NOTE: Do not call unless it is appropriate for the type of roll (i.e. don't call for activation roll)
 *
 * @param {HeroModifierModel } rar
 *
 * @returns {number}
 */
function findRollDivisor(rar) {
    // modifiers are different based on 5e or 6e
    if (rar.parent.is5e) {
        const divisorOption = rar.adders.find((adder) => {
            return adder.XMLID === "MINUS1PER20" || adder.XMLID === "MINUS1PER5" || adder.XMLID === "NOAPPENALTY";
        });

        if (divisorOption?.XMLID === "MINUS1PER20") {
            return 20;
        } else if (divisorOption?.XMLID === "MINUS1PER5") {
            return 5;
        } else if (divisorOption?.XMLID === "NOAPPENALTY") {
            return 0;
        }

        // No AP penalty option means -1 per 10 AP
        return 10;
    } else {
        // item.activePoints is a number
        if (rar.OPTIONID.includes("1PER5")) {
            return 5;
        } else if (rar.OPTIONID.includes("1PER20")) {
            return 20;
        }

        // activation rolls have no minuses due to active points
        if (!isNaN(parseInt(rar.OPTIONID, 10))) {
            return 0;
        }

        // No AP penalty option means -1 per 10 AP
        return 10;
    }
}

function calculateRollApPenalty(item, rar) {
    const divisor = findRollDivisor(rar);
    if (divisor === 0) {
        return 0;
    }

    return roundFavorPlayerTowardsZero(item.activePoints / divisor);
}

function normalize5eTypeAndRollTarget(type, skillOrCharacteristic) {
    return {
        type: TYPE_TO_ROLL_TYPE[type] ?? `type ${type} not translated properly`,
        target: skillOrCharacteristic.trim(),
    };
}

/**
 * Given a rar, extract out all the bits and pieces required to make 1 or more activation rolls. This transforms
 * 5e ACTIVATIONROLL and REQUIRESASKILLROLL XMLIDs and 6e REQUIRESASKILLROLL into an intermediate format that
 * avoids HDC's completely different approach to expressing the modifier between 5e and 6e.
 *
 * @param {HeroSystem6eItem} item
 * @param {HeroModifierModel} rar
 *
 * @returns {Object[]} - rolls required to fulfill the RAR in an intermediate format
 */
function getRollsForRar(item, rar) {
    const rollsToGenerate = [];

    if (item.is5e) {
        // 5e ACTIVATIONROLL or flat number 6e REQUIRESASKILLROLL?
        if (rar.XMLID === "ACTIVATIONROLL") {
            return [
                {
                    type: RSR_ROLL_TYPE.ACTIVATION_ROLL,
                    rollValue: parseInt(rar.OPTIONID),
                },
            ];
        }

        // 5e Luck roll?
        else if (rar.OPTIONID === "ONELUCK" || rar.OPTIONID === "TWOLUCK" || rar.OPTIONID === "THREELUCK") {
            const numSuccessesRequired = rar.OPTIONID === "ONELUCK" ? 1 : rar.OPTIONID === "TWOLUCK" ? 2 : 3;
            return [
                {
                    type: RSR_ROLL_TYPE.LUCK_ROLL,
                    successesRequired: numSuccessesRequired,
                    activeItems: item.actor.items.filter((item) => item.system.XMLID === "LUCK" && item.isActive),
                    items: item.actor.items.filter((item) => item.system.XMLID === "LUCK"),
                },
            ];
        }

        // 5e 2 rolls
        else if (rar.OPTIONID === "TWOROLLS") {
            // This can be a variable roll where the user gets to decide between 2 provided rolls - potentially for each of the rolls.
            // If this is the case, it will have rar.adder[].XMLID === "VARIABLERSR" somewhere. All options, however, are jammed into the rar.
            rollsToGenerate.push(normalize5eTypeAndRollTarget(rar.TYPE, rar.ROLLALIAS || rar.CHARACTERISTIC));
            rollsToGenerate.push(normalize5eTypeAndRollTarget(rar.TYPE2, rar.ROLLALIAS2 || rar.CHARACTERISTIC2));
        }

        // 5e 1 roll
        else if (rar.OPTIONID === "BASICRSR") {
            // This can be a variable roll where the user gets to decide between 2 provided rolls.
            // If this is the case, it will have rar.adder[].XMLID === "VARIABLERSR" somewhere. All options, however, are jammed into the rar.
            rollsToGenerate.push(normalize5eTypeAndRollTarget(rar.TYPE, rar.ROLLALIAS || rar.CHARACTERISTIC));
        }

        // FIXME: OPTIONID= attack roll doesn't seem to exist in HDC but does in the 5e rules (although it's not well defined). It does exist in 6e

        // 5e Unknown OPTIONID
        else {
            console.error(`Unknown 5e RSR ${rar.OPTIONID}`);
        }
    }

    // 6e
    else {
        // 6e activation roll
        const isOnlyDigits = /^\d+$/.test(rar.OPTIONID);
        if (isOnlyDigits) {
            return [
                {
                    type: RSR_ROLL_TYPE.ACTIVATION_ROLL,
                    rollValue: parseInt(rar.OPTIONID),
                },
            ];
        }

        // 6e Skills and background skills
        else if (rar.OPTIONID === "SKILL" || rar.OPTIONID === "SKILL1PER5" || rar.OPTIONID === "SKILL1PER20") {
            rollsToGenerate.push({ type: RSR_ROLL_CATEGORY.SKILL, target: rar.COMMENTS });
        } else if (
            rar.OPTIONID === "KS" ||
            rar.OPTIONID === "KS1PER5" ||
            rar.OPTIONID === "KS1PER20" ||
            rar.OPTIONID === "PS" ||
            rar.OPTIONID === "PS1PER5" ||
            rar.OPTIONID === "PS1PER20" ||
            rar.OPTIONID === "SS" ||
            rar.OPTIONID === "SS1PER5" ||
            rar.OPTIONID === "SS1PER20"
        ) {
            rollsToGenerate.push({
                type: RSR_ROLL_CATEGORY.BACKGROUNDSKILL,
                target: rar.COMMENTS,
            });
        }

        // 6e Characteristics
        else if (rar.OPTIONID === "CHAR") {
            rollsToGenerate.push({ type: RSR_ROLL_CATEGORY.CHAR, target: rar.COMMENTS });
        }

        // 6e perception
        else if (rar.OPTIONID === "PER" || rar.OPTIONID === "PER1PER5" || rar.OPTIONID === "PER1PER20") {
            rollsToGenerate.push({ type: RSR_ROLL_CATEGORY.PER, target: null });
        }

        // 6e attack roll
        else if (rar.OPTIONID === "ATTACK" || rar.OPTIONID === "ATTACK1PER5" || rar.OPTIONID === "ATTACK1PER20") {
            rollsToGenerate.push({ type: RSR_ROLL_CATEGORY.ATTACK, target: null });
        }

        // 6e unknown OPTIONID
        else {
            console.error(`Unknown 6e RSR ${rar.OPTIONID}`);
        }
    }

    return rollsToGenerate.map((rollToGenerate) => {
        switch (rollToGenerate.type) {
            case RSR_ROLL_CATEGORY.ATTACK: {
                // PH: FIXME: Nothing required?
                return {
                    type: RSR_ROLL_TYPE.ATTACK_ROLL,
                };
            }

            case RSR_ROLL_CATEGORY.BACKGROUNDSKILL:
            case RSR_ROLL_CATEGORY.SKILL: {
                const requiredSkills = extractSkills(
                    item.actor,
                    rollToGenerate.target,
                    rollToGenerate.type === RSR_ROLL_CATEGORY.BACKGROUNDSKILL,
                );

                return {
                    type: RSR_ROLL_TYPE.ITEM_ROLL,
                    requiredSkills: requiredSkills,
                };
            }

            case RSR_ROLL_CATEGORY.CHAR:
                return {
                    type: RSR_ROLL_TYPE.CHARACTERISTIC_ROLL,
                    characteristicKey: rollToGenerate.target,
                };

            case RSR_ROLL_CATEGORY.PER: {
                return {
                    type: RSR_ROLL_TYPE.ITEM_ROLL,
                    requiredSkills: [
                        {
                            name: "PERCEPTION",
                            wantBackgroundSkill: false,
                            activeItems: item.actor.items.filter(
                                (item) => item.system.XMLID === "PERCEPTION" && item.isActive,
                            ),
                            items: item.actor.items.filter((item) => item.system.XMLID === "PERCEPTION"),
                        },
                    ],
                };
            }

            default: {
                const error = `${item.detailedName()} has unhandled RSR for OPTIONID ${rar.OPTIONID} -> ${rollToGenerate.type}`;
                console.error(error);
                return {
                    type: RSR_ROLL_TYPE.ITEM_ROLL,
                    requiredSkills: [
                        {
                            name: error,
                            wantBackgroundSkill: false,
                            activeItems: [],
                            items: [],
                        },
                    ],
                };
            }
        }
    });
}

const VALIDATE_SECTION_DEFENSE_ERROR_REASON = Object.freeze({
    NO_COMMENT: "no comment",
    NOT_DECLARATION: "not sectional defense declaration",
    INVALID_RANGE: "sectional defense declaration range invalid",
});

/**
 *
 * @param {HeroSystem6eItem} item
 * @param {string} potentialSectionalComment
 *
 * @returns {{ valid: boolean, reason?: string, sectionalDefenseLocationsSet?: Set }} - returns validation result with location Set on success or error reason on failure
 */
function validateSectionalComments(item, potentialSectionalComment) {
    // Are there comments that could be sectional instructions?
    if (!potentialSectionalComment) {
        return { valid: false, reason: VALIDATE_SECTION_DEFENSE_ERROR_REASON.NO_COMMENT };
    }

    // Are there sectional instructions that we understand?
    const sectionalRangeComment = potentialSectionalComment.trim().match(/^locations? (.*)$/i);
    if (!sectionalRangeComment) {
        return { valid: false, reason: VALIDATE_SECTION_DEFENSE_ERROR_REASON.NOT_DECLARATION };
    }

    // Are the locations provided reasonable (i.e. is it composed of digits, commas, dashes, and whitespace)?
    const sectionalLocationString = sectionalRangeComment[1].replaceAll("and", "");
    if (sectionalLocationString.search(/[^0-9,\-\s]/) !== -1) {
        return { valid: false, reason: VALIDATE_SECTION_DEFENSE_ERROR_REASON.INVALID_RANGE };
    }

    // Do the ranges appear to be within the 3-18 hit location range?
    const sectionalDefenseLocationsSet = new Set();
    const splitSectionalRanges = sectionalLocationString.split(",");
    for (const rangeChunk of splitSectionalRanges) {
        // rangeChunk can be a single value or a range separated by "-". If a single value, then startEndRange will be length 1.
        const startEndRange = rangeChunk.trim().split("-");
        const first = startEndRange[0] ? parseInt(startEndRange[0]) : null;
        const second = startEndRange[1] ? parseInt(startEndRange[1]) : null;

        if (startEndRange.length === 1) {
            // Is it a valid range declaration chunk
            if (first >= 3 && first <= 18) {
                sectionalDefenseLocationsSet.add(first);
                continue;
            }
        } else if (startEndRange.length === 2) {
            // First index of range doesn't have to be start.
            const start = first < second ? first : second;
            const end = first < second ? second : first;

            // Is it a valid range declaration chunk
            if (start >= 3 && end <= 18) {
                for (let i = start; i <= end; ++i) {
                    sectionalDefenseLocationsSet.add(i);
                }
                continue;
            }
        }

        return { valid: false, reason: VALIDATE_SECTION_DEFENSE_ERROR_REASON.INVALID_RANGE };
    }

    return { valid: true, sectionalDefenseLocationsSet };
}

/**
 *
 * @param {Set} sectionalDefenseLocationsSet - A set of all hit locations which provide a defense
 * @param {number} hitLocationNum
 *
 * @returns {boolean} - boolean value indicating the hitLocationNum is within the sectionalDefenseRanges
 */
function doSectionalDefensesApply(sectionalDefenseLocationsSet, hitLocationNum) {
    // PH: FIXME: Low shots (special hit location) can generate a hit location of 19. This is supposed to be treated as
    // a hit of foot. However, we don't have a dialog that allows this translation so it's possible we'll
    // have a hit location of 19 carried through to here. Translate it to 18 (feet).
    const locationNum = hitLocationNum === 19 ? 18 : hitLocationNum;

    if (sectionalDefenseLocationsSet.has(locationNum)) {
        return true;
    }

    return false;
}

/**
 *
 * @param {HeroSystem6eItem} item
 * @param {Object} options
 *
 * @returns {Boolean} - success
 */
export async function isActivatedForThisUse(item, options) {
    // PH: FIXME: options to be removed.
    return isActivatedForThisUseInternal(item, HeroRoll, options);
}

export async function isActivatedForThisUse_TestingOnly(item, rollClass, options) {
    return isActivatedForThisUseInternal(item, rollClass, options);
}

async function isActivatedForThisUseInternal(item, rollClass, options) {
    const rar = item.modifiers.find((o) => o.XMLID === "REQUIRESASKILLROLL" || o.XMLID === "ACTIVATIONROLL");
    if (!rar) {
        return true;
    }

    const actor = item.actor;
    const token = options.token ?? tokenEducatedGuess({ actor });
    const speaker = ChatMessage.getSpeaker({ actor, token });

    // An item with an activation roll/requires a skill roll/requires a roll can take up to 2 consecutive rolls. Figure
    // out what we're actually rolling for.
    const activationRolls = getRollsForRar(item, rar);

    // Make sure all skill items require for the activation roll(s) exist on this character and are active before attempting
    // any rolls.
    for (const activationRoll of activationRolls) {
        // If this is a variable skill roll (i.e. user choosing between two skills depending on the situation), have the user select the chosen skill before the resources are paid.
        if (activationRoll.type === RSR_ROLL_TYPE.ITEM_ROLL && activationRoll.requiredSkills.length > 1) {
            const requiredSkill =
                options?.test?.variableSelectIndex === undefined
                    ? await userSelectsASkill(activationRoll.requiredSkills)
                    : await testOnlyUserSelectsASkill(activationRoll.requiredSkills, options.test.variableSelectIndex);

            // Has the user cancelled the action at this point?
            if (requiredSkill == null) {
                ui.notifications.info(`${item.name} roll aborted during variable skill selection.`);
                return false;
            }

            activationRoll.requiredSkills = [requiredSkill];
        }

        // PH: FIXME: ATTACK_ROLL needs to be considered

        // LUCK_ROLL and ITEM_ROLL must have at least 1 active skill
        if (
            (activationRoll.type === RSR_ROLL_TYPE.LUCK_ROLL && activationRoll.activeItems.length === 0) ||
            (activationRoll.type === RSR_ROLL_TYPE.ITEM_ROLL &&
                activationRoll.requiredSkills[0].activeItems.length === 0)
        ) {
            const flavor = `${item.name} activation ${emphasizeSuccessFailureFlavour(false, `failed as there is no matching active item for the ${activationRoll.type}.`)}`;
            await generateSuccessChatCard(actor, speaker, flavor, null, null);

            return false;
        } else if (
            activationRoll.type === RSR_ROLL_TYPE.CHARACTERISTIC_ROLL &&
            !item.actor.hasCharacteristic(activationRoll.characteristicKey)
        ) {
            const flavor = `${item.name} activation ${emphasizeSuccessFailureFlavour(false, `failed as ${actor.name} does not have the ${activationRoll.characteristicKey} characteristic.`)}`;
            await generateSuccessChatCard(actor, speaker, flavor, null, null);

            return false;
        } else if (activationRoll.type === RSR_ROLL_TYPE.ACTIVATION_ROLL) {
            // PH: FIXME: Should probably sanity here for sectional defenses
        }
    }

    // PH: FIXME: Need to pay the activation resource cost of the RAR skills/char/etc

    // Perform the rolls. Because a roll might consume resources we must perform all rolls (i.e. invoke all skills etc)
    // and then evaluate if there was success.
    const rollPromises = activationRolls.map(async (activationRoll) => {
        const roller = new HeroRoller({}, rollClass);
        let succeeded = false;
        let flavor;

        if (activationRoll.type === RSR_ROLL_TYPE.ACTIVATION_ROLL) {
            // Sectional Defense takes precedence over a standard activation roll.
            const sectionalDefenseActivationRollModifier =
                item.modifiers.find((o) => o.XMLID === "ACTIVATIONROLL") ?? item.findModsByXmlid("EVERYPHASE")?.parent;
            if (options.hitLocationNum && sectionalDefenseActivationRollModifier) {
                const { valid: validSectionalComment, sectionalDefenseLocationsSet } = validateSectionalComments(
                    item,
                    sectionalDefenseActivationRollModifier.COMMENTS,
                );

                // Do we have valid ranges defined and are hit locations turned on? If not, then sectional defense don't make sense to consider.
                if (validSectionalComment && game.settings.get(HEROSYS.module, "hit locations")) {
                    const sectionalDefenseApply = doSectionalDefensesApply(
                        sectionalDefenseLocationsSet,
                        options.hitLocationNum,
                    );

                    const flavor = `The sectional defense from ${item.name} ${emphasizeSuccessFailureFlavour(sectionalDefenseApply, `${sectionalDefenseApply ? "applied" : "does not apply"} to hit location ${options.hitLocationNum}.`)}`;
                    await generateSuccessChatCard(actor, speaker, flavor, null, null);

                    return sectionalDefenseApply;
                }
            }

            // Regular plain activation roll
            roller.makeSuccessRoll(true, activationRoll.rollValue).addDice(3);

            const { succeeded: succeed, flavor: updatedFlavor } = await doSuccessRoll(
                actor,
                roller,
                `${item.name} activation`,
            );
            succeeded = succeed;
            flavor = updatedFlavor;
        } else if (activationRoll.type === RSR_ROLL_TYPE.LUCK_ROLL) {
            const luckPower = activationRoll.activeItems[0]; // PH: FIXME: Kludge. How do we best handle multiple luck powers?
            const { diceParts } = calculateDicePartsForItem(luckPower, {});

            roller.makeLuckRoll().addDice(diceParts.d6Count >= 1 ? diceParts.d6Count : 0);

            await roller.roll();

            const luckTotal = roller.getLuckTotal();
            const luckOption = rar.OPTIONID;
            let requiredLuck;
            if (luckOption === "ONELUCK") {
                requiredLuck = 1;
            } else if (luckOption === "TWOLUCK") {
                requiredLuck = 2;
            } else if (luckOption === "THREELUCK") {
                requiredLuck = 3;
            } else {
                requiredLuck = 100;
                console.error(`${item.detailedName()} has unknown luck option ${luckOption}`);
            }

            succeeded = luckTotal >= requiredLuck;

            flavor = `${item.name} activation <span class="${succeeded ? "announce-success" : "announce-failure"}">${succeeded ? "succeeded" : "failed"} by ${Math.abs(luckTotal - requiredLuck)} levels of luck.</span>`;
        } else if (activationRoll.type === RSR_ROLL_TYPE.CHARACTERISTIC_ROLL) {
            const charKey = activationRoll.characteristicKey.toLowerCase();
            const characteristic = actor.system.characteristics[charKey];
            const baseRequiredRoll = characteristic.roll;
            const apPenalty = calculateRollApPenalty(item, rar);
            const divisor = findRollDivisor(rar);

            // PH: FIXME: what about additional skill levels used to influence the activation roll?
            // PH: FIXME: not including penalties in an obvious way ... should also include the tags for them
            roller
                .makeSuccessRoll(true, baseRequiredRoll, `Base ${charKey} roll`)
                .addDice(3)
                .addNumber(
                    apPenalty,
                    `AP penalty`,
                    `${item.activePoints} AP / ${divisor} -> ${apPenalty.signedString()}`,
                );

            const { succeeded: succeed, flavor: updatedFlavor } = await doSuccessRoll(
                actor,
                roller,
                `${item.name} activation`,
            );
            succeeded = succeed;
            flavor = updatedFlavor;
        } else if (activationRoll.type === RSR_ROLL_TYPE.ITEM_ROLL) {
            // At this point there should be only 1 requiredSkills entry
            const skill = activationRoll.requiredSkills[0].activeItems[0]; // PH: FIXME: Kludge. How do we best handle multiple powers of the same type?
            const baseRequiredRoll = parseInt(skill.system.roll);
            const apPenalty = calculateRollApPenalty(item, rar);
            const divisor = findRollDivisor(rar);

            // PH: FIXME: what about additional skill levels used to influence the activation roll? Can they apply to this?
            roller
                .makeSuccessRoll(true, baseRequiredRoll, `Base ${skill.name} roll`)
                .addDice(3)
                .addNumber(
                    apPenalty,
                    `AP Penalty`,
                    `${item.activePoints} AP / ${divisor} -> ${apPenalty.signedString()}`,
                );

            const { succeeded: succeed, flavor: updatedFlavor } = await doSuccessRoll(
                actor,
                roller,
                `${item.name} activation`,
            );
            succeeded = succeed;
            flavor = updatedFlavor;
        } else {
            console.error(`${item.detailedName()} has unknown type ${activationRoll.type} for requires roll modifier`);
        }

        // PH: FIXME: resource usage string should be built in here as this is what's consuming. Create functions so it can be done in a fixed way.
        await generateSuccessChatCard(actor, speaker, flavor, roller, `Spent ${options.resourcesUsedDescription}`);

        return succeeded;
    });

    const results = await Promise.all(rollPromises);

    // One failure is an overall failure
    return results.reduce((accum, result) => {
        return accum && result;
    });
}

// Probability, in %, of that number on 3d6
const HIT_LOCATION_PROBABILITY = Object.freeze({
    3: 0.46,
    4: 1.38,
    5: 2.77,
    6: 4.62,
    7: 6.94,
    8: 9.72,
    9: 11.57,
    10: 12.5,
    11: 12.5,
    12: 11.57,
    13: 9.72,
    14: 6.94,
    15: 4.62,
    16: 2.77,
    17: 1.38,
    18: 0.46,
});

// Probability, in %, of that number or less on 3d6
const DICE_CUMULATIVE_PROBABILITY = Object.freeze({
    3: 0.46,
    4: 1.85,
    5: 4.62,
    6: 9.25,
    7: 16.2,
    8: 25.92,
    9: 37.5,
    10: 50.0,
    11: 62.5,
    12: 74.07,
    13: 83.79,
    14: 90.74,
    15: 95.37,
    16: 98.14,
    17: 99.53,
    18: 100,
});

export function activationRollHeroValidation(modifier, item) {
    const validations = [];

    // Since sectional defenses are optional we can only check a subset of errors
    const sectionalDefenseRanges = validateSectionalComments(item, modifier.COMMENTS);
    if (!sectionalDefenseRanges.valid) {
        if (sectionalDefenseRanges.reason === VALIDATE_SECTION_DEFENSE_ERROR_REASON.INVALID_RANGE) {
            validations.push({
                property: "COMMENTS",
                message: sectionalDefenseRanges.reason,
                example: "locations 4-6, 8, and 10-12",
                severity: CONFIG.HERO.VALIDATION_SEVERITY.ERROR,
                modifierID: modifier.ID,
            });
        }
    } else {
        // A sectional defense only makes sense for a defense
        if (!item.baseInfo?.type.includes("defense")) {
            validations.push({
                property: undefined,
                message: `${item.detailedName()} should not have a sectional defense declaration as it is not a defensive power`,
                example: "Armor could be a sectional defense with locations 4-6, 8, and 10-12",
                severity: CONFIG.HERO.VALIDATION_SEVERITY.ERROR,
                modifierID: modifier.ID,
            });
        }

        // Check that the sectional defense description roughly matches the expected probability based on the limitation taken
        const activationRollLimitation = modifier.OPTIONID;
        const activationRollCumulativeProbability = DICE_CUMULATIVE_PROBABILITY[activationRollLimitation];
        let hitLocationCumulativeProbability = 0;
        for (const hitLocation of sectionalDefenseRanges.sectionalDefenseLocationsSet.values()) {
            hitLocationCumulativeProbability += HIT_LOCATION_PROBABILITY[hitLocation];
        }

        // If cumulative probability of hit locations is larger than the probability at the activation roll (with a 1% fuzz)
        // then this is "cheating" and the limitation should probably be bought down.
        if (hitLocationCumulativeProbability > activationRollCumulativeProbability + 1) {
            // What is a more reasonable activation roll number?
            let shouldBeLessThanValue = 18;
            for (let cumulativeValue = shouldBeLessThanValue - 1; cumulativeValue >= 3; --cumulativeValue) {
                if (DICE_CUMULATIVE_PROBABILITY[cumulativeValue] < hitLocationCumulativeProbability) {
                    break;
                }

                shouldBeLessThanValue = cumulativeValue;
            }

            validations.push({
                property: undefined,
                message: `${item.detailedName()}'s sectional defense declaration cumulative probability is ${hitLocationCumulativeProbability.toFixed(2)}% vs the matching limitation value's cumulative probability value of ${activationRollCumulativeProbability}%. This limitation should most likely be bought to ${shouldBeLessThanValue}-`,
                example: "A 14- activation roll should reflect a section defense declaration like: 3-5, 7-14, 16-18",
                severity: CONFIG.HERO.VALIDATION_SEVERITY.WARNING,
                modifierID: modifier.ID,
            });
        }
    }

    return validations;
}

export function requiresRollHeroValidation(modifier, item) {
    const validations = [];
    const activationRolls = getRollsForRar(item, modifier);

    // 5e 2 rolls requires GM permission
    if (activationRolls.length >= 2) {
        validations.push({
            message: `2 required skill rolls requires GM permission.`,
            severity: CONFIG.HERO.VALIDATION_SEVERITY.INFO,
            modifierID: modifier.ID,
        });
    }

    // Does the actor have the required powers/skills for the roll?
    for (const activationRoll of activationRolls) {
        // Only naked success rolls can be without a skill
        if (activationRoll.type === RSR_ROLL_TYPE.ITEM_ROLL) {
            // Do we have items that match?
            activationRoll.requiredSkills.forEach((requiredSkill) => {
                if (requiredSkill.items.length === 0) {
                    validations.push({
                        message: `Actor does not have the ${requiredSkill.name} skill to make the activation roll.`,
                        severity: CONFIG.HERO.VALIDATION_SEVERITY.ERROR,
                        modifierID: modifier.ID,
                    });
                } else {
                    // Do we have a cost mismatch between how the power was built and how it should have been built?
                    // PH: FIXME: has the same logic as evaluation that we only look at the first activeItem
                    const activeItemXmlid = requiredSkill.activeItems[0].system.XMLID;
                    const isActiveItemBackgroundSkill = !!BACKGROUND_SKILL_XMLID_TO_KEY[activeItemXmlid];
                    if (requiredSkill.wantBackgroundSkill !== isActiveItemBackgroundSkill) {
                        if (!requiredSkill.wantBackgroundSkill) {
                            validations.push({
                                message: `The requires a skill roll limitation was not bought using the background skill adder but ${requiredSkill.name} is a background skill and you have overpaid for ${activationRoll.name}.`,
                                severity: CONFIG.HERO.VALIDATION_SEVERITY.INFO,
                                modifierID: modifier.ID,
                            });
                        } else {
                            validations.push({
                                message: `The requires a skill roll limtiation was bought using the background skill adder but the ${requiredSkill.name} is not a background skill and you have underpaid for ${activationRoll.name}.`,
                                severity: CONFIG.HERO.VALIDATION_SEVERITY.WARNING,
                                modifierID: modifier.ID,
                            });
                        }
                    }
                }
            });
        } else if (activationRoll.type === RSR_ROLL_TYPE.LUCK_ROLL) {
            if (activationRoll.items.length === 0) {
                validations.push({
                    message: `Actor does not have a luck power to make the activation roll.`,
                    severity: CONFIG.HERO.VALIDATION_SEVERITY.ERROR,
                    modifierID: modifier.ID,
                });
            }

            // Should not have AP penalty on RSR against Luck (warn: just doesn't make sense and behaviour would be GM fiat)
            const luckRollHasApPenalty = findRollDivisor(modifier) !== 0;
            if (activationRoll.items.length > 0 && luckRollHasApPenalty) {
                validations.push({
                    message: `RSR that are based on luck should not have a penalty based on Active Points.`,
                    severity: CONFIG.HERO.VALIDATION_SEVERITY.WARNING,
                    modifierID: modifier.ID,
                });
            }
        } else if (activationRoll.type === RSR_ROLL_TYPE.CHARACTERISTIC_ROLL) {
            if (!item.actor.hasCharacteristic(activationRoll.characteristicKey)) {
                validations.push({
                    message: `Actor does not have the characteristic ${activationRoll.characteristicKey} to make the activation roll.`,
                    severity: CONFIG.HERO.VALIDATION_SEVERITY.ERROR,
                    modifierID: modifier.ID,
                });
            }
        } else if (activationRoll.type === RSR_ROLL_TYPE.ATTACK_ROLL) {
            // Should check if this actor type is capable of attack
            const actor = item.actor;
            if (actor?.type === "base2") {
                validations.push({
                    message: `Bases do not make attack rolls.`,
                    severity: CONFIG.HERO.VALIDATION_SEVERITY.ERROR,
                    modifierID: modifier.ID,
                });
            }
        } else if (activationRoll.type === RSR_ROLL_TYPE.ACTIVATION_ROLL) {
            validations.push(...activationRollHeroValidation(modifier, item));
        } else {
            console.error(`Unknown activation roll type ${activationRoll.type} for heroValidation.`);
        }
    }

    return validations;
}
