export class HeroSystem6eCombatantSingle extends Combatant {
    /**
     * GM-hidden and invisible tokens enter combat hidden from the player-facing
     * tracker (#4466). An explicit hidden value in the creation data wins — the
     * GM can still add them visibly on purpose.
     * @override
     */
    async _preCreate(data, options, user) {
        const allowed = await super._preCreate(data, options, user);
        if (allowed === false) return false;
        if (data.hidden === undefined) {
            const token = this.token ?? this.parent?.scene?.tokens?.get(data.tokenId);
            if (token?.hidden || this.actor?.statuses?.has("invisible")) {
                this.updateSource({ hidden: true });
            }
        }
        return allowed;
    }

    /**
     * Speed Chart. SPD 0 or below has no Phases (Post-Segment 12 Recovery only).
     * @type {Record<number, number[]>}
     */
    static speedChart = {
        1: [7],
        2: [6, 12],
        3: [4, 8, 12],
        4: [3, 6, 9, 12],
        5: [3, 5, 8, 10, 12],
        6: [2, 4, 6, 8, 10, 12],
        7: [2, 4, 6, 7, 9, 11, 12],
        8: [2, 3, 5, 6, 8, 9, 11, 12],
        9: [2, 3, 4, 6, 7, 8, 10, 11, 12],
        10: [2, 3, 4, 5, 6, 8, 9, 10, 11, 12],
        11: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        12: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    };

    /**
     * Monotonic segment counter across rounds, for comparing combat positions.
     * @param {number} round
     * @param {number} segment - 1-12
     * @returns {number}
     */
    static absoluteSegment(round, segment) {
        return round * 12 + segment;
    }

    /**
     * Segment number (1-12) of an absolute segment.
     * @param {number} abs
     * @returns {number}
     */
    static segmentOf(abs) {
        return ((abs - 1) % 12) + 1;
    }

    /**
     * Turn (round) number of an absolute segment.
     * @param {number} abs
     * @returns {number}
     */
    static roundOf(abs) {
        return Math.floor((abs - 1) / 12);
    }

    /**
     * The first absolute segment at or after fromAbs whose segment is a Phase for
     * BOTH speeds — the 5e optional SPD-change rule: after changing SPD, a character
     * cannot act until the next Segment that is a Phase for both SPDs
     * (SPD 1 shares no segment with other SPDs; see the fallback below).
     * @param {number} spdA
     * @param {number} spdB
     * @param {number} fromAbs
     * @returns {number}
     */
    static nextSharedPhaseAbs(spdA, spdB, fromAbs) {
        const systemSpeedChart = CONFIG.HERO?.speedChart || HeroSystem6eCombatantSingle.speedChart;
        const phasesA = systemSpeedChart[Math.min(12, Math.max(1, spdA))] || [];
        const phasesB = systemSpeedChart[Math.min(12, Math.max(1, spdB))] || [];
        for (let abs = fromAbs; abs < fromAbs + 12; abs++) {
            const segment = ((abs - 1) % 12) + 1;
            if (phasesA.includes(segment) && phasesB.includes(segment)) return abs;
        }
        // No shared segment exists (SPD 1's only Phase is Segment 7). Fall back to
        // the later of the two SPDs' next Phases — returning fromAbs would dissolve
        // the lockout entirely.
        return Math.max(
            HeroSystem6eCombatantSingle.nextPhaseAbs(spdA, fromAbs),
            HeroSystem6eCombatantSingle.nextPhaseAbs(spdB, fromAbs),
        );
    }

    /**
     * Human-readable combat position for chat cards.
     * @param {number} abs
     * @returns {string} e.g. "Segment 4 of Turn 2"
     */
    static phaseLabel(abs) {
        return `Segment ${HeroSystem6eCombatantSingle.segmentOf(abs)} of Turn ${HeroSystem6eCombatantSingle.roundOf(abs)}`;
    }

