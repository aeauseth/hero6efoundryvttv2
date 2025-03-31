import { HEROSYS } from "./herosystem6e.mjs";
import { overrideCanAct } from "./settings/settings-helpers.mjs";

export class HeroSystem6eCombatTracker extends CombatTracker {
    // V12 static get defaultOptions is replaced by V13 static DEFAULT_OPTIONS = {}
    // However I'm currently using static PARTS = {} in V13
    static get defaultOptions() {
        // v13 uses PARTS, defaultOptions isn't even called
        return foundry.utils.mergeObject(super.defaultOptions, {
            // id: "combat",
            template: `systems/${HEROSYS.module}/templates/combat/combat-tracker.hbs`,
            // title: "COMBAT.SidebarTitle",
            // scrollY: [".directory-list"],
        });
    }

    static initializeTemplate() {
        // v13 uses PARTS, defaultOptions isn't even called
        if (HeroSystem6eCombatTracker.PARTS) {
            HeroSystem6eCombatTracker.PARTS.tracker.template = `systems/${HEROSYS.module}/templates/combat/tracker.hbs`;
        }
    }

    //v12 uses activateListeners, V13 uses _onRender
    activateListeners(html) {
        super.activateListeners(html);
        this.addHeroListeners.call(this, html);
    }

    addHeroListeners(html) {
        html.find(".segment-has-items").click((ev) => this._onSegmentToggleContent(ev));
    }

    // // v13 uses _onRender instead of activateListeners
    _onRender(context, options) {
        super._onRender(context, options);
        this.addHeroListeners.call(this, $(this.element));
    }

    // V12 getData(options) is replaced by V13 _prepareContext(options)
    async getData(options = {}) {
        // v13 does not call getData
        //console.log("getData", this);
        const context = await super.getData(options);

        const combat = this.viewed;
        if (!combat) return context;

        await this._prepareTrackerContext(context, options);

        return context;
    }

    // V12 getData(options) is replaced by V13 _prepareContext(options)
    async _prepareTrackerContext(context, options) {
        // v13 has _prepareTrackerContext
        if (super._prepareTrackerContext) {
            await super._prepareTrackerContext(context, options);
        }

        if (!this.viewed) {
            return;
        }

        const combat = this.viewed;
        if (!combat) {
            return;
        }

        // try {
        //     // Create our own list of turns that includes several combatants based on SPD.
        //     // Notice we are using the context.turns as a base to support v12/v13 compatibility
        //     const heroTurns = [];
        //     let t = 0;
        //     for (const turn of context.turns) {
        //         const combatant = combat.turns.find((t) => t.id === turn.id);
        //         if (!combatant) {
        //             console.error("unable to location combatant");
        //             continue;
        //         }
        //         for (const segment of combatant.getSegments({ combatCurrent: combat.current })) {
        //             const heroTurn = foundry.utils.deepClone(turn);
        //             heroTurn.flags = foundry.utils.deepClone(combatant.flags);
        //             heroTurn.flags.segment = segment;
        //             heroTurn.name += ` [${t}]`;
        //             heroTurn.css = heroTurn.css.replace("active", ""); // HBS will add this back in for the appropriate segment
        //             heroTurn.holding = combatant.actor?.statuses.has("holding");
        //             heroTurn.effects = (combatant.actor?.temporaryEffects || []).filter(
        //                 (e) => !e.statuses.has(CONFIG.specialStatusEffects.DEFEATED) && e.statuses.size > 0,
        //             );
        //             //heroTurn.name += ` [${heroTurns.length}]`;
        //             heroTurns.push(heroTurn);
        //         }
        //         t++;
        //     }
        //     context.turns = heroTurns;
        // } catch (e) {
        //     console.error(e);
        // }

        try {
            // Create the 12 segments
            context.segments = [];
            for (let s = 1; s <= 12; s++) {
                context.segments[s] = [];
            }

            // Augment default turns
            if (game.settings.get(HEROSYS.module, "combatTrackerDispositionHighlighting")) {
                const turnsDisposition = context.turns.map((turn) => {
                    const combatant = this.viewed.combatants.find((combatant) => combatant.id === turn.id);
                    const token = combatant?.token;
                    switch (token?.disposition) {
                        case CONST.TOKEN_DISPOSITIONS.FRIENDLY:
                            if (token.hasPlayerOwner) {
                                turn.css += " combat-tracker-hero-disposition-player";
                            } else {
                                turn.css += " combat-tracker-hero-disposition-friendly";
                            }
                            break;
                        case CONST.TOKEN_DISPOSITIONS.NEUTRAL:
                            turn.css += " combat-tracker-hero-disposition-neutral";
                            break;
                        case CONST.TOKEN_DISPOSITIONS.HOSTILE:
                            turn.css += " combat-tracker-hero-disposition-hostile";
                            break;
                        case CONST.TOKEN_DISPOSITIONS.SECRET:
                            turn.css += " combat-tracker-hero-disposition-secret";
                            break;
                        default:
                            console.warn(`Unknown token disposition`, this);
                    }
                    return turn;
                });
                context.turns = turnsDisposition;
            }
        } catch (e) {
            console.error(e);
        }

        try {
            // Association segments to determine if a segment has any combatants
            for (let s = 1; s <= 12; s++) {
                for (const turn of context.turns) {
                    const combatant = combat.combatants.find((c) => c.id === turn.id);
                    if (combatant.hasPhase(s)) {
                        context.segments[s].push({ ...turn, segment: s, css: turn.css.replace("active", "") });
                    }
                }
            }
            this.viewed.flags.segments = context.segments;
        } catch (e) {
            console.error(e);
        }
    }

    scrollToTurn() {
        const combat = this.viewed;
        if (!combat || combat.turn === null) return;
        let active = $(this.element)?.find(".combatant.active")[0];
        if (!active) return;
        active.scrollIntoView({ block: "center" });
    }

    // v13 includes target
    async _onCombatantControl(event, target) {
        event.preventDefault();
        event.stopPropagation();
        target ??= event.target; //v12
        const { segmentId } = target.closest("[data-segment-id]")?.dataset ?? {};
        const { combatantId } = target.closest("[data-combatant-id]")?.dataset ?? {};
        const { control, effectId } = target.closest("[data-control]")?.dataset ?? {};

        const combat = this.viewed;
        const c = combat.combatants.get(combatantId);
        console.log(c.name, control);

        if (!c) {
            console.warn(combatantId, control);
        }

        if (control === "effect" && effectId) {
            const effect = c.actor.temporaryEffects.find((e) => e.id == effectId);
            if (effect) {
                for (const status of effect.statuses) {
                    await c.token.actor.toggleStatusEffect(status);
                }
            }
            return;
        }

        if (control === "holdingAnAction") {
            c.flags.holdingAnAction = !c.flags.holdingAnAction;
            if (c.flags.holdingAnAction) {
                c.flags.delayUntil = {
                    segment: parseInt(segmentId),
                    turn: this.turn + 1,
                };
            } else {
                c.flags.delayUntil = null;
            }

            await c.update({ [`flags`]: c.flags });
            return;
        }

        return super._onCombatantControl(event, target);
    }
}
