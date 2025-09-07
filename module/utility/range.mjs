import { getRoundedFavorPlayerDownDistanceInSystemUnits } from "./units.mjs";
import HeroSystem6eMeasuredTemplate from "../measuretemplate.mjs";
import { RoundFavorPlayerDown } from "./round.mjs";

/**
 * Calculate range based on a provided distance in metres. Range penalties are essentially
 * the same in 5e and 6e, but there is a difference in the rounding of the distance.
 *
 * @param {number} distanceInMetres
 * @param {object} actor
 *
 * @returns {number} rangePenalty
 */
export function calculateRangePenaltyFromDistanceInMetres(distanceInMetres, actor) {
    const is5e = actor?.system?.is5e;
    const roundedDistanceInMetres =
        getRoundedFavorPlayerDownDistanceInSystemUnits(distanceInMetres, actor) * (is5e ? 2 : 1);
    const basicRangePenalty = Math.ceil(Math.log2(roundedDistanceInMetres / 8)) * 2;
    const rangePenalty = Math.max(0, basicRangePenalty);

    return rangePenalty;
}

/**
 * Calculate the distance between 2 tokens
 *
 * @param {object} origin MeasuredTemplate or Token or {x: number, y: number, elevation?: number}
 * @param {object} target MeasuredTemplate or Token or {x: number, y: number, elevation?: number}
 *
 * @returns {number} distanceInMetres
 */
export function calculateDistanceBetween(origin, target) {
    if (!target) {
        return {
            distance: 0,
            cost: 0,
            gridSpaces: 0,
        };
    }

    const path = [];
    try {
        path.push({ x: origin.x, y: origin.y });
        path.push({ x: target.x, y: target.y });
    } catch (e) {
        console.error(e, origin, target);
    }
    const distanceMeasurePath = canvas.grid.measurePath(path);
    const originalMeasureDistance = RoundFavorPlayerDown(distanceMeasurePath.distance);

    // We don't yet support measuring 3D distance between a token and a template volume, so we
    // return the original distance
    const templateInvolved =
        origin._object instanceof HeroSystem6eMeasuredTemplate ||
        target._object instanceof HeroSystem6eMeasuredTemplate;
    if (templateInvolved) {
        return {
            distance: originalMeasureDistance,
            cost: distanceMeasurePath.cost,
            gridSpaces: distanceMeasurePath.spaces,
        };
    }

    const originElevation = origin.document ? origin.document.elevation || 0 : origin.elevation || 0;
    const targetElevation = target.document ? target.document.elevation || 0 : target.elevation || 0;
    if (originElevation === targetElevation) {
        return {
            distance: originalMeasureDistance,
            cost: distanceMeasurePath.cost,
            gridSpaces: distanceMeasurePath.spaces,
        };
    }

    // We need to decide on an actor to use for the system units. Since both objects being measured are tokens,
    // we can use the origin token's actor.
    const rulesActor = origin.actor;
    const threeDDistance = Math.sqrt(
        Math.pow(originElevation - targetElevation, 2) + Math.pow(originalMeasureDistance, 2),
    );

    return {
        distance: getRoundedFavorPlayerDownDistanceInSystemUnits(threeDDistance, rulesActor),
        cost: 0, // FIXME: to be implemented
        gridSpaces: 0, // FIXME: to be implemented
    };
}
