import { HEROSYS } from "./herosystem6e.mjs";
import { clamp } from "./utility/compatibility.mjs";
import { whisperUserTargetsForActor, expireEffects, toHHMMSS } from "./utility/util.mjs";
import { rehydrateAttackItem, userInteractiveVerifyOptionallyPromptThenSpendResources } from "./item/item-attack.mjs";
import { HeroSystem6eActorActiveEffects } from "./actor/actor-active-effects.mjs";

// export class HeroSystem6eCombat extends Combat {}

export class HeroSystem6eCombat extends Combat {
    constructor(data, context) {
        data ??= {};
        data.flags ??= {};
        data.flags[game.system.id] ??= {};
        data.flags[game.system.id].segment ??= 12;
        super(data, context);

        this.previous = this.previous || {
            combatantId: null,
        };
    }

    async rollInitiative(ids) {
        if (CONFIG.debug.combat) {
            console.debug(`Hero | rollInitiative`, ids);
        }
        ids = typeof ids === "string" ? [ids] : ids;
        //const currentId = this.combatant?.id;
        // Iterate over Combatants, performing an initiative roll for each
        const updates = [];
        for (const id of ids) {
            // Get Combatant data (non-strictly)
            const combatant = this.combatants.get(id);
            if (!combatant?.isOwner) continue;

            // Produce an initiative roll for the Combatant
            const characteristic = combatant.actor?.system?.initiativeCharacteristic || "dex";
            const initValue =
                (combatant.actor?.system.characteristics[characteristic]?.value || 0) +
                parseInt(combatant.flags.hero6efoundryvttv2?.lightningReflexes?.levels || 0);
            if (
                combatant.flags[game.system.id]?.initiative != initValue ||
                combatant.flags[game.system.id]?.initiativeCharacteristic != characteristic
            ) {
                // monks-combat-marker shows error with tokenDocument.object is nul..
                // tokenDocument is supposed to have an object.
                // Unclear why it is missing sometimes.
                // KLUGE: Do not update initiative when tokenDocument.object is missing.
                if (combatant.token.object) {
                    updates.push({
                        _id: id,
                        [`flags.${game.system.id}.initiative`]: initValue,
                        [`flags.${game.system.id}.initiativeCharacteristic`]: characteristic,
                        initiative: initValue,
                    });
                }
            }
        }

        // Update multiple combatants
        if (updates && updates.length > 0) {
            await this.updateEmbeddedDocuments("Combatant", updates);
        }

        return this;
    }

    /**
     * Return the Array of combatants sorted into initiative order, breaking ties alphabetically by name.
     * @returns {Combatant[]}
     */
    // setupTurns() {
    //     // if (CONFIG.debug.combat) {
    //     //     console.debug(`Hero | setupTurns`);
    //     // }

    //     this.turns ||= [];

    //     // Determine the turn order and the current turn
    //     const turns = this.combatants.contents.sort(this._sortCombatants);
    //     if (this.turn !== null) this.turn = clamp(this.turn, 0, turns.length - 1);

    //     // Update state tracking
    //     const c = turns[this.turn];
    //     this.current = this._getCurrentState(c);

    //     // One-time initialization of the previous state
    //     if (!this.previous) this.previous = this.current;

    //     // Return the array of prepared turns
    //     return (this.turns = turns);
    // }

    /**
     * Define how the array of Combatants is sorted in the displayed list of the tracker.
     * This method can be overridden by a system or module which needs to display combatants in an alternative order.
     * The default sorting rules sort in descending order of initiative using combatant IDs for tiebreakers.
     * @param {Combatant} a     Some combatant
     * @param {Combatant} b     Some other combatant
     * @protected
     */
    _sortCombatants(a, b) {
        try {
            const actorA = game.actors.get(a.actorId);
            const actorB = game.actors.get(b.actorId);
            // Lightning Reflexes
            // const lrA = Number.isNumeric(a.flags[game.system.id]?.lightningReflexes?.levels)
            //     ? a.flags[game.system.id]?.lightningReflexes.levels
            //     : 0;
            // const lrB = Number.isNumeric(b.flags[game.system.id]?.lightningReflexes?.levels)
            //     ? b.flags[game.system.id]?.lightningReflexes.levels
            //     : 0;

            // Sort by segment first
            const segA = Number.isNumeric(a.flags[game.system.id]?.segment)
                ? a.flags[game.system.id].segment
                : -Infinity;
            const segB = Number.isNumeric(b.flags[game.system.id]?.segment)
                ? b.flags[game.system.id].segment
                : -Infinity;

            // Then by initiative
            const initA = Number.isNumeric(a.initiative) ? a.initiative : -Infinity;
            const initB = Number.isNumeric(b.initiative) ? b.initiative : -Infinity;

            // Alternately, the GM may dispense with the
            // DEX Roll (perhaps as a way of speeding up
            // combat) and allow one of the characters to go first
            // based on their respective abilities. Three possibilities
            // include: the character with the highest INT
            // acts first (if their INTs are also tied, use PRE); the
            // character with Fast Draw acts first (if both have
            // Fast Draw, the one with the highest roll acts first);
            // or if one character has a Held Action and the other
            // does not, the character with the Held Action gets
            // to act first.

            // Intelligence
            const intA = Number.isNumeric(actorA.system.characteristics.int?.value)
                ? actorA.system.characteristics.int.value
                : -Infinity;
            const intB = Number.isNumeric(actorB.system.characteristics.int?.value)
                ? actorB.system.characteristics.int.value
                : -Infinity;

            // Presence
            const preA = Number.isNumeric(actorA.system.characteristics.pre?.value)
                ? actorA.system.characteristics.pre.value
                : -Infinity;
            const preB = Number.isNumeric(actorB.system.characteristics.pre?.value)
                ? actorB.system.characteristics.pre.value
                : -Infinity;

            // Then by Speed
            // Rules don't specifically state to use SPD for ties, but seems like the right thing to do
            const spdA = Number.isNumeric(actorA.system.characteristics.spd?.value)
                ? actorA.system.characteristics.spd.value
                : -Infinity;
            const spdB = Number.isNumeric(actorB.system.characteristics.spd?.value)
                ? actorB.system.characteristics.spd.value
                : -Infinity;

            // Then by hasPlayerOwner
            // Rules don't specifically state that ties go to players, but seems like the right thing to do

            // Finally by tokenId
            // We need some way to break ties.
            // Champions suggests rolling a d6 (which we don't currently support)

            return (
                segA - segB ||
                initB - initA ||
                intB - intA ||
                preB - preA ||
                spdB - spdA ||
                (a.hasPlayerOwner === b.hasPlayerOwner ? 0 : a.hasPlayerOwner ? -1 : 1) ||
                a.tokenId.localeCompare(b.tokenId)
            );
        } catch (e) {
            console.error(e);
            return 0;
        }
    }

