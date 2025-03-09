import { HEROSYS } from "./herosystem6e.mjs";

export class EffectsPanel extends Application {
    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            id: "hero-effects-panel",
            popOut: false,
            template: `systems/${HEROSYS.module}/templates/system/effects-panel.hbs`,
        };
    }

    // Addlistners
    // effect-item
    activateListeners(html) {
        super.activateListeners(html);
        // html.find(".effect-item").click(this._onEffectClick.bind(this));
        // html.find(".effect-item").mouseover(this._onEffectClick.bind(this));
    }

    // TODO: lazy load the changes and remove effectpanel updates in herosystem6e (which happen on worldtime tick).
    // This should improve performance.  Although, performance isn't currently a problem.
    // _onEffectClick(event) {
    //     console.log(event);
    // }

    get token() {
        return canvas.tokens.controlled.at(0)?.document ?? null;
    }

    get actor() {
        return this.token?.actor ?? null; // ?? game.user?.character ?? null;
    }

    /**
     * Some PF2E code that looks useful.
     * Debounce and slightly delayed request to re-render this panel. Necessary for situations where it is not possible
     * to properly wait for promises to resolve before refreshing the UI.
     */
    refresh = foundry.utils.debounce(this.render, 100);

    async getData(options) {
        if (!this.actor) return null;

        try {
            const context = await super.getData(options);
            context.effects = [];

            for (const ae of foundry.utils.deepClone(this.actor?.appliedEffects)) {
                const d = ae._prepareDuration();
                // Sometimes ae.parent?.system.active  is false, but the power is active, unclear why.
                // Consider making active a getter (looking for the AE) instead of using system.actor.
                if (ae.parent instanceof HeroSystem6eItem) {
                    // Only show items that have a duration(temporary), or are perceivable
                    if (!d.duration && !ae.parent.isPerceivable()) {
                        continue;
                    }

                    if (d.duration) {
                        ae.flags.label = d.label;
                    }
                } else {
                    if (d.duration) {
                        ae.flags.label = d.label;
                        ae.flags.targetDisplay = ae.flags.target;
                    } else if (!ae.statuses || ae.statuses.size === 0) {
                        //console.log(`Skipping ${ae.name}`);
                        continue;
                    }
                }
                if (!ae.description) {
                    // Active effects may have empty description, which we may enhance
                    ae.description = undefined;
                }
                ae.description ??= fromUuidSync(ae.origin)?.system.description;
                ae.description ??= ae.parent?.system.description;
                context.effects.push(ae);
            }

            // All the effects on items that are not transferred
            // for (const item of this.actor.items) {
            //     for (const ae of item.effects.filter((ae) => ae.transfer === false && ae.duration.seconds)) {
            //         ae.flags.label = `${ae.duration.startTime + ae.duration.seconds - game.time.worldTime} seconds`;
            //         for (const target of ae.flags.target) {
            //             const item = fromUuidSync(target);
            //             ae.flags.targetDisplay = `${item?.name} [${item.system.XMLID}]`;
            //         }

            //         context.effects.push(ae);
            //     }
            // }

            return context;
        } catch (e) {
            console.error(e);
        }
    }
}
