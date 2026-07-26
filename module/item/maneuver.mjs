import { HeroSystem6eActorActiveEffects } from "../actor/actor-active-effects.mjs";
import { HeroCompatibility } from "../utility/compatibility.mjs";
import { roundFavorPlayerTowardsZero } from "../utility/round.mjs";
import { calculateVelocityInSystemUnits } from "../utility/units.mjs";
import { dehydrateAttackItem, rehydrateAttackItem } from "./item-attack.mjs";

/**
 * Maneuvers have some rules of their own that should be considered.
 *
 * @param {*} actor
 * @param {*} item
 */
export async function enforceManeuverLimits() {
    //actor, item) {
    // const maneuverItems = actor.items.filter((e) => ["maneuver", "martialart"].includes(e.type));
    // AARON commented this out on 11/23/2025 as it messes with active.
    // This isn't enforcing any maneuver limits!
    // TODO: I don't believe you can set, brace, and haymaker, etc. so that is what we should be enforcing.
    //await item.update({ "system.active": !item.system.active });
}

// FIXME: DCV should only be effective against HTH attacks unless it's a Dodge
function addDcvTraitToChanges(maneuverDcvChange) {
    if (maneuverDcvChange !== 0) {
        return {
            key: "system.characteristics.dcv.max",
            value: maneuverDcvChange,
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            priority: CONFIG.HERO.ACTIVE_EFFECT_PRIORITY.ADD,
        };
    }
}

function addOcvTraitToChanges(maneuverOcvChange) {
    if (maneuverOcvChange !== 0) {
        return {
            key: "system.characteristics.ocv.max",
            value: maneuverOcvChange,
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            priority: CONFIG.HERO.ACTIVE_EFFECT_PRIORITY.ADD,
        };
    }
}

/**
 * Create flags that will allow us to expire effects on the next phase. If the item is an
 * original item then the item uuid will suffice otherwise the dehydrated item and actor uuid needs to be used
 *
 * @param {*} item
 * @returns
 */
function buildManeuverNextPhaseFlags(item) {
    return buildManeuverFlags(item, "maneuverNextPhaseEffect");
}

/**
 * Create flags that will allow us to expire effects on the next phase. If the item is an
 * original item then the item uuid will suffice otherwise the dehydrated item and actor uuid needs to be used
 *
 * @param {*} item
 * @returns
 */
// function buildManeuverNextSegmentFlags(item) {
//     return buildManeuverFlags(item, "maneuverNextSegementEffect");
// }

/**
 * Create flags that will allow us to expire effects on the next phase. If the item is an
 * original item then the item uuid will suffice otherwise the dehydrated item and actor uuid needs to be used
 *
 * @param {*} item
 * @param {string} type
 * @returns
 */
function buildManeuverFlags(item, type) {
    return {
        [game.system.id]: {
            type: type,
            itemUuid: item.uuid,
            toggle: item.isActivatable(),
            dehydratedManeuverItem: dehydrateAttackItem(item),
            dehydratedManeuverActorUuid: item.actor.uuid,
        },
    };
}

/**
 * Expires maneuver effects that last "until the character's next Phase" (Dodge, Block,
 * Brace, …) at the start of that Phase. Toggleable maneuvers are switched off through
 * their item so activation state stays in sync; loose effects are deleted. Effects
 * created at the current world time are kept — they were declared this instant.
 * Mirrors the legacy stack's _onStartTurn cleanup (combat.mjs) for the single stack.
 * @param {Actor} actor
 */
export async function expireManeuverNextPhaseEffects(actor) {
    // V14 migrated duration.startTime to the top-level start.time field; reading
    // only the V13 shape makes the created-this-instant guard never match there
    const effectStartTime = (ae) => ae.duration?.startTime ?? ae.start?.time ?? null;
    const maneuverAes = (actor?.temporaryEffects ?? []).filter(
        (ae) =>
            ae.flags?.[game.system.id]?.type === "maneuverNextPhaseEffect" &&
            effectStartTime(ae) !== game.time.worldTime,
    );

    const expiryPromises = maneuverAes.map((ae) => {
        const flags = ae.flags[game.system.id];
        if (flags?.toggle) {
            let maneuver = null;
            try {
                maneuver =
                    fromUuidSync(flags.itemUuid) ||
                    rehydrateAttackItem(flags.dehydratedManeuverItem, fromUuidSync(flags.dehydratedManeuverActorUuid))
                        .item;
            } catch (e) {
                console.warn(`Unable to resolve maneuver item for expiring effect ${ae.name}`, e);
            }
            if (maneuver?.isActive) return maneuver.toggle();
        }
        return ae.delete();
    });
    await Promise.all(expiryPromises);
}

/**
 * Things which have the "abort" trait in their effect can be aborted to.
 * @returns {boolean}
 */
