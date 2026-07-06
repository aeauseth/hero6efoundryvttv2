export class HeroSystem6eCombatant extends Combatant {
    static Speed2Segments = [
        [0],
        [7],
        [6, 12],
        [4, 8, 12],
        [3, 6, 9, 12],
        [3, 5, 8, 10, 12],
        [2, 4, 6, 8, 10, 12],
        [2, 4, 6, 7, 9, 11, 12],
        [2, 3, 5, 6, 8, 9, 11, 12],
        [2, 3, 4, 6, 7, 8, 10, 11, 12],
        [2, 3, 4, 5, 6, 8, 9, 10, 11, 12],
        [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    ];

    hasPhase(segmentNumber) {
        const actor = this.actor;
        if (!actor) {
            console.debug(`${this.name} has no actor`);
            return segmentNumber === 12;
        }
        const index = Math.min(Math.max(actor.getCharacteristic("spd")?.value || 0, 1), 12);
        const phases = foundry.utils.deepClone(HeroSystem6eCombatant.Speed2Segments[index]);

        if (this.flags.holdingAnAction) {
            var _idx = phases.indexOf(this.flags.holdingAnAction.initSegment);

            if (_idx !== -1) {
                phases[_idx] = this.flags.holdingAnAction.targetSegment;
            }
        }

        if (phases.includes(segmentNumber)) {
            return true;
        }

        return false;
    }

    hasPhaseOrHolding(segmentNumber) {
        if (this.hasPhase(segmentNumber)) {
            return true;
        }

        if (segmentNumber === this.combat.segment) {
            if (this.actor.statuses.has("holding") || this.actor.statuses.has("haymaker")) {
                return true;
            }
        }

        return false;
    }

    getSegments(options) {
        const _segments = [];
        for (let s = 1; s <= 12; s++) {
            if (this.hasPhase(s, options)) {
                _segments.push(s);
            }
        }
        return _segments;
    }

    static async deleteDocuments(ids = [], operation = {}) {
        // Remove when singleCombatantTracker is the default
        const combat = operation.parent;
        if (combat) {
            const extraCombatantsWithSameTokenId = combat.combatants.filter((c) =>
                ids.find(
                    (i) => c.tokenId === combat.combatants.find((c2) => c2.id === i).tokenId && !ids.includes(c.id),
                ),
            );
            if (extraCombatantsWithSameTokenId.length > 0) {
                console.log(
                    `Deleting ${extraCombatantsWithSameTokenId.length} additional combatants for ${extraCombatantsWithSameTokenId[0].name}`,
                );
                ids = [...ids, ...extraCombatantsWithSameTokenId.map((ec) => ec.id)];
            }
        }
        return await super.deleteDocuments(ids, operation);
    }

    get isDefeated() {
        return super.isDefeated || this.actor?.getKnockedOutOfCombat();
    }
}
