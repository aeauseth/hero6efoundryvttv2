import { gridUnitsToMeters } from "../utility/units.mjs";

/**
 * Utility blueprint layout definition to enforce structural symmetry
 * between Observer Senses and Target Invisibility profiles.
 */
class HeroSenseProfileTemplate {
    static create() {
        return {
            SIGHT: {
                NORMAL: false,
                INFRARED: false,
                ULTRAVIOLET: false,
            },
            HEARING: {
                NORMAL: false,
                TARGETING: false,
            },
            RADIO: {
                TARGETING: false,
            },
            SMELL: {
                NORMAL: false,
                TARGETING: false,
            },
            TOUCH: {
                NORMAL: false,
                TARGETING: false,
            },
            MENTAL: {
                AWARENESS: false,
                TARGETING: false,
            },
        };
    }
}

class HeroBaseDetectionModeV14 extends foundry.canvas.perception.DetectionMode {
    _getObserverSensoryProfile(sourceToken, sourceActor) {
        const sData = sourceActor.getFlag("hero6efoundryvttv2", "senses") || {};
        const isBlind = sourceToken.document.hasStatusEffect("blind") || !!sData.sightSenseDisabledEffect;
        const isDeaf = !!sData.hearingSenseDisabledEffect;

        const profile = HeroSenseProfileTemplate.create();

        // All mapped under the SIGHT group structure
        profile.SIGHT.NORMAL = !isBlind;
        profile.SIGHT.INFRARED = !isBlind && !!sData.hasInfraredPerception;
        profile.SIGHT.ULTRAVIOLET = !isBlind && !!sData.hasUltravioletPerception;

        profile.HEARING.NORMAL = !isDeaf;
        profile.HEARING.TARGETING = !isDeaf && (!!sData.hasTargetingNormalHearing || !!sData.hasTargetingHearingGroup);

        profile.RADIO.TARGETING = !sData.radioSenseDisabledEffect && !!sData.hasTargetingRadioGroup;

        profile.SMELL.NORMAL = !sData.smellSenseDisabledEffect;
        profile.SMELL.TARGETING =
            !sData.smellSenseDisabledEffect && (!!sData.hasTargetingNormalSmell || !!sData.hasTargetingSmellGroup);

        profile.TOUCH.NORMAL = !sData.touchSenseDisabledEffect;
        profile.TOUCH.TARGETING =
            !sData.touchSenseDisabledEffect && (!!sData.hasTargetingNormalTouch || !!sData.hasTargetingTouchGroup);

        profile.MENTAL.AWARENESS = !sData.mentalSenseDisabled && !!sData.hasMentalAwareness;
        profile.MENTAL.TARGETING = !sData.mentalSenseDisabled && !!sData.hasTargetingMentalGroup;

        return profile;
    }