    /**
     * The first absolute segment at or after fromAbs in which the given SPD has a Phase.
     * @param {number} spd
     * @param {number} fromAbs
     * @returns {number}
     */
    static nextPhaseAbs(spd, fromAbs) {
        const systemSpeedChart = CONFIG.HERO?.speedChart || HeroSystem6eCombatantSingle.speedChart;
        const phases = systemSpeedChart[Math.min(12, Math.max(1, spd))] || [];
        for (let abs = fromAbs; abs < fromAbs + 12; abs++) {
            if (phases.includes(((abs - 1) % 12) + 1)) return abs;
        }
        return fromAbs;
    }

    /**
     * Holding/aborted effects live on the actor, which linked tokens share; records
     * without a combatant binding are only trustworthy when this actor fields a
     * single combatant in this combat.
     * @returns {boolean}
     */
    get isSoleCombatantForActor() {
        // Unlinked tokens carry their own synthetic actor: effects on it can only
        // belong to this combatant, however many siblings share the base actorId
        if (this.actor?.isToken) return true;
        const siblings = this.combat?.combatants.filter((c) => c.actorId === this.actorId) ?? [];
        return siblings.length <= 1;
    }

    /**
     * The ActiveEffect carrying THIS combatant's Held Action, or null. Declarations
     * record the declaring combatant's id on the hold flag; effects without one
     * (legacy declarations, bare token-HUD toggles) count only when unambiguous.
     * @type {ActiveEffect|null}
     */
    get heldActionEffect() {
        if (!game.system?.id) return null;
        let unbound = null;
        for (const effect of this.actor?.effects ?? []) {
            if (!effect.statuses.has("holding")) continue;
            const hold = effect.getFlag(game.system.id, "hold");
            if (hold?.combatantId === this.id) return effect;
            if (!hold?.combatantId) unbound ??= effect;
        }
        return unbound && this.isSoleCombatantForActor ? unbound : null;
    }

    /**
     * Details of this combatant's Held Action, or null when not holding.
     * Declared via the tracker's Hold Action dialog, which stores the
     * declaration on the holding effect; a bare holding status (e.g. token HUD toggle)
     * counts as a generic hold.
     * @type {{mode: "position"|"event"|"generic", segmentAbs?: number, dex?: number, trigger?: string,
     *         fraction?: number, declaredAbs?: number, id?: string, combatantId?: string}|null}
     */
    get heldAction() {
        const effect = this.heldActionEffect;
        if (!effect) return null;
        return effect.getFlag(game.system.id, "hold") ?? { mode: "generic" };
    }

    /**
     * True when a positional Held Action places this combatant in the given absolute segment.
     * @param {number} abs
     * @returns {boolean}
     */
    holdsPositionAtAbs(abs) {
        const hold = this.heldAction;
        return hold?.mode === "position" && hold.segmentAbs === abs;
    }

    /**
     * Segment-number variant for turn-flow checks. Unambiguous despite the modulo because
     * the hold window is always shorter than a full Turn (null zone).
     * @param {number} segmentNumber - 1-12
     * @returns {boolean}
     */
    holdsPositionInSegment(segmentNumber) {
        const hold = this.heldAction;
        return hold?.mode === "position" && HeroSystem6eCombatantSingle.segmentOf(hold.segmentAbs) === segmentNumber;
    }

    /**
     * Display-only record of a spent positional hold: the combatant keeps sorting at
     * the DEX they acted at for the rest of that segment, without the holding effect.
     * Written on consumption, cleaned up at segment boundaries.
     * @type {{segmentAbs: number, dex: number}|null}
     */
    get spentHoldPosition() {
        if (!game.system?.id) return null;
        return this.getFlag(game.system.id, "spentHoldPosition") ?? null;
    }

    /**
     * @param {number} abs
     * @returns {boolean}
     */
    spentHoldAtAbs(abs) {
        return this.spentHoldPosition?.segmentAbs === abs;
    }

    /**
     * @param {number} segmentNumber - 1-12
     * @returns {boolean}
     */
    spentHoldInSegment(segmentNumber) {
        const spent = this.spentHoldPosition;
        return !!spent && HeroSystem6eCombatantSingle.segmentOf(spent.segmentAbs) === segmentNumber;
    }

