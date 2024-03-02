import { getPowerInfo } from "../utility/util.js";
import { determineDefense } from "../utility/defense.js";
import { HeroSystem6eActorActiveEffects } from "../actor/actor-active-effects.js";
import { RoundFavorPlayerDown, RoundFavorPlayerUp } from "../utility/round.js";
import {
    calculateDiceFormulaParts,
    CombatSkillLevelsForAttack,
    convertToDcFromItem,
} from "../utility/damage.js";
import {
    performAdjustment,
    renderAdjustmentChatCards,
} from "../utility/adjustment.js";
import { getSystemDisplayUnits } from "../utility/units.js";
import { RequiresASkillRollCheck } from "../item/item.js";
import { ItemAttackFormApplication } from "../item/item-attack-application.js";
import { HeroRoller } from "../utility/dice.js";

export async function chatListeners(html) {
    html.on("click", "button.roll-damage", this._onRollDamage.bind(this));
    html.on("click", "button.apply-damage", this._onApplyDamage.bind(this));
    html.on("click", "button.rollAoe-damage", this._onRollAoeDamage.bind(this));
}

export async function onMessageRendered(html) {
    //[data-visibility="gm"]
    if (!game.user.isGM) {
        html.find(`[data-visibility="gm"]`).remove();
    }

    // visibility based on actor owner
    let element = html.find("div [data-visibility]");
    if (element) {
        let actorId = element.data("visibility");
        if (actorId) {
            let actor = game.actors.get(actorId);
            if (actor && !actor.isOwner) {
                element.remove();
            }
        }
    }
}

/// Dialog box for AttackOptions
export async function AttackOptions(item) {
    const actor = item.actor;
    const token = actor.getActiveTokens()[0];

    if (!actor.canAct(true)) {
        return;
    }

    const data = {
        item: item,
        actor: actor,
        token: token,
        state: null,
        str: item.actor.system.characteristics.str.value,
    };

    // Uses Tk
    let tkItems = item.actor.items.filter(
        (o) => o.system.XMLID == "TELEKINESIS",
    );
    let tkStr = 0;
    for (const item of tkItems) {
        tkStr += parseInt(item.system.LEVELS) || 0;
    }
    if (item.system.usesTk) {
        if (item.system.usesStrength) {
            data.str += tkStr;
        } else {
            data.str = tkStr;
        }
    }

    // Maneuvers and Martial attacks may include velocity
    // [NORMALDC] +v/5 Strike, FMove
    if ((item.system.EFFECT || "").match(/v\/\d/)) {
        //["MOVEBY", "MOVETHROUGH"].includes(item.system.XMLID)) {
        data.showVelocity = true;
        data.velocity = 0;

        const tokens = item.actor.getActiveTokens();
        const token = tokens[0];
        const combatants = game?.combat?.combatants;
        if (combatants && typeof dragRuler != "undefined") {
            if (token) {
                let distance = dragRuler.getMovedDistanceFromToken(token);
                let speed =
                    dragRuler.getRangesFromSpeedProvider(token)[1].range;
                let delta = distance;
                if (delta > speed / 2) {
                    delta = speed - delta;
                }
                data.velocity = delta * 5;
            }
        }

        // Simplistic velocity calc using dragRuler
        if (data.velocity === 0 && token) {
            if (typeof dragRuler != "undefined") {
                if (dragRuler.getRangesFromSpeedProvider(token).length > 1) {
                    data.velocity = parseInt(
                        dragRuler.getRangesFromSpeedProvider(token)[1].range ||
                            0,
                    );
                }
            }
        }

        // Simplistic velocity calc using running & flight
        if (data.velocity === 0) {
            data.velocity = parseInt(
                item.actor.system.characteristics.running.value || 0,
            );
            data.velocity = Math.max(
                data.velocity,
                parseInt(item.actor.system.characteristics.flight.value || 0),
            );
        }
    }

    const aoe = item.getAoeModifier();

    if (
        game.settings.get("hero6efoundryvttv2", "hit locations") &&
        !item.system.noHitLocations &&
        !aoe
    ) {
        data.useHitLoc = true;
        data.hitLoc = CONFIG.HERO.hitLocations;

        // Penalty Skill Levels
        const PENALTY_SKILL_LEVELS = actor.items.find(
            (o) => o.system.XMLID === "PENALTY_SKILL_LEVELS",
        );
        if (PENALTY_SKILL_LEVELS) {
            data.PENALTY_SKILL_LEVELS = PENALTY_SKILL_LEVELS;
        }
    }

    // Combat Skill Levels
    const csl = CombatSkillLevelsForAttack(item);
    if (csl && csl.skill) {
        let _ocv = csl.omcv > 0 ? "omcv" : "ocv";
        data.cslChoices = { [_ocv]: _ocv };
        if (csl.skill.system.OPTION != "SINGLE") {
            data.cslChoices.dcv = "dcv";
            data.cslChoices.dc = "dc";
        }

        // CSL radioBoxes names
        data.csl = [];
        for (let c = 0; c < parseInt(csl.skill.system.LEVELS.value); c++) {
            data.csl.push({
                name: `system.csl.${c}`,
                value: csl.skill.system.csl
                    ? csl.skill.system.csl[c]
                    : "undefined",
            });
        }
    }

    const template =
        "systems/hero6efoundryvttv2/templates/attack/item-attack-card.hbs";
    await renderTemplate(template, data);

    // Testing out a replacement for the dialog box.
    // This would allow for more interactive CSL.
    // This may allow better workflow for AOE and placement of templates.
    delete (await new ItemAttackFormApplication(data).render(true));
}

export async function _processAttackOptions(item, formData) {
    await AttackToHit(item, formData);
}

export async function _processAttackAoeOptions(item, formData) {
    await AttackAoeToHit(item, formData);
}

export async function AttackAoeToHit(item, options) {
    const actor = item.actor;
    if (!actor) {
        return ui.notifications.error(
            `Attack details are no longer available.`,
        );
    }

    const token = actor.getActiveTokens()[0];
    if (!token) {
        return ui.notifications.error(`Token was not found.`);
    }

    const aoeTemplate =
        game.scenes.current.templates.find((o) => o.flags.itemId === item.id) ||
        game.scenes.current.templates.find((o) => o.user.id === game.user.id);
    if (!aoeTemplate) {
        return ui.notifications.error(`Attack AOE template was not found.`);
    }

    const distanceToken = canvas.grid.measureDistance(aoeTemplate, token, {
        gridSpaces: true,
    });
    let dcvTargetNumber = 0;
    if (distanceToken > (actor.system.is5e ? 1 : 2)) {
        dcvTargetNumber = 3;
    }

    const hitCharacteristic = actor.system.characteristics.ocv.value;
    const setManeuver = item.actor.items.find(
        (item) =>
            item.type == "maneuver" &&
            item.name === "Set" &&
            item.system.active,
    );

    const attackHeroRoller = new HeroRoller()
        .makeSuccessRoll()
        .addNumber(11, "Base to hit")
        .addNumber(hitCharacteristic, item.system.uses)
        .addNumber(parseInt(options.ocvMod) || 0, "OCV modifier")
        .subNumber(parseInt(setManeuver?.system.ocv || 0), "Maneuver OCV");

    if (item.system.uses === "ocv") {
        let factor = actor.system.is5e ? 4 : 8;
        let rangePenalty = -Math.ceil(Math.log2(distanceToken / factor)) * 2;
        rangePenalty = rangePenalty > 0 ? 0 : rangePenalty;

        if (rangePenalty) {
            attackHeroRoller.addNumber(rangePenalty, "Range penalty");
        }

        // Brace (+2 OCV only to offset the Range Modifier)
        const braceManeuver = item.actor.items.find(
            (item) =>
                item.type == "maneuver" &&
                item.name === "Brace" &&
                item.system.active,
        );
        if (braceManeuver) {
            let brace = Math.min(-rangePenalty, braceManeuver.system.ocv);
            if (brace > 0) {
                attackHeroRoller.addNumber(brace, "Brace modifier");
            }
        }
    }

    attackHeroRoller.subDice(3);

    await attackHeroRoller.roll();
    const renderedRollResult = await attackHeroRoller.render();
    const hitRollTotal = attackHeroRoller.getSuccessTotal();

    let hitRollText = "AOE origin SUCCESSFULLY hits a DCV of " + hitRollTotal;

    if (hitRollTotal < dcvTargetNumber) {
        const missBy = dcvTargetNumber - hitRollTotal;

        const facingHeroRoller = new HeroRoller().makeBasicRoll().addDice(1);
        await facingHeroRoller.roll();
        const facingRollResult = facingHeroRoller.getBasicTotal();

        const moveDistance = RoundFavorPlayerDown(
            Math.min(
                distanceToken / 2,
                item.actor.system.is5e ? missBy : missBy * 2,
            ),
        );
        hitRollText = `AOE origin MISSED by ${missBy}.  Move AOE origin ${
            moveDistance + getSystemDisplayUnits(item.actor)
        } in the <b>${facingRollResult}</b> direction.`;
    }

    const cardData = {
        // dice rolls
        renderedHitRoll: renderedRollResult,
        hitRollText: hitRollText,
        hitRollValue: hitRollTotal,

        // data for damage card
        actor,
        item,
        ...options,

        // misc
        tags: attackHeroRoller.tags(),
        attackTags: getAttackTags(item),
        formData: JSON.stringify(options),
        dcvTargetNumber,
        buttonText:
            "Confirm AOE placement<br>and selected targets (SHIFT-T to unselect)",
    };

    const template =
        "systems/hero6efoundryvttv2/templates/chat/item-toHitAoe-card.hbs";
    const cardHtml = await renderTemplate(template, cardData);
    const speaker = ChatMessage.getSpeaker({ actor: actor, token });
    speaker.alias = actor.name;

    const chatData = {
        type: CONST.CHAT_MESSAGE_TYPES.ROLL,
        rolls: attackHeroRoller.rawRolls(),
        user: game.user._id,
        content: cardHtml,
        speaker: speaker,
    };

    return ChatMessage.create(chatData);
}

