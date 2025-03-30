import { HEROSYS } from "../herosystem6e.mjs";
import { RoundFavorPlayerUp } from "../utility/round.mjs";
// import { clamp } from "../utility/compatibility.mjs";

export class HeroSystem6eTokenDocument extends TokenDocument {
    constructor(data, context) {
        super(data, context);
    }

    async _preCreate(data, options, user) {
        await super._preCreate(data, options, user);

        // Make sure the number is not duplicated
        if (data.appendNumber) {
            const initialNumber = parseInt(this.name.match(/\((\d+)\)/)?.[1]);
            if (initialNumber) {
                const baseName = this.name.replace(this.name.match(/\((\d+)\)/)?.[0], "").trim();
                for (let n = initialNumber; n < initialNumber + 100; n++) {
                    const sisterToken = canvas.scene.tokens.find((t) => t.name === `${baseName} (${n})`);
                    if (!sisterToken) {
                        this.updateSource({
                            name: `${baseName} (${n})`,
                        });
                        break;
                    }
                }
            }
        }
    }

    _prepareDetectionModes() {
        if (!this.sight.enabled) return;

        if (!this.isOwner) return;

        if (!this.id) return;

        if (this.sight.visionMode !== "heroVision") {
            super._prepareDetectionModes();
            return;
        }

        // TO see the map you must have DETECT + SENSE
        // Anything with 'detect limited class of physical objects'

        // By default you must have a light source to see the map
        const initialRange = this.sight.range;
        this.sight.range = 0;

        // default lightPerception & basicSight detections
        //super._prepareDetectionModes();

        // Maximum distance we can see is based on perception.  This is typically 125m+ so rarely impacts scene.
        // Only 5e INT/PERCEPTION can go below 9.  6e INT cannot go below 0.  5e INT can go below 0.
        // THE RANGE OF SENSES
        // The Range Modifier (page 144) applies to all PER Rolls with Ranged
        // Senses; this effectively restricts their Range significantly. The rules
        // don’t establish any absolute outer limit or boundary for a Ranged
        // Sense; the GM should establish the limit based on common sense
        // and the situation. As a guideline, when the Range Modifier exceeds
        // the point where it reduces a character’s PER Roll to 0 or below,
        // things become too blurry, indistinct, or obscured for the character
        // to perceive, even if he rolls a 3.
        let maxRange = 8;
        // TODO: Fix PERCEPTION.system.roll so we don't have to poke into INT
        //const PERCEPTION = this.actor?.items.find((i) => i.system.XMLID === "PERCEPTION");
        if (this.actor && this.actor.system.characteristics.int) {
            //9 + (INT/5)
            const perRoll = 9 + RoundFavorPlayerUp(parseInt(this.actor.system.characteristics.int.value) / 5);
            const pwr = perRoll / 2 + 2;
            maxRange = Math.floor(Math.max(maxRange, Math.pow(2, pwr)));
        }

        const lightMode = this.detectionModes.find((m) => m.id === "lightPerception");
        if (!lightMode) {
            this.detectionModes.push({ id: "lightPerception", enabled: true, range: maxRange });
        } else {
            lightMode.range = maxRange;
            lightMode.enabled = true;
        }
        const basicMode = this.detectionModes.find((m) => m.id === "basicSight");
        if (!basicMode) {
            this.detectionModes.push({ id: "basicSight", enabled: true, range: 0 });
        } else {
            basicMode.range = 0;
            basicMode.enabled = true;
        }

        try {
            // GENERIC SIGHTGROUP (no lights required; INFRAREDPERCEPTION, NIGHTVISION, etc)
            const SIGHTGROUP = this.actor?.items.find(
                (item) =>
                    item.isSense &&
                    item.system.GROUP === "SIGHTGROUP" &&
                    //item.system.OPTIONID === undefined && // DETECT
                    item.isActive,
            );

            if (SIGHTGROUP && !this.actor?.statuses.has("blind")) {
                const basicMode = this.detectionModes.find((m) => m.id === "basicSight");
                basicMode.range = maxRange;
                this.sight.range = maxRange; // You can see without a light source
            }

            // A special vision that can see the map (like targeting touch)
            let blindVisionItem = this.actor?.items.find(
                (i) =>
                    i.isActive &&
                    i.isSense &&
                    i.isRangedSense &&
                    (i.isTargeting || ["TOUCHGROUP", "SMELLGROUP"].includes(i.system.GROUP)) &&
                    (!this.token?.actor?.statuses.has("blind") || i.system.GROUP !== "SIGHTGROUP"),
            );
            if (blindVisionItem) {
                const basicMode = this.detectionModes.find((m) => m.id === "basicSight");
                basicMode.range = maxRange;
                this.sight.range = maxRange; // You can see without a light source
            }

            // Assume we can use non-targeting senses to detect tokens
            const heroDetectSight = this.detectionModes.find((m) => m.id === "heroDetectSight");
            if (!heroDetectSight) {
                this.detectionModes.push({ id: "heroDetectSight", enabled: true, range: maxRange });
            } else {
                heroDetectSight.range = maxRange;
                heroDetectSight.enabled = true;
            }

            // Update Sight so people don't get confused when looking at the UI
            if (initialRange !== this.sight.range) {
                this.update({ "sight.range": this.sight.range });
            }
        } catch (e) {
            console.error(e);
        }
    }
}