    /**
     * Lightning Reflexes raises effective DEX for acting order only.
     * HD encodes every 6e scope under LIGHTNING_REFLEXES_ALL, distinguished by
     * OPTIONID; 5e single-action LR is its own XMLID. Only the unrestricted All
     * Actions scope applies automatically — scoped purchases restrict the character
     * to the scoped action when acting early, so they elevate on demand. Multiple
     * scoped purchases keep the highest levels.
     * @type {{always: number, scoped: {levels: number, label: string}|null}}
     */
    get lightningReflexes() {
        const result = { always: 0, scoped: null };
        for (const item of this.actor?.items ?? []) {
            const xmlid = item.system?.XMLID;
            if (xmlid !== "LIGHTNING_REFLEXES_ALL" && xmlid !== "LIGHTNING_REFLEXES_SINGLE") continue;
            const levels = parseInt(item.system?.LEVELS ?? 0) || 0;
            if (levels <= 0) continue;
            const optionId = item.system?.OPTIONID || "ALL";
            if (xmlid === "LIGHTNING_REFLEXES_ALL" && optionId === "ALL") {
                result.always += levels;
                continue;
            }
            if (levels > (result.scoped?.levels ?? 0)) {
                const label =
                    item.system?.NAME ||
                    item.system?.INPUT ||
                    item.system?.OPTION_ALIAS ||
                    item.name ||
                    "Lightning Reflexes";
                result.scoped = { levels, label };
            }
        }
        return result;
    }

    /**
     * The absolute segment this combatant elevated themselves to their scoped
     * Lightning Reflexes position in, or null. Display/sort flag for the current
     * segment only; swept at segment boundaries.
     * @type {number|null}
     */
    get lrElevatedAbs() {
        if (!game.system?.id) return null;
        return this.getFlag(game.system.id, "lrElevatedAbs") ?? null;
    }

    /**
     * The absolute segment this combatant's positional held slot was taken in,
     * or null. Written when the pointer lands on the declared slot; a taken slot
     * never comes up again in that segment.
     * @type {number|null}
     */
    get heldSlotTakenAbs() {
        if (!game.system?.id) return null;
        return this.getFlag(game.system.id, "heldSlotTakenAbs") ?? null;
    }

    /**
     * @param {number} abs
     * @returns {boolean}
     */
    heldSlotTakenAt(abs) {
        return this.heldSlotTakenAbs === abs;
    }

    /**
     * The ActiveEffect carrying THIS combatant's abort, or null. Same binding rules
     * as {@link heldActionEffect}: unbound records only count when this actor fields
     * a single combatant in this combat.
     * @type {ActiveEffect|null}
     */
    get abortEffect() {
        if (!game.system?.id) return null;
        let unbound = null;
        for (const effect of this.actor?.effects ?? []) {
            if (!effect.statuses.has("aborted")) continue;
            const abort = effect.getFlag(game.system.id, "abort");
            if (abort?.combatantId === this.id) return effect;
            if (!abort?.combatantId) unbound ??= effect;
        }
        return unbound && this.isSoleCombatantForActor ? unbound : null;
    }

    /**
     * The absolute segment of the Phase this combatant's abort consumes, recorded at
     * declaration (aborting uses the NEXT full Phase). Null for aborts applied
     * without the tracker (bare status toggles), which fall back to segment matching.
     * @type {number|null}
     */
    get abortSpentAbs() {
        return this.abortEffect?.getFlag(game.system.id, "abort")?.spentAbs ?? null;
    }

    /**
     * Whether the aborted status still binds at the given absolute segment. A recorded
     * abort stops applying once its spent Phase has passed, even while the status
     * document awaits the asynchronous boundary cleanup — otherwise target selection
     * for the following segment mis-sorts the aborter to the bottom. Unrecorded aborts
     * (bare status toggles) bind until the status is removed.
     * @param {number} abs
     * @returns {boolean}
     */
    abortAppliesAtAbs(abs) {
        const effect = this.abortEffect;
        if (!effect) return false;
        const spentAbs = effect.getFlag(game.system.id, "abort")?.spentAbs ?? null;
        return spentAbs === null || abs <= spentAbs;
    }