    _getTargetInvisibilityProfile(targetToken, targetActor) {
        const activeInvisPowers = targetActor.items.filter((i) => i.system.XMLID === "INVISIBILITY" && i.isActive);
        const hasCoreInvisibleStatus =
            targetToken.document.hasStatusEffect("invisible") || targetActor.statuses?.has("invisible");

        const profile = HeroSenseProfileTemplate.create();

        // If they have the core status effect, assume baseline sight group invisibility
        if (hasCoreInvisibleStatus) {
            profile.SIGHT.NORMAL = true;
            profile.SIGHT.INFRARED = true;
            profile.SIGHT.ULTRAVIOLET = true;
        }

        if (!activeInvisPowers.length) return { profile, fringeType: "none" };

        let worstFringe = "none";

        for (const item of activeInvisPowers) {
            const blocksSense = (modXmlid) => !!item.findModsByXmlid(modXmlid);

            // HERO System Rule: Invisibility covers the entire Sight Group by default.
            // If SIGHTGROUP_EXEMPT is NOT present, they are invisible to ALL sight senses.
            if (!blocksSense("SIGHTGROUP_EXEMPT")) {
                profile.SIGHT.NORMAL = true;
                profile.SIGHT.INFRARED = true;
                profile.SIGHT.ULTRAVIOLET = true;
            } else {
                // If they ARE exempt from the group, check if they explicitly bought it for single special senses anyway
                if (blocksSense("NORMAL_SIGHT")) profile.SIGHT.NORMAL = true; // Adjust string matching if your system uses a different XMLID for single normal sight
                if (blocksSense("INFRAREDPERCEPTION")) profile.SIGHT.INFRARED = true;
                if (blocksSense("ULTRAVIOLETSIGHT")) profile.SIGHT.ULTRAVIOLET = true;
            }

            if (blocksSense("HEARINGGROUP")) {
                profile.HEARING.NORMAL = true;
                profile.HEARING.TARGETING = true;
            }

            if (blocksSense("RADIOGROUP")) {
                profile.RADIO.TARGETING = true;
            }

            if (blocksSense("SMELLGROUP")) {
                profile.SMELL.NORMAL = true;
                profile.SMELL.TARGETING = true;
            }

            if (blocksSense("TOUCHGROUP")) {
                profile.TOUCH.NORMAL = true;
                profile.TOUCH.TARGETING = true;
            }

            if (blocksSense("MENTALGROUP")) {
                profile.MENTAL.AWARENESS = true;
                profile.MENTAL.TARGETING = true;
            }

            if (blocksSense("BRIGHTFRINGE")) worstFringe = "bright";
            else if (worstFringe !== "bright" && !blocksSense("NOFRINGE")) worstFringe = "standard";
            else if (worstFringe === "none" && blocksSense("NOFRINGE")) worstFringe = "noFringe";
        }

        if (worstFringe === "none") worstFringe = "standard";

        return { profile, fringeType: worstFringe };
    }

    _getCalculatedDistance(sourceToken, targetToken) {
        const tokenScene = sourceToken.document.parent;
        const waypoints = [
            { x: sourceToken.center.x, y: sourceToken.center.y },
            { x: targetToken.center.x, y: targetToken.center.y },
        ];
        const pathMeasurement = canvas.grid.measurePath(waypoints);
        const rawGridDistance = pathMeasurement?.distance ?? 0;

        const distanceMultiplier = gridUnitsToMeters({ silent: true, scene: tokenScene });
        let distanceInMeters = rawGridDistance * distanceMultiplier;

        if (canvas.grid.type !== foundry.CONST.GRID_TYPES.GRIDLESS && tokenScene) {
            const sourceClust = canvas.grid.getOffset({ x: sourceToken.x, y: sourceToken.y });
            const targetClust = canvas.grid.getOffset({ x: targetToken.x, y: targetToken.y });
            const dx = Math.abs(sourceClust.i - targetClust.i);
            const dy = Math.abs(sourceClust.j - targetClust.j);

            const isAdjacent = dx <= 1 && dy <= 1;
            const metersPerSingleGridSpace = (tokenScene.grid?.distance ?? 1) * distanceMultiplier;

            if (
                isAdjacent &&
                distanceInMeters > metersPerSingleGridSpace &&
                distanceInMeters <= metersPerSingleGridSpace * 1.5
            ) {
                distanceInMeters = metersPerSingleGridSpace;
            }
        }
        return distanceInMeters;
    }

    _evaluateSenseWithFringe(isInvisible, fringeType, distance, maxRange) {
        if (!isInvisible) return distance <= maxRange;
        if (fringeType === "noFringe") return false;

        const maxFringeRange = fringeType === "bright" ? 16 : 2;
        const trackingLimit = Math.min(maxFringeRange, maxRange);
        return distance <= trackingLimit;
    }
}

/**
 * Targeting sense group implementation.
 * Extends the Base HERO sensory class.
 */
class HeroTargetingDetectionModeV14 extends HeroBaseDetectionModeV14 {
    static PRIORITY = 10;

    static get TYPE() {
        return foundry.canvas.perception.DetectionMode.DETECTION_TYPES.SIGHT;
    }

