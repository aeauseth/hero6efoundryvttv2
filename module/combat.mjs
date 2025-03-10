import { HEROSYS } from "./herosystem6e.mjs";
import { clamp } from "./utility/compatibility.mjs";
import { whisperUserTargetsForActor, expireEffects } from "./utility/util.mjs";
import { userInteractiveVerifyOptionallyPromptThenSpendResources } from "./item/item-attack.mjs";
import { HeroSystem6eActor } from "./actor/actor.mjs";

// export class HeroSystem6eCombat extends Combat {}

export class HeroSystem6eCombat extends Combat {
    constructor(data, context) {
        super(data, context);

        data.flags.segmentNumber ??= 12; //{ turnNumber: 0, segmentNumber: 12 };

        //this.segmentNumber = 12;
    }

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

    async rebuildInitiative() {
        let updList = [];
        for (let c of this.combatants) {
            this.computeInitiative(c, updList);
        }
        if (updList.length > 0) {
            await this.updateEmbeddedDocuments("Combatant", updList);
            for (let c of updList) {
                if (c.initiative != 0) {
                    return true;
                }
            }
        }
        return false;
    }

    computeInitiative(c, updList) {
        if (!this.isOwner) return;
        const id = c._id || c.id;
        const hasSegment = c.actor.hasPhase(this.flags.segmentNumber);
        const isOnHold = false; //c.actor.getHoldAction();
        const isOnAbort = false; //c.actor.getAbortAction();

        c.flags.segments = HeroSystem6eActor.Speed2Segments[c.actor?.system.characteristics.spd?.value || 0];

        let name = c.token.name;
        // if (hasSegment || isOnHold || isOnAbort) {
        let baseInit = c.actor ? c.actor.getBaseInit(this.flags.segmentNumber) : 0;
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
        updList.push({ _id: id, name: name, initiative: baseInit, holdAction: c.holdAction, flags: c.flags });
        // } else {
        //     updList.push({ _id: id, name: name, initiative: 0, holdAction: c.holdAction, flags: c.flags });
        // }
    }

    /**
     * Return the Array of combatants sorted into initiative order, breaking ties alphabetically by name.
     * @returns {Combatant[]}
     */
    // setupTurns() {
    //     this.turns ||= [];

    //     // Determine the turn order and the current turn
    //     const turns = this.combatants.contents.sort(this._sortCombatants);
    //     turns.push(turns[0]);
    //     if (this.turn !== null) this.turn = Math.clamp(this.turn, 0, turns.length - 1);

    //     // Update state tracking
    //     let c = turns[this.turn];
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
    // _sortCombatants(a, b) {
    //     // Lightning Reflexes
    //     const lrA = Number.isNumeric(a.flags.lightningReflexes?.levels) ? a.flags.lightningReflexes.levels : 0;
    //     const lrB = Number.isNumeric(b.flags.lightningReflexes?.levels) ? b.flags.lightningReflexes.levels : 0;

    //     // Sort by segment first
    //     const segA = Number.isNumeric(a.flags.segment) ? a.flags.segment : -Infinity;
    //     const segB = Number.isNumeric(b.flags.segment) ? b.flags.segment : -Infinity;

    //     // Then by initiative (dex or ego)
    //     const initA = Number.isNumeric(a.initiative) ? a.initiative + lrA : -Infinity;
    //     const initB = Number.isNumeric(b.initiative) ? b.initiative + lrB : -Infinity;

    //     // Then by spd
    //     const spdA = Number.isNumeric(a.flags.spd) ? a.flags.spd : -Infinity;
    //     const spdB = Number.isNumeric(b.flags.spd) ? b.flags.spd : -Infinity;

    //     // Then by hasPlayerOwner
    //     // Finally by tokenId

    //     return (
    //         segA - segB ||
    //         initB - initA ||
    //         spdB - spdA ||
    //         a.hasPlayerOwner < b.hasPlayerOwner ||
    //         (a.tokenId > b.tokenId ? 1 : -1)
    //     );
    // }

