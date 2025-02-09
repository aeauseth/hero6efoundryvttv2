import { calculateDistanceBetween } from "./range.mjs";

export class HeroPointVisionSource extends foundry.canvas.sources.PointVisionSource {
    get isBlinded() {
        // if (this.token?.name === "Onyx") {
        //     debugger;
        // }
        const defaultBlind =
            (this.data.radius === 0 && (this.data.lightRadius === 0 || !this.visionMode?.perceivesLight)) ||
            Object.values(this.blinded).includes(true);
        if (!defaultBlind) {
            return defaultBlind;
        }

        // Do we have an enhanced vision with DETECT & SENSE & RANGE?
        // Some visions have SENSE/RANGE (built in)
        // SightGroup/ToughGroup/HearingGroup/RadioGroup/SmellGroup have SENSE builtIn
        // Assuming only SIGHT/TOUCH/SMELL or TARGETING can actually SEE (you can see, touch, smell a wall)
        let blindVisionItem = this.token?.actor?.items.find(
            (i) =>
                i.isActive &&
                i.isSense &&
                i.isRangedSense &&
                (i.isTargeting || ["TOUCHGROUP", "SMELLGROUP"].includes(i.system.GROUP)) &&
                (!this.token?.actor?.statuses.has("blind") || i.system.GROUP !== "SIGHTGROUP"),
        );

        if (blindVisionItem) {
            //console.log("blindVisionItem", blindVisionItem);
            return false;
        }
        return defaultBlind;
    }

    get token() {
        if (!this.sourceId.match("Token.")) return null;
        const _tokenId = this.sourceId.match(/\.([a-z0-9]{16})/i)?.[1];
        return canvas.tokens.placeables.find((t) => t.id === _tokenId);
    }
}