/// ChatMessage showing Attack To Hit
export async function AttackToHit(item, options) {
    if (!item) {
        return ui.notifications.error(
            `Attack details are no longer available.`,
        );
    }

    const actor = item.actor;
    const itemData = item.system;

    const hitCharacteristic = actor.system.characteristics[itemData.uses].value;

    const toHitChar = CONFIG.HERO.defendsWith[itemData.targets];

    const automation = game.settings.get("hero6efoundryvttv2", "automation");

    const adjustment = getPowerInfo({
        item: item,
    })?.powerType?.includes("adjustment");
    const senseAffecting = getPowerInfo({
        item: item,
    })?.powerType?.includes("sense-affecting");

    // TODO: Much of this looks similar to the AOE stuff above. Any way to combine?
    // -------------------------------------------------
    // attack roll
    // -------------------------------------------------
    const setManeuver = item.actor.items.find(
        (o) => o.type == "maneuver" && o.name === "Set" && o.system.active,
    );

    const heroRoller = new HeroRoller()
        .makeSuccessRoll()
        .addNumber(11, "Base to hit")
        .addNumber(hitCharacteristic, itemData.uses)
        .addNumber(parseInt(options.ocvMod), "OCV modifier")
        .addNumber(parseInt(setManeuver?.system.ocv) || 0, "Maneuver OCV");

    // Calc Distance if we have a target (and using ocv; dcv is typically line of sight)
    if (game.user.targets.size > 0 && itemData?.uses === "ocv") {
        // Educated guess for token
        let token = actor.getActiveTokens()[0];
        let target = game.user.targets.first();
        let distance = canvas.grid.measureDistance(token, target, {
            gridSpaces: true,
        });
        let factor = actor.system.is5e ? 4 : 8;
        let rangePenalty = -Math.ceil(Math.log2(distance / factor)) * 2;
        rangePenalty = rangePenalty > 0 ? 0 : rangePenalty;

        if (rangePenalty) {
            heroRoller.addNumber(rangePenalty, "Range penalty");
        }

        // Brace (+2 OCV only to offset the Range Modifier)
        const braceManeuver = item.actor.items.find(
            (o) =>
                o.type == "maneuver" && o.name === "Brace" && o.system.active,
        );
        if (braceManeuver) {
            let brace = Math.min(-rangePenalty, braceManeuver.system.ocv);
            if (brace > 0) {
                heroRoller.addNumber(brace, braceManeuver.name);
            }
        }
    }

    // Combat Skill Levels
    let csl = CombatSkillLevelsForAttack(item);
    if (csl.ocv || csl.omcv > 0) {
        heroRoller.addNumber(csl.ocv || csl.omcv, csl.item.name);
    }

    let dcv = parseInt(item.system.dcv || 0) + csl.dcv;
    let dmcv = parseInt(item.system.dmcv || 0) + csl.dmcv;

    // Haymaker -5 DCV
    const haymakerManeuver = item.actor.items.find(
        (o) => o.type == "maneuver" && o.name === "Haymaker" && o.system.active,
    );
    if (haymakerManeuver) {
        dcv -= 4;
    }

    if (dcv != 0 || dmcv != 0) {
        // Make sure we don't already have this activeEffect
        let prevActiveEffect = Array.from(
            item.actor.allApplicableEffects(),
        ).find((o) => o.origin === item.uuid);
        if (!prevActiveEffect) {
            // Estimate of how many seconds the DCV penalty lasts (until next phase).
            // In combat.js#_onStartTurn we remove this AE for exact timing.
            let seconds = Math.ceil(
                12 / parseInt(item.actor.system.characteristics.spd.value),
            );

            let _dcvText = "DCV";
            let _dcvValue = dcv;

            if (dmcv != 0) {
                _dcvText = "DMCV";
                _dcvValue = dmcv;
            }

            let activeEffect = {
                label: `${item.name} ${_dcvValue.signedString()} ${_dcvText}`,
                icon:
                    dcv < 0
                        ? "icons/svg/downgrade.svg"
                        : "icons/svg/upgrade.svg",
                changes: [
                    {
                        key: `system.characteristics.${_dcvText.toLowerCase()}.value`,
                        value: _dcvValue,
                        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                    },
                ],
                origin: item.uuid,
                duration: {
                    seconds: seconds,
                },
                flags: {
                    nextPhase: true,
                },
            };
            //await item.addActiveEffect(activeEffect);
            await item.actor.createEmbeddedDocuments("ActiveEffect", [
                activeEffect,
            ]);
        }
    }

    // [x Stun, x N Stun, x Body, OCV modifier]
    let noHitLocationsPower = item.system.noHitLocations || false;
    if (
        game.settings.get("hero6efoundryvttv2", "hit locations") &&
        options.aim &&
        options.aim !== "none" &&
        !noHitLocationsPower
    ) {
        heroRoller.addNumber(
            CONFIG.HERO.hitLocations[options.aim][3],
            options.aim,
        );

        // Penalty Skill Levels
        if (options.usePsl) {
            const PENALTY_SKILL_LEVELS = actor.items.find(
                (o) => o.system.XMLID === "PENALTY_SKILL_LEVELS",
            );
            if (PENALTY_SKILL_LEVELS) {
                let pslValue = Math.min(
                    PENALTY_SKILL_LEVELS.system.LEVELS.value,
                    Math.abs(CONFIG.HERO.hitLocations[options.aim][3]),
                );
                heroRoller.addNumber(pslValue, PENALTY_SKILL_LEVELS.name);
            }
        }
    }

    heroRoller.subDice(3);

    const autofire = item.findModsByXmlid("AUTOFIRE");
    const autoFireShots = autofire
        ? parseInt(autofire.OPTION_ALIAS.match(/\d+/))
        : 0;

    let useEnd = false;
    let enduranceText = "";
    if (game.settings.get("hero6efoundryvttv2", "use endurance")) {
        useEnd = true;
        let valueEnd = actor.system.characteristics.end.value;
        let itemEnd = (parseInt(item.system.end) || 0) * (autoFireShots || 1);
        let newEnd = valueEnd - itemEnd;
        let spentEnd = itemEnd;
        options.effectiveStr = options.effectiveStr || 0; // May want to get rid of this so we can support HKA with 0 STR (wierd but possible?)

        if (itemData.usesStrength || itemData.usesTk) {
            let strEnd = Math.max(1, Math.round(options.effectiveStr / 10));

            // TELIKENESIS is more expensive than normal STR
            if (itemData.usesTk) {
                spentEnd = Math.ceil(
                    (spentEnd * options?.effectiveStr) / item.system.LEVELS,
                );
            } else {
                spentEnd = parseInt(spentEnd) + parseInt(strEnd);
            }
            //item.system.endEstimate += strEnd;=            newEnd = parseInt(newEnd) - parseInt(strEnd);
        }

        const enduranceReserve = item.actor.items.find(
            (o) => o.system.XMLID === "ENDURANCERESERVE",
        );
        if (item.system.USE_END_RESERVE) {
            if (enduranceReserve) {
                let erValue = parseInt(enduranceReserve.system.value);
                if (spentEnd > erValue) {
                    return await ui.notifications.error(
                        `${item.name} needs ${spentEnd} END, but ${enduranceReserve.name} only has ${erValue} END.`,
                    );
                }
                erValue -= spentEnd;
                enduranceReserve.system.value = erValue;
                enduranceReserve.updateItemDescription();
                await enduranceReserve.update({
                    "system.value": enduranceReserve.system.value,
                    "system.description": enduranceReserve.system.description,
                });
                newEnd = valueEnd;
            }
        }

        if (newEnd < 0) {
            let stunDice = Math.ceil(Math.abs(newEnd) / 2);

            const stunForEndHeroRoller = new HeroRoller()
                .makeBasicRoll()
                .addDice(stunDice);
            await stunForEndHeroRoller.roll();
            const stunRenderedResult = await stunForEndHeroRoller.render();
            const stunDamageTotal = stunForEndHeroRoller.getBasicTotal();

            newEnd = -stunDamageTotal;

            enduranceText =
                "Spent " + valueEnd + " END and " + Math.abs(newEnd) + " STUN";

            enduranceText +=
                ` <i class="fal fa-circle-info" data-tooltip="` +
                `<b>USING STUN FOR ENDURANCE</b><br>` +
                `A character at 0 END who still wishes to perform Actions
                may use STUN as END. The character takes 1d6 STUN Only
                damage (with no defense) for every 2 END (or fraction thereof)
                expended. Yes, characters can Knock themselves out this way.` +
                `"></i> `;
            enduranceText += stunRenderedResult;

            await ui.notifications.warn(
                `${actor.name} used STUN for ENDURANCE.`,
            );
        } else {
            enduranceText = "Spent " + spentEnd + " END";

            if (item.system.USE_END_RESERVE && enduranceReserve) {
                enduranceText += `<br>from ${enduranceReserve.name} (${enduranceReserve.system.value}/${enduranceReserve.system.max})`;
            }
        }

        // none: "No Automation",
        // npcOnly: "NPCs Only (end, stun, body)",
        // pcEndOnly: "PCs (end) and NPCs (end, stun, body)",
        // all: "PCs and NPCs (end, stun, body)"
        if (
            automation === "all" ||
            (automation === "npcOnly" && actor.type == "npc") ||
            (automation === "pcEndOnly" && actor.type === "pc")
        ) {
            let changes = {};
            if (newEnd < 0) {
                changes = {
                    "system.characteristics.end.value": 0,
                    "system.characteristics.stun.value":
                        parseInt(actor.system.characteristics.stun.value) +
                        parseInt(newEnd),
                };
            } else {
                changes = {
                    "system.characteristics.end.value": newEnd,
                };
            }
            await actor.update(changes);
        }
    }

    // Charges
    if (item.system.charges?.max > 0) {
        let charges = parseInt(item.system.charges?.value || 0);
        if (charges <= 0) {
            return ui.notifications.error(`${item.name} has no more charges.`);
        }
        options.boostableCharges = Math.clamped(
            parseInt(options.boostableCharges) || 0,
            0,
            Math.min(charges - 1, 4),
        ); // Maximum of 4
        let spentCharges = 1 + options.boostableCharges;
        if (enduranceText === "") {
            enduranceText = `Spent ${spentCharges} charge${
                spentCharges > 1 ? "s" : ""
            }`;
        } else {
            enduranceText += ` and ${spentCharges} charge${
                spentCharges > 1 ? "s" : ""
            }`;
        }
        item.update({ "system.charges.value": charges - spentCharges });
    }

    const aoeModifier = item.getAoeModifier();
    const aoeTemplate =
        game.scenes.current.templates.find(
            (template) => template.flags.itemId === item.id,
        ) ||
        game.scenes.current.templates.find(
            (template) => template.user.id === game.user.id,
        );
    const explosion = item.hasExplosionAdvantage();
    const SELECTIVETARGET = aoeModifier?.ADDER
        ? aoeModifier.ADDER.find((o) => o.XMLID === "SELECTIVETARGET")
        : null;
    const NONSELECTIVETARGET = aoeModifier?.ADDER
        ? aoeModifier.ADDER.find((o) => o.XMLID === "NONSELECTIVETARGET")
        : null;

    const aoeAlwaysHit =
        aoeModifier && !(SELECTIVETARGET || NONSELECTIVETARGET);

    let targetData = [];
    let targetIds = [];
    let targetsArray = Array.from(game.user.targets);

    // If AOE then sort by distance from center
    if (explosion) {
        targetsArray.sort(function (a, b) {
            let distanceA = canvas.grid.measureDistance(aoeTemplate, a, {
                gridSpaces: true,
            });
            let distanceB = canvas.grid.measureDistance(aoeTemplate, b, {
                gridSpaces: true,
            });
            return distanceA - distanceB;
        });
    }

    // Make attacks against all targets
    for (const target of targetsArray) {
        let hit = "Miss";
        let value = RoundFavorPlayerUp(
            target.actor.system.characteristics[toHitChar.toLowerCase()].value,
        );

        const targetHeroRoller = heroRoller.clone();

        // TODO: Autofire against multiple targets should have increasing difficulty

        await targetHeroRoller.roll();
        const toHitRollTotal = targetHeroRoller.getSuccessTotal();

        // TODO: Auto success and failure

        if (value <= toHitRollTotal || aoeAlwaysHit) {
            hit = "Hit";
        }

        let by = toHitRollTotal - value;
        if (by >= 0) {
            by = "+" + by;
        }

        if (explosion) {
            value = 0;
            hit = "Hit";
            by = aoeModifier.OPTION_ALIAS + aoeModifier.LEVELS;

            // Distance from center
            if (aoeTemplate) {
                let distance = canvas.grid.measureDistance(
                    aoeTemplate,
                    target.center,
                    { gridSpaces: true },
                );
                // TODO: Does distance need to be scaled for units?
                by += ` (${distance}${getSystemDisplayUnits(
                    item.actor,
                )} from center)`;
            }
        }

        targetData.push({
            id: target.id,
            name: target.name,
            aoeAlwaysHit: aoeAlwaysHit,
            toHitChar: toHitChar,
            toHitRollTotal: toHitRollTotal,
            hitRollText: `${hit} a ${toHitChar} of ${toHitRollTotal}`,
            value: value,
            result: { hit: hit, by: by.toString() },
            roller: targetHeroRoller,
            renderedRoll: await targetHeroRoller.render(),
        });

        // Keep track of which tokens were hit so we can apply damage later,
        // Assume beneficial adjustment powers always hits
        if (
            hit === "Hit" ||
            item.system.XMLID == "AID" ||
            item.system.XMLID === "HEALING"
        ) {
            targetIds.push(target.id);
        }
    }

    // AUTOFIRE
    if (autofire) {
        // Autofire check for multiple hits on single target
        if (targetData.length === 1) {
            const singleTarget = Array.from(game.user.targets)[0];
            const toHitRollTotal = targetData[0].toHitRollTotal;
            const firstShotResult = targetData[0].result.hit;

            const firstShotRenderedRoll = targetData[0].renderedRoll;
            const firstShotRoller = targetData[0].roller;

            targetData = [];

            for (let shot = 0; shot < autoFireShots; shot++) {
                const autofireShotRollTotal = toHitRollTotal - shot * 2;

                const hitRollText = `Autofire ${
                    shot + 1
                }/${autofire.OPTION_ALIAS.toLowerCase()}<br>${firstShotResult} a ${toHitChar} of ${autofireShotRollTotal}`;

                let hit = "Miss";
                const value =
                    singleTarget.actor.system.characteristics[
                        toHitChar.toLowerCase()
                    ].value;

                if (value <= autofireShotRollTotal) {
                    hit = "Hit";
                }

                let by = autofireShotRollTotal - value;
                if (by >= 0) {
                    by = "+" + by;
                }

                targetData.push({
                    id: singleTarget.id,
                    name: singleTarget.name,
                    aoeAlwaysHit: aoeAlwaysHit,
                    toHitChar: toHitChar,
                    toHitRollTotal: autofireShotRollTotal,
                    hitRollText: hitRollText,
                    value: value,
                    result: { hit: hit, by: by.toString() },
                    roller: shot ? undefined : firstShotRoller,
                    renderedRoll: firstShotRenderedRoll, // TODO: Should perhaps adjust and rerender?
                });
            }
        }
    }

    if (!(await RequiresASkillRollCheck(item))) {
        const speaker = ChatMessage.getSpeaker({ actor: item.actor });
        speaker["alias"] = item.actor.name;
        const chatData = {
            user: game.user._id,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            content: enduranceText,
            whisper: ChatMessage.getWhisperRecipients("GM"),
            speaker,
        };

        await ChatMessage.create(chatData);
        return;
    }

    // Block (which is a repeatable abort)
    const block = item.system.EFFECT?.toLowerCase().indexOf("block");
    if (block > -1) {
        if (targetsArray.length === 1) {
            const hitRollTotal = targetData[0].toHitRollTotal;
            const hitRollText = `Block roll of ${hitRollTotal} vs. OCV of pending attack.`;
            targetData[0].hitRollText = hitRollText;
        } else {
            return ui.notifications.error(`Block requires a target.`);
        }
    }

    // Abort
    if (item.system.EFFECT?.toLowerCase().indexOf("abort") > -1) {
        item.actor.addActiveEffect({
            ...HeroSystem6eActorActiveEffects.abortEffect,
            name: `Aborted [${item.name}]`,
            flags: {
                itemId: item.uuid,
            },
        });
    }

    // Dodge (which is a repeatable abort)
    if (item.system.EFFECT?.toLowerCase().indexOf("dodge") > -1) {
        const speaker = ChatMessage.getSpeaker({ actor: item.actor });
        speaker["alias"] = item.actor.name;
        const chatData = {
            user: game.user._id,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            content: `${item.name} ${dcv.signedString()} DCV`,
            speaker,
        };
        return ChatMessage.create(chatData);
    }

    const cardData = {
        // dice rolls
        velocity: options.velocity,

        // data for damage card
        actor,
        item,
        adjustment,
        senseAffecting,
        ...options,
        targetData: targetData,
        targetIds: targetIds,

        // endurance
        useEnd: useEnd,
        enduranceText: enduranceText,

        // misc
        tags: heroRoller.tags(),
        attackTags: getAttackTags(item),
    };

    // render card
    const template =
        block > -1
            ? "systems/hero6efoundryvttv2/templates/chat/item-toHit-block-card.hbs"
            : "systems/hero6efoundryvttv2/templates/chat/item-toHit-card.hbs";
    const cardHtml = await renderTemplate(template, cardData);

    const token = actor.token;
    const speaker = ChatMessage.getSpeaker({ actor: actor, token });
    speaker.alias = actor.name;

    const chatData = {
        type: aoeAlwaysHit
            ? CONST.CHAT_MESSAGE_TYPES.OTHER
            : CONST.CHAT_MESSAGE_TYPES.ROLL, // most AOEs are auto hit
        rolls: targetData
            .map((target) => target.roller?.rawRolls())
            .flat()
            .filter(Boolean),
        user: game.user._id,
        content: cardHtml,
        speaker: speaker,
    };

    return ChatMessage.create(chatData);
}