    /** @override */
    testVisibility(visionSource, config, options = {}) {
        const targetToken = options.object;
        if (!targetToken || targetToken.document?.documentName !== "Token") {
            return super.testVisibility(visionSource, config, options);
        }

        // Capture both the boolean result and the descriptive reason string
        const { result, reason } = this._processHeroSensoryMatrix(visionSource, targetToken, config, options);

        // Color code based on success/failure, highlighting the exact reason
        console.log(
            `HeroTargetingDetectionModeV14: Can ${visionSource.object.name} see ${targetToken.name}? %c${result} [Reason: ${reason}]`,
            `color: ${result ? "green" : "orange"}; font-weight: bold;`,
        );

        return result;
    }

    /** @protected */
    _processHeroSensoryMatrix(visionSource, targetToken, config, options) {
        const basicCheck = visionSource.los.contains(targetToken.center.x, targetToken.center.y);
        const targetActor = targetToken.actor;
        if (!targetActor) return { result: basicCheck, reason: "No target actor, using Basic LoS" };

        const sourceToken = visionSource.object;
        const sourceActor = sourceToken?.actor;
        if (!sourceActor) return { result: basicCheck, reason: "No source actor, using Basic LoS" };

        const { profile: inv, fringeType } = this._getTargetInvisibilityProfile(targetToken, targetActor);

        // PERFORMANCE SHORT-CIRCUIT
        const hasAnyInvis = Object.values(inv).some((g) => Object.values(g).some((v) => v === true));
        if (!hasAnyInvis) {
            if (targetToken.mesh) targetToken.mesh.isAmbientDetectedOnly = false;
            return { result: basicCheck, reason: `No target invisibility active. Basic LoS is: ${basicCheck}` };
        }

        const senses = this._getObserverSensoryProfile(sourceToken, sourceActor);
        const distanceInMeters = this._getCalculatedDistance(sourceToken, targetToken);

        // UNUSUAL / DEFENSIVE TARGETING SENSES VERIFICATION
        if (
            senses.RADIO.TARGETING &&
            this._evaluateSenseWithFringe(inv.RADIO.TARGETING, fringeType, distanceInMeters, 100)
        ) {
            return { result: true, reason: "RADIO TARGETING bypassed invisibility" };
        }
        if (
            senses.HEARING.TARGETING &&
            this._evaluateSenseWithFringe(inv.HEARING.TARGETING, fringeType, distanceInMeters, 40)
        ) {
            return { result: true, reason: "HEARING TARGETING bypassed invisibility" };
        }
        if (
            senses.MENTAL.TARGETING &&
            this._evaluateSenseWithFringe(inv.MENTAL.TARGETING, fringeType, distanceInMeters, 80)
        ) {
            return { result: true, reason: "MENTAL TARGETING bypassed invisibility" };
        }
        if (
            senses.SMELL.TARGETING &&
            this._evaluateSenseWithFringe(inv.SMELL.TARGETING, fringeType, distanceInMeters, 20)
        ) {
            return { result: true, reason: "SMELL TARGETING bypassed invisibility" };
        }
        if (
            senses.TOUCH.TARGETING &&
            this._evaluateSenseWithFringe(inv.TOUCH.TARGETING, fringeType, distanceInMeters, 1)
        ) {
            return { result: true, reason: "TOUCH TARGETING bypassed invisibility" };
        }

        // Sight Group Unusual Bypass (Infrared / Ultraviolet)
        // If target is invisible to standard sight, see if observer has a special sense that isn't blocked!
        if (inv.SIGHT.NORMAL) {
            if (senses.SIGHT.INFRARED && !inv.SIGHT.INFRARED) {
                return {
                    result: basicCheck,
                    reason: `INFRARED sight bypassed normal invisibility. Basic LoS is: ${basicCheck}`,
                };
            }
            if (senses.SIGHT.ULTRAVIOLET && !inv.SIGHT.ULTRAVIOLET) {
                return {
                    result: basicCheck,
                    reason: `ULTRAVIOLET sight bypassed normal invisibility. Basic LoS is: ${basicCheck}`,
                };
            }
        }

        // Normal Sight Baseline
        if (
            senses.SIGHT.NORMAL &&
            this._evaluateSenseWithFringe(inv.SIGHT.NORMAL, fringeType, distanceInMeters, Infinity)
        ) {
            const finalResult = !inv.SIGHT.NORMAL ? basicCheck : false;
            return {
                result: finalResult,
                reason: `NORMAL SIGHT check evaluated. Target normal invis active: ${!!inv.SIGHT.NORMAL}. Basic LoS: ${basicCheck}`,
            };
        }

        return { result: false, reason: "Failed all sensory matrix checks" };
    }
}