export function setPerceptionModes() {
    // class HeroVisionMode extends VisionMode {
    //     constructor() {
    //         super({
    //             id: "heroSight",
    //             //label: "PF2E.Actor.Creature.Sense.Type.Thoughts",
    //             walls: false,
    //             angle: false,
    //             type: DetectionMode.DETECTION_TYPES.OTHER,
    //         });
    //     }
    // }
    // CONFIG.Canvas.visionModes.heroVision = new HeroVisionMode();
    // CONFIG.Canvas.visionModes.heroSight = new VisionMode({
    //     id: "heroSight",
    //     label: "VISION.HeroSight",
    //     canvas: {
    //         shader: ColorAdjustmentsSamplerShader,
    //         //uniforms: { enable: true, contrast: 0, saturation: -1.0, brightness: 0 },
    //         uniforms: { brightness: 0, contrast: 0, darknessLevel: 0, saturation: -1 },
    //     },
    //     lighting: {
    //         levels: {
    //             // from core-bundled darkvision mode: maybe restore?
    //             //[VisionMode.LIGHTING_LEVELS.DIM]: VisionMode.LIGHTING_LEVELS.BRIGHT,
    //         },
    //         background: { visibility: VisionMode.LIGHTING_VISIBILITY.REQUIRED },
    //     },
    //     vision: {
    //         darkness: { adaptive: false },
    //         defaults: { contrast: 0, saturation: -1, brightness: 0.1 },
    //     },
    // });
    // Hero Generic Sense

    class HeroDetectionSightMode extends DetectionMode {
        constructor() {
            super({
                id: "heroDetectSight",
                //label: "PF2E.Actor.Creature.Sense.Type.Thoughts",
                //walls: true,
                //angle: false,
                type: DetectionMode.DETECTION_TYPES.SIGHT,
            });
        }
        static getDetectionFilter() {
            const filter2 = (this._detectionFilter ??= OutlineOverlayFilter.create({
                wave: true,
                knockout: false,
            }));
            return (filter2.thickness = 1), filter2;
        }
        _canDetect(visionSource, target) {
            if (target?.document?.hidden === true) return false;
            if (super._canDetect(visionSource, target)) return true; // handled by standard vision
            if (!target.document.hidden && !target.document.hasStatusEffect("invisible")) {
                return true;
            }

            // Invisibility Fringe
            const INVISIBILITY = target?.actor?.items.find((i) => i.system.XMLID === "INVISIBILITY");
            if (INVISIBILITY && !INVISIBILITY.findModsByXmlid("NOFRINGE")) {
                const distance = calculateDistanceBetween(visionSource.token, target).distance;
                if (distance < 2.1) {
                    return true;
                }
            }
            return false;
        }

        /// Override
        _testLOS(visionSource, mode, target, test) {
            // Kluge to let PARTIALLYPENETRATIVE see thru walls.
            // Although DESOLIDIFICATION make you undetectable via touch group
            // TODO: Make wall materials and check each wall to see if we can see thru it.
            const DESOLIDIFICATION = target?.actor?.items.find(
                (i) => i.isActive && i.system.XMLID === "DESOLIDIFICATION",
            );
            const FLIGHT = target?.actor?.items.find((i) => i.isActive && i.system.XMLID === "FLIGHT");
            const hideFromTouchGroup = DESOLIDIFICATION || FLIGHT;
            const PARTIALLYPENETRATIVE = visionSource.object?.actor?.items.find(
                (i) =>
                    i.isActive &&
                    i.isSense &&
                    i.isRangedSense &&
                    i.adders.find((a) => a.XMLID === "PARTIALLYPENETRATIVE") &&
                    (!hideFromTouchGroup || i.system.GROUP != "TOUCHGROUP"),
            );
            const PENETRATIVE =
                !DESOLIDIFICATION &&
                visionSource.object?.actor?.items.find(
                    (i) =>
                        i.isActive &&
                        i.isSense &&
                        i.isRangedSense &&
                        i.adders.find((a) => a.XMLID === "PENETRATIVE") &&
                        (!hideFromTouchGroup || i.system.GROUP != "TOUCHGROUP"),
                );

            if (!this.walls || PARTIALLYPENETRATIVE || PENETRATIVE)
                return this._testAngle(visionSource, mode, target, test);
            const type = visionSource.constructor.sourceType;
            const isSight = type === "sight";
            if (isSight && visionSource.blinded.darkness) return false;
            if (!this.angle && visionSource.data.angle < 360) {
                // Constrained by walls but not by vision angle
                return !CONFIG.Canvas.polygonBackends[type].testCollision(
                    { x: visionSource.x, y: visionSource.y },
                    test.point,
                    { type, mode: "any", source: visionSource, useThreshold: true, includeDarkness: isSight },
                );
            }
            // Constrained by walls and vision angle
            let hasLOS = test.los.get(visionSource);
            if (hasLOS === undefined) {
                hasLOS = visionSource.los.contains(test.point.x, test.point.y);
                test.los.set(visionSource, hasLOS);
            }
            return hasLOS;
        }
    }

    CONFIG.Canvas.detectionModes.heroDetectSight = new HeroDetectionSightMode(); //new DeCONFIG.Canvas.detectionModes.feelTremor.clone();
    // CONFIG.Canvas.detectionModes.heroDetectSight.id = "heroDetectSight";
    // CONFIG.Canvas.detectionModes.heroDetectSight.label = "Hero Detect Sight";
    // CONFIG.Canvas.detectionModes.heroDetectSight.type = DetectionMode.DETECTION_TYPES.SIGHT;
    // CONFIG.Canvas.detectionModes.heroDetectSight.walls = true;
    // CONFIG.Canvas.detectionModes.heroDetectSight._canDetect(visionSource, target) {
    //     super._canDetect(visionSource, target);
    //     console.log("canDetect");
    //}

    // new DetectionMode({
    //     id: "heroSense",
    //     label: "Hero Sense",
    //     type: DetectionMode.DETECTION_TYPES.SIGHT,
    // });
    // NIGHTVISION
    // Allows a character to see in total darkness as if it were normal
    // daylight. Therefore, this effect does not penetrate the Power
    // Darkness, but it does offset some forms of Change Environment
    // that obscure vision.
    // CONFIG.Canvas.detectionModes.heroNightVision = new DetectionMode({
    //     id: "nightvision",
    //     label: "VISION.NightVision",
    //     type: DetectionMode.DETECTION_TYPES.SIGHT,
    // });
    //}

    // class ThoughtsDetectionMode extends DetectionMode {
    //     constructor() {
    //         super({
    //             id: "thoughtsense",
    //             label: "PF2E.Actor.Creature.Sense.Type.Thoughts",
    //             walls: false,
    //             angle: false,
    //             type: DetectionMode.DETECTION_TYPES.OTHER,
    //         });
    //     }
    //     static getDetectionFilter() {
    //         const filter2 = (this._detectionFilter ??= OutlineOverlayFilter.create({
    //             wave: true,
    //             knockout: false,
    //         }));
    //         return (filter2.thickness = 1), filter2;
    //     }
    //     _canDetect(visionSource, target) {
    //         return (
    //             target instanceof CONFIG.Token.objectClass /*TokenPF2e*/ &&
    //             !target.document.hidden &&
    //             !target.actor?.isOfType("loot") &&
    //             !target.actor?.system.traits.value.includes("mindless") &&
    //             super._canDetect(visionSource, target)
    //         );
    //     }
}

// Turn on Special Vision
// export async function activateSpecialVision(item, token) {
//     if (!token) return;

//     // token might be a PrototypeToken token
//     const tokenDocument = token.document || token;

//     // Lantern or Torch
//     if (item.system.XMLID === "CUSTOMPOWER" && item.system.ALIAS.match(/light/i)) {
//         await tokenDocument.update({ "light.bright": parseInt(item.system.QUANTITY) });
//     }

//     if (!item.baseInfo?.sight) return;

//     const detectionModes = tokenDocument.detectionModes;
//     const basicSight = detectionModes.find((o) => o.id === "basicSight");
//     if (basicSight) {
//         basicSight.range = null; // Cannot see things in the dark without special visions
//     }

//     await tokenDocument.update({
//         sight: item.baseInfo.sight,
//         detectionModes,
//     });
// }

// Remove Special Visions
// export async function removeSpecialVisions(token) {
//     if (!token) return;

//     // token might be a PrototypeToken token
//     const tokenDocument = token.document || token;

//     // Lantern or Torch
//     if (token.actor.items.find((o) => o.system.XMLID === "CUSTOMPOWER" && o.system.ALIAS.match(/light/i))) {
//         await tokenDocument.update({ "light.dim": 0, "light.bright": 0 });
//     }

//     const detectionModes = tokenDocument.detectionModes;
//     const basicSight = detectionModes.find((o) => o.id === "basicSight");
//     if (basicSight) {
//         basicSight.range = 0; // Cannot see things in the dark without special visions
//     }
//     if (token) {
//         await tokenDocument.update({
//             sight: { visionMode: "basic", range: 0, color: undefined },
//             detectionModes,
//         });
//     }
// }