function getAttackTags(item) {
    // Attack Tags
    let attackTags = [];

    attackTags.push({ name: item.system.class });

    if (item.system.killing) {
        attackTags.push({ name: `killing` });
    }

    // Item adders
    if (item.system.adders) {
        for (let adder of item.system.adders) {
            switch (adder.XMLID) {
                case "MINUSONEPIP":
                case "PLUSONEHALFDIE":
                case "PLUSONEPIP":
                    break;

                case "MULTIPLECLASSES":
                    attackTags.push({
                        name: `${adder.ALIAS}`,
                        title: `${adder.XMLID}`,
                    });
                    break;

                default:
                    attackTags.push({
                        name: `${adder.ALIAS || adder.XMLID}`,
                        title: `${adder.OPTION_ALIAS || ""}`,
                    });
            }
        }
    }

    // USESTANDARDEFFECT
    if (item.system.USESTANDARDEFFECT) {
        attackTags.push({
            name: `Standard Effect`,
            title: `USESTANDARDEFFECT`,
        });
    }

    // STUN/BODY/EFFECT Only
    if (item.system.stunBodyDamage !== "stunbody") {
        const phrase = CONFIG.HERO.stunBodyDamages[item.system.stunBodyDamage];
        attackTags.push({
            name: phrase,
            title: phrase,
        });
    }

    // FLASH
    if (item.system.XMLID === "FLASH") {
        attackTags.push({ name: item.system.OPTION_ALIAS });
    }

    // item modifiers
    for (const mod of item.system.MODIFIER || []) {
        switch (mod.XMLID) {
            case "AUTOFIRE":
                {
                    const autoFireShots = parseInt(
                        mod.OPTION_ALIAS.match(/\d+/),
                    );
                    attackTags.push({
                        name: `${mod.ALIAS || mod.XMLID}(${autoFireShots})`,
                        title: `${mod.OPTION_ALIAS || ""}`,
                    });
                }
                break;

            case "EXPLOSION":
                // 6e explosion is a modifier to AOE. In 5e EXPLOSION is a mod to itself so
                // for 5e (i.e. here), show 2 tags.
                attackTags.push({
                    name: `${mod.ALIAS}`,
                    title: `${mod.XMLID}`,
                });

            // Intentionally Fall Through to AOE to show the size of the attack
            case "AOE":
                // TODO: This needs to be corrected as the names are not consistent.
                attackTags.push({
                    name: `${mod.OPTION_ALIAS}(${mod.LEVELS})`,
                    title: `${mod.XMLID}`,
                });
                break;

            default:
                attackTags.push({
                    name: `${mod.ALIAS || mod.XMLID}`,
                    title: `${mod.OPTION_ALIAS || mod.XMLID}`,
                });
        }

        // item modifier adders
        for (const adder of mod.ADDER || []) {
            switch (adder.XMLID) {
                case "CONTINUOUSCONCENTRATION":
                    attackTags.push({
                        name: `Continuous`,
                        title: `${adder.ALIAS || ""}`,
                    });
                    break;
                default:
                    attackTags.push({
                        name: `${adder.ALIAS || adder.XMLID}`,
                        title: `${adder.OPTION_ALIAS || ""}`,
                    });
            }
        }
    }

    return attackTags;
}

