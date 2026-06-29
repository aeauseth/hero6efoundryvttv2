import { HEROSYS } from "./herosystem6e.mjs";
import { HeroCompatibility } from "./utility/compatibility.mjs";
import { whisperUserTargetsForActor, expireEffects, toHHMMSS, gmActive } from "./utility/util.mjs";
import { rehydrateAttackItem, userInteractiveVerifyOptionallyPromptThenSpendResources } from "./item/item-attack.mjs";
import { HeroSystem6eActorActiveEffects } from "./actor/actor-active-effects.mjs";

export class HeroSystem6eCombat extends Combat {
    // static defineSchema() {
    //     const superSchema = super.defineSchema();
    //     const schema = foundry.utils.mergeObject(superSchema, {
    //         segment: new foundry.fields.NumberField({
    //             required: true,
    //             nullable: true,
    //             integer: true,
    //             min: 0,
    //             initial: 12,
    //         }),
    //         //turn: new foundry.fields.NumberField({ required: true, integer: true, min: 0, initial: null }),
    //     });
    //     return schema;
    // }

    static metadata = Object.freeze(
        foundry.utils.mergeObject(
            super.metadata,
            {
                // Special permissions to allow updating "segment"
                // which is not part of Combat class
                permissions: {
                    update: this.#canUpdate,
                },
            },
            { inplace: false },
        ),
    );

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

    get segment() {
        const segment = this.combatant?.getFlag(game.system.id, "segment");
        if (segment == undefined) {
            console.log(`segment is ${segment}`);
        }
        return segment ?? 12;
    }

    static #canUpdate(user, doc, data) {
        if (user.isGM) return true; // GM users can do anything
        const turnOnly = ["_id", "round", "turn", "combatants", "system"]; // Players may only modify a subset of fields
        if (Object.keys(data).some((k) => !turnOnly.includes(k))) return false;
        if ("round" in data && !doc._canChangeRound(user)) return false;
        if ("turn" in data && !doc._canChangeTurn(user)) return false;
        if ("system" in data && !doc._canChangeSystem(user)) return false;
        if ("combatants" in data && !doc.#canModifyCombatants(user, data.combatants)) return false;
        return true;
    }

    _canChangeSystem() {
        return true;
    }

    #canModifyCombatants(user, combatants) {
        for (const { _id, ...change } of combatants) {
            const c = this.combatants.get(_id);
            if (!c) return false;
            if (!c.canUserModify(user, "update", change)) return false;
        }
        return true;
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
            const initValue = combatant.actor?.getCharacteristic(characteristic)?.value || 0;
            //+parseInt(combatant.flags.hero6efoundryvttv2?.lightningReflexes?.levels || 0);
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
            const intA = Number.isNumeric(actorA?.getCharacteristic("int")?.value)
                ? actorA.getCharacteristic("int").value
                : -Infinity;
            const intB = Number.isNumeric(actorB?.getCharacteristic("int")?.value)
                ? actorB.getCharacteristic("int").value
                : -Infinity;

            // Presence
            const preA = Number.isNumeric(actorA?.getCharacteristic("pre")?.value)
                ? actorA.getCharacteristic("pre").value
                : -Infinity;
            const preB = Number.isNumeric(actorB?.getCharacteristic("pre")?.value)
                ? actorB.getCharacteristic("pre").value
                : -Infinity;

            // Then by Speed
            // Rules don't specifically state to use SPD for ties, but seems like the right thing to do
            const spdA = Number.isNumeric(actorA?.getCharacteristic("spd")?.value)
                ? actorA.getCharacteristic("spd").value
                : -Infinity;
            const spdB = Number.isNumeric(actorB?.getCharacteristic("spd")?.value)
                ? actorB.getCharacteristic("spd").value
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

        // Add or remove extra combatants based on SPD or Lightning Reflexes
        await this.extraCombatants();

        for (const tokenId of [...new Set(documents.map((o) => o.tokenId))]) {
            await this.assignSegments(tokenId);
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
    }

