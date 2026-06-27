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

        profile.SIGHT.NORMAL = hasCoreInvisibleStatus;
        if (!activeInvisPowers.length) return { profile, fringeType: "none" };

        let worstFringe = "none";
        for (const item of activeInvisPowers) {
            const blocksSense = (modXmlid) => !!item.findModsByXmlid(modXmlid);

            if (!blocksSense("SIGHTGROUP_EXEMPT")) {
                profile.SIGHT.NORMAL = true;
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

        const result = this._processHeroSensoryMatrix(visionSource, targetToken, config, options);
        console.log(`HeroTargetingDetectionModeV14 ${visionSource.object.name} ${targetToken.name} ${result}`);
        return result;
    }

    /** @protected */
    _processHeroSensoryMatrix(visionSource, targetToken, config, options) {
        // Get Foundry's raw wall line-of-sight geometry check first
        // Note: Do not use visionSource.testVisibility(target, ...) here to avoid recursive lockouts!
        const basicCheck = visionSource.los.contains(targetToken.center.x, targetToken.center.y);

        const targetActor = targetToken.actor;
        if (!targetActor) return basicCheck;

        const sourceToken = visionSource.object;
        const sourceActor = sourceToken?.actor;
        if (!sourceActor) return basicCheck;

        // Gather profiles natively from your symmetric templates
        const { profile: inv, fringeType } = this._getTargetInvisibilityProfile(targetToken, targetActor);

        // PERFORMANCE SHORT-CIRCUIT: If target has no invisibility active, fall back to basic LoS
        const hasAnyInvis = Object.values(inv).some((g) => Object.values(g).some((v) => v === true));
        if (!hasAnyInvis) {
            if (targetToken.mesh) targetToken.mesh.isAmbientDetectedOnly = false;
            return basicCheck;
        }

        const senses = this._getObserverSensoryProfile(sourceToken, sourceActor);
        const distanceInMeters = this._getCalculatedDistance(sourceToken, targetToken);

        // UNUSUAL / DEFENSIVE TARGETING SENSES VERIFICATION
        if (
            senses.RADIO.TARGETING &&
            this._evaluateSenseWithFringe(inv.RADIO.TARGETING, fringeType, distanceInMeters, 100)
        )
            return true;
        if (
            senses.HEARING.TARGETING &&
            this._evaluateSenseWithFringe(inv.HEARING.TARGETING, fringeType, distanceInMeters, 40)
        )
            return true;
        if (
            senses.MENTAL.TARGETING &&
            this._evaluateSenseWithFringe(inv.MENTAL.TARGETING, fringeType, distanceInMeters, 80)
        )
            return true;
        if (
            senses.SMELL.TARGETING &&
            this._evaluateSenseWithFringe(inv.SMELL.TARGETING, fringeType, distanceInMeters, 20)
        )
            return true;
        if (
            senses.TOUCH.TARGETING &&
            this._evaluateSenseWithFringe(inv.TOUCH.TARGETING, fringeType, distanceInMeters, 1)
        )
            return true;

        // Sight Group Unusual Bypass (Infrared / Ultraviolet)
        if (inv.SIGHT.NORMAL) {
            if (senses.SIGHT.INFRARED && !inv.SIGHT.INFRARED) return basicCheck;
            if (senses.SIGHT.ULTRAVIOLET && !inv.SIGHT.ULTRAVIOLET) return basicCheck;
        }

        // Normal Sight Baseline
        if (
            senses.SIGHT.NORMAL &&
            this._evaluateSenseWithFringe(inv.SIGHT.NORMAL, fringeType, distanceInMeters, Infinity)
        ) {
            // If they are invisible to normal sight, return false here so this mode stops trampling the ambient mode!
            return !inv.SIGHT.NORMAL ? basicCheck : false;
        }

        return false;
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
        // Return cached reference instantly to avoid GPU layout re-allocation stuttering
        // return (this._detectionFilter ??= GlowOverlayFilter.create({
        //     glowColor: [0, 0.6, 0.33, 1], // Emerald Green [R, G, B, A]
        //     thickness: 2,
        //     knockout: true, // Set to true if you want a hollow outline bubble, or false if you want a glowing halo around the token art!
        // }));

        return (this._detectionFilter ??= OutlineOverlayFilter.create({
            outlineColor: [1, 0, 1, 1],
            knockout: true,
            wave: true,
        }));
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