export async function _onRollAoeDamage(event) {
    console.log("_onRollAoeDamage");
    const button = event.currentTarget;
    button.blur(); // The button remains highlighted for some reason; kluge to fix.
    const options = { ...button.dataset };
    const item = fromUuidSync(options.itemid);
    return AttackToHit(item, JSON.parse(options.formdata));
}

// Event handler for when the Roll Damage button is
// clicked on item-attack-card2.hbs
// Notice the chatListeners function in this file.
export async function _onRollDamage(event) {
    const button = event.currentTarget;
    button.blur(); // The button remains highlighted for some reason; kluge to fix.
    const toHitData = { ...button.dataset };
    const item = fromUuidSync(toHitData.itemid);
    const actor = item?.actor;

    if (!actor) {
        return ui.notifications.error(
            `Attack details are no longer available.`,
        );
    }

    const adjustment = getPowerInfo({
        item: item,
    })?.powerType?.includes("adjustment");
    const senseAffecting = getPowerInfo({
        item: item,
    })?.powerType?.includes("sense-affecting");
    const entangle = item.system.XMLID === "ENTANGLE";

    const increasedMultiplierLevels = parseInt(
        item.findModsByXmlid("INCREASEDSTUNMULTIPLIER")?.LEVELS || 0,
    );
    const decreasedMultiplierLevels = parseInt(
        item.findModsByXmlid("DECREASEDSTUNMULTIPLIER")?.LEVELS || 0,
    );

    const useStandardEffect = item.system.USESTANDARDEFFECT || false;

    const { dc, tags } = convertToDcFromItem(item, {
        isAction: true,
        ...toHitData,
    });
    const formulaParts = calculateDiceFormulaParts(item, dc);

    // TODO: Should also include AOE considerations. Does AOE preclude hit locations? The code is not consistent.
    const includeHitLocation =
        game.settings.get("hero6efoundryvttv2", "hit locations") &&
        (item.system.noHitLocations || true);

    const heroRoller = new HeroRoller()
        .modifyTo5e(actor.system.is5e)
        .makeNormalRoll(
            !senseAffecting && !adjustment && !formulaParts.isKilling,
        )
        .makeKillingRoll(
            !senseAffecting && !adjustment && formulaParts.isKilling,
        )
        .makeAdjustmentRoll(!!adjustment)
        .makeFlashRoll(!!senseAffecting)
        .makeEntangleRoll(entangle)
        .addStunMultiplier(
            increasedMultiplierLevels - decreasedMultiplierLevels,
        )
        .addDice(formulaParts.d6Count)
        .addHalfDice(formulaParts.halfDieCount)
        .addDiceMinus1(formulaParts.d6Less1DieCount)
        .addNumber(formulaParts.constant)
        .modifyToStandardEffect(useStandardEffect)
        .modifyToNoBody(
            item.system.stunBodyDamage === "stunonly" ||
                item.system.stunBodyDamage === "effectonly",
        )
        .addToHitLocation(includeHitLocation, toHitData.aim);

    await heroRoller.roll();

    const damageRenderedResult = await heroRoller.render();

    const damageDetail = await _calcDamage(heroRoller, item, toHitData);

    const aoeTemplate =
        game.scenes.current.templates.find((o) => o.flags.itemId === item.id) ||
        game.scenes.current.templates.find((o) => o.user.id === game.user.id);
    const explosion = item.hasExplosionAdvantage();

    // Apply Damage button for specific targets
    let targetTokens = [];
    for (const id of toHitData.targetids.split(",")) {
        let token = canvas.scene.tokens.get(id);
        if (token) {
            let targetToken = {
                token,
                roller: heroRoller.toJSON(),
            };

            // TODO: Add in explosion handling (or flattening)
            if (explosion) {
                // Distance from center
                if (aoeTemplate) {
                    // Explosion
                    // Simple rules is to remove the hightest dice term for each
                    // hex distance from center.  Works fine when radius = dice,
                    // but that isn't always the case.

                    // Remove highest terms based on distance
                    const distance = canvas.grid.measureDistance(
                        aoeTemplate,
                        token.object.center,
                        { gridSpaces: true },
                    );
                    const pct = distance / aoeTemplate.distance;

                    // TODO: This assumes that the number of terms equals the DC/5 AP. This is
                    //       true for normal attacks but not always.
                    //       This ignores explosion modifiers for DC falloff.
                    const termsToRemove = Math.floor(
                        pct * (heroRoller.getBaseTerms().length - 1),
                    );

                    const heroRollerClone = heroRoller.clone();
                    heroRollerClone.removeNHighestRankTerms(termsToRemove);

                    targetToken = {
                        ...targetToken,
                        distance,
                        roller: heroRollerClone.toJSON(),
                    };
                }
            }
            targetTokens.push(targetToken);
        }
    }

    // If there is only 1 target then get rid of targetIds (which is used for Apply Damage ALL)
    if (targetTokens.length <= 1) {
        delete toHitData.targetids;
    }

    const cardData = {
        item: item,
        adjustment,
        senseAffecting,
        // dice rolls
        renderedDamageRoll: damageRenderedResult,
        renderedStunMultiplierRoll: damageDetail.renderedStunMultiplierRoll,

        // hit locations
        useHitLoc: damageDetail.useHitLoc,
        hitLocText: damageDetail.hitLocText,
        hitLocation: damageDetail.hitLocation,

        // body
        bodyDamage: damageDetail.bodyDamage,
        bodyDamageEffective: damageDetail.body,
        countedBody: damageDetail.countedBody,

        // stun
        stunDamage: damageDetail.stunDamage,
        stunDamageEffective: damageDetail.stun,
        hasRenderedDamageRoll: true,
        stunMultiplier: damageDetail.stunMultiplier,
        hasStunMultiplierRoll: damageDetail.hasStunMultiplierRoll,

        roller: heroRoller.toJSON(),

        // misc
        targetIds: toHitData.targetids,
        tags: tags,

        attackTags: getAttackTags(item),
        targetTokens: targetTokens,
        user: game.user,
    };

    // render card
    const template =
        "systems/hero6efoundryvttv2/templates/chat/item-damage-card.hbs";
    const cardHtml = await renderTemplate(template, cardData);
    const speaker = ChatMessage.getSpeaker({ actor: item.actor });
    const chatData = {
        type: CONST.CHAT_MESSAGE_TYPES.ROLL,
        rolls: heroRoller.rawRolls(),
        user: game.user._id,
        content: cardHtml,
        speaker: speaker,
    };

    return ChatMessage.create(chatData);
}