    static get singleCombatantTracker() {
        return (
            game.settings.get(game.system.id, "alphaTesting") &&
            game.settings.get(game.system.id, "singleCombatantTracker")
        );
    }

    /**
     * Actions taken after descendant documents have been created and changes have been applied to client data.
     * @param {Document} parent         The direct parent of the created Documents, may be this Document or a child
     * @param {string} collection       The collection within which documents were created
     * @param {Document[]} documents    The array of created Documents
     * @param {object[]} data           The source data for new documents that were created
     * @param {object} options          Options which modified the creation operation
     * @param {string} userId           The ID of the User who triggered the operation
     * @override
     */
    async _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
        if (CONFIG.debug.combat) {
            console.debug(`Hero | _onCreateDescendantDocuments`);
        }

        // Automatically roll initiative for all combatants created in the combat tracker.
        // We could use rollAll() here, but rollInitiative is probably more efficient.
        await this.rollInitiative(documents.map((o) => o.id));

        // Get current combatant and try to maintain turn order to the best of our ability
        //const priorState = foundry.utils.deepClone(this.current);

        this.setupTurns();

        // Variable options.combatTurn is the current combat turn,
        // which normally should remain the same after we add a new combatant.
        // Need some help when called from extraCombatants to keep proper turn.
        if (options.combatTurn && options.combatant) {
            options.combatTurn = this.turns.findIndex((o) => o.id === options.combatant._id) || options.combatTurn;
        }

        // Call Super
        await super._onCreateDescendantDocuments(
            parent,
            collection,
            documents,
            data,
            options, //{ ...options, combatTurn: combatTurn },
            userId,
        );