    async assignSegments(tokenId) {
        if (!tokenId) return;

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
                const spd = HeroCompatibility.clamp(
                    parseInt(_combatant.actor?.getCharacteristic("spd")?.value || 0),
                    1,
                    12,
                );
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
                    HeroCompatibility.clamp(parseInt(actor.getCharacteristic("spd")?.value || 0), 1, 12) *
                    (lightningReflexes ? 2 : 1);
                const tokenCombatants = this.combatants.filter((o) => o.tokenId === _tokenId);
                const tokenCombatantCount = tokenCombatants.length;

                if (tokenCombatantCount < targetCombatantCount) {
                    for (let i = 0; i < targetCombatantCount - tokenCombatantCount; i++) {
                        toCreate.push({
                            ...foundry.utils.deepClone(_combatant),
                            _id: null,
                            flags: {
                                [game.system.id]: {
                                    segment: HeroSystem6eCombat.getSegment(actor.getCharacteristic("spd").value, i),
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
                `extraCombatants/after: ${this.current.name} segment=${game.combat.segment} init=${this.current.initiative}`,
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
        switch (HeroCompatibility.clamp(parseInt(spd), 0, 12)) {
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
            segment: this.segment || null,
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
            [`flags.${game.system.id}.-=heroCurrent`]: null,
            [`flags.${game.system.id}.segment`]: 12,
        };
        Hooks.callAll("combatStart", this, updateData);
        await this.update(updateData);

        // Remove spentEndOn
        for (const combatant of this.combatants) {
            await combatant.unsetFlag(game.system.id, "heroHistory");
            await combatant.unsetFlag(game.system.id, "spentEndOn");
        }
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
        // if (!this.turns[context?.turn]?.hasPhase()) {
        //     console.debug(
        //         `skipping _onStartTurn because ${combatant.name} does not hasPhase`,
        //         this.turns[context?.turn],
        //     );
        //     return;
        // }
        if (CONFIG.debug.combat) {
            console.debug(
                `%c Hero | _onStartTurn: ${combatant.name} ${game.time.worldTime}`,
                "background: #292; color: #bada55",
            );
        }

        await super._onStartTurn(combatant);

        if (!combatant) return;
        if (!combatant.actor) {
            console.error(`${combatant.name} has no actor`);
            return;
        }

        // We need a single combatant to store some flags. Like for DragRuler, end tracking, etc.
        // getCombatantByToken seems to get the first combatant in combat.turns that is for our token.
        // This likely causes issues when SPD/LightningReflexes changes.
        const masterCombatant = this.getCombatantByToken(combatant.tokenId);
        const _segmentNumber = this.segment;

        // if (
        //     !combatant.flags[game.system.id]?.lightningReflexes &&
        //     game.combat.combatants.find(
        //         (c) => combatant.tokenId === c.tokenId && combatant.flags[game.system.id]?.lightningReflexes,
        //     )
        // ) {
        //     console.log(
        //         `skipping onStartTurn for ${combatant.name} because non lightning reflexes version of combatant`,
        //         combatant,
        //     );
        //     return;
        // }

        // Make sure flags are setup
        combatant.flags[game.system.id] ??= {};
        combatant.flags[game.system.id].heroHistory ??= {};
        masterCombatant.flags[game.system.id] ??= {};
        masterCombatant.flags[game.system.id].heroHistory ??= {};

        const heroHistoryKey = `r${String(this.round).padStart(2, "0")}s${String(_segmentNumber).padStart(2, "0")}`;

        // let heroHistoryThisCombatant = combatant.flags[game.system.id].heroHistory[heroHistoryKey];
        //console.warn(heroHistoryKey, heroHistoryThisCombatant);

        // V13 clear movement history and END used for movement
        if (masterCombatant.token.clearMovementHistory) {
            await masterCombatant.setFlag(game.system.id, "endUsedForMovement", 0);
            await masterCombatant.token.clearMovementHistory();
        }

        // If we have already attacked this segment (lightning reflexes),
        // then skip this combatant
        // const heroHistoryThisSegment = masterCombatant.flags[game.system.id].heroHistory[heroHistoryKey];
        // if (!heroHistoryThisCombatant && heroHistoryThisSegment?.action) {
        //     ui.notifications.info(
        //         `Skipping <b>${this.combatant.name}</b> because they have already taken an action [${heroHistoryThisSegment.action.name}] this segment`,
        //     );
        //     return this.nextTurn();
        // }

        // Save some properties for future support for rewinding combat tracker
        // TODO: Include charges for various items?
        try {
            masterCombatant.flags[game.system.id].heroHistory ??= {};
            masterCombatant.flags[game.system.id].heroHistory[heroHistoryKey] ??= {};
            // heroHistoryThisCombatant = masterCombatant.flags[game.system.id].heroHistory[heroHistoryKey];
            // heroHistoryThisCombatant.end = masterCombatant.actor.getCharacteristic("end")?.value;
            // heroHistoryThisCombatant.stun = masterCombatant.actor.getCharacteristic("stun")?.value;
            // heroHistoryThisCombatant.body = masterCombatant.actor.getCharacteristic("body")?.value;
            await masterCombatant.setFlag(
                game.system.id,
                "heroHistory",
                masterCombatant.flags[game.system.id].heroHistory,
            );
        } catch (e) {
            console.error(e);
        }

        // Expire Effects
        // We expire on our phase, not on our segment.
        try {
            await expireEffects(combatant.actor, "turnStart");
        } catch (e) {
            console.error(e);
        }

        // Stop holding
        if (combatant.actor.statuses.has("holding") && combatant.actor.hasPhase(this.segment)) {
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

        // Stop ABORT
        if (combatant.actor.statuses.has("aborted")) {
            await combatant.actor.toggleStatusEffect(HeroSystem6eActorActiveEffects.statusEffectsObj.abortEffect.id);
        }

        // Stop dodges and other maneuvers' active effects that expire automatically
        const maneuverNextPhaseAes = combatant.actor.temporaryEffects.filter(
            (ae) =>
                ae.flags?.[game.system.id]?.type === "maneuverNextPhaseEffect" &&
                ae.duration.startTime !== game.time.worldTime,
        );

        // Sanity check for older maneuver styles.
        // TODO: Perhaps use appliedEffects above
        const sanity1 = combatant.actor.effects.filter(
            (ae) =>
                ae.flags?.[game.system.id]?.type === "maneuverNextPhaseEffect" &&
                ae.duration.startTime !== game.time.worldTime,
        );
        if (sanity1.length > 0) {
            console.error(`unexpected maneuver flag.type`, sanity1);
        }

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

        // STUNNING
        // The character remains Stunned and can take no
        // Actions (not even Aborting to a defensive action) until their next
        // Phase.
        // Use actor.canAct to block actions
        // Remove STUNNED effect _onEndTurn

        // Spend resources for all active powers
        // But only if we haven't already done so (like when rewinding combat tracker and moving forward again)
        const roundSegmentKey = this.round + _segmentNumber / 100;
        if ((masterCombatant.flags[game.system.id].spentEndOn || 0) < roundSegmentKey) {
            await masterCombatant.update({ [`flags.${game.system.id}.spentEndOn`]: roundSegmentKey });

            let content = "";
            let tempContent = "";
            let startContent = "";

            if (combatant.actor.statuses.size > 0) {
                startContent += `Has the following statuses: ${Array.from(combatant.actor.statuses).join(", ")}<br>`;
            }

            for (const ae of combatant.actor.temporaryEffects) {
                const remaining = ae._prepareDuration().remaining;
                const remainingText = remaining > 0 ? `in ${toHHMMSS(remaining)}` : "0s";
                tempContent += `<li>${ae.name} fades ${remainingText} ${ae.flags[game.system.id]?.expiresOn ?? ""}</li>`;
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
                    item.type !== "skill" && // Natural skills are always on, but only use resources when used/rolled
                    item.system.duration !== CONFIG.HERO.DURATION_TYPES.INSTANT && // Is the power non instant
                    (!item.system.MODIFIER?.find(
                        (o) =>
                            (o.XMLID === "COSTSEND" && o.OPTIONID === "ACTIVATE") ||
                            o.XMLID === "COSTSENDONLYTOACTIVATE",
                    ) || // Does the power use END continuously?
                        (item.system.chargeModifier && !item.system.chargeModifier.CONTINUING)), // Does the power use charges but is not continuous (as that is tracked by an effect when made active)?
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
                    // This check for no resource usage is required in at least 1 (2?) cases:
                    // - STR as a power. item.end() for the filter will return the reported value but under the hood we say that STR
                    //   uses 0 END.
                    // - Continuing fuel charges won't use charges? Will depend how we actually implement them.
                    // Regardless, we probably don't want to report a stream of no resource usage messages on the start of every turn.
                    if (
                        !(
                            resourcesRequired.totalCharges === 0 &&
                            resourcesRequired.totalEnd === 0 &&
                            resourcesRequired.totalReserveEnd === 0
                        )
                    ) {
                        content += resourcesUsedDescription
                            ? `<li>${powerUsingResourcesToContinue.detailedName()} spent ${resourcesUsedDescription}${resourcesUsedDescriptionRenderedRoll}</li>`
                            : "";

                        spentResources.totalEnd += resourcesRequired.totalEnd;
                        spentResources.totalReserveEnd += resourcesRequired.totalReserveEnd;
                        spentResources.totalCharges += resourcesRequired.totalCharges;
                    }
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
                        const value = parseInt(this.combatant.actor.getCharacteristic("end").value);
                        const newEnd = value - endCostPerTurn;

                        await this.combatant.actor.updateCharacteristics([["end", { value: newEnd }]], {});
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
                //const segment = this.combatant.flags[game.system.id]?.segment;

                if (
                    spentResources.totalEnd > 0 ||
                    spentResources.totalReserveEnd > 0 ||
                    spentResources.totalCharges > 0
                ) {
                    content = `${startContent}Spent ${spentResources.totalEnd} END, ${spentResources.totalReserveEnd} reserve END, and ${
                        spentResources.totalCharges
                    } charge${spentResources.totalCharges > 1 ? "s" : ""} on turn ${
                        this.round
                    } segment ${_segmentNumber}:<ul>${content}</ul>`;
                } else {
                    content = startContent;
                }

                // BREAKFALL from prone?
                if (combatant.actor.statuses.has("prone")) {
                    const breakFallItem = combatant.actor.items.find(
                        (o) => o.system.XMLID === "BREAKFALL" && o.isActive,
                    );
                    if (breakFallItem) {
                        content += `
                            <button class="roll-breakfall" 
                                data-actor-uuid="${combatant.actor.uuid}" 
                                data-target-token-id="${combatant.tokenId}"
                                title="You can use BREAKFALL to regain control from being prone without the need to take a Half Phase action.">
                                Roll Breakfall
                            </button>
                        `;
                    }
                }

                const token = combatant.token;
                const speaker = ChatMessage.getSpeaker({
                    actor: combatant.actor,
                    token,
                });

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

        // Skip if they are stunned
        // if (combatant.actor.statuses.has("stunned")) {
        //     ui.notifications.info(`Skipping <b>${this.combatant.name}</b> because they are Stunned.`);
        //     return this.nextTurn();
        // }

        // Skip if they are knockedOut
        // if (combatant.actor.statuses.has("knockedOut")) {
        //     ui.notifications.info(`Skipping <b>${this.combatant.name}</b> because they are Knocked Out.`);
        //     return this.nextTurn();
        // }

        if (game.user.isActiveGM) {
            await this.promptToDeleteAoeInstantRegions();
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
        // if (!this.turns[context?.turn]?.hasPhase()) {
        //     console.debug(`skipping _onEndTurn because ${combatant.name} does not hasPhase`, this.turns[context?.turn]);
        //     return;
        // }
        if (CONFIG.debug.combat) {
            console.debug(
                `%c Hero | _onEndTurn: ${combatant.name} ${game.time.worldTime}`,
                "background: #da5555; color: #bada55",
            );
        }
        super._onEndTurn(combatant);

        if (!combatant) return;
        if (!combatant.actor) {
            console.debug(`${combatant.name} has no actor`);
            return;
        }

        // Show and clear spend END for movement
        // END is spent realtime in HeroSystem6eTokenDocument:_onMovementRecorded
        const endUsedForMovement = combatant.getFlag(game.system.id, "endUsedForMovement") || 0;
        if (endUsedForMovement > 0) {
            const content = `${combatant.name} spend ${endUsedForMovement} END for movement this phase.`;
            ChatMessage.create({
                style: CONST.CHAT_MESSAGE_STYLES.OTHER,
                author: game.user._id,
                speaker: ChatMessage.getSpeaker({ actor: combatant.actor, token: combatant.token }),
                content,
                whisper: whisperUserTargetsForActor(combatant.actor),
            });
        }

        // At the end of the Segment, any non-Persistent Powers, and any Skill Levels of any type, turn off for STUNNED actors.
        if (
            this.turns?.[this.turn]?.flags[game.system.id]?.segment !=
            this.turns?.[this.turn - 1]?.flags[game.system.id]?.segment
        ) {
            for (let _combatant of this.combatants) {
                if (_combatant?.actor?.statuses.has("stunned") || _combatant?.actor?.statuses.has("knockedout")) {
                    for (const item of _combatant.actor.getActiveConstantItems()) {
                        // Skills, talents ect are Constant, but they may not be toggleable
                        if (item.isActivatable()) {
                            await item.turnOff();
                        }
                    }
                }
            }
        }

        const lightningReflexes = combatant.actor?.items.find(
            (o) => o.system.XMLID === "LIGHTNING_REFLEXES_ALL" || o.system.XMLID === "LIGHTNING_REFLEXES_SINGLE",
        );

        // If actor has Lightning Reflexes, then Only clear stunned/KO when on LR combatant
        if (!lightningReflexes || combatant.flags[game.system.id]?.lightningReflexes) {
            if (combatant.actor.statuses.has("stunned")) {
                await combatant.actor.toggleStatusEffect(
                    HeroSystem6eActorActiveEffects.statusEffectsObj.stunEffect.id,
                    {
                        active: false,
                    },
                );

                const content = `${combatant.token.name} recovers from being stunned.`;

                const chatData = {
                    author: game.user._id,
                    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
                    content: content,
                };

                await ChatMessage.create(chatData);
            } else if (combatant.actor.statuses.has("knockedOut")) {
                if (combatant.actor.getCharacteristic("stun")?.value >= -10) {
                    await combatant.actor.TakeRecovery({ asAction: false, token: combatant.token });
                }
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

        if (this.current.round > 1) {
            await this.PostSegment12();
        }
    }

    async PostSegment12() {
        if (CONFIG.debug.combat) {
            console.debug(`Hero | PostSegment12`);
        }

        if (!game.user.isGM) {
            if (!gmActive()) {
                ui.notifications.warn(`Could not perform this operation because there is no GM connected.`);
            } else {
                // Request GM perform this operation
                console.log(`emit PostSegment12`);
                game.socket.emit(`system.${game.system.id}`, {
                    operation: "PostSegment12",
                    userId: game.user.id,
                });
            }
            return;
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

        try {
            this.update({ [`flags.${game.system.id}.postSegment12Round`]: postSegment12Round });
        } catch (e) {
            console.warn(
                `Unable to update postSegment12Round. ` +
                    `Likely occurred because ${this.name} clicked END TURN, triggering PostSegment12, ` +
                    `and does not have permissions to update [combat.flags]. ` +
                    `Future solution is to store "postSegment12Round" in root of Combat schema like we do for "segment". ` +
                    `This is only a problem when rewinding combat tracker.`,
            );
            console.error(e);
        }

        const automation = game.settings.get(HEROSYS.module, "automation");

        let content = `Post-Segment 12 (Turn ${this.round - 1})`;
        let contentHidden = `Post-Segment 12 (Turn ${this.round - 1})`;
        content += "<ul>";
        contentHidden += "<ul>";
        let hasHidden = false;
        for (const combatant of this.getUniqueCombatants().filter((o) => !o.isDefeated || o.hasPlayerOwner)) {
            const actor = combatant.actor;

            // Make sure we have a valid actor
            if (!actor) continue;

            // If this is an NPC and their STUN <= 0 then leave them be.
            // Typically, you should only use the Recovery Time Table for
            // PCs. Once an NPC is Knocked Out below the -10 STUN level
            // they should normally remain unconscious until the fight ends.
            // ACTOR#ONUPDATE SHOULD MARK AS DEFEATED
            // if (actor.type != "pc" && parseInt(actor.getCharacteristic("stun").value) <= -10)
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
                // if (combatant.actor.statuses.has("knockedOut")) {
                //     if (combatant.actor.getCharacteristic("stun")?.value < -20) {
                //         console.log(`${combatant.name} is knockedOut. Skipping PostSegment12 recovery.`);
                //         continue;
                //     }
                // }

                const showToAll = !combatant.hidden && (combatant.hasPlayerOwner || combatant.actor?.type === "pc");

                // Make sure combatant is visible in combat tracker
                let recoveryText = await combatant.actor.TakeRecovery({
                    asAction: false,
                    token: combatant.token,
                    preventRecoverFromStun: true,
                });

                // END RESERVE
                for (const endReserveItem of actor.items.filter((o) => o.system.XMLID === "ENDURANCERESERVE")) {
                    const ENDURANCERESERVEREC = endReserveItem.findModsByXmlid("ENDURANCERESERVEREC");
                    if (ENDURANCERESERVEREC) {
                        const newValue = Math.min(
                            endReserveItem.system.LEVELS,
                            endReserveItem.system.value + parseInt(ENDURANCERESERVEREC.LEVELS),
                        );
                        if (newValue > endReserveItem.system.value) {
                            const delta = newValue - endReserveItem.system.value;
                            await endReserveItem.update({
                                "system.value": newValue,
                            });
                            recoveryText += `${recoveryText ? " " : ""}${endReserveItem.name} +${delta} END.`;
                        }
                    }
                }

                if (recoveryText) {
                    if (showToAll) {
                        content += "<li>" + recoveryText + "</li>";
                    } else {
                        hasHidden = true;
                        contentHidden += "<li>" + recoveryText + "</li>";
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
     */
    async nextTurn() {
        if (CONFIG.debug.combat) {
            console.debug(`%c Hero | nextTurn ${game.time.worldTime}`, "background: #229; color: #bada55");
        }

        if (!game.user.isGM) {
            if (!gmActive()) {
                ui.notifications.warn(`Could not perform this operation because there is no GM connected.`);
            } else {
                // Request GM perform this operation
                game.socket.emit(`system.${game.system.id}`, {
                    operation: "nextTurn",
                    userId: game.user.id,
                });
            }
            return;
        }

        const originalRunningSegment = this.round * 12 + game.combat.segment;

        let turn = this.turn ?? -1;
        const skip = this.settings.skipDefeated;

        // Determine the next turn number
        let next = turn + 1;
        if (this.flags[game.system.id].segment !== game.combat.segment) {
            console.warn("inconsistent segment number");
            this.flags[game.system.id].segment = game.combat.segment;
        }
        let newSegment = game.combat.segment;

        for (let [i, t] of this.turns.entries()) {
            if (i <= turn) continue;
            if (skip && t.isDefeated) continue;
            next = i;
            newSegment = t.flags[game.system.id].segment;
            break;
        }

        if (next === this.turns.length - 1 && this.turns[next].isDefeated) {
            return this.nextRound();
        }

        // Maybe advance to the next round
        if (this.round === 0 || next === null || next >= this.turns.length) {
            return this.nextRound();
        }

        const newRunningSegment = this.round * 12 + newSegment;

        const advanceTime = newRunningSegment - originalRunningSegment;

        const updateData = {
            round: this.round,
            turn: next,
            [`flags.${game.system.id}.segment`]: newSegment,
        };
        const updateOptions = { direction: 1, worldTime: { delta: advanceTime } };

        if (advanceTime !== 0) {
            await this.onSegmentChange();
        }

        //console.log("nextTurn before game.time.advance", game.time.worldTime, advanceTime);
        //Hooks.callAll("combatTurn", this, updateData, updateOptions);

        //const _gt = game.time.worldTime;
        await this.update(updateData, updateOptions);
    }

    _onUpdate(changed, options) {
        //super._onUpdate(changed, options, userId);
        const priorState = foundry.utils.deepClone(this.current);
        if (!this.previous) this.previous = priorState; // Just in case

        // Determine the new turn order
        if ("combatants" in changed)
            this.setupTurns(); // Update all combatants
        else this.current = this._getCurrentState(); // Update turn or round

        // Record the prior state and manage turn events
        const stateChanged = this.#recordPreviousState(priorState);
        if (stateChanged && options.turnEvents !== false) this._manageTurnEvents();

        // Render applications for Actors involved in the Combat
        this.updateCombatantActors();

        // Render the CombatTracker sidebar
        if (changed.active === true && this.isActive) ui.combat.render({ combat: this });
        else if ("scene" in changed) ui.combat.render({ combat: null });

        // Refresh token combat markers
        if (stateChanged) this._updateTurnMarkers();

        // Trigger combat sound cues in the active encounter
        if (this.active && stateChanged && this.started && priorState.round) {
            const play = (c) => c && (game.user.isGM ? !c.hasPlayerOwner : c.isOwner);
            if (play(this.combatant)) this._playCombatSound("yourTurn");
            else if (play(this.nextCombatant)) this._playCombatSound("nextUp");
        }
    }

    #recordPreviousState(priorState) {
        const { round, turn, combatantId, segment } = this.current;
        const turnChange =
            combatantId !== priorState.combatantId ||
            round !== priorState.round ||
            turn !== priorState.turn ||
            segment !== priorState.segment;
        Object.assign(this.previous, priorState);
        return turnChange;
    }

    /**
     * Rewind the combat to the previous turn
     * @returns {Promise<Combat>}
     */
    async previousTurn() {
        if (CONFIG.debug.combat) {
            console.debug(`Hero | previousTurn`, "background: #222; color: #bada55");
        }

        if (!game.user.isGM) {
            if (!gmActive()) {
                ui.notifications.warn(`Could not perform this operation because there is no GM connected.`);
            } else {
                // Request GM perform this operation
                console.log(`emit previousTurn`);
                game.socket.emit(`system.${game.system.id}`, {
                    operation: "previousTurn",
                    userId: game.user.id,
                });
            }
            return;
        }

        if (this.turn === 0 && this.round === 0) {
            return this;
        } else if (this.turn <= 0 && this.turn !== null) {
            return this.previousRound();
        }
        let previousTurn = (this.turn ?? this.turns.length) - 1;

        const originalRunningSegment = this.round * 12 + game.combat.segment;

        // Hero combats start with round 1 and segment 12.
        // So anything less than segment 12 will call previousTurn
        if (this.round <= 1) {
            const segment12turn = this.turns.findIndex((o) => o.flags[game.system.id]?.segment === 12) || 0;
            if (this.turn <= segment12turn) {
                return this.previousRound();
            }
        }

        // Loop thru turns to find the previous combatant that hasPhase on this segment
        for (let i = 0; i <= this.turns.length * 12; i++) {
            this.turn--;
            if (this.turn < 0) {
                //await this.onPreviousHeroSegment();
                this.turn = this.turns.length;
                this.flags[game.system.id].segment--;

                if (this.flags[game.system.id].segment < 1) {
                    return this.previousRound();
                }
            }

            if (this.round == 1 && this.flags[game.system.id].segment < 12) {
                return this.previousRound();
            }

            if (this.turns[this.turn]?.hasPhase(this.flags[game.system.id].segment)) {
                break;
            }
        }

        // Update the document, passing data through a hook first
        const updateData = {
            round: this.round,
            turn: previousTurn,
            [`flags.${game.system.id}.segment`]: this.turns[previousTurn].flags[game.system.id].segment,
        };
        const updateOptions = { direction: -1, worldTime: { delta: -1 * CONFIG.time.turnTime } };
        Hooks.callAll("combatTurn", this, updateData, updateOptions);
        const _previousTurn = await this.update(updateData, updateOptions);

        const newRunningSegment = this.round * 12 + this.combatant.flags?.[game.system.id]?.segment;
        if (originalRunningSegment != newRunningSegment) {
            const advanceTime = newRunningSegment - originalRunningSegment;
            await game.time.advance(advanceTime);

            if (advanceTime !== 0) {
                await this.onSegmentChange();
            }
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

        if (!game.user.isGM) {
            if (!gmActive()) {
                ui.notifications.warn(`Could not perform this operation because there is no GM connected.`);
            } else {
                // Request GM perform this operation
                console.log(`emit nextRound`);
                game.socket.emit(`system.${game.system.id}`, {
                    operation: "nextRound",
                    userId: game.user.id,
                });
            }
            return;
        }

        const originalRunningSegment =
            this.round * 12 + (this.combatant?.flags[game.system.id]?.segment || this.flags?.[game.system.id]?.segment);
        const _nextRound = await super.nextRound();

        const newRunningSegment =
            this.round * 12 + (this.combatant?.flags[game.system.id]?.segment || this.flags?.[game.system.id]?.segment);
        if (originalRunningSegment != newRunningSegment) {
            const advanceTime = newRunningSegment - originalRunningSegment;
            await game.time.advance(advanceTime);
            await this.onSegmentChange();
        }

        if (this.turns.length === 0) {
            ui.notifications.error(`There are no combatants`);
        } else {
            const updateData = { [`flags.${game.system.id}.segment`]: this.turns[0]?.flags[game.system.id].segment };
            await this.update(updateData);
        }

        return _nextRound;
    }

    async onSegmentChange() {
        console.log("onSegmentChange");
    }

    async promptToDeleteAoeInstantRegions() {
        // This only works for V14. canvas.regions.viewedDocuments is an invalid V14 function.
        if (!HeroCompatibility.isV14) return;

        // We only care about AoEs
        const regionsToPrompt = Array.from(canvas.regions.viewedDocuments()).filter(
            (template) => template.flags[game.system.id]?.purpose === "AoE",
        );
        for (const region of regionsToPrompt) {
            // Make sure item the region is associated with an INSTANT effectiveItem
            const effectiveItem = rehydrateAttackItem(region.flags[game.system.id].effectiveItemJson).item;
            const duration = effectiveItem.system.duration;
            if (duration === CONFIG.HERO.DURATION_TYPES.INSTANT) {
                const proceed = await foundry.applications.api.DialogV2.confirm({
                    window: {
                        title: `Delete region ${region.name}?`,
                    },
                    content: `<p>The region <b>${region.name}</b> is likely no longer needed. Would you like to delete it?</p>`,
                    rejectClose: false,
                    modal: true,
                });

                if (proceed) {
                    await region.delete();
                }
            }
        }
    }

    async previousRound() {
        if (CONFIG.debug.combat) {
            console.debug(`Hero | previousRound`);
        }

        const originalRunningSegment =
            this.round * 12 + (this.combatant?.flags[game.system.id]?.segment || this.flags?.[game.system.id]?.segment);
        const _previousRound = await super.previousRound();
        const newRunningSegment =
            this.round * 12 + (this.combatant?.flags[game.system.id]?.segment || this.flags?.[game.system.id]?.segment);

        if (originalRunningSegment != newRunningSegment) {
            const advanceTime = newRunningSegment - originalRunningSegment;
            // NaN Typically occurs when previous round ends combat
            if (!isNaN(advanceTime)) {
                await game.time.advance(advanceTime);
            }
            await this.onSegmentChange();
        }

        const updateData = {
            [`flags.${game.system.id}.segment`]: this.turns[this.turns.length - 1].flags[game.system.id].segment,
        };
        await this.update(updateData);

        return _previousRound;
    }

    computeInitiative(c, updList) {
        const id = c._id || c.id;
        const hasSegment = c.hasPhaseOrHolding(this.segment || 12);
        const isOnHold = false; //c.actor.statuses.has("holding"); //false; //c.actor?.getHoldAction();
        const isOnAbort = false; //c.actor?.getAbortAction();
        let name = c.name;
        //if (true || hasSegment || isOnHold || isOnAbort) {
        const baseInit = c.actor ? c.actor.getBaseInit(this.segment) : 0;
        const LIGHTNINGREFLEXES = c.actor?.items.find((i) => i.system.XMLID.includes("LIGHTNING_REFLEXES"));
        const initiative = baseInit + parseInt(LIGHTNINGREFLEXES?.system.LEVELS || 0);
        if (isOnHold) {
            if (hasSegment) {
                // On hold + current segment -> auto-disable on hold
                c.actor.disableHoldAction();
            } else {
                name += " (H)";
            }
        }
        if (isOnAbort) {
            name += " (A)";
            if (c.actor.incAbortActionCount()) {
                c.actor.disableAbortAction();
            }
        }
        updList.push({ _id: id, name: name, initiative, holdAction: c.holdAction, hasSegment });
        // } else {
        //     updList.push({ _id: id, name: name, initiative: 0, holdAction: c.holdAction });
        // }
    }

    async rebuildInitiative() {
        let updList = [];
        for (let c of this.combatants) {
            this.computeInitiative(c, updList);
        }
        if (updList.length > 0) {
            const hasCombatants = updList.find((o) => o.hasSegment);
            await this.updateEmbeddedDocuments("Combatant", updList);
            //console.log("Rebuild INIT", updList)
            if (hasCombatants) {
                return true;
            }
        }
        return false;
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

    async _manageTurnEvents() {
        if (!this.started) return;
        return super._manageTurnEvents();
    }

    async triggerTurnEvents() {
        const { current, previous } = this;
        const intervals = [];
        let roundDelta = current.round - previous.round;

        // In Hero we only do 1 interval
        if (roundDelta >= 0) {
            intervals.push([previous.turn, current.turn]);
        }

        // Dispatch events when either the round or turn progressed
        if (intervals.length > 0) {
            let prior = {
                combatant: this.combatants.get(previous.combatantId) ?? null,
                round: previous.round,
                turn: previous.turn,
                skipped: false,
                segment: previous.segment,
            };

            const next = {
                combatant: this.combatants.get(current.combatantId) ?? null,
                round: current.round,
                turn: current.turn,
                //skipped: round !== current.round || turn !== current.turn,
                segment: current.segment,
            };
            if (prior.combatant && prior.combatant.hasPhase(prior.segment)) {
                await this._onEndTurn(prior.combatant, {
                    round: prior.round,
                    turn: prior.turn,
                    skipped: prior.skipped,
                    segment: prior.segment,
                });
            }

            if (next.combatant && next.combatant.hasPhase(next.segment)) {
                await this._onStartTurn(next.combatant, {
                    round: next.round,
                    turn: next.turn,
                    skipped: next.skipped,
                    segment: next.segment,
                });
            }
        }

        // Dispatch events when the turn order is changed
        else {
            const changeCombatant =
                current.combatantId !== previous.combatantId &&
                current.round === previous.round &&
                current.turn === previous.turn;
            if (changeCombatant) {
                const prior = this.combatants.get(previous.combatantId);
                const next = this.combatant;
                if (prior) await this.onEndTurn(prior, { round: current.round, turn: current.turn, skipped: false });
                if (next) await this.onStartTurn(next, { round: current.round, turn: current.turn, skipped: false });
            }
        }
    }
}