// Event handler for when the Apply Damage button is
// clicked on item-damage-card.hbs
// Notice the chatListeners function in this file.
export async function _onApplyDamage(event) {
    const button = event.currentTarget;
    button.blur(); // The button remains highlighted for some reason; kluge to fix.
    const toHitData = { ...button.dataset };
    const item = fromUuidSync(event.currentTarget.dataset.itemid);

    // Single target
    if (toHitData.targetTokenId) {
        return _onApplyDamageToSpecificToken(event, toHitData.targetTokenId);
    }

    // All targets
    if (toHitData.targetIds) {
        const targetsArray = toHitData.targetIds.split(",");

        // If AOE then sort by distance from center
        if (item.hasExplosionAdvantage()) {
            const aoeTemplate =
                game.scenes.current.templates.find(
                    (o) => o.flags.itemId === item.id,
                ) ||
                game.scenes.current.templates.find(
                    (o) => o.user.id === game.user.id,
                );

            targetsArray.sort(function (a, b) {
                let distanceA = canvas.grid.measureDistance(
                    aoeTemplate,
                    game.scenes.current.tokens.get(a).object,
                    { gridSpaces: true },
                );
                let distanceB = canvas.grid.measureDistance(
                    aoeTemplate,
                    game.scenes.current.tokens.get(b).object,
                    { gridSpaces: true },
                );
                return distanceA - distanceB;
            });
        }

        for (const id of targetsArray) {
            console.log(game.scenes.current.tokens.get(id).name);
            await _onApplyDamageToSpecificToken(event, id);
        }
        return;
    }

    // Check to make sure we have a selected token
    if (canvas.tokens.controlled.length == 0) {
        return ui.notifications.warn(
            `You must select at least one token before applying damage.`,
        );
    }

    for (const token of canvas.tokens.controlled) {
        _onApplyDamageToSpecificToken(event, token.id);
    }
}