export function maneuverCanBeAbortedTo(item) {
    const maneuverHasAbortTrait = item.system.EFFECT?.toLowerCase().indexOf("abort") > -1;
    return !!maneuverHasAbortTrait;
}

/**
 * Things which have the "Attacker Falls" trait in their effect.
 * @returns {boolean}
 */
export function maneuverHasAttackerFallsTrait(item) {
    const maneuverHasAttackerFallsTrait = item.system.EFFECT?.search(/you fall/i) > -1;
    return !!maneuverHasAttackerFallsTrait;
}

/**
 * Things which have the "Crush" trait in their effect.
 * @returns {boolean}
 */
export function maneuverHasBindTrait(item) {
    const maneuverHasBindTrait = item.system.EFFECT?.search(/bind/i) > -1;
    return maneuverHasBindTrait;
}

/**
 * Things which have the "block" trait in their effect. Need to be careful that we're not triggering on
 * the "Must Follow Block" trait in their effect.
 * @returns {boolean}
 */
export function maneuverHasBlockTrait(item) {
    const maneuverHasBlockTrait =
        item.system.EFFECT?.search(/block/i) > -1 && !(item.system.EFFECT?.search(/follow block/i) > -1);
    return maneuverHasBlockTrait;
}

/**
 * Things which have the "Crush" trait in their effect.
 * @returns {boolean}
 */
export function maneuverHasCrushTrait(item) {
    const maneuverHasCrushTrait = item.system.EFFECT?.search(/crush/i) > -1;
    return maneuverHasCrushTrait;
}

/**
 * Things which have the "disarm" trait in their effect.
 * @returns {boolean}
 */
export function maneuverHasDisarmTrait(item) {
    const maneuverHasDisarmTrait = item.system.EFFECT?.search(/disarm/i) > -1;
    return !!maneuverHasDisarmTrait;
}

/**
 * Things which have the "dodge" trait in their effect.
 * @returns {boolean}
 */
export function maneuverHasDodgeTrait(item) {
    const maneuverHasDodgeTrait = item.system.EFFECT?.search(/dodge/i) > -1;
    return !!maneuverHasDodgeTrait;
}

/**
 * Things which have the "flash dc" trait in their effect.
 * @returns {boolean}
 */
export function maneuverHasFlashEffectTrait(item) {
    const maneuverHasFlashTrait = item.system.EFFECT?.search(/\[FLASHDC\]/i) > -1;
    return !!maneuverHasFlashTrait;
}

/**
 * Things which have the "grab" trait in their effect.
 * @returns {boolean}
 */
export function maneuverHasGrabTrait(item) {
    const maneuverHasGrabTrait = item.system.EFFECT?.search(/grab/i) > -1;
    return !!maneuverHasGrabTrait;
}

/**
 * Things which have the "killing" damage trait in their effect.
 * @returns {boolean}
 */
export function maneuverHasKillingDamageTrait(item) {
    const maneuverHasKillingTrait = item.system.EFFECT?.search(/\[KILLINGDC\]/i) > -1;
    return !!maneuverHasKillingTrait;
}

/**
 * Things which have the "NND" damage trait in their effect.
 * @returns {boolean}
 */
export function maneuverHasNoNormalDefenseDamageTrait(item) {
    const maneuverHasNNDTrait = item.system.EFFECT?.search(/\[NNDDC\]/i) > -1;
    return !!maneuverHasNNDTrait;
}

/**
 * Things which have the "normal" damage trait in their effect.
 * @returns {boolean}
 */
export function maneuverHasNormalDamageTrait(item) {
    const maneuverHasNormalTrait = item.system.EFFECT?.search(/\[NORMALDC\]/i) > -1;
    return !!maneuverHasNormalTrait;
}

/**
 * Things which have the "Target Falls" trait in their effect.
 * @returns {boolean}
 */
export function maneuverHasTargetFallsTrait(item) {
    const maneuverHasTargetFallsTrait = item.system.EFFECT?.search(/target falls/i) > -1;
    return !!maneuverHasTargetFallsTrait;
}

/**
 * Things which have the "to resist Shove" trait in their effect.
 * @returns {boolean}
 */
export function maneuverHasRootTrait(item) {
    const maneuverHasRootTrait = item.system.EFFECT?.search(/to resist Shove/i) > -1;
    return !!maneuverHasRootTrait;
}

/**
 * Things which have the "shove" trait in their effect. Need to be careful that we're not triggering on
 * the "to resist Shove" (i.e. maneuverHasRootTrait) trait in their effect.
 * @returns {boolean}
 */
export function maneuverHasShoveTrait(item) {
    const maneuverHasShoveTrait =
        item.system.EFFECT?.search(/shove/i) > -1 && !(item.system.EFFECT?.search(/to resist Shove/i) > -1);
    return maneuverHasShoveTrait;
}