export class HeroSystem6eToken extends Token {
    constructor(document) {
        super(document);
    }

    async _drawEffects() {
        this.effects.renderable = false;

        // Clear Effects Container
        this.effects.removeChildren().forEach((c) => c.destroy());
        this.effects.bg = this.effects.addChild(new PIXI.Graphics());
        this.effects.bg.zIndex = -1;
        this.effects.overlay = null;

        // Categorize effects
        let activeEffects = this.actor?.temporaryEffects || [];
        const overlayEffect = activeEffects.findLast((e) => e.img && e.getFlag("core", "overlay"));

        // If dead only show overlayEffect
        if (this.actor?.statuses.has("dead") && overlayEffect) {
            activeEffects = [overlayEffect];
        }

        // Draw effects
        const promises = [];
        for (const [i, effect] of activeEffects.entries()) {
            if (!effect?.img) continue;
            const promise =
                effect === overlayEffect
                    ? this._drawOverlay(effect.img, effect.tint)
                    : this._drawEffect(effect.img, effect.tint);
            promises.push(
                promise.then((e) => {
                    if (e) e.zIndex = i;
                }),
            );
        }
        await Promise.allSettled(promises);

        this.effects.sortChildren();
        this.effects.renderable = true;
        this.renderFlags.set({ refreshEffects: true });
    }

    /**
     * Add or remove the currently controlled Tokens from the active combat encounter
     * @param {Combat} [combat]    A specific combat encounter to which this Token should be added
     * @returns {Promise<Token>} The Token which initiated the toggle
     */
    async toggleCombat(combat) {
        await super.toggleCombat(combat);
    }

    _canDragLeftStart(user, event) {
        let canDragLeftStart = super._canDragLeftStart(user, event);

        // If in combat, do not allow tokens to move when it is not their turn.
        if (
            canDragLeftStart &&
            !game.user.isGM &&
            this.inCombat &&
            this.combatant.combat.started &&
            this.combatant.combat.current?.tokenId !== this.id &&
            game.settings.get(HEROSYS.module, "CombatMovementOnlyOnActorsPhase")
        ) {
            ui.notifications.warn("Combat has started and you must wait for your phase to move.");
            canDragLeftStart = false;
        }

        // Entangled tokens typically can't move
        if (canDragLeftStart && this.actor) {
            canDragLeftStart = this.actor.canMove(true, event);
        }

        return canDragLeftStart;
    }

    _onControl(options) {
        if (game.ready) game[HEROSYS.module].effectPanel.refresh();
        if (game.ready && game.combat) {
            game.combat.collection.render();
        }
        return super._onControl(options);
    }

    _onRelease(options) {
        if (game.ready) game[HEROSYS.module].effectPanel.refresh();
        if (game.ready && game.combat) {
            game.combat.collection.render();
        }
        return super._onRelease(options);
    }

    // _canHover(user, event) {
    //     if (!game.user.isGM && !this.visible) {
    //         return false;
    //     }
    //     return super._canHover(user, event);
    // }

    // _canViewMode(mode) {
    //     try {
    //         if (this.isVisable) {
    //             const point = this.center;
    //             const { width, height } = this.getSize();
    //             const tolerance = Math.min(width, height) / 4;
    //             //const visibility = canvas.visibility.testVisibility(this.center, { tolerance, object: this });

    //             const sr = canvas.dimensions.sceneRect;
    //             const inBuffer = !sr.contains(point.x, point.y);
    //             const activeVisionSources = canvas.effects.visionSources.filter(
    //                 (s) => s.active && inBuffer !== sr.contains(s.x, s.y),
    //             );
    //             const modes = CONFIG.Canvas.detectionModes;
    //             const config = canvas.visibility._createVisibilityTestConfig(point, { tolerance, object: this });
    //             for (const visionSource of activeVisionSources) {
    //                 const basicMode = this.detectionModes.find((m) => m.id === "basicSight");
    //                 if (basicMode) {
    //                     const visibility = modes.basicSight.testVisibility(visionSource, basicMode, config);
    //                     if (!visibility) {
    //                         return false;
    //                     }
    //                 }
    //             }
    //         }
    //     } catch (e) {
    //         console.error(e);
    //     }
    //     return super._canViewMode(mode);
    // }
}