        if (!HeroSystem6eCombat.singleCombatantTracker) {
            // Add or remove extra combatants based on SPD or Lightning Reflexes
            await this.extraCombatants();

            for (const tokenId of [...new Set(documents.map((o) => o.tokenId))]) {
                await this.assignSegments(tokenId);
            }
        }
    }

    async _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
        if (CONFIG.debug.combat) {
            console.debug(`Hero | _onDeleteDescendantDocuments`);
        }

        // Get current combatant
        const priorState = foundry.utils.deepClone(this.current);
        this.setupTurns();
        await this.assignSegments(priorState.tokenId);
        const combatTurn = this.getCombatTurnHero(priorState);

        // Call the Super (don't render the likely incorrect turn that default foundry provides)
        await super._onDeleteDescendantDocuments(
            parent,
            collection,
            documents,
            ids,
            { ...options, combatTurn: combatTurn },
            userId,
        );

        // if (!HeroSystem6eCombat.singleCombatantTracker) {
        //     // Add or remove extra combatants based on SPD or Lightning Reflexes (shouldn't be needed as we have overrides for combatant deletes via UI)
        //     //await this.extraCombatants();
        // }
    }

    async assignSegments(tokenId) {
        if (!tokenId) return;

        if (!HeroSystem6eCombat.singleCombatantTracker) {
            console.warn("assignedSegments called for singleCombatantTracker");
            return;
        }

        try {
            const tokenCombatants = this.combatants.filter((o) => o.tokenId === tokenId);
            const tokenCombatantCount = tokenCombatants.length;
            if (tokenCombatantCount === 0) return;
            if (!tokenCombatants[0]?.isOwner) return;
            const actor = tokenCombatants[0].actor;
            if (!actor) return;
            const lightningReflexes = actor?.items.find(
                (o) => o.system.XMLID === "LIGHTNING_REFLEXES_ALL" || o.system.XMLID === "LIGHTNING_REFLEXES_SINGLE",
            );
            const updates = [];
            for (let c = 0; c < tokenCombatantCount; c++) {
                const _combatant = tokenCombatants[c];
                const spd = clamp(parseInt(_combatant.actor?.system.characteristics.spd?.value || 0), 1, 12);
                if (spd) {
                    const segment = HeroSystem6eCombat.getSegment(spd, Math.floor(c * (lightningReflexes ? 0.5 : 1)));
                    let update = {
                        _id: _combatant.id,
                        initiative: _combatant.flags[game.system.id]?.initiative || _combatant.initiative,
                        [`flags.${game.system.id}.segment`]: segment,
                        [`flags.${game.system.id}.spd`]: spd,
                        [`flags.${game.system.id}.initiativeTooltip`]: `${
                            _combatant.flags[game.system.id]?.initiative
                        }${_combatant.flags[game.system.id]?.initiativeCharacteristic?.toUpperCase()} ${spd}SPD`,
                    };
                    if (lightningReflexes && c % 2 === 0) {
                        update = {
                            ...update,
                            [`flags.${game.system.id}.initiativeTooltip`]: `${
                                _combatant.flags[game.system.id].initiative
                            }${_combatant.flags[game.system.id].initiativeCharacteristic?.toUpperCase()} ${spd}SPD ${
                                lightningReflexes.system.LEVELS
                            }LR`,
                            initiative:
                                (_combatant.flags[game.system.id]?.initiative || _combatant.initiative) +
                                parseInt(lightningReflexes?.system.LEVELS || 0),
                            [`flags.${game.system.id}.lightningReflexes.levels`]: parseInt(
                                lightningReflexes.system.LEVELS,
                            ),
                            [`flags.${game.system.id}.lightningReflexes.name`]:
                                lightningReflexes.system.OPTION_ALIAS ||
                                lightningReflexes.system.INPUT ||
                                "All Actions",
                        };
                    } else {
                        update = {
                            ...update,
                            [`flags.${game.system.id}.lightningReflexes`]: null,
                        };
                    }
                    if (
                        update.initiative != _combatant.initiative ||
                        update[`flags.${game.system.id}.lightningReflexes.name`] !=
                            _combatant.flags?.[game.system.id]?.lightningReflexes?.name ||
                        update[`flags.${game.system.id}.segment`] != _combatant.flags?.[game.system.id]?.segment
                    ) {
                        updates.push(update);
                    }
                }
            }
            if (updates.length > 0) {
                await this.updateEmbeddedDocuments("Combatant", updates);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async extraCombatants() {
        if (HeroSystem6eCombat.singleCombatantTracker) {
            console.warn(`Calling extraCombatants with singleCombatantTracker`);
            return;
        }

        if (CONFIG.debug.combat) {
            console.debug(`Hero | extraCombatants`);
        }

        try {
            // Only 1 GM should do this
            if (!game.users.activeGM?.isSelf) return;

            const toCreate = [];
            const toDelete = [];

            const uniqueTokens = Array.from(new Set(this.combatants.map((o) => o.tokenId)));
            for (const _tokenId of uniqueTokens) {
                const _combatant = this.combatants.find((o) => o.tokenId === _tokenId && o.actor);
                if (!_combatant?.isOwner) continue;
                const actor = _combatant?.actor;
                if (!actor) continue;
                const lightningReflexes = actor?.items.find(
                    (o) =>
                        o.system.XMLID === "LIGHTNING_REFLEXES_ALL" || o.system.XMLID === "LIGHTNING_REFLEXES_SINGLE",
                );
                const targetCombatantCount =
                    clamp(parseInt(actor.system.characteristics.spd?.value || 0), 1, 12) * (lightningReflexes ? 2 : 1);
                const tokenCombatants = this.combatants.filter((o) => o.tokenId === _tokenId);
                const tokenCombatantCount = tokenCombatants.length;

                if (tokenCombatantCount < targetCombatantCount) {
                    for (let i = 0; i < targetCombatantCount - tokenCombatantCount; i++) {
                        toCreate.push({
                            ...foundry.utils.deepClone(_combatant),
                            _id: null,
                            flags: {
                                [game.system.id]: {
                                    segment: HeroSystem6eCombat.getSegment(actor.system.characteristics.spd.value, i),
                                },
                            },
                        });
                    }
                    continue;
                }

                if (tokenCombatantCount > targetCombatantCount) {
                    const _combatants = this.combatants.filter((o) => o.tokenId === _tokenId && o.actor);
                    toDelete.push(
                        ..._combatants.filter((o) => o.id).slice(0, tokenCombatantCount - targetCombatantCount),
                    );
                    continue;
                }

                // Add custom hero flags for segments and such
                // if (tokenCombatantCount === targetCombatantCount) {
                //     await this.assignSegments(_tokenId);
                // }
            }

            if (toCreate.length > 0) {
                await this.createEmbeddedDocuments("Combatant", toCreate);
            }

            if (toDelete.length > 0) {
                await this.deleteEmbeddedDocuments(
                    "Combatant",
                    toDelete.map((o) => o.id),
                );
            }
            console.debug(
                `extraCombatants/after: ${this.current.name} segment=${this.current.segment} init=${this.current.initiative}`,
                this,
            );
        } catch (e) {
            console.error(e);
        }
    }

    static getSegment(spd, index) {
        let i = index;
        for (let segment = 1; segment <= 12; segment++) {
            if (HeroSystem6eCombat.hasPhase(spd, segment)) {
                i--;
                if (i < 0) {
                    return segment;
                }
            }
        }
        return 12;
    }

    static hasPhase(spd, segment) {
        switch (clamp(parseInt(spd), 0, 12)) {
            case 0:
                // At SPD 0, a character is frozen in place, unable to move or take any other Actions. He can only take Post-Segment 12 Recoveries,
                return [12].includes(segment);
            case 1:
                return [12].includes(segment);
            case 2:
                return [6, 12].includes(segment);
            case 3:
                return [4, 8, 12].includes(segment);
            case 4:
                return [3, 6, 9, 12].includes(segment);
            case 5:
                return [3, 5, 8, 10, 12].includes(segment);
            case 6:
                return [2, 4, 6, 8, 10, 12].includes(segment);
            case 7:
                return [2, 4, 6, 7, 9, 11, 12].includes(segment);
            case 8:
                return [2, 3, 5, 6, 8, 9, 11, 12].includes(segment);
            case 9:
                return [2, 3, 4, 6, 7, 8, 10, 11, 12].includes(segment);
            case 10:
                return [2, 3, 4, 5, 6, 8, 9, 10, 11, 12].includes(segment);
            case 11:
                return [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(segment);
            case 12:
                return true;
            default:
                // if (spd < 1 && segment === 12) return true;
                // if (spd === undefined && segment === 12) return true;
                return false;
        }
    }

    /**
     * Get the current history state of the Combat encounter.
     * @param {Combatant} [combatant]       The new active combatant
     * @returns {CombatHistoryData}
     * @protected
     */
    _getCurrentState(combatant) {
        combatant ||= this.combatant;
        return {
            round: this.round,
            turn: this.turn ?? null,
            combatantId: combatant?.id || null,
            tokenId: combatant?.tokenId || null,
            segment: combatant?.flags[game.system.id]?.segment || this?.flags[game.system.id]?.segment || null,
            name: combatant?.token?.name || combatant?.actor?.name || null,
            initiative: combatant?.initiative || null,
        };
    }

    /**
     * Begin the combat encounter, advancing to round 1 and turn 1
     * @returns {Promise<Combat>}
     */
    async startCombat() {
        if (CONFIG.debug.combat) {
            console.debug(`Hero | startCombat`);
        }
        // Hero combats start with round 1 and segment 12.
        const firstSegment12turn = this.turns.findIndex((o) => o.flags[game.system.id]?.segment === 12) || 0;

        this._playCombatSound("startEncounter");
        const updateData = {
            round: 1,
            turn: firstSegment12turn,
            [`flags.${game.system.id}.-=postSegment12Round`]: null,
            [`flags.${game.system.id}-heroCurrent`]: null,
        };
        Hooks.callAll("combatStart", this, updateData);
        return this.update(updateData);
    }

    /**
     * A workflow that occurs at the start of each Combat Turn.
     * This workflow occurs after the Combat document update, new turn information exists in this.current.
     * This can be overridden to implement system-specific combat tracking behaviors.
     * This method only executes for one designated GM user. If no GM users are present this method will not be called.
     * @param {Combatant} combatant     The Combatant whose turn just started
     * @returns {Promise<void>}
     * @protected
     */
    async _onStartTurn(combatant) {
        if (CONFIG.debug.combat) {
            console.debug(
                `%c Hero | _onStartTurn: ${combatant.name} ${game.time.worldTime}`,
                "background: #292; color: #bada55",
            );
        }

        // We need a single combatant to store some flags. Like for DragRuler, end tracking, etc.
        // getCombatantByToken seems to get the first combatant in combat.turns that is for our token.
        // This likely causes issues when SPD/LightningReflexes changes.
        const masterCombatant = this.getCombatantByToken(combatant.tokenId);

        await super._onStartTurn(combatant);

        if (!combatant) return;

        // Save some properties for future support for rewinding combat tracker
        // TODO: Include charges for various items
        combatant.flags[game.system.id] ??= {};
        combatant.flags[game.system.id].heroHistory ??= {};
        if (combatant.actor && this.round && combatant.flags[game.system.id].segment) {
            combatant.flags[game.system.id].heroHistory[
                `r${String(this.round).padStart(2, "0")}s${String(combatant.flags[game.system.id].segment).padStart(2, "0")}`
            ] = {
                end: combatant.actor.system.characteristics.end?.value,
                stun: combatant.actor.system.characteristics.stun?.value,
                body: combatant.actor.system.characteristics.body?.value,
            };
            const updates = [
                {
                    _id: combatant.id,
                    [`flags.${game.system.id}.heroHistory`]: combatant.flags[game.system.id].heroHistory,
                },
            ];
            this.updateEmbeddedDocuments("Combatant", updates);
        }

        // Expire Effects
        // We expire on our phase, not on our segment.
        try {
            await expireEffects(combatant.actor);
        } catch (e) {
            console.error(e);
        }

        // Stop holding
        if (combatant.actor.statuses.has("holding")) {
            //const ae = combatant.actor.effects.find((effect) => effect.statuses.has("holding"));
            //combatant.actor.removeActiveEffect(ae);
            await combatant.actor.toggleStatusEffect(
                HeroSystem6eActorActiveEffects.statusEffectsObj.holdingAnActionEffect.id,
                {
                    active: false,
                },
            );
        }

        // Stop nonCombatMovement
        if (combatant.actor.statuses.has("nonCombatMovement")) {
            //const ae = combatant.actor.effects.find((effect) => effect.statuses.has("nonCombatMovement"));
            //combatant.actor.removeActiveEffect(ae);
            await combatant.actor.toggleStatusEffect(
                HeroSystem6eActorActiveEffects.statusEffectsObj.nonCombatMovementEffect.id,
                {
                    active: false,
                },
            );
        }

        // Stop BRACE
        const BRACE = combatant.actor.items.find((i) => i.system.XMLID === "BRACE");
        if (BRACE?.system.active === true) {
            await BRACE.toggle();
        }

        // Stop HAYMAKER
        const HAYMAKER = combatant.actor.items.find((i) => i.system.XMLID === "HAYMAKER");
        if (HAYMAKER?.system.active === true) {
            await HAYMAKER.toggle();
        }

        // Stop dodges and other maneuvers' active effects that expire automatically
        const maneuverNextPhaseAes = combatant.actor.effects.filter(
            (ae) => ae.flags?.[game.system.id]?.type === "maneuverNextPhaseEffect",
        );
        const maneuverNextPhaseTogglePromises = maneuverNextPhaseAes
            .filter((ae) => ae.flags[game.system.id]?.toggle)
            .map((toggleAes) => {
                const maneuver =
                    fromUuidSync(toggleAes.flags[game.system.id]?.itemUuid) ||
                    rehydrateAttackItem(
                        toggleAes.flags[game.system.id]?.dehydratedManeuverItem,
                        fromUuidSync(toggleAes.flags[game.system.id]?.dehydratedManeuverActorUuid),
                    ).item;

                return maneuver.toggle();
            });
        const maneuverNextPhaseNonTogglePromises = maneuverNextPhaseAes
            .filter((ae) => !ae.flags[game.system.id].toggle)
            .map((maneuverAes) => maneuverAes.delete());
        const combinedManeuvers = [...maneuverNextPhaseTogglePromises, ...maneuverNextPhaseNonTogglePromises];
        if (combinedManeuvers.length > 0) {
            await Promise.all(combinedManeuvers);
        }

        // PH: FIXME: stop abort under certain circumstances

        // Reset movement history
        if (window.dragRuler) {
            if (masterCombatant) {
                // If we are missing flags for dragRuler or the trackedRound !== null, resetMovementHistory
                // Without this we sometimes get in a continuous loop (unclear as to why; related to #onModifyCombatants?)
                if (!masterCombatant.flags.dragRuler || masterCombatant.flags.dragRuler.trackedRound !== null) {
                    await dragRuler.resetMovementHistory(this, masterCombatant.id);
                }
            } else {
                console.error("Unable to find masterCombatant for DragRuler");
            }
        }

        // STUNNING
        // The character remains Stunned and can take no
        // Actions (not even Aborting to a defensive action) until their next
        // Phase.
        // Use actor.canAct to block actions
        // Remove STUNNED effect _onEndTurn

        // Spend resources for all active powers
        // But only if we haven't already done so (like when rewinding combat tracker and moving forward again)
        const roundSegmentKey = this.round + combatant.flags[game.system.id].segment / 100;
        if ((masterCombatant.flags[game.system.id].spentEndOn || 0) < roundSegmentKey) {
            await masterCombatant.update({ [`flags.${game.system.id}.spentEndOn`]: roundSegmentKey });

            let content = "";
            let tempContent = "";
            let startContent = "";

            if (combatant.actor.statuses.size > 0) {
                startContent += `Has the following statuses: ${Array.from(combatant.actor.statuses).join(", ")}<br>`;
            }

            for (const ae of combatant.actor.temporaryEffects.filter((ae) => ae._prepareDuration().duration)) {
                tempContent += `<li>${ae.name} fades in ${toHHMMSS(ae._prepareDuration().remaining)}</li>`;
            }
            if (tempContent) {
                startContent += `Has the following temporary effects: <ul>${tempContent}</ul>`;
            }

            /**
             * @type {HeroSystemItemResourcesToUse}
             */
            const spentResources = {
                totalEnd: 0,
                totalReserveEnd: 0,
                totalCharges: 0,
            };

            for (const powerUsingResourcesToContinue of combatant.actor.items.filter(
                (item) =>
                    item.isActive === true && // Is the power active?
                    item.baseInfo && // Do we have baseInfo for this power
                    item.baseInfo.duration !== "instant" && // Is the power non instant
                    ((parseInt(item.system.end || 0) > 0 && // Does the power use END?
                        !item.system.MODIFIER?.find((o) => o.XMLID === "COSTSEND" && o.OPTION === "ACTIVATE")) || // Does the power use END continuously?
                        (item.system.charges && !item.system.charges.continuing)), // Does the power use charges but is not continuous (as that is tracked by an effect when made active)?
            )) {
                const {
                    error,
                    warning,
                    resourcesUsedDescription,
                    resourcesUsedDescriptionRenderedRoll,
                    resourcesRequired,
                } = await userInteractiveVerifyOptionallyPromptThenSpendResources(powerUsingResourcesToContinue, {});
                if (error || warning) {
                    content += `<li>(${powerUsingResourcesToContinue.name} ${error || warning}: power turned off)</li>`;
                    await powerUsingResourcesToContinue.toggle();
                } else {
                    content += resourcesUsedDescription
                        ? `<li>${powerUsingResourcesToContinue.detailedName()} spent ${resourcesUsedDescription}${resourcesUsedDescriptionRenderedRoll}</li>`
                        : "";

                    spentResources.totalEnd += resourcesRequired.totalEnd;
                    spentResources.totalReserveEnd += resourcesRequired.totalReserveEnd;
                    spentResources.totalCharges += resourcesRequired.totalCharges;
                }
            }

            // TODO: This should be END per turn calculated on the first phase of action for the actor.
            const encumbered = combatant.actor.effects.find((effect) => effect.flags?.[game.system.id]?.encumbrance);
            if (encumbered) {
                const endCostPerTurn = Math.abs(parseInt(encumbered.flags?.[game.system.id]?.dcvDex)) - 1;
                if (endCostPerTurn > 0) {
                    spentResources.totalEnd += endCostPerTurn;
                    spentResources.end += endCostPerTurn;

                    if (endCostPerTurn > 0) {
                        content += `<li>${encumbered.name} (${endCostPerTurn})</li>`;

                        // TODO: There should be a better way of integrating this with userInteractiveVerifyOptionallyPromptThenSpendResources
                        // TODO: This is wrong as it does not use STUN when there is no END
                        const value = parseInt(this.combatant.actor.system.characteristics.end.value);
                        const newEnd = value - endCostPerTurn;

                        await this.combatant.actor.update({
                            "system.characteristics.end.value": newEnd,
                        });
                    }
                }
            }

            if (
                startContent !== "" ||
                content !== "" ||
                spentResources.totalEnd > 0 ||
                spentResources.totalReserveEnd > 0 ||
                spentResources.totalCharges > 0
            ) {
                const segment = this.combatant.flags[game.system.id]?.segment;

                if (
                    spentResources.totalEnd > 0 ||
                    spentResources.totalReserveEnd > 0 ||
                    spentResources.totalCharges > 0
                ) {
                    content = `${startContent}Spent ${spentResources.totalEnd} END, ${spentResources.totalReserveEnd} reserve END, and ${
                        spentResources.totalCharges
                    } charge${spentResources.totalCharges > 1 ? "s" : ""} on turn ${
                        this.round
                    } segment ${segment}:<ul>${content}</ul>`;
                } else {
                    content = startContent;
                }

                const token = combatant.token;
                const speaker = ChatMessage.getSpeaker({
                    actor: combatant.actor,
                    token,
                });
                speaker["alias"] = combatant.actor.name;

                const chatData = {
                    author: game.user._id,
                    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
                    content: content,
                    whisper: whisperUserTargetsForActor(combatant.actor),
                    speaker,
                };

                await ChatMessage.create(chatData);
            }
        } else {
            console.log(
                `Skipping the check to spend resources for all active powers for ${combatant.name} because this was already performed up thru ${masterCombatant.flags[game.system.id]?.spentEndOn}`,
            );
        }

        // Some attacks include a DCV penalty which was added as an ActiveEffect.
        // At the beginning of our turn we make sure that AE is deleted.
        const removeOnNextPhase = combatant.actor.effects.filter(
            (o) => o.flags[game.system.id]?.nextPhase && o.duration.startTime < game.time.worldTime,
        );
        for (const ae of removeOnNextPhase) {
            await ae.delete();
        }

        // Remove Aborted
        if (combatant.actor.statuses.has("aborted")) {
            const effect = combatant.actor.effects.contents.find((o) => o.statuses.has("aborted"));
            await effect.delete();
        }
    }

    /**
     * A workflow that occurs at the end of each Combat Turn.
     * This workflow occurs after the Combat document update, prior round information exists in this.previous.
     * This can be overridden to implement system-specific combat tracking behaviors.
     * This method only executes for one designated GM user. If no GM users are present this method will not be called.
     * @param {Combatant} combatant     The Combatant whose turn just ended
     * @returns {Promise<void>}
     * @protected
     */
    async _onEndTurn(combatant) {
        if (CONFIG.debug.combat) {
            console.debug(
                `%c Hero | _onEndTurn: ${combatant.name} ${game.time.worldTime}`,
                "background: #292; color: #bada55",
            );
        }
        super._onEndTurn(combatant);

        // At the end of the Segment, any non-Persistent Powers, and any Skill Levels of any type, turn off for STUNNED actors.
        if (
            this.turns?.[this.turn]?.flags[game.system.id]?.segment !=
            this.turns?.[this.turn - 1]?.flags[game.system.id]?.segment
        ) {
            for (let _combatant of this.combatants) {
                if (_combatant?.actor?.statuses.has("stunned") || _combatant?.actor?.statuses.has("knockedout")) {
                    for (const item of _combatant.actor.getActiveConstantItems()) {
                        await item.toggle();
                    }
                }
            }
        }

        if (combatant.actor.statuses.has("stunned")) {
            // const effect = combatant.actor.effects.contents.find((o) => o.statuses.has("stunned"));
            // await effect.delete();

            await combatant.actor.toggleStatusEffect(HeroSystem6eActorActiveEffects.statusEffectsObj.stunEffect.id, {
                active: false,
            });

            const content = `${combatant.token.name} recovers from being stunned.`;

            const chatData = {
                author: game.user._id,
                style: CONST.CHAT_MESSAGE_STYLES.OTHER,
                content: content,
            };

            await ChatMessage.create(chatData);
        } else if (combatant.actor.statuses.has("knockedOut")) {
            if (combatant.actor.system.characteristics.stun?.value >= -10) {
                await combatant.actor.TakeRecovery(false, combatant.token);
            }
        }
    }

    async _onEndSegment() {
        console.log("empty and never called");
    }

    async _onStartSegment() {
        console.log("empty and never called");
    }

    /**
     * A workflow that occurs at the end of each Combat Round.
     * This workflow occurs after the Combat document update, prior round information exists in this.previous.
     * This can be overridden to implement system-specific combat tracking behaviors.
     * This method only executes for one designated GM user. If no GM users are present this method will not be called.
     * @returns {Promise<void>}
     * @protected
     */
    async _onEndRound() {
        if (CONFIG.debug.combat) {
            console.debug(`Hero | _onEndRound`);
        }
        super._onEndRound();

        // Make really sure we only call at the end of the round
        if (this.current.round > 1 && this.current.turn === 0) {
            await this.PostSegment12();
        }
    }

    async PostSegment12() {
        if (CONFIG.debug.combat) {
            console.debug(`Hero | PostSegment12`);
        }
        // POST-SEGMENT 12 RECOVERY
        // After Segment 12 each Turn, all characters (except those deeply
        // unconscious or holding their breath) get a free Post-Segment 12
        // Recovery. This includes Stunned characters, although the Post-
        // Segment 12 Recovery does not eliminate the Stunned condition.

        // Only run this once per turn.
        // So if we go back in time, then forward again, skip PostSegment12
        if (this.flags[game.system.id]?.postSegment12Round?.[this.round]) {
            const content = `Post-Segment 12 (Turn ${this.round - 1})
            <p>Skipping because this has already been performed on this turn during this combat.
            This typically occurs when rewinding combat or during speed changes.</p>`;
            const chatData = {
                style: CONST.CHAT_MESSAGE_STYLES.OTHER,
                author: game.user._id,
                content: content,
            };

            await ChatMessage.create(chatData);
            return;
        }
        const postSegment12Round = this.flags[game.system.id]?.postSegment12Round || {};
        postSegment12Round[this.round] = true;

        this.update({ [`flags.${game.system.id}.postSegment12Round`]: postSegment12Round });

        const automation = game.settings.get(HEROSYS.module, "automation");

        let content = `Post-Segment 12 (Turn ${this.round - 1})`;
        let contentHidden = `Post-Segment 12 (Turn ${this.round - 1})`;
        content += "<ul>";
        contentHidden += "<ul>";
        let hasHidden = false;
        for (const combatant of this.getUniqueCombatants().filter((o) => !o.defeated)) {
            const actor = combatant.actor;

            // Make sure we have a valid actor
            if (!actor) continue;

            // If this is an NPC and their STUN <= 0 then leave them be.
            // Typically, you should only use the Recovery Time Table for
            // PCs. Once an NPC is Knocked Out below the -10 STUN level
            // they should normally remain unconscious until the fight ends.
            // ACTOR#ONUPDATE SHOULD MARK AS DEFEATED
            // if (actor.type != "pc" && parseInt(actor.system.characteristics.stun.value) <= -10)
            // {
            //     //console.log("defeated", combatant)
            //     continue;
            // }

            // Make sure we have automation enabled
            if (
                automation === "all" ||
                (automation === "npcOnly" && actor.type == "npc") ||
                (automation === "pcEndOnly" && actor.type === "pc")
            ) {
                const showToAll = !combatant.hidden && (combatant.hasPlayerOwner || combatant.actor?.type === "pc");

                // Make sure combatant is visible in combat tracker
                const recoveryText = await combatant.actor.TakeRecovery(false, combatant.token);
                if (recoveryText) {
                    if (showToAll) {
                        content += "<li>" + recoveryText + "</li>";
                    } else {
                        hasHidden = true;
                        contentHidden += "<li>" + recoveryText + "</li>";
                    }
                }

                // END RESERVE
                for (const item of actor.items.filter((o) => o.system.XMLID === "ENDURANCERESERVE")) {
                    const ENDURANCERESERVEREC = item.findModsByXmlid("ENDURANCERESERVEREC");
                    if (ENDURANCERESERVEREC) {
                        const newValue = Math.min(
                            item.system.max,
                            item.system.value + parseInt(ENDURANCERESERVEREC.LEVELS),
                        );
                        if (newValue > item.system.value) {
                            const delta = newValue - item.system.value;
                            await item.update({
                                "system.value": newValue,
                            });

                            if (showToAll) {
                                content += "<li>" + `${combatant.token.name} ${item.name} +${delta}` + "</li>";
                            } else {
                                contentHidden += "<li>" + `${combatant.token.name} ${item.name} +${delta}` + "</li>";
                            }
                        }
                    }
                }
            }
        }
        content += "</ul>";
        contentHidden += "</ul>";
        const chatData = {
            style: CONST.CHAT_MESSAGE_STYLES.OTHER,
            author: game.user._id,
            content: content,
        };

        await ChatMessage.create(chatData);

        if (hasHidden) {
            return ChatMessage.create({
                ...chatData,
                content: contentHidden,
                whisper: ChatMessage.getWhisperRecipients("GM"),
            });
        }
    }

    getUniqueCombatants() {
        const results = [];
        for (const c of this.combatants.values()) {
            if (!results.find((o) => o.token.object.id === c.token.object?.id)) {
                results.push(c);
            }
        }
        return results;
    }

    /**
     * Advance the combat to the next turn
     * @returns {Promise<Combat>}
     */ async nextTurn() {
        if (CONFIG.debug.combat) {
            console.debug(`%c Hero | nextTurn ${game.time.worldTime}`, "background: #229; color: #bada55");
        }
        const originalRunningSegment = this.round * 12 + this.combatant?.flags[game.system.id]?.segment;

        let turn = this.turn ?? -1;
        const skip = this.settings.skipDefeated;

        // Determine the next turn number
        let next = null;

        if (!HeroSystem6eCombat.singleCombatantTracker) {
            if (skip) {
                for (let [i, t] of this.turns.entries()) {
                    if (i <= turn) continue;
                    if (t.isDefeated) continue;
                    next = i;
                    break;
                }
            } else next = turn + 1;

            // Maybe advance to the next round
            if (this.round === 0 || next === null || next >= this.turns.length) {
                return this.nextRound();
            }
        } else {
            // SingleCombatant

            // Loop thru turns to find the next combatant that hasPhase on this segment
            for (let i = 0; i <= this.turns.length * 12; i++) {
                this.turn++;
                if (this.turn >= this.turns.length) {
                    this.turn = 0;
                    this.flags[game.system.id].segment++;
                }
                if (this.flags[game.system.id].segment > 12) {
                    return this.nextRound();
                }

                if (this.turns[this.turn]?.hasPhase(this.flags[game.system.id].segment)) {
                    if (!this.settings.skipDefeated || !this.turns[this.turn].isDefeated) {
                        break;
                    }
                }
            }
        }

        const newRunningSegment = this.round * 12 + this.nextCombatant?.flags[game.system.id]?.segment;

        const advanceTime = newRunningSegment - originalRunningSegment;
        const updateData = { round: this.round, turn: next };
        const updateOptions = { direction: 1, worldTime: { delta: advanceTime } };

        //console.log("nextTurn before game.time.advance", game.time.worldTime, advanceTime);
        Hooks.callAll("combatTurn", this, updateData, updateOptions);

        //const _gt = game.time.worldTime;
        await this.update(updateData, updateOptions);
    }

    async _onUpdate(...args) {
        //console.log(`%c combat._onUpdate`, "background: #229; color: #bada55", args);
        super._onUpdate(...args);
    }

    /**
     * Rewind the combat to the previous turn
     * @returns {Promise<Combat>}
     */
    async previousTurn() {
        if (CONFIG.debug.combat) {
            console.debug(`Hero | previousTurn`, "background: #222; color: #bada55");
        }
        if (this.turn === 0 && this.round === 0) return this;
        else if (this.turn <= 0 && this.turn !== null) return this.previousRound();
        let previousTurn = (this.turn ?? this.turns.length) - 1;

        const originalRunningSegment = this.round * 12 + this.combatant.flags[game.system.id]?.segment;

        // Hero combats start with round 1 and segment 12.
        // So anything less than segment 12 will call previousTurn
        if (this.round <= 1) {
            const segment12turn = this.turns.findIndex((o) => o.flags[game.system.id]?.segment === 12) || 0;
            if (this.turn <= segment12turn) {
                return this.previousRound();
            }
        }

        // Update the document, passing data through a hook first
        const updateData = { round: this.round, turn: previousTurn };
        const updateOptions = { direction: -1, worldTime: { delta: -1 * CONFIG.time.turnTime } };
        Hooks.callAll("combatTurn", this, updateData, updateOptions);
        const _previousTurn = await this.update(updateData, updateOptions);

        const newRunningSegment = this.round * 12 + this.combatant[game.system.id].segment;
        if (originalRunningSegment != newRunningSegment) {
            const advanceTime = newRunningSegment - originalRunningSegment;
            await game.time.advance(advanceTime);
        }

        return _previousTurn;
    }

    /**
     * Advance the combat to the next round
     * @returns {Promise<Combat>}
     */
    async nextRound() {
        if (CONFIG.debug.combat) {
            console.debug(`Hero | nextRound`);
        }
        const originalRunningSegment =
            this.round * 12 + (this.combatant?.flags[game.system.id]?.segment || this.flags?.[game.system.id]?.segment);
        const _nextRound = await super.nextRound();
        const newRunningSegment =
            this.round * 12 + (this.combatant?.flags[game.system.id]?.segment || this.flags?.[game.system.id]?.segment);
        if (originalRunningSegment != newRunningSegment) {
            const advanceTime = newRunningSegment - originalRunningSegment;
            await game.time.advance(advanceTime);
        }
        return _nextRound;
    }

    async previousRound() {
        if (CONFIG.debug.combat) {
            console.debug(`Hero | previousRound`);
        }
        const originalRunningSegment = this.round * 12 + this.combatant?.[game.system.id]?.segment;
        const _previousRound = await super.previousRound();
        const newRunningSegment = this.round * 12 + this.combatant?.flags[game.system.id]?.segment;
        if (originalRunningSegment != newRunningSegment) {
            const advanceTime = newRunningSegment - originalRunningSegment;
            // NaN Typically occurs when previous round ends combat
            if (!isNaN(advanceTime)) {
                await game.time.advance(advanceTime);
            }
        }
        return _previousRound;
    }

    getCombatTurnHero(combatState) {
        if (CONFIG.debug.combat) {
            console.debug(`Hero | getCombatTurnHero`, combatState);
        }

        // Don't bother when combat tracker is empty
        if (this.turns.length === 0) return this.turn;

        // Combat not started
        if (this.round === 0) return this.turn;

        // Find Exact match
        let combatTurn = this.turns.findIndex(
            (o) =>
                o.tokenId === combatState.tokenId &&
                o.flags[game.system.id]?.segment === combatState.segment &&
                o.initiative === combatState.initiative,
        );

        // find closest match
        if (combatTurn === -1) {
            combatTurn = this.turns.findIndex(
                (o) =>
                    (o.flags[game.system.id]?.segment === combatState.segment &&
                        o.initiative <= combatState.initiative) ||
                    o.flags[game.system.id]?.segment > combatState.segment,
            );
            console.log(
                `Combat Tracker was unable to find exact match.  Should only occur when current combatant changes SPD/Initiative.`,
                combatState,
                this,
            );
        }

        if (combatTurn > -1) {
            return combatTurn;
        }

        // There may be oddities when Initiative changes at last turn
        ui.notifications.warn(
            "Combat Tracker combatants were modified. Unable to determine which combatant should be active.",
        );

        return this.turn;
    }
}
