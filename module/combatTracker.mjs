import { HEROSYS } from "./herosystem6e.mjs";
import { overrideCanAct } from "./settings/settings-helpers.mjs";

// v13 has namespaced this. Remove when support is no longer provided. Also remove from eslint template.
const FoundryVttCombatTracker = foundry.applications?.sidebar?.tabs?.CombatTracker || CombatTracker;

export class HeroSystem6eCombatTracker extends FoundryVttCombatTracker {
    // V12 static get defaultOptions is replaced by V13 static DEFAULT_OPTIONS = {}
    // However I'm currently using static PARTS = {} in V13
    static get defaultOptions() {
        // v13 uses PARTS, defaultOptions isn't even called
        return foundry.utils.mergeObject(super.defaultOptions, {
            // id: "combat",
            template: this.singleCombatantTracker
                ? `systems/${HEROSYS.module}/templates/combat/combat-tracker-singleB.hbs`
                : `systems/${HEROSYS.module}/templates/combat/combat-tracker.hbs`,
            // title: "COMBAT.SidebarTitle",
            // scrollY: [".directory-list"],
        });
    }

    static get singleCombatantTracker() {
        return (
            game.settings.get(game.system.id, "alphaTesting") &&
            game.settings.get(game.system.id, "singleCombatantTracker")
        );
    }

    static initializeTemplate() {
        // v13 uses PARTS, defaultOptions isn't even called
        if (HeroSystem6eCombatTracker.PARTS) {
            HeroSystem6eCombatTracker.PARTS.header.template = `systems/${HEROSYS.module}/templates/combat/header.hbs`;
            HeroSystem6eCombatTracker.PARTS.tracker.template = this.singleCombatantTracker
                ? `systems/${HEROSYS.module}/templates/combat/tracker-singleB.hbs`
                : `systems/${HEROSYS.module}/templates/combat/tracker.hbs`;
            //HeroSystem6eCombatTracker.PARTS.tracker.template = `systems/${HEROSYS.module}/templates/combat/tracker.hbs`;
        }
    }

    //v12 uses activateListeners, V13 uses _onRender
    activateListeners(html) {
        super.activateListeners(html);
        this.addHeroListeners.call(this, html);
    }

    addHeroListeners(html) {
        html.find(".segment-has-items").click((ev) => this._onSegmentToggleContent(ev));
        html.find(".token-effects").click((ev) => this._onCombatantControl(ev));
    }

    // // v13 uses _onRender instead of activateListeners
    _onRender(context, options) {
        super._onRender(context, options);
        this.addHeroListeners.call(this, $(this.element));

        // Replace V13 Round with Turn
        // const encounterTitle = $(this.element).find(".encounter-title");
        // if (encounterTitle) {
        //     encounterTitle.text(encounterTitle.text().replace("Round", "Turn"));
        // }
    }

    // V12 getData(options) is replaced by V13 _prepareCombatContext
    async getData(options = {}) {
        const context = await super.getData(options);
        await this._prepareTrackerContext(context, options);

        return context;
    }