/**
 * Things which have the "Strike" trait in their effect.
 * @returns {boolean}
 */
export function maneuverHasStrikeTrait(item) {
    const maneuverHasStrikeTrait = item.system.EFFECT?.search(/strike/i) > -1;
    return !!maneuverHasStrikeTrait;
}

/**
 * Things which have the "velocity" trait in their effect.
 * @returns {boolean}
 */
export function maneuverHasVelocityTrait(item) {
    const maneuverHasVelocityTrait = item.system.EFFECT?.search(/v\/(\d+)/i) > -1;
    return !!maneuverHasVelocityTrait;
}

/**
 * Activates a combat or martial maneuver using 100% native V14 string-based expiry events.
 * @param {Item} item - The embedded maneuver item document instance
 * @param {object} [options={}] - Destructured options parameters configuration frame
 * @param {TokenDocument} [options.token] - The specific targeted Canvas Token instance context
 * @returns {Promise<ChatMessage|void>} The created ChatMessage document transaction or void
 */
export async function activateManeuver(item, { token } = {}) {
    const _effect = item.system.EFFECT?.toLowerCase() || "";
    const actor = item.actor;
    if (!actor) return;

    // 1. In-Combat Safety Check Guard
    if (actor.inCombat === false) {
        return ui.notifications.info(`${item.name} effects were not automated because ${actor.name} is not in combat.`);
    }

    // 2. Fetch configured expiry event token from item.baseInfo mapping
    const expiryEvent = item.baseInfo?.expiryEvent;
    if (!expiryEvent) {
        console.error(
            `Unsupported maneuver signature block or missing expiryEvent configuration for ${item.name || item.system.XMLID}`,
        );
        return;
    }

    const currentWorldTime = game.time.worldTime;
    const dcvBonus = parseInt(item.system.DCV?.replace("+", ""), 10) || 0;
    const ocvBonus = parseInt(item.system.OCV?.replace("+", ""), 10) || 0;

    const modifierChanges = [];
    if (dcvBonus !== 0) {
        modifierChanges.push({
            key: "system.characteristics.dcv.value",
            value: dcvBonus,
            mode: CONFIG.HERO.ACTIVE_EFFECT_MODES.ADD,
        });
    }
    if (ocvBonus !== 0) {
        modifierChanges.push({
            key: "system.characteristics.ocv.value",
            value: ocvBonus,
            mode: CONFIG.HERO.ACTIVE_EFFECT_MODES.ADD,
        });
    }

    const originCombatantId = game.combat?.combatants.find((c) => c.actor?.id === actor.id)?.id || null;
    const isAbortManeuver = _effect.includes("abort");
    const isDodgeManeuver = _effect.includes("dodge");

    // Dynamically assemble native V14 statuses array frame
    const effectStatuses = [];
    if (isAbortManeuver) effectStatuses.push("aborted");
    if (isDodgeManeuver) effectStatuses.push("dodge");

    // 3a. Abstract Shared Core Blueprint Parameters for V14 DataModel Parity
    const baseEffectBlueprint = {
        disabled: false,
        origin: item.uuid,
        duration: {
            type: "seconds",
            units: "seconds",
            _worldTime: currentWorldTime,
        },
        system: {
            XMLID: item.system.XMLID || "MANEUVER",
            createdRound: game.combat?.round ?? 0,
            createdTurn: game.combat?.turn ?? 0,
            createdSegment: game.combat?.segment ?? 0,
            originCombatantId: originCombatantId,
        },
    };

    const effectsToCreate = [];

    // 3b. Compile Specific Statistic Modifier Layout (Dodge/Core Maneuver)
    effectsToCreate.push(
        foundry.utils.mergeObject(foundry.utils.deepClone(baseEffectBlueprint), {
            name: item.name,
            img: item.img || "icons/svg/shield.svg",
            statuses: isDodgeManeuver ? ["dodge"] : [],
            duration: { expiry: expiryEvent }, // "hero.nextTurnStart"
            system: {
                type: "maneuver",
                subType: item.name.toLowerCase(),
                changes: modifierChanges,
            },
        }),
    );

    // 3c. Compile Specific Action-Lock Layout (Abort)
    if (isAbortManeuver) {
        const abortIconPath =
            HeroSystem6eActorActiveEffects?.statusEffectsObj?.abortEffect?.img || "icons/svg/clockwork.svg";

        effectsToCreate.push(
            foundry.utils.mergeObject(foundry.utils.deepClone(baseEffectBlueprint), {
                name: "Aborted Stance Lock",
                img: abortIconPath,
                statuses: ["aborted"],
                duration: { expiry: "hero.nextPhaseEnd" },
                system: {
                    type: "status-lock",
                    subType: "aborted",
                    changes: [], // No stat adjustments, pure state tracking lock
                },
            }),
        );
    }

    // 4. Aggressive Maneuver Monopoly Guard: Find ALL older structures to sweep out
    const staleIds = actor.effects.contents
        .filter((ae) => ae.system?.type === "maneuver" || ae.system?.type === "status-lock")
        .map((ae) => ae.id);

    // 5. Complete Database Wipe
    if (staleIds.length > 0) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", staleIds);
    }

    // 6. Direct Multi-Document Transaction Commit
    await actor.createEmbeddedDocuments("ActiveEffect", effectsToCreate);

    // 7. Generate Chat Roll Notification Card using your extracted token parameter
    const chatTemplateData = {
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: actor, token: token ?? actor.token }),
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        flavor: `<h3>Activates ${item.name}</h3>`,
        content: `
      <div class="hero-maneuver-card">
        <p><strong>Maneuver:</strong> ${item.system.XMLID || "Custom"}</p>
        <p><strong>Phase cost:</strong> ${item.system.PHASE || "1/2"}</p>
        ${ocvBonus !== 0 ? `<p><strong>OCV Modifier:</strong> ${item.system.OCV}</p>` : ""}
        ${dcvBonus !== 0 ? `<p><strong>DCV Modifier:</strong> ${item.system.DCV}</p>` : ""}
        <p><strong>Effects:</strong> <em>${item.system.EFFECT || "None"}</em></p>
      </div>
    `,
    };

    return ChatMessage.create(chatTemplateData);
}