export async function _onApplyDamageToSpecificToken(event, tokenId) {
    const button = event.currentTarget;
    const damageData = { ...button.dataset };
    const item = fromUuidSync(damageData.itemid);
    if (!item) {
        // This typically happens when the attack id stored in the damage card no longer exists on the actor.
        // For example if the attack item was deleted or the HDC was uploaded again.
        console.warn(damageData.itemid);
        return ui.notifications.error(
            `Attack details are no longer available.`,
        );
    }

    const token = canvas.tokens.get(tokenId);
    if (!token) {
        return ui.notifications.warn(
            `You must select at least one token before applying damage.`,
        );
    }

    const heroRoller = HeroRoller.fromJSON(damageData.roller);
    const originalRoll = heroRoller.clone();

    const automation = game.settings.get("hero6efoundryvttv2", "automation");

    const avad = item.findModsByXmlid("AVAD");

    // Check for conditional defenses
    let ignoreDefenseIds = [];
    const conditionalDefenses = token.actor.items.filter(
        (o) =>
            (o.system.subType || o.system.type) === "defense" &&
            (o.system.active ||
                o.effects.find(() => true)?.disabled === false) &&
            ((o.system.MODIFIER || []).find((p) =>
                ["ONLYAGAINSTLIMITEDTYPE", "CONDITIONALPOWER"].includes(
                    p.XMLID,
                ),
            ) ||
                avad),
    );

    // AVAD Life Support
    if (avad) {
        const lifeSupport = token.actor.items.filter(
            (o) => o.system.XMLID === "LIFESUPPORT",
        );
        conditionalDefenses.push(...lifeSupport);
    }

    if (
        conditionalDefenses.length > 0 &&
        !["AID"].includes(item.system.XMLID)
    ) {
        const template2 =
            "systems/hero6efoundryvttv2/templates/attack/item-conditional-defense-card.hbs";

        let options = [];
        for (const defense of conditionalDefenses) {
            const option = {
                id: defense.id,
                name: defense.name,
                checked: !avad,
                conditions: "",
            };

            // AVAD: Attempt to check likely defenses
            if (avad) {
                // PD, ED, MD
                if (avad.INPUT.toUpperCase() === defense.system.XMLID)
                    option.checked = true;

                // Damage Reduction
                if (
                    avad.INPUT.toUpperCase() == "PD" &&
                    defense.system.INPUT === "Physical"
                )
                    option.checked = true;
                if (
                    avad.INPUT.toUpperCase() == "ED" &&
                    defense.system.INPUT === "Energy"
                )
                    option.checked = true;
                if (
                    avad.INPUT.replace("Mental Defense", "MD").toUpperCase() ==
                        "MD" &&
                    defense.system.INPUT === "Mental"
                )
                    option.checked = true;

                // Damage Negation
                if (
                    avad.INPUT.toUpperCase() == "PD" &&
                    defense.findModsByXmlid("PHYSICAL")
                )
                    option.checked = true;
                if (
                    avad.INPUT.toUpperCase() == "ED" &&
                    defense.findModsByXmlid("ENERGY")
                )
                    option.checked = true;
                if (
                    avad.INPUT.replace("Mental Defense", "MD").toUpperCase() ==
                        "MD" &&
                    defense.findModsByXmlid("MENTAL")
                )
                    option.checked = true;

                // Flash Defense
                if (
                    avad.INPUT.match(/flash/i) &&
                    defense.system.XMLID === "FLASHDEFENSE"
                )
                    option.checked = true;

                // Power Defense
                if (
                    avad.INPUT.match(/power/i) &&
                    defense.system.XMLID === "POWERDEFENSE"
                )
                    option.checked = true;

                // Life Support
                if (
                    avad.INPUT.match(/life/i) &&
                    defense.system.XMLID === "LIFESUPPORT"
                )
                    option.checked = true;

                // Resistant Damage Reduction
                if (
                    avad.INPUT == "Resistant PD" &&
                    defense.system.INPUT === "Physical" &&
                    defense.system.OPTION.match(/RESISTANT/i)
                )
                    option.checked = true;
                if (
                    avad.INPUT == "Resistant ED" &&
                    defense.system.INPUT === "Energy" &&
                    defense.system.OPTION.match(/RESISTANT/i)
                )
                    option.checked = true;
                if (
                    avad.INPUT == "Resistant MD" &&
                    defense.system.INPUT === "Mental" &&
                    defense.system.OPTION.match(/RESISTANT/i)
                )
                    option.checked = true;

                // FORCEFIELD, RESISTANT PROTECTION
                if (
                    avad.INPUT.toUpperCase() == "PD" &&
                    parseInt(defense.system.PDLEVELS || 0) > 0
                )
                    option.checked = true;
                if (
                    avad.INPUT.toUpperCase() == "ED" &&
                    parseInt(defense.system.EDLEVELS || 0) > 0
                )
                    option.checked = true;
                if (
                    avad.INPUT.replace("Mental Defense", "MD").toUpperCase() ==
                        "MD" &&
                    parseInt(defense.system.MDLEVELS || 0) > 0
                )
                    option.checked = true;
                if (
                    avad.INPUT.match(/power/i) &&
                    parseInt(defense.system.POWDLEVELS || 0) > 0
                )
                    option.checked = true;
            }

            option.description = defense.system.description;
            options.push(option);
        }

        let data = {
            token,
            item,
            conditionalDefenses: options,
        };

        const html = await renderTemplate(template2, data);

        // eslint-disable-next-line no-inner-declarations
        async function getDialogOutput() {
            return new Promise((resolve) => {
                const dataConditionalDefenses = {
                    title: item.actor.name + " conditional defenses",
                    content: html,
                    buttons: {
                        normal: {
                            label: "Apply Damage",
                            callback: (html) => {
                                resolve(html.find("form input"));
                            },
                        },
                        cancel: {
                            label: "cancel",
                            callback: () => {
                                resolve(null);
                            },
                        },
                    },
                    default: "normal",
                    close: () => {
                        resolve(null);
                    },
                };
                new Dialog(dataConditionalDefenses).render(true);
            });
        }

        const inputs = await getDialogOutput();
        if (inputs === null) return;

        let defenses = [];
        for (let input of inputs) {
            if (!input.checked) {
                ignoreDefenseIds.push(input.id);
                defenses.push(token.actor.items.get(input.id));
            }
        }

        if (defenses.length > 0) {
            let content = `The following defenses were not applied vs <span title="${item.name.replace(
                /"/g,
                "",
            )}: ${item.system.description.replace(/"/g, "")}">${
                item.name
            }</span>:<ul>`;
            for (let def of defenses) {
                content += `<li title="${def.name.replace(
                    /"/g,
                    "",
                )}: ${def.system.description.replace(/"/g, "")}">${
                    def.name
                }</li>`;
            }
            content += "</ul>";

            const speaker = ChatMessage.getSpeaker({ actor: token.actor });
            speaker["alias"] = token.actor.name;
            const chatData = {
                user: game.user._id,
                type: CONST.CHAT_MESSAGE_TYPES.OTHER,
                content,
                whisper: ChatMessage.getWhisperRecipients("GM"),
                speaker,
            };

            await ChatMessage.create(chatData);
        }
    }

    // -------------------------------------------------
    // determine active defenses
    // -------------------------------------------------
    let defense = "";
    let [
        defenseValue,
        resistantValue,
        impenetrableValue,
        damageReductionValue,
        damageNegationValue,
        knockbackResistance,
        defenseTags,
    ] = determineDefense(token.actor, item, { ignoreDefenseIds });
    if (damageNegationValue > 0) {
        defense += "Damage Negation " + damageNegationValue + "DC(s); ";
    }

    defense =
        defense + defenseValue + " normal; " + resistantValue + " resistant";

    if (damageReductionValue > 0) {
        defense += "; damage reduction " + damageReductionValue + "%";
    }

    damageData.defenseValue = defenseValue;
    damageData.resistantValue = resistantValue;
    damageData.impenetrableValue = impenetrableValue;
    damageData.damageReductionValue = damageReductionValue;
    damageData.damageNegationValue = damageNegationValue;
    damageData.knockbackResistance = knockbackResistance;
    damageData.defenseAvad =
        defenseValue +
        resistantValue +
        impenetrableValue +
        damageReductionValue +
        damageNegationValue +
        knockbackResistance;
    damageData.targetToken = token;

    // AVAD All or Nothing
    if (avad) {
        const nnd = avad.ADDER.find((o) => o.XMLID === "NND"); // Check for ALIAS="All Or Nothing" shouldn't be necessary
        if (nnd && damageData.defenseAvad === 0) {
            // render card
            let speaker = ChatMessage.getSpeaker({ actor: item.actor });

            const chatData = {
                user: game.user._id,
                content: `${item.name} did no damage.`,
                speaker: speaker,
            };

            return ChatMessage.create(chatData);
        }
    }

    heroRoller.removeNDC(damageData.damageNegationValue);

    // We need to recalculate damage to account for possible Damage Negation
    const damageDetail = await _calcDamage(heroRoller, item, damageData);

    // AID, DRAIN or any adjustment powers
    const adjustment = getPowerInfo({
        item: item,
    })?.powerType?.includes("adjustment");
    if (adjustment) {
        return _onApplyAdjustmentToSpecificToken(
            item,
            token,
            damageData,
            defense,
        );
    }
    const senseAffecting = getPowerInfo({
        item: item,
    })?.powerType?.includes("sense-affecting");
    if (senseAffecting) {
        return _onApplySenseAffectingToSpecificToken(
            item,
            token,
            damageData,
            defense,
        );
    }

    // AUTOMATION immune to mental powers
    if (item.system.class === "mental" && token?.actor?.type === "automaton") {
        defenseTags.push({
            name: "AUTOMATON",
            value: "immune",
            resistant: false,
            title: "Automations are immune to mental powers",
        });
        damageDetail.stun = 0;
        damageDetail.body = 0;
    }

    // AUTOMATION powers related to STUN
    const CANNOTBESTUNNED = token.actor.items.find(
        (o) =>
            o.system.XMLID === "AUTOMATON" &&
            o.system.OPTION === "CANNOTBESTUNNED",
    );
    const NOSTUN1 = token.actor.items.find(
        (o) => o.system.XMLID === "AUTOMATON" && o.system.OPTION === "NOSTUN1",
    ); // AUTOMATION Takes No STUN (loses abilities when takes BODY)
    const NOSTUN2 = token.actor.items.find(
        (o) => o.system.XMLID === "AUTOMATON" && o.system.OPTION === "NOSTUN2",
    ); //Takes No STUN
    if (NOSTUN1 && damageDetail.stun > 0) {
        defenseTags.push({
            name: "TAKES NO STUN",
            value: "immune",
            resistant: false,
            title: "Ignore the STUN damage from any attack; loses abilities when takes BODY",
        });
        damageDetail.effects =
            damageDetail.effects +
            "Takes No STUN (loses abilities when takes BODY); ";
        damageDetail.stun = 0;
    }
    if (NOSTUN2 && damageDetail.stun > 0) {
        defenseTags.push({
            name: "TAKES NO STUN",
            value: "immune",
            resistant: false,
            title: "Ignore the STUN damage from any attack",
        });
        damageDetail.effects = damageDetail.effects + "Takes No STUN; ";
        damageDetail.stun = 0;
    }

    // check if target is stunned
    if (game.settings.get("hero6efoundryvttv2", "stunned")) {
        // determine if target was Stunned
        if (
            damageDetail.stun > token.actor.system.characteristics.con.value &&
            !CANNOTBESTUNNED
        ) {
            damageDetail.effects = damageDetail.effects + "inflicts Stunned; ";

            // none: "No Automation",
            // npcOnly: "NPCs Only (end, stun, body)",
            // pcEndOnly: "PCs (end) and NPCs (end, stun, body)",
            // all: "PCs and NPCs (end, stun, body)"
            if (
                automation === "all" ||
                (automation === "npcOnly" && token.actor.type === "npc")
            ) {
                token.actor.addActiveEffect(
                    HeroSystem6eActorActiveEffects.stunEffect,
                );
            }
        }
    }

    const damageRenderedResult = await heroRoller.render();

    // Attack may have additional effects, such as those from martial arts
    let effectsFinal = foundry.utils.deepClone(damageDetail.effects);
    if (item.system.effect) {
        for (const effect of item.system.effect.split(",")) {
            // Do not include [NORMALDC] strike and similar
            if (effect.indexOf("[") == -1 && !effect.match(/strike/i)) {
                effectsFinal += effect;
            }
        }
    }
    effectsFinal = effectsFinal.replace(/; $/, "");

    const cardData = {
        item: item,

        // Incoming Damage Information
        incomingDamageSummary: originalRoll.getTotalSummary(),
        incomingAnnotatedDamageTerms: originalRoll.getAnnotatedTermsSummary(),

        // dice rolls
        roller: heroRoller,
        renderedDamageRoll: damageRenderedResult,
        renderedStunMultiplierRoll: damageDetail.renderedStunMultiplierRoll,

        // body
        bodyDamage: damageDetail.bodyDamage,
        bodyDamageEffective: damageDetail.body,
        countedBody: damageDetail.countedBody,

        // stun
        stunDamage: damageDetail.stunDamage,
        stunDamageEffective: damageDetail.stun,
        hasRenderedDamageRoll: true,
        stunMultiplier: damageDetail.stunMultiplier,
        hasStunMultiplierRoll: damageDetail.hasStunMultiplierRoll,

        damageString: heroRoller.getTotalSummary(),

        // effects
        effects: effectsFinal,

        // defense
        defense: defense,
        damageNegationValue: damageNegationValue,

        // knockback
        knockbackMessage: damageDetail.knockbackMessage,
        useKnockBack: damageDetail.useKnockBack,
        knockbackRenderedResult: damageDetail.knockbackRenderedResult,
        knockbackTags: damageDetail.knockbackTags,

        // misc
        tags: defenseTags,
        targetToken: token,
    };

    // render card
    const template =
        "systems/hero6efoundryvttv2/templates/chat/apply-damage-card.hbs";
    const cardHtml = await renderTemplate(template, cardData);
    const speaker = ChatMessage.getSpeaker({ actor: item.actor });

    const chatData = {
        user: game.user._id,
        content: cardHtml,
        speaker: speaker,
    };

    // none: "No Automation",
    // npcOnly: "NPCs Only (end, stun, body)",
    // pcEndOnly: "PCs (end) and NPCs (end, stun, body)",
    // all: "PCs and NPCs (end, stun, body)"
    if (
        automation === "all" ||
        (automation === "npcOnly" && token.actor.type === "npc")
    ) {
        let changes = {
            "system.characteristics.stun.value":
                token.actor.system.characteristics.stun.value -
                damageDetail.stun,
            "system.characteristics.body.value":
                token.actor.system.characteristics.body.value -
                damageDetail.body,
        };
        await token.actor.update(changes);
    }

    const damageChatMessage = ChatMessage.create(chatData);

    // Absorption happens after damage is taken unless the GM allows it.
    const absorptionItems = token.actor.items.filter(
        (item) => item.system.XMLID === "ABSORPTION",
    );
    if (absorptionItems) {
        await _performAbsorptionForToken(
            token,
            absorptionItems,
            damageDetail,
            item,
        );
    }

    return damageChatMessage;
}

