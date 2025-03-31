import { HEROSYS } from "./herosystem6e.mjs";
import { clamp } from "./utility/compatibility.mjs";
import { whisperUserTargetsForActor, expireEffects } from "./utility/util.mjs";
import { userInteractiveVerifyOptionallyPromptThenSpendResources } from "./item/item-attack.mjs";
import { HeroSystem6eActorActiveEffects } from "./actor/actor-active-effects.mjs";

// export class HeroSystem6eCombat extends Combat {}

export class HeroSystem6eCombat extends Combat {
    _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
        super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    }
}

export class HeroSystem6eCombat2 extends Combat {
    constructor(data, context) {
        data.flags ??= {};
        data.flags.segment ??= 12;
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
        const baseInit = c.actor ? c.actor.getBaseInit(this.flags.segment) : 0;
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
                this.flags.segment++;
            }
            if (this.flags.segment > 12) {
                return this.nextRound();
            }

            if (this.turns[this.turn]?.hasPhase(this.flags.segment)) {
                break;
            }
        }
        await this.update({ turn: this.turn, [`flags.segment`]: this.flags.segment });
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
                this.flags.segment--;

                if (this.flags.segment < 1) {
                    return this.previousRound();
                }
            }

            if (this.round == 1 && this.flags.segment < 12) {
                return this.previousRound();
            }

            if (this.turns[this.turn]?.hasPhase(this.flags.segment)) {
                break;
            }
        }

        await this.update({ turn: this.turn, [`flags.segment`]: this.flags.segment });
    }

    // async onNextHeroSegment() {
    //     // Advance Segment Number
    //     this.flags.segment++;
    //     if (this.flags.segment > 12) {
    //         await this.nextRound();
    //         return;
    //     }
    //     await this.update({ [`flags.segment`]: this.flags.segment, turn: 0 });

    //     // Loop thru turns to find the next combatant that hasPhase on this segment
    //     for (let i = 0; i <= this.turns.length; i++) {
    //         if (this.turn >= this.turns.length) {
    //             await this.onNextHeroSegment();
    //             return;
    //         }
    //         if (this.turns[this.turn]?.hasPhase(this.flags.segment)) {
    //             return;
    //         }
    //         await this.update({ turn: this.turn + 1 });
    //     }
    //     await this.onNextHeroSegment();
    // }

    // async onPreviousHeroSegment() {
    //     // Decrement Segment Number
    //     this.flags.segment--;
    //     if (this.flags.segment < 1) {
    //         await this.previousRound();
    //         return;
    //     }

    //     await this.update({ [`flags.segment`]: this.flags.segment, turn: this.turns.length });

    //     // Loop thru turns to find the next combatant that hasPhase on this segment
    //     for (let i = 0; i <= this.turns.length; i++) {
    //         if (this.turn < 0) {
    //             await this.onPreviousHeroSegment();
    //             return;
    //         }
    //         if (this.turns[this.turn]?.hasPhase(this.flags.segment)) {
    //             return;
    //         }
    //         await this.update({ turn: this.turn - 1 });
    //     }
    //     await this.onPreviousHeroSegment();
    // }

    async nextRound() {
        if (CONFIG.debug.combat) {
            console.debug(`Hero | nextRound`);
        }
        //this.turn = 0;
        //await super.nextRound();

        this.turn = 0;
        this.flags.segment = 1;

        // Loop thru turns to find the next combatant that hasPhase on this segment
        for (let i = 0; i <= this.turns.length * 12; i++) {
            if (this.turn >= this.turns.length) {
                this.turn = 0;
                this.flags.segment++;
            }
            if (this.turns[this.turn]?.hasPhase(this.flags.segment)) {
                break;
            }
            this.turn++;
        }

        const advanceTime = 1;
        const updateData = { round: this.round + 1, [`flags.segment`]: this.flags.segment, turn: this.turn };
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
        this.flags.segment = 12;

        // Loop thru turns to find the next combatant that hasPhase on this segment
        // Likely the first one as most/all combatants go in segment 12
        for (let i = 0; i <= this.turns.length * 12; i++) {
            if (this.turn < 0) {
                //await this.onPreviousHeroSegment();
                this.flags.segment--;
                break;
            }
            if (this.round <= 0) {
                this.turn = null;
                this.segment = 12;
                break;
            }
            if (this.turns[this.turn]?.hasPhase(this.flags.segment)) {
                break;
            }
            this.turn--;
        }
        await this.update({ [`flags.segment`]: this.flags.segment, turn: this.turn });
    }

    _getCurrentState(combatant) {
        const _state = super._getCurrentState(combatant);
        // round: this.round,
        // turn: this.turn ?? null,
        // combatantId: combatant?.id || null,
        // tokenId: combatant?.tokenId || null
        _state.segment = this.flags.segment ?? null;
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
}