/**
 * For maneuvers that require a hit, we apply tactical status effects in addition to or instead of damage.
 * Prioritizes absolute database parity and simple execution paths by processing documents sequentially.
 *
 * @param {Item} item - The maneuver item initiating the action.
 * @param {Object} action - The action payload tracking target and execution metadata.
 * @returns {Promise<void>}
 */
export async function doManeuverEffects(item, action, targetToken) {
    const attackerActor = item.actor;

    // Guard Clause: If there is no initiating actor, notify the console/UI and terminate execution immediately
    if (!attackerActor) {
        const errorMsg = `HERO: Cannot process maneuver effects because the item "${item.name}" lacks a valid actor reference.`;
        ui.notifications?.error(errorMsg);
        console.error(errorMsg);
        return;
    }

    const hasAttackerFallsTrait = maneuverHasAttackerFallsTrait(item);
    const hasGrabTrait = maneuverHasGrabTrait(item);
    const hasTargetFallsTrait = maneuverHasTargetFallsTrait(item);

    const currentTargets = action.system.currentTargets || [];
    if (currentTargets.length === 0 && targetToken) {
        currentTargets.push(targetToken);
    }
    const validTargets = currentTargets.filter((t) => !!t.actor);

    // --- 1. PROCESS ALL TARGETED DEFENDERS SEQUENTIALLY ---
    if (hasTargetFallsTrait || hasGrabTrait) {
        for (const targetedToken of validTargets) {
            const defenderActor = targetedToken.actor;

            if (hasGrabTrait) {
                await defenderActor.createEmbeddedDocuments("ActiveEffect", [
                    {
                        ...HeroSystem6eActorActiveEffects.statusEffectsObj.grabEffect,
                        name: `Grabbed by ${attackerActor.name}`,
                        flags: {
                            [game.system.id]: {
                                grabberById: attackerActor.id,
                                grabberByUuid: attackerActor.uuid,
                            },
                        },
                    },
                ]);
            }

            if (hasTargetFallsTrait) {
                await defenderActor.toggleStatusEffect(HeroSystem6eActorActiveEffects.statusEffectsObj.proneEffect.id, {
                    active: true,
                });
                // TODO: Offer actor an ACROBATICS skill roll to negate the prone effect
                // Acrobatics allows -3 to negate prone for target, breakfall at -1 per 2d6 to
                // halve damage but not prevent prone, per UMA p112 and 5ER p400.
                // They can also make a half roll on acrobatics to retain full DCV but remain prone.
            }
        }
    }

    // --- 2. PROCESS THE ATTACKER ---
    if (hasGrabTrait && validTargets.length > 0) {
        await attackerActor.createEmbeddedDocuments("ActiveEffect", [
            {
                ...HeroSystem6eActorActiveEffects.statusEffectsObj.grabEffect,
                name: `Grabbing ${validTargets.map((t) => t.name).join(" + ")}`,
                flags: {
                    [game.system.id]: {
                        targetIds: validTargets.map((t) => t.id),
                        targetUuids: validTargets.map((t) => t.actor.uuid),
                    },
                },
            },
        ]);
    }

    if (hasAttackerFallsTrait) {
        await attackerActor.toggleStatusEffect(HeroSystem6eActorActiveEffects.statusEffectsObj.proneEffect.id, {
            active: true,
        });
    }
}