    // V12 getData(options) is replaced by V13 _prepareTrackerContext
    async _prepareTrackerContext(context, options) {
        // gameSystemId is used to access flags in handlebar files
        context.gameSystemId = game.system.id;

        // v13 has _prepareTrackerContext
        if (super._prepareCombatContext) {
            await super._prepareTrackerContext(context, options);
        }

        if (!this.viewed) {
            return;
        }

        const combat = this.viewed;
        if (!combat) {
            return;
        }

        if (!context.turns) {
            return;
        }

        // Augment default turns
        if (!HeroSystem6eCombatTracker.singleCombatantTracker) {
            try {
                const turnsAugmented = context.turns.map((turn) => {
                    const combatant = this.viewed.combatants.find((combatant) => combatant.id === turn.id);
                    return {
                        ...turn,
                        //css: turn.css.replace("active", ""), // HBS will add this back in for the appropriate segment
                        flags: combatant.flags,
                        holding: combatant.actor?.statuses.has("holding"),
                        effects: (combatant.actor?.temporaryEffects || []).filter(
                            (e) => !e.statuses.has(CONFIG.specialStatusEffects.DEFEATED) && e.statuses.size > 0,
                        ),
                        segment: combatant.flags[game.system.id]?.segment,
                    };
                });
                context.turns = turnsAugmented;
            } catch (e) {
                console.error(e);
            }

            // try {
            //     for (let t = 0; t < context.turns.length; t++) {
            //         context.turns[t].turn = t;
            //     }
            // } catch (e) {
            //     console.error(e);
            // }

            try {
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

            context.segments = [];
            for (let s = 1; s <= 12; s++) {
                context.segments[s] = [];
                try {
                    for (let [t, turn] of context.turns.entries()) {
                        // if (!turn.flags?.[game.system.id]?.segment) {
                        //     console.warn(`missing segment:${s} turn:${t}`, turn);
                        // }
                        if (turn.flags?.[game.system.id]?.segment === s) {
                            turn.turnNumber = t;
                            context.segments[s].push(turn);
                        }
                    }
                } catch (e) {
                    console.error(e);
                }
            }

            // Debug: assign them to segment 12 if we don't know what to do with them
            for (const [t, turn] of context.turns.entries()) {
                // console.debug(t, turn);
                if (isNaN(turn.flags?.[game.system.id]?.segment)) {
                    context.segments[12].push(turn);
                    console.warn(`Missing segment`, t, turn);
                }
            }
            //context._segments = "test";
        } else {
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
                        turn.effects = (combatant.actor?.temporaryEffects || []).filter(
                            (e) =>
                                !e.statuses.has(CONFIG.specialStatusEffects.DEFEATED) &&
                                e.statuses.size > 0 &&
                                CONFIG.statusEffects.find((s) => s.id === e.statuses.first()),
                        );
                        turn.holding =
                            combatant.actor?.statuses.has("holding") || combatant.flags?.nextPhase?.initiative;
                        turn.hasRolled ??= turn.initiative > 0; // v13
                        turn.flags ??= combatant.flags;
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
                            context.segments[s].push({
                                ...turn,
                                segment: s,
                                css: s !== combat.current.segment ? turn.css.replace("active", "") : turn.css,
                            });
                        }
                    }
                }
                this.viewed.flags[game.system.id] ??= {};
                this.viewed.flags[game.system.id].segments = context.segments;

                // Custom sort current segment (needed for holding actions)
                for (let s = 1; s <= 12; s++) {
                    if (s !== combat.flags[game.system.id]?.segment) {
                        context.segments[s] = context.segments[s].sort(this._sortCombatantsOffSegment);
                    }
                }
            } catch (e) {
                console.error(e);
            }
        }
    }

    scrollToTurn() {
        const combat = this.viewed;
        if (!combat || combat.turn === null) return;
        if (!this.element) return;
        const element = $(this.element);
        const active = element?.find(".combatant.active")?.[0];
        if (!active) return;
        active.scrollIntoView({ block: "center" });
    }

    // async _render(...args) {
    //     console.log("_render", this);
    //     // v13 does not seem to have a _render function, perhaps super.render instead.
    //     try {
    //         await super._render(args); // for updating hidden combatants
    //         await ui.combat.scrollToTurn();
    //     } catch (e) {
    //         console.warn(e);
    //     }
    // }

    // v13 includes target
    async _onCombatantControl(event, target) {
        event.preventDefault();
        event.stopPropagation();
        target ??= event.target; //v12
        const { combatantId } = target.closest("[data-combatant-id]")?.dataset ?? {};
        const { control, effectId } = target.closest("[data-control]")?.dataset ?? {};
        const combat = this.viewed;
        const c = combat.combatants.get(combatantId);

        if (!c) {
            console.warn(combatantId, control);
        }

        if (control === "toggleHidden") {
            // Need to toggle all combatants associated with this token
            const _combatants = combat.combatants.filter((o) => o.tokenId === c.tokenId);
            const updates = [];
            for (const c2 of _combatants) {
                updates.push({ _id: c2.id, hidden: !c.hidden });
            }
            await combat.updateEmbeddedDocuments("Combatant", updates);
            return;
        }

        if (control === "effect" && effectId) {
            const effect = c.actor.temporaryEffects.find((e) => e.id == effectId);
            if (effect) {
                for (const status of effect.statuses) {
                    await c.token.actor.toggleStatusEffect(status);
                }
            }
        }

        return super._onCombatantControl(event, target);
    }

    async _onCombatControl(event) {
        const overrideKeyText = game.keybindings.get(HEROSYS.module, "OverrideCanAct")?.[0].key;
        const target = event.target;
        if (["fas fa-step-backward", "fas fa-step-forward"].includes(target.className) && !overrideCanAct) {
            return await ui.notifications.warn(
                `Changing turns is unusual. Hold <b>${overrideKeyText}<b> to change turn.`,
            );
        }

        await super._onCombatControl(event);
    }

    _onSegmentToggleContent(event) {
        event.preventDefault();

        const header = event.currentTarget;
        const segment = header.closest(".segment-container");
        const content = segment.querySelector(".segment-content");
        content.style.display = content.style.display === "none" ? "block" : "none";
    }
}
