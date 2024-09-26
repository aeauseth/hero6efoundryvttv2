import { HEROSYS } from "./herosystem6e.mjs";

export class HeroSystem6eCombatTracker extends CombatTracker {
    static get defaultOptions() {
        var path = `systems/${HEROSYS.module}/templates/combat/combat-tracker.hbs`;
        return foundry.utils.mergeObject(super.defaultOptions, {
            template: path,
        });
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find(".segment-hasItems").click((ev) => this._onSegmentToggleContent(ev));
    }

    async _onCombatControl(event) {
        const target = event.target;
        if (["fas fa-step-backward", "fas fa-step-forward"].includes(target.className) && !event.shiftKey) {
            return await ui.notifications.warn(`Changing turns is unusual. Hold SHIFT to change turn.`);
        }

        await super._onCombatControl(event);
    }

    async getData(options = {}) {
        let context = await super.getData(options);

        const combat = this.viewed;
        const hasCombat = combat !== null;

        if (!hasCombat) return context;

        const turns = [];
        for (let [i, combatant] of combat.turns.entries()) {
            if (!combatant.visible) continue;

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
                hasRolled: combatant.initiative !== null,
                hasResource: resource !== null,
                resource: resource,
                canPing: combatant.sceneId === canvas.scene?.id && game.user.hasPermission("PING_CANVAS"),
            };
            //if (turn.initiative !== null && !Number.isInteger(turn.initiative)) hasDecimals = true;
            turn.css = [turn.active ? "active" : "", turn.hidden ? "hidden" : "", turn.defeated ? "defeated" : ""]
                .join(" ")
                .trim();

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

            // Actor and Token status effects
            turn.effects = new Set();
            for (const effect of combatant.actor?.temporaryEffects || []) {
                if (effect.statuses.has(CONFIG.specialStatusEffects.DEFEATED)) turn.defeated = true;
                else if (effect.img) turn.effects.add(effect.img);
            }
            turns.push(turn);
        }
        context.turns = turns;

        return context;
    }
}
