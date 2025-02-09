import { HEROSYS } from "./herosystem6e.mjs";
import { overrideCanAct } from "./settings/settings-helpers.mjs";

export class HeroSystem6eCombatTracker extends CombatTracker {
    static get defaultOptions() {
        var path = `systems/${HEROSYS.module}/templates/combat/combat-tracker.hbs`;
        return foundry.utils.mergeObject(super.defaultOptions, {
            template: path,
        });
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find(".segment-has-items").click((ev) => this._onSegmentToggleContent(ev));
    }

    async _onCombatantControl(event) {
        event.preventDefault();
        event.stopPropagation();
        const btn = event.currentTarget;
        const li = btn.closest(".combatant");
        const combat = this.viewed;
        const c = combat.combatants.get(li.dataset.combatantId);

        if (btn.dataset.control === "toggleHidden") {
            // Need to toggle all combatants associated with this token
            const _combatants = combat.combatants.filter((o) => o.tokenId === c.tokenId);
            const updates = [];
            for (const c2 of _combatants) {
                updates.push({ _id: c2.id, hidden: !c.hidden });
            }
            combat.updateEmbeddedDocuments("Combatant", updates);
            return;
        }
        super._onCombatantControl(event);
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

    async getData(options = {}) {
        let context = await super.getData(options);

        const combat = this.viewed;
        const hasCombat = combat !== null;

        if (!hasCombat) return context;

        // Initialize segments
        context.segments = [];
        for (let s = 1; s <= 12; s++) {
            context.segments[s] = [];
        }

        // Turns
        const turns = [];
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
                defeated: combatant.isDefeated,
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
            //if (turn.initiative !== null && !Number.isInteger(turn.initiative)) hasDecimals = true;
            turn.css = [turn.active ? "active" : "", turn.hidden ? "hidden" : "", turn.defeated ? "defeated" : ""]
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

        return context;
    }

    /**
     * Scroll the combat log container to ensure the current Combatant turn is centered vertically
     */
    scrollToTurn() {
        const combat = this.viewed;
        if (!combat || combat.turn === null) return;
        let active = this.element.find(".combatant.active")[0];
        if (!active) return;
        active.scrollIntoView({ block: "center" });
    }

    async _render(...args) {
        // v13 does not seem to have a _render function, perhaps super.render instead.
        if (super._render) {
            await super._render(args);
            await ui.combat.scrollToTurn();
        } else {
            console.error(`v13 workaround for combatTracker:_render`);
        }
    }

    // async render(...args) {
    //     console.log(`combatTracker:render`);
    //     super.render(args);
    // }
}