async function _performAbsorptionForToken(
    token,
    absorptionItems,
    damageDetail,
    damageItem,
) {
    const attackType = damageItem.system.class; // TODO: avad?

    // Match attack against absorption type. If we match we can do some absorption.
    for (const absorptionItem of absorptionItems) {
        if (absorptionItem.system.OPTION === attackType.toUpperCase()) {
            const actor = absorptionItem.actor;
            let maxAbsorption;
            if (actor.system.is5e) {
                const dice = absorptionItem.system.dice;
                const extraDice = absorptionItem.system.extraDice;

                // Absorption allowed based on a roll with the usual requirements
                const absorptionRoller = new HeroRoller()
                    .makeAdjustmentRoll()
                    .addDice(dice)
                    .addHalfDice(extraDice === "half" ? 1 : 0)
                    .addDiceMinus1(extraDice === "one-pip" ? 1 : 0)
                    .addNumber(extraDice === "pip" ? 1 : 0);

                if (dice > 0 || (dice === 0 && extraDice !== "zero")) {
                    await absorptionRoller.roll();
                    maxAbsorption = absorptionRoller.getAdjustmentTotal();
                } else {
                    maxAbsorption = 0;
                }

                // Present the roll.
                const cardHtml = await absorptionRoller.render(
                    `${attackType} attack vs ${absorptionItem.name}`,
                );

                const speaker = ChatMessage.getSpeaker({
                    actor: actor,
                    token,
                });
                speaker.alias = actor.name;

                const chatData = {
                    type: CONST.CHAT_MESSAGE_TYPES.ROLL,
                    rolls: absorptionRoller.rawRolls(),
                    user: game.user._id,
                    content: cardHtml,
                    speaker: speaker,
                };

                await ChatMessage.create(chatData);
            } else {
                maxAbsorption = parseInt(absorptionItem.system.LEVELS);
            }

            console.warn("TODO: Not tracking per segment absorption max");

            // Apply the absorption
            await _onApplyAdjustmentToSpecificToken(
                absorptionItem,
                token,
                {
                    stundamage: Math.min(
                        maxAbsorption,
                        damageDetail.bodyDamage,
                    ),
                    defenseValue: 0,
                    resistantValue: 0,
                },
                "Absorption - No Defense",
            );
        }
    }
}

async function _onApplyAdjustmentToSpecificToken(
    adjustmentItem,
    token,
    damageData,
    defense,
) {
    if (
        adjustmentItem.actor.id === token.actor.id &&
        ["DISPEL", "DRAIN", "SUPPRESS", "TRANSFER"].includes(
            adjustmentItem.system.XMLID,
        )
    ) {
        await ui.notifications.warn(
            `${adjustmentItem.system.XMLID} attacker/source (${adjustmentItem.actor.name}) and defender/target (${token.actor.name}) are the same.`,
        );
    }

    const rawActivePointsDamage = parseInt(damageData.stundamage);
    const actualActivePointDamage = Math.max(
        0,
        rawActivePointsDamage -
            damageData.defenseValue -
            damageData.resistantValue,
    );

    const { valid, reducesArray, enhancesArray } =
        adjustmentItem.splitAdjustmentSourceAndTarget();
    if (!valid) {
        return ui.notifications.error(
            `Invalid adjustment sources/targets provided. Compute effects manually.`,
        );
    }

    const reductionChatMessages = [];
    const reductionTargetActor = token.actor;
    for (const reduce of reducesArray) {
        reductionChatMessages.push(
            await performAdjustment(
                adjustmentItem,
                reduce,
                rawActivePointsDamage,
                actualActivePointDamage,
                defense,
                false,
                reductionTargetActor,
            ),
        );
    }
    if (reductionChatMessages.length > 0) {
        await renderAdjustmentChatCards(reductionChatMessages);
    }

    const enhancementChatMessages = [];
    const enhancementTargetActor =
        adjustmentItem.system.XMLID === "TRANSFER"
            ? adjustmentItem.actor
            : token.actor;
    for (const enhance of enhancesArray) {
        enhancementChatMessages.push(
            await performAdjustment(
                adjustmentItem,
                enhance,
                -rawActivePointsDamage,
                adjustmentItem.system.XMLID === "TRANSFER"
                    ? -actualActivePointDamage
                    : -rawActivePointsDamage,
                "None - Beneficial",
                false,
                enhancementTargetActor,
            ),
        );
    }
    if (enhancementChatMessages.length > 0) {
        await renderAdjustmentChatCards(enhancementChatMessages);
    }
}

async function _onApplySenseAffectingToSpecificToken(
    senseAffectingItem,
    token,
    damageData,
    defense,
) {
    // FLASHDEFENSE
    const flashDefense = senseAffectingItem.actor.items.find(
        (o) => o.system.XMLID === "FLASHDEFENSE",
    );
    if (flashDefense) {
        const value = parseInt(flashDefense.system.LEVELS.value || 0);
        damageData.bodydamage = Math.max(0, damageData.bodydamage - value);
        defense = `${value} Flash Defense`;
    }

    // Create new ActiveEffect
    if (damageData.bodydamage > 0) {
        token.actor.addActiveEffect({
            ...HeroSystem6eActorActiveEffects.blindEffect,
            name: `${senseAffectingItem.system.XMLID} ${damageData.bodydamage} [${senseAffectingItem.actor.name}]`,
            duration: {
                seconds: damageData.bodydamage,
            },
            flags: {
                bodyDamage: damageData.bodydamage,
                XMLID: senseAffectingItem.system.XMLID,
                source: senseAffectingItem.actor.name,
            },
            origin: senseAffectingItem.uuid,
        });
    }

    const cardData = {
        item: senseAffectingItem,
        // dice rolls

        // body
        damageData,

        // defense
        defense: defense,

        // misc
        targetToken: token,
    };

    // render card
    const template =
        "systems/hero6efoundryvttv2/templates/chat/apply-sense-affecting-card.hbs";
    const cardHtml = await renderTemplate(template, cardData);
    const speaker = ChatMessage.getSpeaker({ actor: senseAffectingItem.actor });

    const chatData = {
        user: game.user._id,
        content: cardHtml,
        speaker: speaker,
    };

    return ChatMessage.create(chatData);
}

/**
 *
 * @param {HeroRoller} heroRoller
 * @param {*} item
 * @param {*} options
 * @returns
 */