/**
 * Non-targeting ambient sense group implementation.
 * Overridden to natively force Foundry's Token Outline sensory drawing style.
 */
class HeroAmbientDetectionModeV14 extends HeroBaseDetectionModeV14 {
    static PRIORITY = 5;

    static get TYPE() {
        // Enforces native "Sense Invisibility" outline shader styles across the canvas layer
        return foundry.canvas.perception.DetectionMode.DETECTION_TYPES.SENSE_INVISIBILITY;
    }

    static getDetectionFilter() {
        // 1. Force the base token artwork mesh to be translucent and faded
        if (this.object?.mesh) {
            this.object.mesh.alpha = 0.4; // 40% translucent ghost look
        }

        // 2. Initialize the unified custom filter pipeline if it doesn't exist yet
        if (!this._combinedDetectionFilter) {
            // A. Create the native Glow Filter
            const glowFilter = GlowOverlayFilter.create(
                {
                    glowColor: [1.0, 0.0, 1.0, 1.0], // Bright Magenta
                    animated: true, // Native breathing animation loop
                    innerGlow: false,
                    knockout: false,
                },
                {
                    distance: 30, // Thicker lines
                    quality: 0.5,
                },
            );

            // B. Create the Alpha Blur Filter from the global namespace
            let alphaBlurFilter;
            const AlphaBlurClass =
                globalThis.AlphaBlurFilter || globalThis.foundry?.canvas?.rendering?.filters?.AlphaBlurFilter;

            if (AlphaBlurClass) {
                alphaBlurFilter = new AlphaBlurClass();
                alphaBlurFilter.blur = 12;
            } else {
                alphaBlurFilter = new PIXI.BlurFilter();
                alphaBlurFilter.blur = 8;
            }

            // C. COMBINE BOTH WITHOUT OVERRIDING: Use a standard PIXI Filter container pass
            // This executes the Alpha Blur first, then passes the result into the Glow Filter
            const vertexSrc = PIXI.Filter.defaultVertexSrc;
            const fragmentSrc = `
      varying vec2 vTextureCoord;
      uniform sampler2D uSampler;
      void main() {
        gl_FragColor = texture2D(uSampler, vTextureCoord);
      }
    `;

            const combinedFilter = new PIXI.Filter(vertexSrc, fragmentSrc);

            // Inject the two native filters sequentially into the pipeline array
            combinedFilter.subFilters = [alphaBlurFilter, glowFilter];

            this._combinedDetectionFilter = combinedFilter;
        }

        return this._combinedDetectionFilter;
    }

    /** @override */
    testVisibility(visionSource, config, options = {}) {
        const targetToken = options.object;

        if (!targetToken || targetToken.document?.documentName !== "Token") {
            return false;
        }

        // 1. Evaluate your custom HERO System non-targeting ambient senses loop
        const hasAmbientDetection = this._processHeroAmbientMatrix(visionSource, targetToken, config, options);
        console.log(
            `%c HeroAmbientDetectionModeV14 ${visionSource.object.name} ${targetToken.name} ${hasAmbientDetection}`,

            "background: #1111FF; color: #FFFFFF",
        );

        // 2. If undetected, return false immediately to keep the token hidden
        if (!hasAmbientDetection) {
            if (targetToken.mesh) targetToken.mesh.isAmbientDetectedOnly = false;
            return false;
        }

        // 3. V14 CORE ENFORCEMENT: Force the canvas engine to render this token
        // using the outline/ghost shader profile instead of drawing raw texture files!
        if (targetToken.mesh) {
            targetToken.mesh.isAmbientDetectedOnly = true;
        }

        return true;
    }

