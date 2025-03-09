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

        await this._prepareCombatContext(context, options);

        return context;
    }

    // V12 getData(options) is replaced by V13 _prepareContext(options)
    async _prepareCombatContext(context, options) {
        // v13 has _prepareTrackerContext
        if (super._prepareCombatContext) {
            await super._prepareCombatContext(context, options);
        }

        if (!this.viewed) {
            return;
        }

        context.segments = [];
        for (let s = 1; s <= 12; s++) {
            context.segments[s] = [];
        }

        // Turns
        const turns = [];
        const combat = this.viewed;
        for (let [i, combatant] of combat.turns.entries()) {
            if (!combatant.visible) continue;

            // Is this token visible by the player?  Always show PC's
            if (game.settings.get(HEROSYS.module, "ShowOnlyVisibleCombatants")) {
                if (
                    !game.user.isGM &&
                    canvas.visibility?.testVisibility(combatant.token) === false &&
                    combatant.actor.type !== "pc"
                ) {
                    continue;
                }
            }

            // Prepare turn data
            const resource =
                combatant.permission >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER ? combatant.resource : null;
            const token = combatant.token;
            const turn = {
                id: combatant.id,
                name: combatant.name,
                img: await this._getCombatantThumbnail(combatant),
                active: i === combat.turn,
                owner: combatant.isOwner,
                defeated: combatant.isDefeated || combatant.actor?.statuses.has("dead"),
                hidden: combatant.hidden,
                initiative: combatant.initiative,
                initiativeTooltip: combatant.flags.initiativeTooltip,
                lightningReflexes: combatant.flags.lightningReflexes,
                hasRolled: combatant.initiative !== null,
                hasResource: resource !== null,
                resource: resource,
                canPing: combatant.sceneId === canvas.scene?.id && game.user.hasPermission("PING_CANVAS"),
                segment: combatant.flags.segment,
                holding: combatant.actor?.statuses.has("holding"),
            };

            // V13 hidden is now hide
            let constHidden = "hidden";
            if (foundry.utils.isNewerVersion(game.version, "13.000")) {
                constHidden = "hide";
            }

            turn.css = [turn.active ? "active" : "", turn.hidden ? constHidden : "", turn.defeated ? "defeated" : ""]
                .join(" ")
                .trim();

            if (game.settings.get(HEROSYS.module, "combatTrackerDispositionHighlighting")) {
                switch (token.disposition) {
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
                }
            }

            // Actor and Token status effects
            turn.effects = new Set();
            for (const effect of combatant.actor?.temporaryEffects || []) {
                if (effect.statuses.has(CONFIG.specialStatusEffects.DEFEATED)) turn.defeated = true;
                else if (effect.img) turn.effects.add(effect.img);
            }
            turns.push(turn);

            if (turn.segment) {
                context.segments[turn.segment].push(turn);
            }
        }
        context.turns = turns;
    }

    // scrollToTurn() {
    //     const combat = this.viewed;
    //     if (!combat || combat.turn === null) return;
    //     let active = this.element?.find(".combatant.active")[0];
    //     if (!active) return;
    //     active.scrollIntoView({ block: "center" });
    // }

    // v13 includes target
    async _onCombatantControl(event, target) {
        event.preventDefault();
        event.stopPropagation();
        target ??= event.target; //v12
        const { combatantId } = target.closest("[data-combatant-id]")?.dataset ?? {};
        const { control } = target.closest("[data-control]")?.dataset ?? {};
        const combat = this.viewed;
        const c = combat.combatants.get(combatantId);
        console.log(c.name);

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
