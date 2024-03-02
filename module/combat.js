export class HeroSystem6eCombat extends Combat {
    constructor(data, context) {
        super(data, context);

        this.previous = this.previous || {
            combatantId: null,
        };
    }

    /**
     * Roll initiative for one or multiple Combatants within the Combat entity
     * @param {string|string[]} ids     A Combatant id or Array of ids for which to roll
     * @param {object} [options={}]     Additional options which modify how initiative rolls are created or presented.
     * @param {string|null} [options.formula]         A non-default initiative formula to roll. Otherwise the system default is used.
     * @param {boolean} [options.updateTurn=true]     Update the Combat heroTurn after adding new initiative scores to keep the heroTurn on the same Combatant.
     * @param {object} [options.messageOptions={}]    Additional options with which to customize created Chat Messages
     * @return {Promise<Combat>}        A promise which resolves to the updated Combat entity once updates are complete.
     */

    async rollInitiative() {
        //console.log("rollInitiative");
        // Iterate over Combatants, performing an initiative roll for each
        const updates = [];
        for (let [id /*, value*/] of this.combatants.entries()) {
            // Get Combatant data (non-strictly)
            const combatant = this.combatants.get(id);
            if (!combatant?.isOwner) return this;
            //if (combatant.hasRolled) continue;

            if (!combatant.actor) continue;

            // Produce an initiative roll for the Combatant
            let characteristic =
                combatant.actor.system?.initiativeCharacteristic || "dex";
            let dexValue =
                combatant.actor.system.characteristics[characteristic].value;
            let spdValue = combatant.actor.system.characteristics.spd.value;
            //let intValue = combatant.actor.system.characteristics.int.value;

            let initiativeValue = dexValue + spdValue / 100; // + intValue / 10000;

            if (initiativeValue != combatant.initiative) {
                updates.push({
                    _id: id,
                    initiative: initiativeValue || 0,
                });
            }
        }
        if (!updates.length) return this;

        // Update multiple combatants
        await this.updateEmbeddedDocuments("Combatant", updates);

        return this;
    }

    /* -------------------------------------------- */

    /**
     * Return the Array of combatants sorted into initiative order, breaking ties alphabetically by name.
     * @return {Combatant[]}
     */

    setupTurns() {
        //console.log("setupTurns");
        // Roll Initiative everytime as DEX/INT/SPD may have changed
        // await this.rollAll();
        // Determine the turn order and the current turn
        const turnsRaw = this.combatants.contents.sort(this._sortCombatants);

        // Loop thru all combatants, add extra turn if they have LIGHTNING REFLEXES
        for (const combatant of this.combatants) {
            if (!combatant.actor) {
                continue; // Not sure how this could happen
            }

            const lightningReflexes = combatant.actor.items.find(
                (o) =>
                    o.system.XMLID === "LIGHTNING_REFLEXES_ALL" ||
                    o.system.XMLID === "LIGHTNING_REFLEXES_SINGLE",
            );
            if (lightningReflexes) {
                const levels =
                    lightningReflexes.system.LEVELS?.value ||
                    lightningReflexes.system.LEVELS ||
                    lightningReflexes.system.levels ||
                    lightningReflexes.system.other.levels ||
                    0;
                const lightning_reflex_initiative = combatant.initiative
                    ? combatant.initiative + parseInt(levels)
                    : null;
                const alias =
                    lightningReflexes.system.OPTION_ALIAS ||
                    lightningReflexes.system.INPUT ||
                    "All Actions";
                const lightning_reflex_alias = "(" + alias + ")";

                const combatantLR = new Combatant({
                    tokenId: combatant.tokenId,
                    sceneId: combatant.sceneId,
                    actorId: combatant.actor.id,
                    hidden: combatant.hidden,
                    _id: combatant.id,
                });

                combatantLR.initiative = lightning_reflex_initiative;
                combatantLR.flags.lightningReflexesAlias =
                    lightning_reflex_alias;

                turnsRaw.push(combatantLR);

                // Notice we didn't update the database with combatantLR.
                // Not really sure how we would do that without really messing things up.
                // As a result the flags.lightning_reflex_initiative is likely null,
                // which we will update in the combatTracker::getData()
            }
        }

        turnsRaw.sort(this._sortCombatants);

        // this.turns is an array of combatants.  These combatants typically appear more than
        // once in the array (1/SPEED).  Any change to one combatant for a specific token seems
        // to update all combatant entries for that specific token.  So we can't store unique
        // data in combatant (like segment number).  Using turnsExtra to store unique data (like segment).
        //this.turnsExtra = []

        // Assign Combatant copies to appropriate segments
        // Notice segment[0] is unused
        let turns = [];
        for (let s = 1; s <= 12; s++) {
            for (let t = 0; t < turnsRaw.length; t++) {
                if (!turnsRaw[t].actor) {
                    continue;
                }
                if (
                    HeroSystem6eCombat.hasPhase(
                        turnsRaw[t].actor.system.characteristics.spd.value,
                        s,
                    )
                ) {
                    const combatant = new Combatant(turnsRaw[t]);
                    combatant.flags = {
                        ...turnsRaw[t].flags,
                        segment: s,
                        turn: turns.length,
                    };
                    turns.push(combatant);
                }
            }
        }

        if (this.turn !== null)
            this.turn = Math.clamped(this.turn, 0, turns.length - 1);

        // Update state tracking
        let c = turns[this.turn];
        this.current = {
            round: this.round,
            turn: this.turn,
            combatantId: c ? c.id : null,
            tokenId: c ? c.tokenId : null,
        };

        // One-time initialization of the previous state
        if (!this.previous) this.previous = this.current;

        // Return the array of prepared turns
        return (this.turns = turns);
    }

    _sortCombatants(a, b) {
        const initA = Number.isNumeric(a.initiative) ? a.initiative : -9999;
        const initB = Number.isNumeric(b.initiative) ? b.initiative : -9999;

        let initDifference = initB - initA;
        if (initDifference != 0) {
            return initDifference;
        }

        const typeA = a.actor?.hasPlayerOwner || a.hasPlayerOwner;
        const typeB = b.actor?.hasPlayerOwner || b.hasPlayerOwner;

        if (typeA != typeB) {
            if (typeA) {
                return -1;
            }
            if (typeB) {
                return 1;
            }
        }
    }

    _sortSegments(a, b) {
        const initA = Number.isNumeric(a.combatant.initiative)
            ? a.combatant.initiative
            : -9999;
        const initB = Number.isNumeric(b.combatant.initiative)
            ? b.combatant.initiative
            : -9999;

        let initDifference = initB - initA;
        if (initDifference != 0) {
            return initDifference;
        }

        const typeA = a.combatant.hasPlayerOwner;
        const typeB = b.combatant.hasPlayerOwner;

        if (typeA != typeB) {
            if (typeA) {
                return -1;
            }
            if (typeB) {
                return 1;
            }
        }
    }

    // Standard HeroSystem rules per SPEED CHART
    static hasPhase(spd, segment) {
        switch (parseInt(spd)) {
            case 1:
                return [7].includes(segment);
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
                if (spd < 1) return false;
                return true;
        }
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    _onUpdate(data, options, userId) {
        //console.log("_onUpdate", data, options, userId);
        super._onUpdate(data, options, userId);

        // _onUpdate isn't async, so can't call await.
        // Without await is seems to loose track of turn (go from turn=0 to turn=last ).
        // Instead moved scrollToTurn to combatTracker::_render.
        //await ui.combat.scrollToTurn();
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    async _onCreateDescendantDocuments(
        parent,
        collection,
        documents,
        data,
        options,
        userId,
    ) {
        //console.log("_onCreateDescendantDocuments");

        //Missing actor?
        // let missingActors = documents.filter((o) => !o.actor);
        // {
        //     for (let c of missingActors) {
        //         ui.notifications.warn(
        //             `${c.name} references an Actor which no longer exists within the World.`,
        //         );
        //     }
        // }

        // documents = documents.filter((o) => o.actor);
        // if (documents.length === 0) return;

        // Get current combatant
        const oldCombatant = this.combatant;

        // Super
        await super._onCreateDescendantDocuments(
            parent,
            collection,
            documents,
            data,
            options,
            userId,
        );

        // Setup turns in segment fashion
        //const _turns = this.setupTurns();

        // Roll initiative (again?)
        await this.rollInitiative();

        // Keep the current Combatant the same after adding new Combatants to the Combat
        if (oldCombatant) {
            this.turn = this.turns.findIndex(
                (o) =>
                    o.tokenId === oldCombatant.tokenId &&
                    o.flags.segment === oldCombatant.flags.segment,
            );
            await this.update({ turn: this.turn });
        }

        // Render the collection
        if (this.active) this.collection.render();
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    async _onDeleteDescendantDocuments(
        parent,
        collection,
        documents,
        ids,
        options,
        userId,
    ) {
        //console.log("_onDeleteDescendantDocuments");

        // Update the heroTurn order and adjust the combat to keep the combatant the same (unless they were deleted)

        // Get current (active) combatant
        const oldCombatant = this.combatant;
        const nextCombatant =
            this.turns[this.turn + 1 > this.turns.length ? 0 : this.turn + 1];

        // Super
        super._onDeleteDescendantDocuments(
            parent,
            collection,
            documents,
            ids,
            options,
            userId,
        );

        // Setup turns in segment fashion
        // this.setupTurns();

        // When Combat is not started there is no oldCombatant (or current one), so were done.
        if (!oldCombatant) {
            return;
        }

        // If old & new combatant are the same, then default actions are appropriate.
        if (this.combatants.get(oldCombatant.id)) {
            this.turn = this.turns.findIndex(
                (o) =>
                    o.tokenId === oldCombatant.tokenId &&
                    o.flags.segment === oldCombatant.flags.segment,
            );
        } else {
            // We deleted the combatent so find turn of nextCombatant.
            // Could be on next round

            if (nextCombatant) {
                this.turn = this.turns.findIndex(
                    (o) =>
                        o.tokenId === nextCombatant.tokenId &&
                        o.flags.segment === nextCombatant.flags.segment,
                );
            } else {
                this.turn = 0;
                this.round++;
            }
        }
        await this.update({ turn: this.turn, round: this.round });

        // Render the collection
        if (this.active) this.collection.render();
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    _onUpdateDescendantDocuments(
        parent,
        collection,
        documents,
        changes,
        options,
        //_userId,
    ) {
        //console.log("_onUpdateDescendantDocuments");

        //super.super._onUpdateDescendantDocuments(..) would be ideal but not likely necessary and difficult to implement.

        // Update the turn order
        const priorState = foundry.utils.deepClone(this.current);
        const combatant = this.combatant;
        this.setupTurns();
        this.#recordPreviousState(priorState);

        // When token (turns) are added or deleted this.turns likely points to the wrong turn.
        // Adjust turn order to keep the current Combatant the same (SEGMENT is important for HeroSystem)
        let sameTurn = this.turns.findIndex(
            (t) =>
                t.id === combatant?.id &&
                t.flags.segment === combatant?.flags.segment &&
                t.initiative === combatant?.initiative,
        );
        if (sameTurn < 0) sameTurn = this.turn;

        const adjustedTurn = sameTurn !== this.turn ? sameTurn : undefined;
        if (options.turnEvents !== false && adjustedTurn) {
            this._manageTurnEvents(adjustedTurn);
        }

        // Render the Collection
        if (this.active && options.render !== false) {
            this.collection.render();
        }
    }

    /**
     * Update the previous turn data.
     * Compare the state with the new current state. Only update the previous state if there is a difference.
     * @param {CombatHistoryData} priorState      A cloned copy of the current history state before changes
     */
    #recordPreviousState(priorState) {
        const current = this.current;
        const hasChanged =
            current.combatantId !== priorState.combatantId ||
            current.round !== priorState.round ||
            current.turn !== priorState.turn;
        if (hasChanged) this.previous = priorState;
    }

    async _onActorDataUpdate(...args) {
        //console.log("_onActorDataUpdate");
        super._onActorDataUpdate(...args);
        this.setupTurns();
        if (this.active) this.collection.render();
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
        //console.log("_onStartTurn", combatant.name, this.current);

        await super._onStartTurn(combatant);

        if (!combatant) return;

        // Reset movement history
        if (dragRuler) {
            await dragRuler.resetMovementHistory(this, combatant.id);
        }

        // STUNNING
        // The character remains Stunned and can take no
        // Actions (not even Aborting to a defensive action) until their next
        // Phase.
        // Use actor.canAct to block actions
        // Remove STUNNED effect _onEndTurn

        // Spend END for all active powers
        let content = "";
        let spentEnd = 0;

        for (let powerUsingEnd of combatant.actor.items.filter(
            (item) =>
                item.system.active === true &&
                parseInt(item.system?.end || 0) > 0 &&
                (item.system.subType || item.type) != "attack",
        )) {
            const costEndOnlyToActivate = powerUsingEnd.system.MODIFIER?.find(
                (o) => o.XMLID === "COSTSEND" && o.OPTION === "ACTIVATE",
            );
            if (!costEndOnlyToActivate) {
                const end = parseInt(powerUsingEnd.system.end);
                spentEnd += end;
                content += `<li>${powerUsingEnd.name} (${end})</li>`;
            }
        }

        const encumbered = combatant.actor.effects.find(
            (effect) => effect.flags.encumbrance,
        );
        if (encumbered) {
            const endCostPerTurn =
                Math.abs(parseInt(encumbered.flags?.dcvDex)) - 1;
            if (endCostPerTurn > 0) {
                spentEnd += endCostPerTurn;
                content += `<li>${encumbered.name} (${endCostPerTurn})</li>`;
            }
        }

        if (spentEnd > 0 && !this.combatant.isFake) {
            let segment = this.combatant.flags.segment;
            let value = parseInt(
                this.combatant.actor.system.characteristics.end.value,
            );
            let newEnd = value;
            newEnd -= spentEnd;

            await this.combatant.actor.update({
                "system.characteristics.end.value": newEnd,
            });

            content = `Spent ${spentEnd} END (${value} to ${newEnd}) on turn ${this.round} segment ${segment}:<ul>${content}</ul>`;

            const token = combatant.token;
            const speaker = ChatMessage.getSpeaker({
                actor: combatant.actor,
                token,
            });
            speaker["alias"] = combatant.actor.name;
            const chatData = {
                user: game.user._id,
                type: CONST.CHAT_MESSAGE_TYPES.OTHER,
                content: content,
                whisper: ChatMessage.getWhisperRecipients("GM"),
                speaker,
            };

            await ChatMessage.create(chatData);
        }

        // Some attacks include a DCV penalty which was added as an ActiveEffect.
        // At the beginning of our turn we make sure that AE is deleted.
        const removeOnNextPhase = combatant.actor.effects.filter(
            (o) =>
                o.flags.nextPhase && o.duration.startTime < game.time.worldTime,
        );
        for (const ae of removeOnNextPhase) {
            await ae.delete();
        }

        // Remove Aborted
        if (combatant.actor.statuses.has("aborted")) {
            const effect = combatant.actor.effects.contents.find((o) =>
                o.statuses.has("aborted"),
            );
            await effect.delete();
        }

        //console.log("_onStartTurn.end", combatant.name, this.current);
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
        //console.log("_onEndTurn", combatant.name, this.current);

        // const automation = game.settings.get(
        //     "hero6efoundryvttv2",
        //     "automation",
        // );

        // https://github.com/dmdorman/hero6e-foundryvtt/issues/722
        // if (this.round > 0) {
        //     // Edge case where Flight was using 1 END when combat begins.  Make sure that doesn't happen.
        //     // Hover (flight) uses 1 END
        //     if (
        //         automation === "all" ||
        //         (automation === "npcOnly" && combatant.actor.type == "npc") ||
        //         (automation === "pcEndOnly" && combatant.actor.type === "pc")
        //     ) {
        //         if (
        //             // gliding costs no endurance
        //             ["flight"].includes(combatant.actor?.flags?.activeMovement)
        //         ) {
        //             //console.log(combatant.actor);
        //             if (dragRuler?.getRangesFromSpeedProvider) {
        //                 if (
        //                     dragRuler.getMovedDistanceFromToken(
        //                         combatant.token.object,
        //                     ) === 0
        //                 ) {
        //                     let endValue =
        //                         parseInt(
        //                             combatant.actor.system.characteristics.end
        //                                 .value,
        //                         ) - 1;
        //                     await combatant.actor.update({
        //                         "system.characteristics.end.value": endValue,
        //                     });

        //                     // ChatCard notification about spending 1 END to hover.
        //                     // Players may mistakenly leave FLIGHT on.
        //                     const content = `${combatant.token.name} spent 1 END to hover.`;
        //                     const chatData = {
        //                         user: game.user.id,
        //                         //whisper: ChatMessage.getWhisperRecipients("GM"),
        //                         speaker: ChatMessage.getSpeaker({
        //                             actor: combatant.actor,
        //                         }),
        //                         //blind: true,
        //                         content: content,
        //                     };
        //                     await ChatMessage.create(chatData);
        //                 }
        //             }
        //         }
        //     }
        // }

        super._onEndTurn(combatant);

        // At the end of the Segment, any non-Persistent Powers, and any Skill Levels of any type, turn off for STUNNED actors.
        if (
            this.turns?.[this.turn]?.flags.segment !=
            this.turns?.[this.turn - 1]?.flags.segment
        ) {
            //console.log(
            //     "next segment",
            //     this.combatant.flags?.segment,
            //     this.current,
            // );
            for (let _combatant of this.combatants) {
                if (
                    _combatant?.actor?.statuses.has("stunned") ||
                    _combatant?.actor?.statuses.has("knockedout")
                ) {
                    for (const item of _combatant.actor.getActiveConstantItems()) {
                        await item.toggle();
                    }
                }
            }
        }

        if (combatant.actor.statuses.has("stunned")) {
            const effect = combatant.actor.effects.contents.find((o) =>
                o.statuses.has("stunned"),
            );

            await effect.delete();

            let content = `${combatant.actor.name} recovers from being stunned.`;
            const token = combatant.token;
            const speaker = ChatMessage.getSpeaker({
                actor: combatant.actor,
                token,
            });
            speaker["alias"] = combatant.actor.name;
            const chatData = {
                user: game.user._id,
                type: CONST.CHAT_MESSAGE_TYPES.OTHER,
                content: content,
                //speaker: speaker
            };

            await ChatMessage.create(chatData);
        }
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
        //console.log("_onEndRound", this.current);

        super._onEndRound();

        // Make really sure we only call at the end of the round
        if (this.current.round > 1 && this.current.turn === 0) {
            await this.PostSegment12();
        }
    }

    // TODO: Replace with PostSegment12 activities.
    // Such as automatic recovery
    async PostSegment12() {
        // POST-SEGMENT 12 RECOVERY
        // After Segment 12 each Turn, all characters (except those deeply
        // unconscious or holding their breath) get a free Post-Segment 12
        // Recovery. This includes Stunned characters, although the Post-
        // Segment 12 Recovery does not eliminate the Stunned condition.

        const automation = game.settings.get(
            "hero6efoundryvttv2",
            "automation",
        );

        let content = `Post-Segment 12 (Turn ${this.round - 1})`;
        let contentHidden = `Post-Segment 12 (Turn ${this.round - 1})`;
        content += "<ul>";
        contentHidden += "<ul>";
        let hasHidden = false;
        for (let combatant of this.combatants.filter((o) => !o.defeated)) {
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
                // Make sure combatant is visible in combat tracker
                if (!combatant.hidden) {
                    content +=
                        "<li>" +
                        (await combatant.actor.TakeRecovery()) +
                        "</li>";
                } else {
                    hasHidden = true;
                    contentHidden +=
                        "<li>" +
                        (await combatant.actor.TakeRecovery()) +
                        "</li>";
                }

                // END RESERVE
                for (const item of actor.items.filter(
                    (o) => o.system.XMLID === "ENDURANCERESERVE",
                )) {
                    const ENDURANCERESERVEREC = item.findModsByXmlid(
                        "ENDURANCERESERVEREC",
                    );
                    if (ENDURANCERESERVEREC) {
                        const newValue = Math.min(
                            item.system.max,
                            item.system.value +
                                parseInt(ENDURANCERESERVEREC.LEVELS),
                        );
                        if (newValue > item.system.value) {
                            const delta = newValue - item.system.value;
                            await item.update({
                                "system.value": newValue,
                            });

                            if (!combatant.hidden) {
                                content +=
                                    "<li>" +
                                    `${combatant.token.name} ${item.name} +${delta}` +
                                    "</li>";
                            } else {
                                contentHidden +=
                                    "<li>" +
                                    `${combatant.token.name} ${item.name} +${delta}` +
                                    "</li>";
                            }
                        }
                    }
                }
            }
        }
        content += "</ul>";
        contentHidden += "</ul>";
        const chatData = {
            user: game.user._id,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
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

    /**
     * Begin the combat encounter, advancing to round 1 and turn 1
     * @returns {Promise<Combat>}
     */
    async startCombat() {
        //console.log("startCombat", this.current);

        // Don't call super because we start on segment 12 which is never turn 0.
        //await super.startCombat();
        this._playCombatSound("startEncounter");
        const turn = this.turns.findIndex((o) => o.flags.segment === 12) || 1;
        const updateData = {
            round: 1,
            turn: turn,
            previous: { round: 1, turn: Math.max(0, turn - 1) },
        };
        Hooks.callAll("combatStart", this, updateData);
        await this.update(updateData);

        // Reset all movement history when we start combat
        // if (dragRuler) {
        //     for (const _combatant of this.combatants) {
        //         await dragRuler.resetMovementHistory(this, _combatant.id);
        //     }
        // }

        //this.setupTurns();

        // Find first TURN with segment 12
        // let turn = this.turns.findIndex((o) => o.flags.segment === 12) || 1;

        // const updateData = { round: 1, turn: turn };
        // await this.update(updateData);
        //console.log("startCombat.end", this.current);
    }

    /**
     * Rewind the combat to the previous turn
     * @returns {Promise<Combat>}
     */
    async previousTurn() {
        //console.log("previousTurn");
        if (this.turn === 0 && this.round === 0) return this;
        else if (this.turn <= 0 && this.turn !== null)
            return this.previousRound();

        // Hero combats start with round 1 and segment 12.
        // So anything less than segment 12 will call previousTurn
        let segment12turn =
            this.turns.findIndex((o) => o.flags.segment === 12) || -1;
        if (this.round <= 1 && this.turn <= segment12turn) {
            return this.previousRound();
        }

        let previousTurn = (this.turn ?? this.turns.length) - 1;

        // Determine segment
        let segment = this.combatant.flags.segment;
        let segment_prev = this.turns[previousTurn].flags.segment;
        let advanceTime = segment_prev - segment;
        if (advanceTime > 0) {
            advanceTime = 0;
        }

        // Update the document, passing data through a hook first
        const updateData = { round: this.round, turn: previousTurn };
        const updateOptions = { advanceTime, direction: -1 };
        Hooks.callAll("combatTurn", this, updateData, updateOptions);
        return this.update(updateData, updateOptions);
    }

    /**
     * Rewind the combat to the previous round
     * @returns {Promise<Combat>}
     */
    async previousRound() {
        //console.log("previousRound");
        let turn = this.round === 0 ? 0 : Math.max(this.turns.length - 1, 0);
        if (this.turn === null) turn = null;
        let round = Math.max(this.round - 1, 0);
        //let advanceTime = -1 * (this.turn || 0) * CONFIG.time.turnTime;
        //if (round > 0) advanceTime -= HERO.time.turn; //CONFIG.time.roundTime;

        // Determine segment
        let segment = this.turns[turn]?.flags.segment || null;
        let segment_prev = this.combatant?.flags.segment || null;
        // if (round > 0) {
        //     segment += 12;
        // }
        let advanceTime = segment_prev - segment;

        // Hero combats start with round 1 and segment 12.
        // So anything less than segment 12 will call previousTurn
        let segment12turn =
            this.turns.findIndex((o) => o.flags.segment === 12) || -1;
        if (round <= 1 && turn < segment12turn) {
            round = 0;
            turn = null;
        }
        if (round == 0) {
            turn = null;
        }

        // Update the document, passing data through a hook first
        const updateData = { round, turn };
        const updateOptions = { advanceTime, direction: -1 };
        Hooks.callAll("combatRound", this, updateData, updateOptions);
        return this.update(updateData, updateOptions);
    }

    /**
     * Advance the combat to the next turn
     * @returns {Promise<Combat>}
     */
    async nextTurn() {
        let turn = this.turn ?? -1;
        let skip = this.settings.skipDefeated;

        // Determine the next turn number
        let next = null;
        if (skip) {
            for (let [i, t] of this.turns.entries()) {
                if (i <= turn) continue;
                if (t.isDefeated) continue;
                next = i;
                break;
            }
        } else next = turn + 1;

        // Maybe advance to the next round
        let round = this.round;
        if (this.round === 0 || next === null || next >= this.turns.length) {
            return this.nextRound();
        }

        // Determine segment
        let segment = this.combatant.flags.segment;
        let segment_next = this.turns[next].flags.segment;
        if (segment_next < segment) {
            segment_next += 12;
        }
        let advanceTime = segment_next - segment;

        // Update the document, passing data through a hook first
        const updateData = { round, turn: next };
        const updateOptions = { advanceTime: advanceTime, direction: 1 };
        Hooks.callAll("combatTurn", this, updateData, updateOptions);
        return this.update(updateData, updateOptions);
    }

    /**
     * Advance the combat to the next round
     * @returns {Promise<Combat>}
     */
    async nextRound() {
        let turn = this.turn === null ? null : 0; // Preserve the fact that it's no-one's turn currently.
        if (this.settings.skipDefeated && turn !== null) {
            turn = this.turns.findIndex((t) => !t.isDefeated);
            if (turn === -1) {
                ui.notifications.warn("COMBAT.NoneRemaining", {
                    localize: true,
                });
                turn = 0;
            }
        }

        let nextRound = this.round + 1;

        // Determine segment
        let segment = this.combatant?.flags.segment || null;
        let segment_next = this.turns[0]?.flags.segment || null;
        segment_next += 12;
        const advanceTime = segment_next - segment;

        // Update the document, passing data through a hook first
        const updateData = { round: nextRound, turn };
        const updateOptions = { advanceTime, direction: 1 };
        Hooks.callAll("combatRound", this, updateData, updateOptions);
        return this.update(updateData, updateOptions);
    }
}

// class HeroCombatant extends Combatant {
//     constructor(combatant) {
//         super();
//         Object.assign(this, combatant);
//         this.id = combatant.id;
//     }

//     id = null;
//     initiative = null; //Override
//     turn = null;
//     segment = null;
//     alias = null;
//     isFake = false;
//     //hasRolled = true; // Initiative is static, but actor DEX/INT/SPD might change
// }