    /** @protected */
    _processHeroAmbientMatrix(visionSource, targetToken, config, options) {
        const targetActor = targetToken.actor;
        if (!targetActor) return false;

        const sourceToken = visionSource.object;
        const sourceActor = sourceToken?.actor;
        if (!sourceActor) return false;

        const { profile: inv, fringeType } = this._getTargetInvisibilityProfile(targetToken, targetActor);

        // Ambient pings only run if the target is currently cloaked/invisible to standard sight!
        if (!inv.SIGHT.NORMAL) return false;

        const senses = this._getObserverSensoryProfile(sourceToken, sourceActor);
        const distanceInMeters = this._getCalculatedDistance(sourceToken, targetToken);

        // NON-TARGETING SENSORY RESOLVER (Sound/Odor proximity pings)
        if (senses.HEARING.NORMAL && !senses.HEARING.TARGETING) {
            if (this._evaluateSenseWithFringe(inv.HEARING.NORMAL, fringeType, distanceInMeters, 40)) return true;
        }
        if (senses.MENTAL.AWARENESS && !senses.MENTAL.TARGETING) {
            if (this._evaluateSenseWithFringe(inv.MENTAL.AWARENESS, fringeType, distanceInMeters, 80)) return true;
        }
        if (senses.SMELL.NORMAL && !senses.SMELL.TARGETING) {
            if (this._evaluateSenseWithFringe(inv.SMELL.NORMAL, fringeType, distanceInMeters, 20)) return true;
        }
        if (senses.TOUCH.NORMAL && !senses.TOUCH.TARGETING) {
            if (this._evaluateSenseWithFringe(inv.TOUCH.NORMAL, fringeType, distanceInMeters, 1)) return true;
        }

        return false;
    }
}

// ====================================================================
// SECURE CENTRALIZED INITIALIZATION & REGISTRY PIPELINE
// Registers your class architecture safely into Foundry V14.
// ====================================================================
export function initializeHeroVisionV14() {
    const isV14 = game.release ? game.release.generation >= 14 : false;
    if (!isV14) return;

    // A. Register Full Targeting Configuration Profile Class Model
    CONFIG.Canvas.detectionModes["heroTargetingSenses"] = new HeroTargetingDetectionModeV14({
        id: "heroTargetingSenses",
        label: "HERO: Targeting Senses Matrix",
        type: foundry.canvas.perception.DetectionMode.DETECTION_TYPES.SIGHT,
    });

    // B. Register Ambient Non-Targeting Detection Profile Class Model
    CONFIG.Canvas.detectionModes["heroAmbientSenses"] = new HeroAmbientDetectionModeV14({
        id: "heroAmbientSenses",
        label: "HERO: Ambient Sensory Pings",
        type: foundry.canvas.perception.DetectionMode.DETECTION_TYPES.SENSE_INVISIBILITY,

        // FIX: Tells Foundry's Token Sheet UI configuration manager that this is a
        // system-managed tracking channel. This stops the core interface builder from
        // forcefully injecting checkbox controls or enabling it blindly on prototype tokens!
        enabled: false,
    });

    // C. Register Master Unified Vision Mode UI Dropdown Configuration Profile
    CONFIG.Canvas.visionModes["heroUnifiedVisionV14"] = new foundry.canvas.perception.VisionMode({
        id: "heroUnifiedVisionV14",
        label: "HERO: Dynamic System Vision",
        tokenConfig: true,

        // Structured V14 vision data model template settings
        vision: {
            darkness: { adaptive: true },
            defaults: {
                // Automatically injects your custom targeting matrix as a baseline engine fallback
                heroTargetingSenses: null,
            },
        },
        canvas: {},
    });
}
