import { convertSystemUnitsToMetres } from "../utility/units.mjs";
import { ftlLevelsToLightYearsPerYear } from "../item/item.mjs";

// PH: FIXME: Need to get extra dimensional appearing. We have icon now

// v13 has namespaced this. Remove when support is no longer provided. Also remove from eslint template.
const FoundryVttTokenHUD = foundry.applications.hud?.TokenHUD || TokenHUD;

/**
 * Generate a canSelect function that is appropriate for the characteristic
 * @param {String} characteristic
 */
function generateMovementCanSelectFunction(characteristic) {
    return (token) => parseInt(token.actor?.system.characteristics[characteristic]?.value || 0) > 0;
}

/**
 * Generate a maxCombatDistanceMeters function that is appropriate for the characteristic
 * @param {String} characteristic
 */
function generateMovementMaxCombatDistanceMeters(characteristic) {
    return (token) =>
        convertSystemUnitsToMetres(
            parseInt(token.actor?.system.characteristics[characteristic]?.value || 0) || 0,
            token.actor,
        );
}

// PH: FIXME: Base FTL is 0 LEVELS. Probably this is not expected elsewhere
function ftlCanSelect(token) {
    return parseInt(token.actor?.system.characteristics.ftl?.value || -1) > -1;
}

function ftlMaxNonCombatDistanceMeters(token) {
    const levels = parseInt(token.actor?.system.characteristics.ftl?.value || -1);
    if (levels <= -1) {
        return 0;
    }

    // FTL is given movement per year - not per phase. Convert to per phase based on speed.
    const lightYearsPerYear = ftlLevelsToLightYearsPerYear(levels);
    const metresPerTurnPerLightYearPerYear = 2.998e8 * lightYearsPerYear;
    const speed = parseInt(token.actor?.system.characteristics.spd?.value || 0);

    return metresPerTurnPerLightYearPerYear / speed;
}

export class HeroSystemTokenHud extends FoundryVttTokenHUD {
    /**
     * Return initialize movement actions
     * @param {string} module
     * @return {Object} movementActions
     */
    static initializeMovementActions(module) {
        return {
            RUNNING: {
                label: "Running",
                icon: "fa-solid fa-person-running",
                img: "icons/svg/walk.svg",
                isActive: false,
                order: 0,
                canSelect: generateMovementCanSelectFunction("running"),
                maxCombatDistanceMeters: generateMovementMaxCombatDistanceMeters("running"),
            },
            SWIMMING: {
                label: "Swimming",
                icon: "fa-solid fa-person-swimming",
                img: "icons/svg/whale.svg",
                isActive: false,
                order: 1,
                canSelect: generateMovementCanSelectFunction("swimming"),
                maxCombatDistanceMeters: generateMovementMaxCombatDistanceMeters("swimming"),
            },
            LEAPING: {
                label: "Leaping",
                icon: "fa-solid fa-person-running-fast",
                img: "icons/svg/jump.svg",
                isActive: false,
                order: 2,
                canSelect: generateMovementCanSelectFunction("leaping"),
                maxCombatDistanceMeters: generateMovementMaxCombatDistanceMeters("leaping"),
            },

            EXTRADIMENSIONALMOVEMENT: {
                label: "Dimensional Travel",
                icon: "fa-solid fa-transporter",
                img: `systems/${module}/icons/movement/star-gate.svg`,
                isActive: false,
                order: 3,
                canSelect: generateMovementCanSelectFunction("extradimensionalmovement"),
                maxCombatDistanceMeters: generateMovementMaxCombatDistanceMeters("extradimensionalmovement"),
            },
            FLIGHT: {
                label: "Flight",
                icon: "fa-solid fa-person-fairy",
                img: "icons/svg/wing.svg",
                isActive: false,
                order: 4,
                canSelect: generateMovementCanSelectFunction("flight"),
                maxCombatDistanceMeters: generateMovementMaxCombatDistanceMeters("flight"),
            },
            FTL: {
                label: "Faster Than Light",
                icon: "fa-solid fa-lightbulb",
                img: `systems/${module}/icons/movement/rocket.svg`,
                isActive: false,
                order: 5,
                canSelect: ftlCanSelect,
                maxCombatDistanceMeters: () => 0, // FTL does not support combat - only non combat
                maxNonCombatDistanceMetres: ftlMaxNonCombatDistanceMeters,
            },
            GLIDING: {
                label: "Gliding",
                icon: "fa-solid fa-person-from-portal",
                img: `systems/${module}/icons/movement/hang-glider.svg`,
                isActive: false,
                order: 6,
                canSelect: generateMovementCanSelectFunction("gliding"),
                maxCombatDistanceMeters: generateMovementMaxCombatDistanceMeters("gliding"),
            },
            SWINGING: {
                label: "Swinging",
                icon: "fa-solid fa-lasso",
                img: `systems/${module}/icons/movement/grapple-hook.svg`,
                isActive: false,
                order: 7,
                canSelect: generateMovementCanSelectFunction("swinging"),
                maxCombatDistanceMeters: generateMovementMaxCombatDistanceMeters("swinging"),
            },
            TELEPORTATION: {
                label: "Teleportation",
                icon: "fa-solid fa-person-from-portal",
                img: "icons/svg/teleport.svg",
                isActive: false,
                order: 8,
                teleport: true,
                canSelect: generateMovementCanSelectFunction("teleportation"),
                maxCombatDistanceMeters: generateMovementMaxCombatDistanceMeters("teleportation"),
            },
            TUNNELING: {
                label: "Tunneling",
                icon: "fa-solid fa-person-digging",
                img: "icons/svg/burrow.svg",
                isActive: false,
                order: 9,
                canSelect: generateMovementCanSelectFunction("tunneling"),
                maxCombatDistanceMeters: generateMovementMaxCombatDistanceMeters("tunneling"),
            },

            // Special action that is always required (otherwise v13.350 crashes)
            displace: {
                label: "TOKEN.MOVEMENT.ACTIONS.displace.label",
                icon: "fa-solid fa-transporter-1",
                img: "icons/svg/portal.svg",
                order: 99,
                teleport: true,
                measure: false,
                walls: null,
                visualize: false,
                getAnimationOptions: () => ({ duration: 0 }),
                canSelect: () => false,
                deriveTerrainDifficulty: () => 1,
                getCostFunction: () => () => 0,
            },
        };
    }

    // PH: FIXME: Do we want to actually activate this movement power?
    // static async #movementAction(event, target) {
    //     // Call the super version of this
    //     return TokenHUD.DEFAULT_OPTIONS.actions.movementAction.call(this, ...arguments);
    // }
}