async function _calcDamage(heroRoller, item, options) {
    let damageDetail = {};
    const itemData = item.system;

    const adjustmentPower = getPowerInfo({
        item: item,
    })?.powerType?.includes("adjustment");
    const senseAffectingPower = getPowerInfo({
        item: item,
    })?.powerType?.includes("sense-affecting");
    const entangle = item.system.XMLID === "ENTANGLE";

    let body;
    let stun;

    if (adjustmentPower) {
        body = 0;
        stun = heroRoller.getAdjustmentTotal();
    } else if (senseAffectingPower) {
        body = heroRoller.getFlashTotal();
        stun = 0;
    } else if (entangle) {
        body = heroRoller.getEntangleTotal();
        stun = 0;
    } else {
        body = heroRoller.getBodyTotal();
        stun = heroRoller.getStunTotal();
    }

    let hasStunMultiplierRoll = !!itemData.killing;

    let stunMultiplier = hasStunMultiplierRoll
        ? heroRoller.getStunMultiplier()
        : 1;

    let noHitLocationsPower = item.system.noHitLocations || false;

    // TODO: FIXME: This calculation is buggy as it doesn't consider:
    //       multiple levels of penetrating vs hardened/impenetrable
    //       or the fact that there is no impenetrable in 5e which uses hardened instead.
    // Penetrating
    const penetratingBody = item.system.penetrating
        ? Math.max(0, body - options.impenetrableValue)
        : 0;

    // get hit location
    let hitLocation = "None";
    let useHitLoc = false;

    if (
        game.settings.get("hero6efoundryvttv2", "hit locations") &&
        !noHitLocationsPower
    ) {
        useHitLoc = true;

        if (
            game.settings.get("hero6efoundryvttv2", "hitLocTracking") === "all"
        ) {
            hitLocation = heroRoller.getHitLocation().fullName;
        } else {
            hitLocation = heroRoller.getHitLocation().name;
        }
    }

    let bodyDamage = body;
    let stunDamage = stun;

    let effects = "";
    if (item.system.EFFECT) {
        effects = item.system.EFFECT + ";";
    }

    // Splits an attack into two equal parts for the purpose of
    // determining BODY damage and applying it to the target’s
    // defenses (though it’s still resolved with one Attack Roll and
    // treated as a single attack).
    // This is super awkward with the current system.
    // KLUGE: Apply body defense twice.
    let REDUCEDPENETRATION = item.findModsByXmlid("REDUCEDPENETRATION");
    if (REDUCEDPENETRATION) {
        if (item.killing) {
            body = Math.max(0, body - (options.resistantValue || 0));
        }
        body = Math.max(0, body - (options.defenseValue || 0));
    }

    // determine knockback
    let useKnockBack = false;
    let knockbackMessage = "";
    let knockbackRenderedResult = null;
    const knockbackMultiplier = parseInt(itemData.knockbackMultiplier);
    let knockbackTags = [];
    if (
        game.settings.get("hero6efoundryvttv2", "knockback") &&
        knockbackMultiplier
    ) {
        useKnockBack = true;

        let knockbackDice = 2;

        // Target is in the air -1d6
        // TODO: This is perhaps not the right check as they could just have the movement radio on. Consider a flying status
        //       when more than 0m off the ground? This same effect should also be considered for gliding.
        if (options.targetToken?.actor?.flags?.activeMovement === "flight") {
            knockbackDice -= 1;
            knockbackTags.push({
                value: "-1d6KB",
                name: "target is in the air",
                title: "Knockback Modifier",
            });
        }

        // TODO: Target Rolled With A Punch -1d6
        // TODO: Target is in zero gravity -1d6

        // Target is underwater +1d6
        if (options.targetToken?.actor?.statuses?.has("underwater")) {
            knockbackDice += 1;
            knockbackTags.push({
                value: "+1d6KB",
                name: "target is underwater",
                title: "Knockback Modifier",
            });
        }

        // TODO: Target is using Clinging +1d6

        // Attack did Killing Damage +1d6
        if (item.system.killing) {
            knockbackDice += 1;
            knockbackTags.push({
                value: "+1d6KB",
                name: "attack did Killing Damage",
                title: "Knockback Modifier",
            });
        }

        // Attack used a Martial Maneuver +1d6
        if (["martialart", "martial"].includes(item.type)) {
            knockbackDice += 1;
            knockbackTags.push({
                value: "+1d6",
                name: "attack used a Martial Maneuver",
                title: "Knockback Modifier",
            });
        }

        const knockbackHeroRoller = new HeroRoller()
            .makeBasicRoll()
            .addNumber(
                body * (knockbackMultiplier > 1 ? knockbackMultiplier : 1), // TODO: Consider supporting multiplication in HeroRoller
                "Max potential knockback",
            )
            .subNumber(
                parseInt(options.knockbackResistance || 0),
                "Knockback resistance",
            )
            .addDice(
                parseInt(options.knockbackMod || options.knockbadmod || 0),
                "Knockback modifier", // knockback modifier added on an attack by attack basis
            )
            .subDice(Math.max(0, knockbackDice));
        await knockbackHeroRoller.roll();

        const knockbackResultTotal = Math.round(
            knockbackHeroRoller.getBasicTotal(),
        );

        knockbackRenderedResult = await knockbackHeroRoller.render();

        if (knockbackResultTotal < 0) {
            knockbackMessage = "No Knockback";
        } else if (knockbackResultTotal == 0) {
            knockbackMessage = "Inflicts Knockdown";
        } else {
            // If the result is positive, the target is Knocked Back 1" or 2m times the result
            knockbackMessage = `Knocked Back ${
                knockbackResultTotal * (item.actor.system.is5e ? 1 : 2)
            }${getSystemDisplayUnits(item.actor)}`;
        }
    }

    // -------------------------------------------------
    // determine effective damage
    // -------------------------------------------------

    if (itemData.killing) {
        stun =
            stun - (options.defenseValue || 0) - (options.resistantValue || 0);
        body = body - (options.resistantValue || 0);
    } else {
        stun =
            stun - (options.defenseValue || 0) - (options.resistantValue || 0);
        body =
            body - (options.defenseValue || 0) - (options.resistantValue || 0);
    }

    stun = RoundFavorPlayerDown(stun < 0 ? 0 : stun);
    body = RoundFavorPlayerDown(body < 0 ? 0 : body);

    let hitLocText = "";
    if (
        game.settings.get("hero6efoundryvttv2", "hit locations") &&
        !noHitLocationsPower
    ) {
        const hitLocationBodyMultiplier =
            heroRoller.getHitLocation().bodyMultiplier;
        const hitLocationStunMultiplier =
            heroRoller.getHitLocation().stunMultiplier;

        if (itemData.killing) {
            // killing attacks apply hit location multiplier after resistant damage protection has been subtracted
            // Location : [x Stun, x N Stun, x Body, OCV modifier]
            // TODO: Should this also be round down?
            body = body * hitLocationBodyMultiplier;
        } else {
            // stun attacks apply N STUN hit location multiplier after defenses
            stun = RoundFavorPlayerDown(stun * hitLocationStunMultiplier);
            body = RoundFavorPlayerDown(body * hitLocationBodyMultiplier);
        }

        hitLocText =
            "Hit " +
            hitLocation +
            " (x" +
            hitLocationStunMultiplier +
            " STUN x" +
            hitLocationBodyMultiplier +
            " BODY)";

        hasStunMultiplierRoll = false;
    }

    // apply damage reduction
    if (options.damageReductionValue > 0) {
        //defense += "; damage reduction " + options.damageReductionValue + "%";
        stun = RoundFavorPlayerDown(
            stun * (1 - options.damageReductionValue / 100),
        );
        body = RoundFavorPlayerDown(
            body * (1 - options.damageReductionValue / 100),
        );
    }

    // minimum damage rule
    if (stun < body) {
        stun = body;
        effects +=
            `minimum damage invoked <i class="fal fa-circle-info" data-tooltip="` +
            `<b>MINIMUM DAMAGE FROM INJURIES</b><br>` +
            `A character automatically takes 1 STUN for every 1 point of BODY
        damage that gets through their defenses. They can Recover this STUN
        normally; they don't have to heal the BODY damage first.` +
            `"></i> `;
    }

    // The body of a penetrating attack is the minimum damage
    if (penetratingBody > body) {
        if (itemData.killing) {
            body = penetratingBody;
            stun = body * stunMultiplier;
        } else {
            stun = penetratingBody;
        }
        effects += "penetrating damage; ";
    }

    // StunOnly?
    if (item.system.stunBodyDamage === "stunonly") {
        body = 0;
    }

    // BodyOnly?
    if (item.system.stunBodyDamage === "bodyonly") {
        stun = 0;
    }

    // EffectOnly?
    if (item.system.stunBodyDamage === "effectonly") {
        stun = 0;
        body = 0;
    }

    stun = RoundFavorPlayerDown(stun);
    body = RoundFavorPlayerDown(body);

    // TODO: Should this be entirely within the HeroRoller itself and extractable as required?
    damageDetail.body = body;
    damageDetail.stun = stun;
    damageDetail.effects = effects;
    damageDetail.stunDamage = stunDamage;
    damageDetail.bodyDamage = bodyDamage;
    damageDetail.stunMultiplier = stunMultiplier;
    damageDetail.hasStunMultiplierRoll = hasStunMultiplierRoll;
    damageDetail.useHitLoc = useHitLoc;
    damageDetail.hitLocText = hitLocText;
    damageDetail.hitLocation = hitLocation;

    damageDetail.knockbackMessage = knockbackMessage;
    damageDetail.useKnockBack = useKnockBack;
    damageDetail.knockbackRenderedResult = knockbackRenderedResult;
    damageDetail.knockbackTags = knockbackTags;

    return damageDetail;
}