    async _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
        await super._onCreateEmbeddedDocuments(parent, collection, documents, data, options, userId);
        await this.rebuildInitiative();
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

    /**
     * Get the current history state of the Combat encounter.
     * @param {Combatant} [combatant]       The new active combatant
     * @returns {CombatHistoryData}
     * @protected
     */
    // _getCurrentState(combatant) {
    //     combatant ||= this.combatant;
    //     return {
    //         round: this.round,
    //         turn: this.turn ?? null,
    //         combatantId: combatant?.id || null,
    //         tokenId: combatant?.tokenId || null,
    //         segment: combatant?.flags.segment || null,
    //         name: combatant?.token?.name || combatant?.actor?.name || null,
    //         initiative: combatant?.initiative || null,
    //     };
    // }

    /**
     * Begin the combat encounter, advancing to round 1 and turn 1
     * @returns {Promise<Combat>}
     */
    async startCombat() {
        if (CONFIG.debug.combat) {
            console.debug(`Hero | extraCombatants`);
        }

        let updList = [];
        for (let c of this.combatants) {
            // const updateData = {
            //     round: 1,
            //     turn: firstSegment12turn,
            //     "flags.-=postSegment12Round": null,
            //     "flags.-heroCurrent": null,
            // };
            c.flags.postSegment12Round = null;
            c.flags.heroCurrent = null;
            this.computeInitiative(c, updList);
            //await c.actor.cleanCombat();
        }
        if (updList.length > 0) {
            await this.updateEmbeddedDocuments("Combatant", updList);
        }

        super.startCombat();
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
    // async _onStartTurn(combatant) {
    //     if (CONFIG.debug.combat) {
    //         console.debug(
    //             `%c Hero | _onStartTurn: ${combatant.name} ${game.time.worldTime}`,
    //             "background: #292; color: #bada55",
    //         );
    //     }

    //     // We need a single combatant to store some flags. Like for DragRuler, end tracking, etc.
    //     // getCombatantByToken seems to get the first combatant in combat.turns that is for our token.
    //     // This likely causes issues when SPD/LightningReflexes changes.
    //     const masterCombatant = this.getCombatantByToken(combatant.tokenId);

    //     await super._onStartTurn(combatant);

    //     if (!combatant) return;

    //     // Save some properties for future support for rewinding combat tracker
    //     // TODO: Include charges for various items
    //     combatant.flags.heroHistory ||= {};
    //     if (combatant.actor && this.round && combatant.flags.segment) {
    //         combatant.flags.heroHistory[
    //             `r${String(this.round).padStart(2, "0")}s${String(combatant.flags.segment).padStart(2, "0")}`
    //         ] = {
    //             end: combatant.actor.system.characteristics.end?.value,
    //             stun: combatant.actor.system.characteristics.stun?.value,
    //             body: combatant.actor.system.characteristics.body?.value,
    //         };
    //         const updates = [{ _id: combatant.id, "flags.heroHistory": combatant.flags.heroHistory }];
    //         this.updateEmbeddedDocuments("Combatant", updates);
    //     }

    //     // Expire Effects
    //     // We expire on our phase, not on our segment.
    //     try {
    //         await expireEffects(combatant.actor);
    //     } catch (e) {
    //         console.error(e);
    //     }

    //     // Stop holding
    //     if (combatant.actor.statuses.has("holding")) {
    //         const ae = combatant.actor.effects.find((effect) => effect.statuses.has("holding"));
    //         //combatant.actor.removeActiveEffect(ae);
    //         await combatant.actor.toggleStatusEffect(ae.id, {
    //             active: false,
    //         });
    //     }

    //     // Stop nonCombatMovement
    //     if (combatant.actor.statuses.has("nonCombatMovement")) {
    //         const ae = combatant.actor.effects.find((effect) => effect.statuses.has("nonCombatMovement"));
    //         //combatant.actor.removeActiveEffect(ae);
    //         await combatant.actor.toggleStatusEffect(ae.id, {
    //             active: false,
    //         });
    //     }

    //     // Stop BRACE
    //     const BRACE = combatant.actor.items.find((i) => i.system.XMLID === "BRACE");
    //     if (BRACE?.system.active === true) {
    //         await BRACE.toggle();
    //     }

    //     // Stop HAYMAKER
    //     const HAYMAKER = combatant.actor.items.find((i) => i.system.XMLID === "HAYMAKER");
    //     if (HAYMAKER?.system.active === true) {
    //         await HAYMAKER.toggle();
    //     }

    //     // Stop dodges and other maneuvers' active effects that expire automatically
    //     const maneuverNextPhaseAes = combatant.actor.effects.filter(
    //         (ae) => ae.flags?.type === "maneuverNextPhaseEffect",
    //     );
    //     const maneuverNextPhaseTogglePromises = maneuverNextPhaseAes
    //         .filter((ae) => ae.flags.toggle)
    //         .map((toggleAes) => fromUuidSync(toggleAes.flags.itemUuid).toggle());
    //     const maneuverNextPhaseNonTogglePromises = maneuverNextPhaseAes
    //         .filter((ae) => !ae.flags.toggle)
    //         .map((maneuverAes) => maneuverAes.delete());
    //     await Promise.all(maneuverNextPhaseTogglePromises, maneuverNextPhaseNonTogglePromises);

    //     // PH: FIXME: stop abort under certain circumstances

    //     // Reset movement history
    //     if (window.dragRuler) {
    //         if (masterCombatant) {
    //             await dragRuler.resetMovementHistory(this, masterCombatant.id);
    //         } else {
    //             console.error("Unable to find masterCombatant for DragRuler");
    //         }
    //     }

    //     // STUNNING
    //     // The character remains Stunned and can take no
    //     // Actions (not even Aborting to a defensive action) until their next
    //     // Phase.
    //     // Use actor.canAct to block actions
    //     // Remove STUNNED effect _onEndTurn

    //     // Spend resources for all active powers
    //     // But only if we haven't already done so (like when rewinding combat tracker and moving forward again)
    //     const roundSegmentKey = this.round + combatant.flags.segment / 100;
    //     if ((masterCombatant.flags.spentEndOn || 0) < roundSegmentKey) {
    //         await masterCombatant.update({ "flags.spentEndOn": roundSegmentKey });

    //         let content = "";

    //         /**
    //          * @type {HeroSystemItemResourcesToUse}
    //          */
    //         const spentResources = {
    //             totalEnd: 0,
    //             end: 0,
    //             reserveEnd: 0,
    //             charges: 0,
    //         };

    //         for (const powerUsingResourcesToContinue of combatant.actor.items.filter(
    //             (item) =>
    //                 item.isActive === true && // Is the power active?
    //                 item.baseInfo && // Do we have baseInfo for this power
    //                 item.baseInfo.duration !== "instant" && // Is the power non instant
    //                 ((parseInt(item.system.end || 0) > 0 && // Does the power use END?
    //                     !item.system.MODIFIER?.find((o) => o.XMLID === "COSTSEND" && o.OPTION === "ACTIVATE")) || // Does the power use END continuously?
    //                     (item.system.charges && !item.system.charges.continuing)), // Does the power use charges but is not continuous (as that is tracked by an effect when made active)?
    //         )) {
    //             const {
    //                 error,
    //                 warning,
    //                 resourcesUsedDescription,
    //                 resourcesUsedDescriptionRenderedRoll,
    //                 resourcesRequired,
    //             } = await userInteractiveVerifyOptionallyPromptThenSpendResources(powerUsingResourcesToContinue, {});
    //             if (error || warning) {
    //                 content += `<li>(${powerUsingResourcesToContinue.name} ${error || warning}: power turned off)</li>`;
    //                 await powerUsingResourcesToContinue.toggle();
    //             } else {
    //                 content += resourcesUsedDescription
    //                     ? `<li>${powerUsingResourcesToContinue.name} spent ${resourcesUsedDescription}${resourcesUsedDescriptionRenderedRoll}</li>`
    //                     : "";

    //                 spentResources.totalEnd += resourcesRequired.totalEnd;
    //                 spentResources.end += resourcesRequired.end;
    //                 spentResources.reserveEnd += resourcesRequired.reserveEnd;
    //                 spentResources.charges += resourcesRequired.charges;
    //             }
    //         }

    //         // TODO: This should be END per turn calculated on the first phase of action for the actor.
    //         const encumbered = combatant.actor.effects.find((effect) => effect.flags.encumbrance);
    //         if (encumbered) {
    //             const endCostPerTurn = Math.abs(parseInt(encumbered.flags?.dcvDex)) - 1;
    //             if (endCostPerTurn > 0) {
    //                 spentResources.totalEnd += endCostPerTurn;
    //                 spentResources.end += endCostPerTurn;

    //                 content += `<li>${encumbered.name} (${endCostPerTurn})</li>`;

    //                 // TODO: There should be a better way of integrating this with userInteractiveVerifyOptionallyPromptThenSpendResources
    //                 // TODO: This is wrong as it does not use STUN when there is no END
    //                 const value = parseInt(this.combatant.actor.system.characteristics.end.value);
    //                 const newEnd = value - endCostPerTurn;

    //                 await this.combatant.actor.update({
    //                     "system.characteristics.end.value": newEnd,
    //                 });
    //             }
    //         }

    //         if (content !== "" && (spentResources.totalEnd > 0 || spentResources.charges > 0)) {
    //             const segment = this.combatant.flags.segment;

    //             content = `Spent ${spentResources.end} END, ${spentResources.reserveEnd} reserve END, and ${
    //                 spentResources.charges
    //             } charge${spentResources.charges > 1 ? "s" : ""} on turn ${
    //                 this.round
    //             } segment ${segment}:<ul>${content}</ul>`;

    //             const token = combatant.token;
    //             const speaker = ChatMessage.getSpeaker({
    //                 actor: combatant.actor,
    //                 token,
    //             });
    //             speaker["alias"] = combatant.actor.name;

    //             const chatData = {
    //                 author: game.user._id,
    //                 style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    //                 content: content,
    //                 whisper: whisperUserTargetsForActor(combatant.actor),
    //                 speaker,
    //             };

    //             await ChatMessage.create(chatData);
    //         }
    //     } else {
    //         console.log(
    //             `Skipping the check to spend resources for all active powers for ${combatant.name} because this was already performed up thru ${masterCombatant.flags.spentEndOn}`,
    //         );
    //     }

    //     // Some attacks include a DCV penalty which was added as an ActiveEffect.
    //     // At the beginning of our turn we make sure that AE is deleted.
    //     const removeOnNextPhase = combatant.actor.effects.filter(
    //         (o) => o.flags.nextPhase && o.duration.startTime < game.time.worldTime,
    //     );
    //     for (const ae of removeOnNextPhase) {
    //         await ae.delete();
    //     }

    //     // Remove Aborted
    //     if (combatant.actor.statuses.has("aborted")) {
    //         const effect = combatant.actor.effects.contents.find((o) => o.statuses.has("aborted"));
    //         await effect.delete();
    //     }
    // }

    /**
     * A workflow that occurs at the end of each Combat Turn.
     * This workflow occurs after the Combat document update, prior round information exists in this.previous.
     * This can be overridden to implement system-specific combat tracking behaviors.
     * This method only executes for one designated GM user. If no GM users are present this method will not be called.
     * @param {Combatant} combatant     The Combatant whose turn just ended
     * @returns {Promise<void>}
     * @protected
     */
    // async _onEndTurn(combatant) {
    //     if (CONFIG.debug.combat) {
    //         console.debug(
    //             `%c Hero | _onEndTurn: ${combatant.name} ${game.time.worldTime}`,
    //             "background: #292; color: #bada55",
    //         );
    //     }
    //     super._onEndTurn(combatant);

    //     // At the end of the Segment, any non-Persistent Powers, and any Skill Levels of any type, turn off for STUNNED actors.
    //     if (this.turns?.[this.turn]?.flags.segment != this.turns?.[this.turn - 1]?.flags.segment) {
    //         for (let _combatant of this.combatants) {
    //             if (_combatant?.actor?.statuses.has("stunned") || _combatant?.actor?.statuses.has("knockedout")) {
    //                 for (const item of _combatant.actor.getActiveConstantItems()) {
    //                     await item.toggle();
    //                 }
    //             }
    //         }
    //     }

    //     if (combatant.actor.statuses.has("stunned")) {
    //         const effect = combatant.actor.effects.contents.find((o) => o.statuses.has("stunned"));

    //         await effect.delete();

    //         const content = `${combatant.actor.name} recovers from being stunned.`;

    //         const chatData = {
    //             author: game.user._id,
    //             style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    //             content: content,
    //         };

    //         await ChatMessage.create(chatData);
    //     }
    // }

    // async _onEndSegment() {
    //     console.log("empty and never called");
    // }

    // async _onStartSegment() {
    //     console.log("empty and never called");
    // }

    /**
     * A workflow that occurs at the end of each Combat Round.
     * This workflow occurs after the Combat document update, prior round information exists in this.previous.
     * This can be overridden to implement system-specific combat tracking behaviors.
     * This method only executes for one designated GM user. If no GM users are present this method will not be called.
     * @returns {Promise<void>}
     * @protected
     */
    // async _onEndRound() {
    //     if (CONFIG.debug.combat) {
    //         console.debug(`Hero | _onEndRound`);
    //     }
    //     super._onEndRound();

    //     // Make really sure we only call at the end of the round
    //     if (this.current.round > 1 && this.current.turn === 0) {
    //         await this.PostSegment12();
    //     }
    // }

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

    // getUniqueCombatants() {
    //     const results = [];
    //     for (const c of this.combatants.values()) {
    //         if (!results.find((o) => o.token.object.id === c.token.object?.id)) {
    //             results.push(c);
    //         }
    //     }
    //     return results;
    // }

    nextTurn() {
        console.log(`nextTurn`);
        let nbC = this.combatants.filter((c) => c.flags.segments.includes(this.flags.segmentNumber)).length;
        if (this.turn < nbC - 1) {
            super.nextTurn();
        } else {
            this.nextRound();
        }
    }

    //  async nextTurn() {
    //     if (CONFIG.debug.combat) {
    //         console.debug(`%c Hero | nextTurn ${game.time.worldTime}`, "background: #229; color: #bada55");
    //     }
    //     const originalRunningSegment = this.round * 12 + this.combatant?.flags.segment;
    //     //const originalRound = this.round;
    //     //const _nextTurn = await super.nextTurn();

    //     let turn = this.turn ?? -1;
    //     let skip = this.settings.skipDefeated;

    //     // Determine the next turn number
    //     let next = null;
    //     if (skip) {
    //         for (let [i, t] of this.turns.entries()) {
    //             if (i <= turn) continue;
    //             if (t.isDefeated) continue;
    //             next = i;
    //             break;
    //         }
    //     } else next = turn + 1;

    //     // Maybe advance to the next round
    //     let round = this.round;
    //     if (this.round === 0 || next === null || next >= this.turns.length) {
    //         return this.nextRound();
    //     }

    //     const newRunningSegment = this.round * 12 + this.nextCombatant?.flags.segment;
    //     //const newRound = this.round;

    //     //if (originalRunningSegment != newRunningSegment) {
    //     const advanceTime = newRunningSegment - originalRunningSegment;
    //     const updateData = { round, turn: next };
    //     const updateOptions = { direction: 1, worldTime: { delta: advanceTime } };

    //     //console.log("nextTurn before game.time.advance", game.time.worldTime, advanceTime);
    //     Hooks.callAll("combatTurn", this, updateData, updateOptions);

    //     const _gt = game.time.worldTime;
    //     await this.update(updateData, updateOptions);

    //     // Hack to let worldTime update, which we need to expire effects on the correct phase within each segment.
    //     if (advanceTime) {
    //         for (let x = 0; x < 200; x++) {
    //             const _gt2 = game.time.worldTime;
    //             if (_gt2 != _gt) break;
    //             console.warn("Waiting for game.time.advance", _gt, _gt2);
    //             await new Promise((resolve) => setTimeout(resolve, 10));
    //         }
    //         if (game.time.worldTime === _gt) {
    //             console.warn(`Worldtime did not advance when expected`, _gt, game.time.worldTime);
    //         }
    //     }
    //     // console.log("nextTurn after game.time.advance", game.time.worldTime);

    //     // && originalRound === newRound) {

    //     //console.log(originalRunningSegment, newRunningSegment, newRunningSegment - originalRunningSegment);
    //     // console.log("nextTurn game.time.advance", game.time.worldTime);
    //     // await game.time.advance(advanceTime);
    //     // console.log("nextTurn game.time.advance", game.time.worldTime);
    //     //}

    //     //return;
    // }

    // async _onUpdate(...args) {
    //     //console.log(`%c combat._onUpdate`, "background: #229; color: #bada55", args);
    //     super._onUpdate(...args);
    // }

    /**
     * Rewind the combat to the previous turn
     * @returns {Promise<Combat>}
     */
    // async previousTurn() {
    //     if (CONFIG.debug.combat) {
    //         console.debug(`Hero | previousTurn`, "background: #222; color: #bada55");
    //     }
    //     if (this.turn === 0 && this.round === 0) return this;
    //     else if (this.turn <= 0 && this.turn !== null) return this.previousRound();
    //     let previousTurn = (this.turn ?? this.turns.length) - 1;

    //     const originalRunningSegment = this.round * 12 + this.combatant.flags.segment;

    //     // Hero combats start with round 1 and segment 12.
    //     // So anything less than segment 12 will call previousTurn
    //     if (this.round <= 1) {
    //         const segment12turn = this.turns.findIndex((o) => o.flags.segment === 12) || 0;
    //         if (this.turn <= segment12turn) {
    //             return this.previousRound();
    //         }
    //     }

    //     // Update the document, passing data through a hook first
    //     const updateData = { round: this.round, turn: previousTurn };
    //     const updateOptions = { direction: -1, worldTime: { delta: -1 * CONFIG.time.turnTime } };
    //     Hooks.callAll("combatTurn", this, updateData, updateOptions);
    //     const _previousTurn = await this.update(updateData, updateOptions);

    //     const newRunningSegment = this.round * 12 + this.combatant.flags.segment;
    //     if (originalRunningSegment != newRunningSegment) {
    //         const advanceTime = newRunningSegment - originalRunningSegment;
    //         await game.time.advance(advanceTime);
    //     }

    //     return _previousTurn;
    // }

    async nextRound() {
        console.log(`nextRound`);
        //let hasCombatants = false;
        let nextRound = this.round;
        let advanceTime = 0;
        let turn = this.turn === null ? null : 0; // Preserve the fact that it's no-one's turn currently.
        //let turnData = this.getFlag("world", "turnData");

        for (let i = 1; i < 13; i++) {
            // (!hasCombatants) {
            if (this.settings.skipDefeated && turn !== null) {
                turn = this.turns.findIndex((t) => !t.isDefeated);
                if (turn === -1) {
                    ui.notifications.warn("COMBAT.NoneRemaining", { localize: true });
                    turn = 0;
                }
            }
            //advanceTime = Math.max(this.turns.length - this.turn, 0) * CONFIG.time.turnTime;
            advanceTime += CONFIG.time.roundTime;
            nextRound = nextRound + 1;
            //console.log("Next round called....2", nextRound, turnData)
            // turnData = this.getFlag("world", "turnData");
            // if (!turnData) {
            //     turnData = { turnNumber: 0, segmentNumber: 12 };
            //     this.setFlag("world", "turnData", turnData);
            // }
            // turnData = duplicate(turnData);
            this.flags.segmentNumber++;
            if (this.flags.segmentNumber > 12) {
                this.flags.segmentNumber = 1;
            }
            // turnData.segmentNumber += 1;
            // if (turnData.segmentNumber > 12) {
            //     turnData.segmentNumber = 1;
            //     turnData.turnNumber++;
            //     ChatMessage.create({
            //         content: "Complete Post-Segment 12 Recoveries.",
            //     });
            // }
            //await this.setFlag("world", "turnData", turnData);
            //this.turnNumber = turnData.turnNumber;
            //this.segmentNumber = turnData.segmentNumber;
            //console.log("Next round called....3", nextRound, turnData)

            // Re-compute init of actors
            //hasCombatants = await this.rebuildInitiative();
            //if (hasCombatants) break;
            if (this.flags.segments[this.flags.segmentNumber].length > 0) {
                turn = Array.from(this.combatants).findIndex((combatant) =>
                    combatant.flags.segments.includes(this.flags.segmentNumber),
                );
                if (turn < 0) {
                    console.error(`Unable to locate combatant`, this);
                }
                break;
            }
            console.log(`No combatants for segment ${this.flags.segmentNumber}`);
        }

        // Update the document, passing data through a hook first
        const updateData = { round: nextRound, turn, "flags.segmentNumber": this.flags.segmentNumber };
        const updateOptions = { advanceTime, direction: 1 };
        Hooks.callAll("combatRound", this, updateData, updateOptions);
        return this.update(updateData, updateOptions);
    }

    // async nextRound() {
    //     if (CONFIG.debug.combat) {
    //         console.debug(`Hero | nextRound`);
    //     }
    //     const originalRunningSegment = this.round * 12 + this.combatant?.flags.segment;
    //     const _nextRound = await super.nextRound();
    //     const newRunningSegment = this.round * 12 + this.combatant?.flags.segment;
    //     if (originalRunningSegment != newRunningSegment) {
    //         const advanceTime = newRunningSegment - originalRunningSegment;
    //         await game.time.advance(advanceTime);
    //     }
    //     return _nextRound;
    // }

    // async previousRound() {
    //     if (CONFIG.debug.combat) {
    //         console.debug(`Hero | previousRound`);
    //     }
    //     const originalRunningSegment = this.round * 12 + this.combatant?.flags.segment;
    //     const _previousRound = await super.previousRound();
    //     const newRunningSegment = this.round * 12 + this.combatant?.flags.segment;
    //     if (originalRunningSegment != newRunningSegment) {
    //         const advanceTime = newRunningSegment - originalRunningSegment;
    //         // NaN Typically occurs when previous round ends combat
    //         if (!isNaN(advanceTime)) {
    //             await game.time.advance(advanceTime);
    //         }
    //     }
    //     return _previousRound;
    // }

    // getCombatTurnHero(priorState) {
    //     if (CONFIG.debug.combat) {
    //         console.debug(`Hero | getCombatTurnHero`, priorState);
    //     }

    //     // Don't bother when combat tracker is empty
    //     if (this.turns.length === 0) return this.turn;

    //     // Combat not started
    //     if (this.round === 0) return this.turn;

    //     // Find Exact match
    //     let combatTurn = this.turns.findIndex(
    //         (o) =>
    //             o.tokenId === priorState.tokenId &&
    //             o.flags.segment === priorState.segment &&
    //             o.initiative === priorState.initiative,
    //     );

    //     // find closest match
    //     if (combatTurn === -1) {
    //         combatTurn = this.turns.findIndex(
    //             (o) =>
    //                 (o.flags.segment === priorState.segment && o.initiative <= priorState.initiative) ||
    //                 o.flags.segment > priorState.segment,
    //         );
    //         console.log(
    //             `Combat Tracker was unable to find exact match.  Should only occur when current combatant changes SPD/Initiative.`,
    //             priorState,
    //             this,
    //         );
    //     }

    //     if (combatTurn > -1) {
    //         return combatTurn;
    //     }

    //     // There may be oddities when Initiative changes at last turn
    //     ui.notifications.warn(
    //         "Combat Tracker combatants were modified. Unable to determine which combatant should be active.",
    //     );

    //     return this.turn;
    // }
}