    /**
     * Whether this combatant occupies an initiative position in the segment: a spent
     * hold's acted position, a positional hold's declared slot, or a natural Phase.
     * A positional hold commits the banked Phase to its slot, so natural Phases don't
     * count while one is pending.
     * @param {number} segmentNumber - 1-12
     * @returns {boolean}
     */
    occupiesSegment(segmentNumber) {
        if (this.spentHoldInSegment(segmentNumber)) return true;
        const hold = this.heldAction;
        if (hold?.mode === "position") return this.holdsPositionInSegment(segmentNumber);
        return this.hasPhaseInSegment(segmentNumber);
    }

    /**
     * Out of the fight for turn-skipping purposes: the tracker's defeated toggle, dead,
     * or knocked out. Deliberately NOT an isDefeated override — core computes the skull
     * toggle's next state from isDefeated, so broadening that getter inverts the toggle
     * for KO'd combatants (skull becomes inert / strips dead from group members).
     * @type {boolean}
     */
    get isOutOfCombat() {
        return this.isDefeated || !!this.actor?.statuses.has("dead") || !!this.actor?.statuses.has("knockedOut");
    }

    /**
     * Effective Speed for phase purposes: 0 when drained below 1, otherwise clamped
     * to the 1-12 speed chart range since characters cannot act more than once per segment.
     * @type {number}
     */
    get combatSpd() {
        if (!this.actor) return 0;

        // A voluntarily declared SPD change takes effect only at Post-Segment 12;
        // until then the character keeps acting at the old SPD
        if (game.system?.id && this.combat?.started) {
            const pending = this.getFlag(game.system.id, "pendingSpd");
            if (pending) {
                const known = this.getFlag(game.system.id, "knownSpd");
                const effective = typeof known === "object" && known !== null ? known.effective : known;
                if (Number.isFinite(effective)) {
                    if (effective <= 0) return 0;
                    return Math.min(12, effective);
                }
            }
        }

        // Prepared system data carries active-effect adjustments (Aid/Drain);
        // the raw _source only covers documents read before preparation
        const rawSource = this.actor._source?.system || this.actor.system?._source || {};
        const spdObj = this.actor.system?.characteristics?.spd || rawSource.characteristics?.spd;

        const rawSpd = spdObj?.value ?? 2;

        if (rawSpd <= 0) return 0;
        return Math.min(12, rawSpd);
    }

    /**
     * Whether this combatant has a Phase in the given Speed Chart segment.
     * @param {number} segmentIndex - Speed Chart segment column to examine (1-12)
     * @param {number} [queryAbs] - Exact absolute segment being probed; segment numbers
     *   alias across Turns, so scans reaching into the next round pass the position.
     *   Defaults to the first occurrence at or after the current combat position.
     * @returns {boolean} True if the combatant is capable of taking a turn
     */
    hasPhaseInSegment(segmentIndex, queryAbs = null) {
        const spd = this.combatSpd;
        if (spd <= 0) return false;

        const systemSpeedChart = CONFIG.HERO?.speedChart || HeroSystem6eCombatantSingle.speedChart;
        const activePhases = systemSpeedChart[spd] || [];
        if (!activePhases.includes(segmentIndex)) return false;

        // A character whose SPD changed mid-Turn cannot act until both the old and the
        // new SPD would have had a Phase. The lockout flag is written and cleared by
        // the combat's segment-boundary maintenance.
        const lockout = game.system?.id ? this.getFlag(game.system.id, "spdLockout") : null;
        const combat = this.combat;
        if (lockout?.lockoutEndAbs && combat?.started) {
            const currentAbs = HeroSystem6eCombatantSingle.absoluteSegment(combat.round, combat.segment);
            const currentSegment = ((currentAbs - 1) % 12) + 1;
            const abs = queryAbs ?? currentAbs + ((segmentIndex - currentSegment + 12) % 12);
            if (abs < lockout.lockoutEndAbs) return false;
        }

        return true;
    }
}
