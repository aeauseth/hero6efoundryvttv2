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
    }

    // static defineSchema() {
    //     debugger;
    //     return super.defineSchema();
    // }

    async rollInitiative(ids) {
        ids = typeof ids === "string" ? [ids] : ids;

        let updList = [];
        for (let cId = 0; cId < ids.length; cId++) {
            const c = this.combatants.get(ids[cId]);
            this.computeInitiative(c, updList);
        }

        if (updList.length > 0) {
            await this.updateEmbeddedDocuments("Combatant", updList);
        }

        return this;
    }

    computeInitiative(c, updList) {
        if (!this.isOwner) return;
        const id = c._id || c.id;
        //const hasSegment = c.actor.hasPhase(this.flags.segmentNumber);
        // const isOnHold = false; //c.actor.getHoldAction();
        // const isOnAbort = false; //c.actor.getAbortAction();

        //let name = c.token.name;
        // if (hasSegment || isOnHold || isOnAbort) {
        const baseInit = c.actor ? c.actor.getBaseInit(this.flags[game.system.id].segment) : 0;
        const lightningReflexesInit = parseInt(c.flags.lightningReflexes?.system.LEVELS || 0);

        // if (isOnHold) {
        //     if (hasSegment) {
        //         // On hold + current segment -> auto-disable on hold
        //         c.actor.disableHoldAction();
        //     } else {
        //         //name += " (H)";
        //     }
        // }
        // if (isOnAbort) {
        //     //name += " (A)";
        //     if (c.actor.incAbortActionCount()) {
        //         c.actor.disableAbortAction();
        //     }
        // }

        const initiative = baseInit + lightningReflexesInit || 0;

        if (c.initiative !== initiative) {
            updList.push({
                _id: id,
                initiative: initiative,
            });
        }
    }

    async rebuildInitiative() {
        let updList = [];
        for (let c of this.combatants) {
            this.computeInitiative(c, updList);
        }
        if (updList.length > 0) {
            await this.updateEmbeddedDocuments("Combatant", updList);
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
     * @protected
     */
    async _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
        super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
        await this.rebuildInitiative();
    }

    async nextTurn() {
        if (CONFIG.debug.combat) {
            console.debug(`Hero | nextTurn`);
        }

        // Loop thru turns to find the next combatant that hasPhase on this segment
        for (let i = 0; i <= this.turns.length * 12; i++) {
            this.turn++;
            if (this.turn >= this.turns.length) {
                //await this.onNextHeroSegment();
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

        await this.update({
            turn: this.turn,
            [`flags.${game.system.id}.segment`]: this.flags[game.system.id].segment,
            turns: this.setupTurns(),
        });
    }

    async previousTurn() {
        if (CONFIG.debug.combat) {
            console.debug(`Hero | previousTurn`);
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

        await this.update({ turn: this.turn, [`flags.${game.system.id}.segment`]: this.flags[game.system.id].segment });
    }

    async nextRound() {
        if (CONFIG.debug.combat) {
            console.debug(`Hero | nextRound`);
        }
        //this.turn = 0;
        //await super.nextRound();

        this.turn = 0;
        this.flags[game.system.id].segment = 1;

        // Loop thru turns to find the next combatant that hasPhase on this segment
        for (let i = 0; i <= this.turns.length * 12; i++) {
            if (this.turn >= this.turns.length) {
                this.turn = 0;
                this.flags[game.system.id].segment++;
            }
            if (this.turns[this.turn]?.hasPhase(this.flags[game.system.id].segment)) {
                break;
            }
            this.turn++;
        }

        const advanceTime = 1;
        const updateData = {
            round: this.round + 1,
            [`flags.${game.system.id}.segment`]: this.flags[game.system.id].segment,
            turn: this.turn,
        };
        const updateOptions = { direction: 1, worldTime: { delta: advanceTime } };

        Hooks.callAll("combatRound", this, updateData, updateOptions);
        return this.update(updateData, updateOptions);
    }

    async previousRound() {
        if (CONFIG.debug.combat) {
            console.debug(`Hero | previousRound`);
        }
        await super.previousRound();

        // Combat hasn't started yet?
        if (this.turn === null) return;

        this.turn = this.turns.length;
        this.flags[game.system.id].segment = 12;

        // Loop thru turns to find the next combatant that hasPhase on this segment
        // Likely the first one as most/all combatants go in segment 12
        for (let i = 0; i <= this.turns.length * 12; i++) {
            if (this.turn < 0) {
                //await this.onPreviousHeroSegment();
                this.flags[game.system.id].segment--;
                break;
            }
            if (this.round <= 0) {
                this.turn = null;
                this.segment = 12;
                break;
            }
            if (this.turns[this.turn]?.hasPhase(this.flags[game.system.id].segment)) {
                break;
            }
            this.turn--;
        }
        await this.update({ [`flags.${game.system.id}.segment`]: this.flags[game.system.id].segment, turn: this.turn });
    }

    _getCurrentState(combatant) {
        const _state = super._getCurrentState(combatant);
        // round: this.round,
        // turn: this.turn ?? null,
        // combatantId: combatant?.id || null,
        // tokenId: combatant?.tokenId || null
        _state.segment = this.flags[game.system.id]?.segment ?? null;
        _state.name = combatant?.name;
        return _state;
    }

    async _manageTurnEvents() {
        if (CONFIG.debug.combat) {
            console.debug(`Hero | _manageTurnEvents`);
        }
        if (!this.started) return;

        // Gamemaster handling only
        if (game.users.activeGM?.isSelf) {
            const advanceRound = this.current.round > (this.previous.round ?? -1);
            const advanceTurn = advanceRound || this.current.turn > (this.previous.turn ?? -1);

            const changeCombatant = this.current.combatantId !== this.previous.combatantId;
            const segmentChanged = this.current.segment !== this.previous.segment;
            //if ( !(advanceTurn || advanceRound || changeCombatant) ) return;

            // Conclude the prior Combatant turn
            const prior = this.combatants.get(this.previous.combatantId);
            if ((advanceTurn || changeCombatant || segmentChanged) && prior) await this._onEndTurn(prior);

            // Conclude the prior round
            if (advanceRound && this.previous.round) await this._onEndRound();

            // Begin the new round
            if (advanceRound) await this._onStartRound();

            // Begin a new Combatant turn
            const next = this.combatant;
            if ((advanceTurn || changeCombatant || segmentChanged) && next) await this._onStartTurn(this.combatant);
        }

        // Hooks handled by all clients
        Hooks.callAll("combatTurnChange", this, this.previous, this.current);
    }

    _onUpdate(changed, options) {
        if (CONFIG.debug.combat) {
            console.debug(`Hero | _onUpdate`);
        }
        const priorState = foundry.utils.deepClone(this.current);
        //super._onUpdate(changed, { ...options, turnEvents: false }, userId);

        if (!this.previous) this.previous = priorState; // Just in case

        // Determine the new turn order
        if ("combatants" in changed)
            this.setupTurns(); // Update all combatants
        else this.current = this._getCurrentState(); // Update turn or round

        // Record the prior state and manage turn events
        const stateChanged = this.recordPreviousState(priorState);
        if (stateChanged && options.turnEvents !== false) this._manageTurnEvents();

        // Render applications for Actors involved in the Combat
        this.updateCombatantActors();

        // Render the CombatTracker sidebar
        if (changed.active === true && this.isActive) ui.combat.initialize({ combat: this });
        else if ("scene" in changed) ui.combat.initialize();

        // Trigger combat sound cues in the active encounter
        if (this.active && this.started && priorState.round) {
            const play = (c) => c && (game.user.isGM ? !c.hasPlayerOwner : c.isOwner);
            if (play(this.combatant)) this._playCombatSound("yourTurn");
            else if (play(this.nextCombatant)) this._playCombatSound("nextUp");
        }
    }

    recordPreviousState(priorState) {
        const { round, combatantId, segment } = this.current;
        const turnChange =
            combatantId !== priorState.combatantId || round !== priorState.round || segment !== priorState.segment;
        Object.assign(this.previous, priorState);
        return turnChange;
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
        combatant.flags.heroHistory ||= {};
        if (combatant.actor && this.round && combatant.flags.segment) {
            combatant.flags.heroHistory[
                `r${String(this.round).padStart(2, "0")}s${String(combatant.flags.segment).padStart(2, "0")}`
            ] = {
                end: combatant.actor.system.characteristics.end?.value,
                stun: combatant.actor.system.characteristics.stun?.value,
                body: combatant.actor.system.characteristics.body?.value,
            };
            const updates = [{ _id: combatant.id, "flags.heroHistory": combatant.flags.heroHistory }];
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
            (ae) => ae.flags?.type === "maneuverNextPhaseEffect",
        );
        const maneuverNextPhaseTogglePromises = maneuverNextPhaseAes
            .filter((ae) => ae.flags.toggle)
            .map((toggleAes) => {
                const maneuver =
                    fromUuidSync(toggleAes.flags.itemUuid) ||
                    rehydrateAttackItem(
                        toggleAes.flags.dehydratedManeuverItem,
                        fromUuidSync(toggleAes.flags.dehydratedManeuverActorUuid),
                    ).item;

                return maneuver.toggle();
            });
        const maneuverNextPhaseNonTogglePromises = maneuverNextPhaseAes
            .filter((ae) => !ae.flags.toggle)
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
        const roundSegmentKey = this.round + combatant.flags.segment / 100;
        if ((masterCombatant.flags.spentEndOn || 0) < roundSegmentKey) {
            await masterCombatant.update({ "flags.spentEndOn": roundSegmentKey });

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
            const encumbered = combatant.actor.effects.find((effect) => effect.flags.encumbrance);
            if (encumbered) {
                const endCostPerTurn = Math.abs(parseInt(encumbered.flags?.dcvDex)) - 1;
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
                const segment = this.combatant.flags.segment;

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
                `Skipping the check to spend resources for all active powers for ${combatant.name} because this was already performed up thru ${masterCombatant.flags.spentEndOn}`,
            );
        }

        // Some attacks include a DCV penalty which was added as an ActiveEffect.
        // At the beginning of our turn we make sure that AE is deleted.
        const removeOnNextPhase = combatant.actor.effects.filter(
            (o) => o.flags.nextPhase && o.duration.startTime < game.time.worldTime,
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
        if (this.turns?.[this.turn]?.flags.segment != this.turns?.[this.turn - 1]?.flags.segment) {
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

        // PostSegment12
        if (this.current.round > 1) {
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
        if (this.flags.postSegment12Round?.[this.round]) {
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
        const postSegment12Round = this.flags.postSegment12Round || {};
        postSegment12Round[this.round] = true;

        this.update({ "flags.postSegment12Round": postSegment12Round });

        const automation = game.settings.get(HEROSYS.module, "automation");

        let content = `Post-Segment 12 (Turn ${this.round - 1})`;
        let contentHidden = `Post-Segment 12 (Turn ${this.round - 1})`;
        content += "<ul>";
        contentHidden += "<ul>";
        let hasHidden = false;
        for (const combatant of this.combatants.filter((o) => !o.defeated)) {
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

    /**
     * Get the Combatant who has the next turn.
     * @type {Combatant}
     */
    get nextCombatant() {
        let _turn = this.turn;
        let _segment = this.flags[game.system.id].segment;
        // Loop thru turns to find the next combatant that hasPhase on this segment
        for (let i = 0; i <= this.turns.length * 12; i++) {
            _turn++;
            if (_turn >= this.turns.length) {
                _turn = 0;
                _segment++;
            }
            if (_segment > 12) {
                _segment = 1;
            }

            if (this.turns[_turn]?.hasPhase(_segment)) {
                if (!this.settings.skipDefeated || !this.turns[_turn].isDefeated) {
                    return this.turns[_turn];
                }
            }
        }
        console.warn("Unable to determine HERO nextCombatant");
        return super.nextCombatant;
    }

    _sortCombatants(a, b) {
        const ia = a.flags.nextPhase?.initiative || (Number.isNumeric(a.initiative) ? a.initiative : -Infinity);
        const ib = b.flags.nextPhase?.initiative || (Number.isNumeric(b.initiative) ? b.initiative : -Infinity);
        return ib - ia || (a.id > b.id ? 1 : -1);
    }
}
