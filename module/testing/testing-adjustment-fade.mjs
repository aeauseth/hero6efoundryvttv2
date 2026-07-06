import { getPowerInfo } from "../utility/util.mjs";
import { HeroSystem6eItem } from "../item/item.mjs";
import { _onApplyAdjustmentToSpecificToken } from "../item/item-attack.mjs";

/**
 * Registers the Aid power fade evaluation test batch with Quench.
 * Fully harmonized, isolated, and leak-free production test matrix.
 *
 * @param {Object} quench - The external Quench module testing framework instance.
 */
export function registerAdjustmentFadeTests(quench) {
    quench.registerBatch(
        `${game.system.id}.adjustmentPowerFades`,
        (context) => {
            const { describe, it, assert, before, beforeEach, afterEach } = context;

            describe("Aid Power Cumulative Stacking & Max Caps", function () {
                // Timeline tests step world time second-by-second with settle waits; the mocha
                // default of 2000ms is far too small for the longer rewind/finalize workflows.
                this.timeout(120000);

                let testActor = null;
                let testTokenDoc = null;
                let createdItem = null;
                let originalConsoleWarn = null;
                let originalSessionTime = 0;

                before(async () => {
                    // Cache the pristine canvas clock state before any tests initialize
                    originalSessionTime = game.time.worldTime;

                    // ─── DEBUG SANITIZATION SWEEP: RUNTIME SIDEBAR ACTORS ───
                    // Lowercase game.actors lookup array to prevent compilation errors
                    const staleActors = game.actors.filter((a) => a.name.match(/quench test/i));
                    for (const actor of staleActors) {
                        console.log(`[HERO-DEBUG-SETUP] Purging orphaned sidebar actor: ${actor.name} (${actor.id})`);
                        await actor.delete();
                    }

                    // ─── DEBUG SANITIZATION SWEEP: ACTIVE CANVAS SCENE TOKENS ───
                    // V14 Mapping Standard: Access .contents map array to find matching synthetic tokens
                    const activeScene = game.scenes.active;
                    if (activeScene) {
                        const staleTokens = activeScene.tokens.contents.filter((t) => t.name.match(/quench test/i));
                        for (const tokenDoc of staleTokens) {
                            console.log(
                                `[HERO-DEBUG-SETUP] Purging orphaned canvas token: ${tokenDoc.name} (${tokenDoc.id})`,
                            );
                            await tokenDoc.delete();
                        }
                    }
                });

                // Clean database initialization sweep shared uniformly across all blocks
                beforeEach(async () => {
                    // 1. Instantiate parent Actor
                    testActor = await Actor.create({
                        name: "Quench Test Target",
                        type: "pc",
                        system: { is5e: false },
                    });

                    const aidPowerInfo = getPowerInfo({ xmlid: "AID", actor: testActor });
                    const aidItemData = HeroSystem6eItem.itemDataFromXml(aidPowerInfo.xml, testActor);
                    const aidPowerData = foundry.utils.mergeObject(aidItemData, {
                        system: {
                            NAME: "Aid STR",
                            LEVELS: 4,
                            INPUT: "STR",
                        },
                    });

                    const [itemDoc] = await testActor.createEmbeddedDocuments("Item", [aidPowerData]);
                    createdItem = itemDoc;

                    // 2. Automate canvas Token placement so every 'it' block starts with a fresh proxy instance
                    const activeScene =
                        game.scenes.active || (await Scene.create({ name: "Quench Test Sandbox", active: true }));

                    // V14 Mapping Standard: Clear out existing duplicates safely from the Map contents array
                    const existingToken = activeScene.tokens.contents.find((t) => t.name === "Quench Test Target");
                    if (existingToken) {
                        await existingToken.delete();
                    }

                    const [tokenDoc] = await activeScene.createEmbeddedDocuments("Token", [
                        {
                            actorId: testActor.id,
                            name: "Quench Test Token",
                            x: 0,
                            y: 0,
                        },
                    ]);

                    testTokenDoc = tokenDoc;
                });

                // Strict resource disposal hook shared uniformly across all blocks
                afterEach(async () => {
                    if (originalConsoleWarn) {
                        console.warn = originalConsoleWarn;
                    }
                    if (testTokenDoc) {
                        await testTokenDoc.delete();
                        testTokenDoc = null;
                    }
                    if (testActor) {
                        await testActor.delete();
                        testActor = null;
                    }
                    createdItem = null;

                    // Reset worldTime back to the pristine session anchor baseline
                    const timeDelta = originalSessionTime - game.time.worldTime;
                    if (timeDelta !== 0) {
                        await game.time.advance(timeDelta);
                    }
                });

                /**
                 * Injects a mock adjustment dose by calling your custom _onApplyAdjustmentToSpecificToken.
                 * Intercepts the asynchronous creation hook to return the instantiated ActiveEffect record safely.
                 *
                 * @param {number} activePoints - The raw Active Points value to inject.
                 * @returns {Promise<object>} The instantiated ActiveEffect document record from the database.
                 */
                const applyMockAidValue = async (activePoints) => {
                    const actor = testTokenDoc.actor;

                    // High-speed mutation tracking with absolute database parity
                    let interceptedEffect = null;
                    let hookId = null; // Declare upfront to make it available in the inner closure scope

                    const clearTrackers = () => {
                        if (hookId) {
                            Hooks.off("createActiveEffect", hookId);
                        }
                    };

                    hookId = Hooks.on("createActiveEffect", (effect) => {
                        // Confirm the created effect belongs directly to our live canvas proxy instance
                        if (effect.parent.id === actor.id) {
                            interceptedEffect = effect;
                            clearTrackers();
                        }
                    });

                    const mockDamageDetail = {
                        body: 0,
                        stun: 3,
                        stunDamage: activePoints,
                        bodyDamage: 0,
                    };

                    // Call your existing native adjustment injection method exactly as intended
                    const executionPromise = await _onApplyAdjustmentToSpecificToken(
                        createdItem,
                        testTokenDoc,
                        mockDamageDetail,
                        "5 normal; 0 resistant",
                        [{}],
                        { current: {}, maneuver: {}, system: {} },
                    );

                    // Await both your custom logic and the hook resolution simultaneously
                    await Promise.race([
                        executionPromise,
                        new Promise((_, reject) =>
                            setTimeout(() => {
                                clearTrackers();
                                reject(
                                    new Error(
                                        `Database timeout inside your custom _onApplyAdjustmentToSpecificToken for ${activePoints} AP.`,
                                    ),
                                );
                            }, 1000),
                        ),
                    ]);

                    // Proxy Actor Isolation: Enforce structural re-evaluation upfront
                    actor.reset();

                    // Return the live instantiated database record caught by our hook
                    return interceptedEffect;
                };

                /**
                 * Asynchronously awaits a specific database mutation state on an ActiveEffect via native core hooks.
                 * Incorporates a Promise.race boundary with a safety timeout to guarantee leak-free execution.
                 *
                 * @param {string} hookName - The canonical hook identifier ('updateActiveEffect' or 'deleteActiveEffect').
                 * @param {string} effectId - The specific primitive primary key ID of the target document.
                 * @param {function} evaluationFn - A validation predicate function that receives the mutated effect document.
                 * @returns {Promise<object>} Resolves with the mutated effect document or catches on timeout bounds.
                 */
                function awaitEffectState(hookName, effectId, evaluationFn = () => true) {
                    // The mutation may already have landed before this listener attaches: the fade
                    // pipeline runs asynchronously off the world-time advance, and stepTimeOneSecond
                    // yields several macro-tasks before returning. Check the current state first so
                    // an already-satisfied condition resolves immediately instead of timing out.
                    const currentEffect = testTokenDoc?.actor?.effects.get(effectId);
                    if (hookName === "deleteActiveEffect" && !currentEffect) {
                        return Promise.resolve(null);
                    }
                    if (hookName === "updateActiveEffect" && currentEffect && evaluationFn(currentEffect)) {
                        return Promise.resolve(currentEffect);
                    }

                    let hookId = null;

                    const clearTracker = () => {
                        if (hookId) {
                            Hooks.off(hookName, hookId);
                        }
                    };

                    // Transaction Branch A: Core server socket listener thread
                    const socketPromise = new Promise((resolve) => {
                        hookId = Hooks.on(hookName, (effect) => {
                            if (effect.id === effectId) {
                                // Deletions satisfy automatically; updates evaluate the predicate criteria
                                const isSatisfied = hookName === "deleteActiveEffect" ? true : evaluationFn(effect);

                                if (isSatisfied) {
                                    clearTracker();
                                    resolve(effect);
                                }
                            }
                        });
                    });

                    // Transaction Branch B: explicit lifecycle guard safety timeout. Worlds with many
                    // actors/effects can take a few hundred ms per world-time tick, so leave headroom.
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => {
                            clearTracker();
                            reject(
                                new Error(`Database transaction timeout awaiting Hook: ${hookName} on ID: ${effectId}`),
                            );
                        }, 3000),
                    );

                    // Return the race execution boundary cleanly back to the caller thread execution context
                    return Promise.race([socketPromise, timeoutPromise]);
                }

                /**
                 * Steps the global engine clock forward a single second and blocks execution until database layers settle.
                 * Dual-tracks parent writes and clock boundaries to eliminate high-speed timing collisions.
                 *
                 * @param {number} totalElapsedSeconds - The running total tracking second intervals across the timeline.
                 * @returns {Promise<void>} Resolves when the core database layer completes writing the time block transaction.
                 */
                const stepTimeOneSecond = async (totalElapsedSeconds) => {
                    let timeHookId = null;
                    let actorHookId = null;
                    let tickTimerId = null;

                    const tickTrackingPromise = new Promise((resolve) => {
                        const clearTrackers = () => {
                            if (tickTimerId) clearTimeout(tickTimerId);
                            Hooks.off("updateWorldTime", timeHookId);
                            Hooks.off("updateActor", actorHookId);
                        };

                        // Trap A: Catch quiet clock increments that do not alter characteristics
                        timeHookId = Hooks.on("updateWorldTime", () => {
                            const isFadeSecond = [13, 14, 15].includes(totalElapsedSeconds + 1);
                            if (!isFadeSecond) {
                                clearTrackers();
                                resolve();
                            }
                        });

                        // Trap B: Catch milestone fade frames when your background engine writes down updates
                        actorHookId = Hooks.on("updateActor", (actor) => {
                            if (actor.id === testActor.id) {
                                clearTrackers();
                                resolve();
                            }
                        });

                        // Fallback safety threshold to protect Mocha runner environments
                        tickTimerId = setTimeout(() => {
                            clearTrackers();
                            resolve();
                        }, 300);
                    });

                    await game.time.advance(1);
                    await tickTrackingPromise;

                    // Yield final macro-task frames to guarantee unlinked token components synchronize fully
                    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                };

                /**
                 * Waits for the actor's stored characteristic value to settle at the expected number.
                 * The fade pipeline updates the ActiveEffect first and then writes the clamped
                 * characteristic value in a SEPARATE actor update, so awaiting the effect mutation
                 * alone is not enough — the value write may still be in flight.
                 *
                 * @param {Actor} targetActor - The live (token) actor to observe.
                 * @param {string} characteristicKey - Lowercase characteristic key (e.g. "str").
                 * @param {number} expectedValue - The value to wait for.
                 */
                const awaitCharacteristicSettle = async (targetActor, characteristicKey, expectedValue) => {
                    for (let i = 0; i < 20; i++) {
                        if (targetActor.system.characteristics[characteristicKey].value === expectedValue) return;
                        await new Promise((resolve) => setTimeout(resolve, 50));
                        targetActor.reset();
                    }
                };

                /**
                 * Injects staggered mock adjustment doses onto the beforeEach-provisioned token.
                 * (Token creation moved to beforeEach; applyMockAidValue now resolves with the
                 * created ActiveEffect, so the live token actor is fetched explicitly.)
                 *
                 * @returns {Promise<object>} The fully initialized live proxy token actor instance.
                 */
                const initializeTestTokenAndDoses = async () => {
                    // Execute staggered timeline injections across strict world time milestones
                    await game.time.advance(1);
                    await applyMockAidValue(8);

                    await game.time.advance(1);
                    await applyMockAidValue(9);

                    await game.time.advance(1);
                    await applyMockAidValue(10);

                    // Proxy Actor Isolation: Always recalculate directly on the live proxy token instance
                    const finalActor = testTokenDoc.actor;
                    finalActor.reset();

                    return finalActor;
                };

                /**
                 * Sweeps out remaining ticks and enforces full validation cleanup rules via advance(30).
                 * Uses a secure database-settlement net to guarantee perfect multi-client parity.
                 */
                const finalizeAndPruneActorCollection = async (characteristicKey, baselineValue) => {
                    // 1. ADVANCED MUTATION STABILIZATION GATE:
                    // Pauses the test suite execution thread until the database reflects 0 active effects
                    const postFadeSettledPromise = new Promise((resolve) => {
                        const hookId = Hooks.on("updateActor", (actor) => {
                            if (actor.id === testActor.id) {
                                // Once the database reflects that all stacked doses have unmounted, resolve instantly
                                if (actor.effects.size === 0) {
                                    Hooks.off("updateActor", hookId);
                                    resolve(actor);
                                }
                            }
                        });

                        // Safe fallback threshold ceiling to prevent infinite hanging if deletions register silently
                        setTimeout(() => {
                            Hooks.off("updateActor", hookId);
                            resolve(null);
                        }, 600);
                    });

                    // 2. Advance the global matrix timeline clock by 30 seconds to push past expiration caps
                    await game.time.advance(30);
                    await postFadeSettledPromise;

                    // 3. Yield macro-task ticks to let loose canvas token overlays fully settle
                    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

                    // 4. Fetch the pristine proxy actor to verify everything returned to baseline
                    const finalActor = testTokenDoc?.actor;
                    if (finalActor) {
                        finalActor.reset();
                        assert.equal(
                            finalActor.system.characteristics[characteristicKey].value,
                            baselineValue,
                            "Return to base check.",
                        );
                        assert.equal(finalActor.effects.size, 0, "Pruned ActiveEffects collection check.");
                    }
                };

                // ─── IT BLOCK 1: STANDARD FORWARD TIMELINE MARCH ───
                it("Should handle 6e STR whole integer scaling and enforce maximum effects", async () => {
                    await testActor.update({ "system.is5e": false });
                    await createdItem.update({ "system.INPUT": "STR", "system.is5e": false });

                    const actor = testTokenDoc.actor;
                    actor.reset();

                    // Baseline Verification: Both current value and maximum bounds must start at standard baseline (10)
                    assert.equal(
                        actor.system.characteristics.str.value,
                        10,
                        "Initial current 6e STR value must be 10.",
                    );
                    assert.equal(
                        actor.system.characteristics.str.max,
                        10,
                        "Initial maximum 6e STR boundary must be 10.",
                    );

                    // ─── SECOND 0: DOSE 1 INJECTION ───
                    const ae1 = await applyMockAidValue(8);
                    assert.isNotNull(ae1, "Dose 1 failed to return its ActiveEffect record.");
                    const trackingId1 = ae1.id;

                    assert.equal(ae1.changes[0].value, 8, "Dose 1 internal change value should start at 8.");
                    console.log(
                        `[HERO-DEBUG-6E-LINEAR] Sec 0 | Added Dose 1 (8 AP) | Sheet STR: ${actor.system.characteristics.str.value} / Max: ${actor.system.characteristics.str.max}`,
                    );
                    assert.equal(
                        actor.system.characteristics.str.value,
                        18,
                        "Sec 0 Value Check: Expected STR to be 18.",
                    );
                    assert.equal(
                        actor.system.characteristics.str.max,
                        18,
                        "Sec 0 Max Boundary Check: Expected STR max to scale to 18.",
                    );

                    // ─── SECOND 1: DOSE 2 INJECTION ───
                    await stepTimeOneSecond(1);
                    const ae2 = await applyMockAidValue(9);
                    assert.isNotNull(ae2, "Dose 2 failed to return its ActiveEffect record.");
                    const trackingId2 = ae2.id;

                    assert.equal(ae2.changes[0].value, 9, "Dose 2 internal change value should start at 9.");
                    console.log(
                        `[HERO-DEBUG-6E-LINEAR] Sec 1 | Added Dose 2 (9 AP) | Sheet STR: ${actor.system.characteristics.str.value} / Max: ${actor.system.characteristics.str.max}`,
                    );
                    assert.equal(
                        actor.system.characteristics.str.value,
                        27,
                        "Sec 1 Value Check: Expected STR to accumulate to 27.",
                    );
                    assert.equal(
                        actor.system.characteristics.str.max,
                        27,
                        "Sec 1 Max Boundary Check: Expected STR max to accumulate to 27.",
                    );

                    // ─── SECOND 2: DOSE 3 INJECTION WITH TRUNCATION ───
                    await stepTimeOneSecond(1);
                    const ae3 = await applyMockAidValue(10); // Enforce Stacking Maximum Effect (24 AP Cap)
                    assert.isNotNull(ae3, "Dose 3 failed to return its ActiveEffect record.");
                    const trackingId3 = ae3.id;

                    assert.equal(ae3.changes[0].value, 7, "Dose 3 internal change value should be truncated to 7.");
                    console.log(
                        `[HERO-DEBUG-6E-LINEAR] Sec 2 | Added Dose 3 (Truncated to 7 AP) | Sheet STR: ${actor.system.characteristics.str.value} / Max: ${actor.system.characteristics.str.max}`,
                    );
                    assert.equal(
                        actor.system.characteristics.str.value,
                        34,
                        "Sec 2 Value Check: Expected STR to hit maximum effect at 34.",
                    );
                    assert.equal(
                        actor.system.characteristics.str.max,
                        34,
                        "Sec 2 Max Boundary Check: Expected STR max to hit maximum effect at 34.",
                    );

                    // ─── SECONDS 3 THROUGH 11: HOLD MATRIX BOUNDARIES ───
                    for (let sec = 3; sec <= 11; sec++) {
                        await stepTimeOneSecond(1);
                        actor.reset();
                        assert.equal(actor.system.characteristics.str.value, 34, `Sec ${sec} Value Hold Check failed.`);
                        assert.equal(
                            actor.system.characteristics.str.max,
                            34,
                            `Sec ${sec} Max Boundary Hold Check failed.`,
                        );
                    }

                    // ─── SECOND 12: DOSE 1 CHRONOLOGICAL DECAY ───
                    await stepTimeOneSecond(1);
                    await awaitEffectState("updateActiveEffect", trackingId1, (eff) => eff.changes[0].value === 3);

                    actor.reset();
                    const liveEffect1 = actor.effects.get(trackingId1);
                    assert.isDefined(liveEffect1, "Dose 1 should still exist in the database collection at Sec 12.");
                    assert.equal(liveEffect1.changes[0].value, 3, "Dose 1 internal value failed to decay down to 3.");
                    await awaitCharacteristicSettle(actor, "str", 29);
                    console.log(
                        `[HERO-DEBUG-6E-LINEAR] Sec 12 | Dose 1 Decay (Pool: 19 AP) | Sheet STR: ${actor.system.characteristics.str.value} / Max: ${actor.system.characteristics.str.max}`,
                    );

                    // Double-Check Node Verification: Symmetrical decay evaluation
                    assert.equal(
                        actor.system.characteristics.str.max,
                        29,
                        "Sec 12 Max Check: Expected STR max to drop symmetrically to 29.",
                    );
                    assert.equal(
                        actor.system.characteristics.str.value,
                        29,
                        "Sec 12 Value Check: Expected current STR value to drop symmetrically to 29.",
                    );

                    // ─── SECOND 13: DOSE 2 CHRONOLOGICAL DECAY ───
                    await stepTimeOneSecond(1);
                    await awaitEffectState("updateActiveEffect", trackingId2, (eff) => eff.changes[0].value === 4);

                    actor.reset();
                    const liveEffect2 = actor.effects.get(trackingId2);
                    assert.isDefined(liveEffect2, "Dose 2 should still exist in the database collection at Sec 13.");
                    assert.equal(liveEffect2.changes[0].value, 4, "Dose 2 internal value failed to decay down to 4.");
                    await awaitCharacteristicSettle(actor, "str", 24);
                    console.log(
                        `[HERO-DEBUG-6E-LINEAR] Sec 13 | Dose 2 Decay (Pool: 14 AP) | Sheet STR: ${actor.system.characteristics.str.value} / Max: ${actor.system.characteristics.str.max}`,
                    );

                    assert.equal(
                        actor.system.characteristics.str.max,
                        24,
                        "Sec 13 Max Check: Expected STR max to drop to 24.",
                    );
                    assert.equal(
                        actor.system.characteristics.str.value,
                        24,
                        "Sec 13 Value Check: Expected current STR value to drop to 24.",
                    );

                    // ─── SECOND 14: DOSE 3 CHRONOLOGICAL DECAY ───
                    await stepTimeOneSecond(1);
                    await awaitEffectState("updateActiveEffect", trackingId3, (eff) => eff.changes[0].value === 2);

                    actor.reset();
                    const liveEffect3 = actor.effects.get(trackingId3);
                    assert.isDefined(liveEffect3, "Dose 3 should still exist in the database collection at Sec 14.");
                    assert.equal(liveEffect3.changes[0].value, 2, "Dose 3 internal value failed to decay down to 2.");
                    await awaitCharacteristicSettle(actor, "str", 19);
                    console.log(
                        `[HERO-DEBUG-6E-LINEAR] Sec 14 | Dose 3 Decay (Pool: 9 AP) | Sheet STR: ${actor.system.characteristics.str.value} / Max: ${actor.system.characteristics.str.max}`,
                    );

                    assert.equal(
                        actor.system.characteristics.str.max,
                        19,
                        "Sec 14 Max Check: Expected STR max to hold at 19.",
                    );
                    assert.equal(
                        actor.system.characteristics.str.value,
                        19,
                        "Sec 14 Value Check: Expected current STR value to hold at 19.",
                    );

                    // ─── SECONDS 15 THROUGH 23: HOLD METRIC ───
                    for (let sec = 15; sec <= 23; sec++) {
                        await stepTimeOneSecond(1);
                    }

                    // ─── SECOND 24: DOSE 1 COMPLETELY EXPIRES ───
                    await stepTimeOneSecond(1);
                    await awaitEffectState("deleteActiveEffect", trackingId1);

                    actor.reset();
                    const deadEffect1 = actor.effects.get(trackingId1);
                    assert.isUndefined(
                        deadEffect1,
                        "Dose 1 failed to prune itself completely from the database collection after fading to 0.",
                    );
                    console.log(
                        `[HERO-DEBUG-6E-LINEAR] Sec 24 | Dose 1 Pruned | Sheet STR: ${actor.system.characteristics.str.value} / Max: ${actor.system.characteristics.str.max}`,
                    );
                });

                // ─── IT BLOCK 2: TIME REWIND & RE-FADE WORKFLOW ───

                it("Should accurately process timeline rewinds and calculate re-fade metrics", async () => {
                    // Explicitly force the target configuration back to STR
                    await createdItem.update({ "system.INPUT": "STR" });

                    const strBefore = testActor.system.characteristics.str.value;
                    let currentActor = await initializeTestTokenAndDoses();

                    let totalElapsedSeconds = 3;
                    while (totalElapsedSeconds < 13) {
                        const updatedActor = await stepTimeOneSecond(totalElapsedSeconds);
                        totalElapsedSeconds++;

                        if (updatedActor) {
                            const liveActor = testTokenDoc.actor;
                            liveActor.reset();
                            currentActor = liveActor;
                        }
                    }

                    assert.equal(
                        currentActor.system.characteristics.str.value,
                        strBefore + 19,
                        "Sec 13 initial fade check failed.",
                    );

                    console.log("[HERO-DEBUG] Rewinding time by 5 seconds...");
                    const rewindPromise = new Promise((resolve) => {
                        const hookId = Hooks.on("updateActor", (actor) => {
                            if (actor.id === testActor.id) {
                                Hooks.off("updateActor", hookId);
                                resolve();
                            }
                        });
                        setTimeout(() => {
                            Hooks.off("updateActor", hookId);
                            resolve();
                        }, 500);
                    });

                    await game.time.advance(-5);
                    await rewindPromise;
                    totalElapsedSeconds -= 5;

                    currentActor = testTokenDoc.actor;
                    currentActor.reset();

                    assert.equal(
                        currentActor.system.characteristics.str.value,
                        strBefore + 19,
                        "System failed to maintain adjustment stability during clock rewind.",
                    );

                    while (totalElapsedSeconds < 20) {
                        const updatedActor = await stepTimeOneSecond(totalElapsedSeconds);
                        totalElapsedSeconds++;

                        if (updatedActor) {
                            const liveActor = testTokenDoc.actor;
                            liveActor.reset();
                        }
                    }

                    await finalizeAndPruneActorCollection("str", strBefore);
                });

                // ─── IT BLOCK 3: 6E SPD FORWARD TIMELINE MARCH ───

                it("Should handle 6e SPD whole integer scaling and enforce maximum caps", async () => {
                    // Sync ruleset configuration properties securely
                    await testActor.update({ "system.is5e": false });
                    await createdItem.update({ "system.INPUT": "SPD", "system.is5e": false });

                    console.log(
                        `[HERO-DEBUG-SPD] Parent Actor Raw baseline SPD before token creation: ${testActor.system.characteristics.spd.value}`,
                    );

                    let currentActor = await initializeTestTokenAndDoses();
                    const spdBefore = testActor.system.characteristics.spd.value;
                    const rawCurrentSpd = currentActor.system.characteristics.spd.value;

                    console.log(`[HERO-DEBUG-SPD] Computed spdBefore Base: ${spdBefore}`);
                    console.log(`[HERO-DEBUG-SPD] Live Token Sheet Total SPD at Sec 3: ${rawCurrentSpd}`);

                    // Enforce 6e whole number capping: 24 Max Active Points / 10 = +2 whole integer SPD bonus.
                    // Base (2) + AID Bonus (2) = 4 SPD.
                    const expectedMaxSpd = 4;
                    assert.equal(
                        rawCurrentSpd,
                        expectedMaxSpd,
                        `Sec 3 Check: Expected Total SPD to be ${expectedMaxSpd}.`,
                    );

                    let totalElapsedSeconds = 3;
                    while (totalElapsedSeconds < 20) {
                        await stepTimeOneSecond(totalElapsedSeconds);
                        totalElapsedSeconds++;

                        // Always read directly from the live token proxy instance
                        const liveActor = testTokenDoc.actor;
                        liveActor.reset();
                        currentActor = liveActor;

                        const currentSpd = currentActor.system.characteristics.spd.value;
                        console.log(`[HERO-DEBUG-SPD] Sec ${totalElapsedSeconds} | Current Sheet SPD: ${currentSpd}`);

                        switch (totalElapsedSeconds) {
                            case 4:
                            case 5:
                            case 6:
                            case 7:
                            case 8:
                            case 9:
                            case 10:
                            case 11:
                            case 12:
                                assert.equal(currentSpd, expectedMaxSpd, `Sec ${totalElapsedSeconds} Hold`);
                                break;
                            case 13:
                                // Dose 1 fades. Pool drops to 19 AP -> trunc(19/10) = +1 SPD bonus (2 + 1 = 3 SPD)
                                await awaitCharacteristicSettle(currentActor, "spd", 3);
                                assert.equal(currentActor.system.characteristics.spd.value, 3, "Sec 13 Fade Check");
                                break;
                            case 14:
                                // Dose 2 fades. Pool drops to 14 AP -> trunc(14/10) still grants +1 once the
                                // cumulative recalc settles (per-effect truncation briefly shows less).
                                await awaitCharacteristicSettle(currentActor, "spd", 3);
                                assert.equal(currentActor.system.characteristics.spd.value, 3, "Sec 14 Fade Check");
                                break;
                            case 15:
                                // Dose 3 fades. Pool drops to 9 AP -> trunc(9/10) = +0, back to base 2 SPD.
                                await awaitCharacteristicSettle(currentActor, "spd", 2);
                                assert.equal(currentActor.system.characteristics.spd.value, 2, "Sec 15 Fade Check");
                                break;
                            default:
                                break;
                        }
                    }

                    // Force full wipe sweep verification boundary
                    await finalizeAndPruneActorCollection("spd", spdBefore);
                });

                // ─── IT BLOCK 4: 6E SPD TIME REWIND WORKFLOW ───
                it("Should maintain 6e SPD stability during chronological rewinds", async () => {
                    // Sync ruleset configuration properties securely before initialization
                    await testActor.update({ "system.is5e": false });
                    await createdItem.update({ "system.INPUT": "SPD", "system.is5e": false });

                    console.log(
                        `[HERO-DEBUG-SPD-REWIND] Parent Actor Raw baseline SPD before token creation: ${testActor.system.characteristics.spd.value}`,
                    );

                    let currentActor = await initializeTestTokenAndDoses();
                    const spdBefore = testActor.system.characteristics.spd.value;
                    const rawCurrentSpd = currentActor.system.characteristics.spd.value;

                    console.log(`[HERO-DEBUG-SPD-REWIND] Computed spdBefore Base: ${spdBefore}`);
                    console.log(`[HERO-DEBUG-SPD-REWIND] Live Token Sheet Total SPD at Sec 3: ${rawCurrentSpd}`);

                    // 6e whole number capping check: Base (2) + AID Bonus (2) = 4 SPD.
                    const expectedMaxSpd = 4;
                    assert.equal(
                        rawCurrentSpd,
                        expectedMaxSpd,
                        `Sec 3 Setup Check: Expected Total SPD to be ${expectedMaxSpd}.`,
                    );

                    // ─── PHASE 1: MARCH TIMELINE FORWARD TO CRITICAL INTERMEDIATE FADE ───
                    let totalElapsedSeconds = 3;
                    while (totalElapsedSeconds < 13) {
                        await stepTimeOneSecond(totalElapsedSeconds);
                        totalElapsedSeconds++;

                        // Re-evaluate live proxy token instance data safely
                        const liveActor = testTokenDoc.actor;
                        liveActor.reset();
                        currentActor = liveActor;

                        console.log(
                            `[HERO-DEBUG-SPD-REWIND] Forward | Sec ${totalElapsedSeconds} | Sheet SPD: ${currentActor.system.characteristics.spd.value}`,
                        );
                    }

                    // At Sec 13, Dose 1 fades. Pool drops to 19 AP -> Truncates to +1 SPD bonus (2 + 1 = 3 SPD)
                    const midSpd = currentActor.system.characteristics.spd.value;
                    assert.equal(midSpd, 3, "Sec 13 Forward Check failed to truncate to 3 SPD.");

                    // ─── PHASE 2: EXECUTE CHRONOLOGICAL REWIND BOUNDARY ───
                    console.log(`[HERO-DEBUG-SPD-REWIND] Initiating backward timeline leap from Sec 13 to Sec 3...`);

                    // Wind time back 10 seconds. System must NOT resurrect or re-create expired effects.
                    while (totalElapsedSeconds > 3) {
                        totalElapsedSeconds--;
                        await game.time.advance(-1);

                        const liveActor = testTokenDoc.actor;
                        liveActor.reset();
                        currentActor = liveActor;

                        console.log(
                            `[HERO-DEBUG-SPD-REWIND] Rewind | Sec ${totalElapsedSeconds} | Sheet SPD: ${currentActor.system.characteristics.spd.value}`,
                        );
                    }

                    // Enforce the strict non-resurrection constraint: value must remain locked at its current faded value
                    console.log(
                        `[HERO-DEBUG-SPD-REWIND] Post-Rewind Stability Check at Sec 3 | Sheet SPD: ${currentActor.system.characteristics.spd.value}`,
                    );
                    assert.equal(
                        currentActor.system.characteristics.spd.value,
                        3,
                        "Chronological rule violation: System modified or gave back SPD points during a timeline rewind loop.",
                    );

                    // ─── PHASE 3: MARCH TIMELINE FORWARD AGAIN TO VERIFY RE-FADE METRICS ───
                    console.log(`[HERO-DEBUG-SPD-REWIND] Re-marching timeline forward from Sec 3 to Sec 15...`);
                    while (totalElapsedSeconds < 15) {
                        await stepTimeOneSecond(totalElapsedSeconds);
                        totalElapsedSeconds++;

                        const liveActor = testTokenDoc.actor;
                        liveActor.reset();
                        currentActor = liveActor;

                        console.log(
                            `[HERO-DEBUG-SPD-REWIND] Re-March | Sec ${totalElapsedSeconds} | Sheet SPD: ${currentActor.system.characteristics.spd.value}`,
                        );
                    }

                    // Ensure matrix recalculations line up cleanly with original forward march timeline paths.
                    // At Sec 15 all three doses have faded once: pool = 24 - 15 = 9 AP -> trunc(9/10) = +0,
                    // so SPD settles back to its base of 2.
                    await awaitCharacteristicSettle(currentActor, "spd", 2);
                    assert.equal(
                        currentActor.system.characteristics.spd.value,
                        2,
                        "Timeline forward re-march failed: Aligned matrix calculation drifted after rewind operations.",
                    );

                    // Force full wipe sweep verification boundary
                    await finalizeAndPruneActorCollection("spd", spdBefore);
                });

                // ─── IT BLOCK 5: 5E FRACTIONAL SPD STACKING CONFIGURATIONS ───
                it("Should handle 5e whole integer rounding and clamp SPD maximum caps", async () => {
                    // Enforce 5th Edition ruleset behavior matrix properties securely
                    await testActor.update({ "system.is5e": true });
                    await createdItem.update({ "system.INPUT": "SPD", "system.is5e": true });

                    console.log(
                        `[HERO-DEBUG-5E-SPD] Parent Actor Raw baseline SPD before token creation: ${testActor.system.characteristics.spd.value}`,
                    );

                    // Initialize and isolate the live token proxy instance
                    let currentActor = await initializeTestTokenAndDoses();
                    const spdBefore = testActor.system.characteristics.spd.value;
                    const rawCurrentSpd = currentActor.system.characteristics.spd.value;

                    console.log(`[HERO-DEBUG-5E-SPD] Computed spdBefore Base: ${spdBefore}`);
                    console.log(`[HERO-DEBUG-5E-SPD] Live Token Sheet Total 5e SPD at Sec 3: ${rawCurrentSpd}`);

                    // 5th Edition Rule Parameter: Fractions stack and pool directly.
                    // Verify initialization bounds without forcing immediate whole integer truncation
                    const expectedMaxSpd5e = 4;
                    assert.equal(
                        Math.floor(rawCurrentSpd),
                        expectedMaxSpd5e,
                        `Sec 3 Check: Expected pooled 5e total SPD floor to be ${expectedMaxSpd5e}.`,
                    );

                    let totalElapsedSeconds = 3;
                    while (totalElapsedSeconds < 20) {
                        await stepTimeOneSecond(totalElapsedSeconds);
                        totalElapsedSeconds++;

                        // V14 Mapping Standard: Safely access the active token map contents array
                        const sceneTokens = game.scenes.active.tokens.contents;
                        if (!sceneTokens || sceneTokens.length === 0) {
                            assert.fail("Active canvas scene tokens collection is completely empty during step loops.");
                        }

                        // Proxy Actor Isolation: Call reset directly on the live proxy token instance
                        const liveActor = testTokenDoc.actor;
                        liveActor.reset();
                        currentActor = liveActor;

                        const currentSpd = currentActor.system.characteristics.spd.value;
                        console.log(
                            `[HERO-DEBUG-5E-SPD] Sec ${totalElapsedSeconds} | Current 5e Sheet SPD: ${currentSpd}`,
                        );

                        switch (totalElapsedSeconds) {
                            case 4:
                            case 5:
                            case 6:
                            case 7:
                            case 8:
                            case 9:
                            case 10:
                            case 11:
                            case 12:
                                // Confirm fractional stability holds completely across continuous ticks
                                assert.equal(
                                    Math.floor(currentSpd),
                                    expectedMaxSpd5e,
                                    `Sec ${totalElapsedSeconds} Hold`,
                                );
                                break;
                            case 13:
                                // Dose 1 fades fractionally. Check that the remaining fractional pool is evaluated
                                console.log(`[HERO-DEBUG-5E-SPD] Evaluating fractional pool fade step at Sec 13...`);
                                break;
                            default:
                                break;
                        }
                    }

                    // Force clean lifecycle disposal sweep of the database collection
                    await finalizeAndPruneActorCollection("spd", spdBefore);
                });

                // ─── IT BLOCK 6: 5E ROUNDED INTEGER SPD TIME REWIND WORKFLOW ───
                it("Should maintain 5e rounded integer SPD stability during chronological rewinds", async () => {
                    // Enforce 5th Edition ruleset behavior matrix properties securely
                    await testActor.update({ "system.is5e": true });
                    await createdItem.update({ "system.INPUT": "SPD", "system.is5e": true });

                    // Proxy Actor Isolation: Target the live canvas proxy instance directly
                    const actor = testTokenDoc.actor;
                    actor.reset();

                    // Baseline Verification: Confirm base 5e SPD starts at 2
                    console.log(`[HERO-DEBUG-5E-LINEAR] Baseline SPD: ${actor.system.characteristics.spd.value}`);
                    assert.equal(actor.system.characteristics.spd.value, 2, "Initial baseline 5e SPD must be 2.");

                    // ─── SECOND 0 ───
                    // Inject Dose 1: +8 Active Points. 5e Pools fractionally: +0.8 SPD. (2 + 0.8 = 2.8) -> Math.floor rounds to 2 SPD.
                    await applyMockAidValue(8);
                    actor.reset();
                    console.log(
                        `[HERO-DEBUG-5E-LINEAR] Sec 0 | Added Dose 1 (8 AP) | Sheet SPD: ${actor.system.characteristics.spd.value}`,
                    );
                    assert.equal(
                        Math.floor(actor.system.characteristics.spd.value),
                        2,
                        "Sec 0 Check: Expected pooled total floor to be 2.",
                    );

                    // ─── SECOND 1 ───
                    await stepTimeOneSecond(1);
                    actor.reset();
                    console.log(
                        `[HERO-DEBUG-5E-LINEAR] Sec 1 | Ticked Forward | Sheet SPD: ${actor.system.characteristics.spd.value}`,
                    );
                    assert.equal(
                        Math.floor(actor.system.characteristics.spd.value),
                        2,
                        "Sec 1 Check: Expected pooled total floor to be 2.",
                    );

                    // Inject Dose 2: +9 Active Points. Pool scales to: 8 + 9 = 17 AP (+1.7 SPD). (2 + 1.7 = 3.7) -> Floor rounds to 3 SPD.
                    await applyMockAidValue(9);
                    actor.reset();
                    console.log(
                        `[HERO-DEBUG-5E-LINEAR] Sec 1 | Added Dose 2 (9 AP) | Sheet SPD: ${actor.system.characteristics.spd.value}`,
                    );
                    assert.equal(
                        Math.floor(actor.system.characteristics.spd.value),
                        3,
                        "Sec 1 Post-Dose Check: Expected pooled total floor to be 3.",
                    );

                    // ─── SECOND 2 ───
                    await stepTimeOneSecond(1);
                    actor.reset();
                    console.log(
                        `[HERO-DEBUG-5E-LINEAR] Sec 2 | Ticked Forward | Sheet SPD: ${actor.system.characteristics.spd.value}`,
                    );
                    assert.equal(
                        Math.floor(actor.system.characteristics.spd.value),
                        3,
                        "Sec 2 Check: Expected pooled total floor to be 3.",
                    );

                    // Inject Dose 3: +10 Active Points. Pool scales to: 17 + 10 = 27 AP (+2.7 SPD). (2 + 2.7 = 4.7) -> Floor rounds to 4 SPD.
                    await applyMockAidValue(10);
                    actor.reset();
                    console.log(
                        `[HERO-DEBUG-5E-LINEAR] Sec 2 | Added Dose 3 (10 AP) | Sheet SPD: ${actor.system.characteristics.spd.value}`,
                    );
                    assert.equal(
                        Math.floor(actor.system.characteristics.spd.value),
                        4,
                        "Sec 2 Post-Dose Check: Expected pooled total floor to be 4.",
                    );

                    // ─── SECONDS 3 THROUGH 11: HOLD MATRIX BOUNDARIES ───
                    // March through the stable hold phase, ensuring the 4 SPD maximum cap holds cleanly
                    for (let sec = 3; sec <= 11; sec++) {
                        await stepTimeOneSecond(1);
                        actor.reset();
                        console.log(
                            `[HERO-DEBUG-5E-LINEAR] Sec ${sec} | Hold Matrix Loop | Sheet SPD: ${actor.system.characteristics.spd.value}`,
                        );
                        assert.equal(
                            Math.floor(actor.system.characteristics.spd.value),
                            4,
                            `Sec ${sec} Hold Check failed.`,
                        );
                    }

                    // ─── SECOND 12: DOSE 1 FADE STEP ───
                    // Dose 1 (Sec 0) fades exactly at Sec 12: the 24 AP capped pool (8+9+7) drops
                    // to 19 AP -> 2 + 1.9 = 3.9 -> floor 3. Wait for the fade to settle — sampling
                    // immediately can still see the pre-fade 4.
                    await stepTimeOneSecond(1);
                    await awaitCharacteristicSettle(actor, "spd", 3);
                    console.log(
                        `[HERO-DEBUG-5E-LINEAR] Sec 12 | First Decay Tick (Pool: 19 AP) | Sheet SPD: ${actor.system.characteristics.spd.value}`,
                    );
                    assert.equal(
                        Math.floor(actor.system.characteristics.spd.value),
                        3,
                        "Sec 12 Check: Expected capped pool (19 AP) floor to drop to 3 SPD.",
                    );

                    // ─── SECOND 13: SEQUENTIAL FADE STEP (DOSE 2) ───
                    // Pool drops to 14 AP -> 2 + 1.4 = 3.4 -> floor 3.
                    await stepTimeOneSecond(1);
                    await awaitCharacteristicSettle(actor, "spd", 3);
                    console.log(
                        `[HERO-DEBUG-5E-LINEAR] Sec 13 | Second Decay Tick (Pool: 14 AP) | Sheet SPD: ${actor.system.characteristics.spd.value}`,
                    );
                    assert.equal(
                        Math.floor(actor.system.characteristics.spd.value),
                        3,
                        "Sec 13 Check: Expected 5e fractional pool floor to hold at 3 SPD.",
                    );

                    // ─── SECOND 14: SEQUENTIAL FADE STEP (DOSE 3) ───
                    // Pool drops to 9 AP -> 2 + 0.9 = 2.9 -> floor 2.
                    await stepTimeOneSecond(1);
                    await awaitCharacteristicSettle(actor, "spd", 2);
                    console.log(
                        `[HERO-DEBUG-5E-LINEAR] Sec 14 | Third Decay Tick (Pool: 9 AP) | Sheet SPD: ${actor.system.characteristics.spd.value}`,
                    );
                    assert.equal(
                        Math.floor(actor.system.characteristics.spd.value),
                        2,
                        "Sec 14 Check: Expected 5e fractional pool floor to drop to 2 SPD.",
                    );
                });
            });
        },
        { displayName: "HERO: Adjustment Power Fade Matrix" },
    );
}
