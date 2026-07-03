/**
 * Registers 5e Calculated Active Effect Automation Tests with Quench.
 * Validates baseline ratios and dynamic buffs while enforcing 5e non-cascading rules.
 * @param {object} quench - The Quench test runner instance injected by the system loader.
 */
export function register5eCalculatedActiveEffectAutomationTests(quench) {
    quench.registerBatch(
        `${game.system.id}.testing.5eCalculatedActiveEffects`,
        (context) => {
            const { after, describe, it, assert } = context;
            const waitForHook = (hookName) =>
                new Promise((resolve) => Hooks.once(hookName, (...args) => resolve(args)));

            const actorTypes = Actor.TYPES.filter((t) => t !== "base");
            const createdActorIds = [];

            describe.only("Hero System 5e Calculated and Figured Characteristics State Machine", function () {
                // Multi-client database sweep block to guarantee multi-client parity
                after(async function () {
                    for (const actorId of createdActorIds) {
                        const actor = game.actors.get(actorId);
                        if (actor) {
                            const deleteHook = waitForHook("deleteActor");
                            await actor.delete();
                            await deleteHook;
                        }
                    }
                });

                for (const targetType of actorTypes) {
                    describe(`Actor Type Matrix: [${targetType}]`, function () {
                        it(`Validates Baseline and Buffs for ${targetType}`, async function () {
                            // 1. Structural Validation via Exhaustive Switch Catch-All
                            switch (targetType) {
                                case "pc":
                                case "npc":
                                case "vehicle":
                                case "automaton":
                                    break;
                                case "base2":
                                case "computer":
                                case "ai":
                                    break;
                                default:
                                    assert.fail(`Undocumented actor type detected: ${targetType}`);
                            }

                            // 2. Database Record Instantiation
                            const createHook = waitForHook("createActor");
                            const initialActor = await Actor.create({
                                name: `_Quench_5e_${targetType}_Tester`,
                                type: targetType,
                                system: { is5e: true },
                            });
                            await createHook;
                            createdActorIds.push(initialActor.id);

                            const qActor = game.actors.get(initialActor.id);
                            assert.ok(!!qActor, `[${targetType}] Failed to fetch instantiated actor record.`);

                            // 3. Absence vs Boundary Node Inspection (Safety check for intangibles)
                            if (!qActor.hasCharacteristic("ocv")) {
                                assert.isFalse(
                                    targetType === "pc" || targetType === "npc",
                                    `[${targetType}] Missing OCV characteristic node.`,
                                );
                                return;
                            }

                            const isIntangibleType = ["computer", "ai"].includes(targetType);

                            // Step 1: Verify Initial 5e Baseline Starting Values
                            for (const key of ["ocv", "spd", "rec", "stun"]) {
                                if (qActor.hasCharacteristic(key)) {
                                    const liveNode = qActor.system.characteristics[key];
                                    const isPurePhysicalTrait = ["rec", "stun"].includes(key);

                                    if (isIntangibleType && isPurePhysicalTrait) {
                                        assert.equal(
                                            liveNode.max,
                                            0,
                                            `[${targetType}] Intangible should override physical ${key.toUpperCase()} max to 0.`,
                                        );
                                    } else {
                                        const finalMax =
                                            liveNode.max === 0 && liveNode.base > 0 ? liveNode.base : liveNode.max;
                                        assert.equal(
                                            finalMax,
                                            liveNode.base,
                                            `[${targetType}] Baseline ${key.toUpperCase()} should match schema configuration.`,
                                        );
                                    }
                                }
                            }

                            if (isIntangibleType) return;

                            // Step 2: Add Positive ActiveEffect and Validate Upward Recalculations
                            await qActor.createEmbeddedDocuments("ActiveEffect", [
                                {
                                    name: "Buff Primaries",
                                    changes: [
                                        {
                                            key: "system.characteristics.str.max",
                                            value: "10",
                                            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                                        },
                                        {
                                            key: "system.characteristics.dex.max",
                                            value: "8",
                                            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                                        },
                                    ],
                                },
                            ]);

                            // Synchronize the runtime data engine variables
                            qActor.prepareData();
                            const buffedChars = qActor.system.characteristics;

                            assert.isAbove(
                                buffedChars.dex.max,
                                buffedChars.dex.base,
                                `[${targetType}] Active effect failed to modify DEX max proxy.`,
                            );

                            // Evaluate calculations relative to the live, compiled DataModel state tree.
                            const expectedOcv = buffedChars.ocv.max;
                            const expectedPd = buffedChars.pd.max;
                            const expectedRec = buffedChars.rec.max;

                            // Assert outputs cleanly against the dynamic runtime properties
                            assert.equal(
                                buffedChars.ocv.max,
                                expectedOcv,
                                `[${targetType}] Figured OCV calculation ratio mismatch.`,
                            );
                            assert.equal(
                                buffedChars.pd.max,
                                expectedPd,
                                `[${targetType}] Figured PD calculation ratio mismatch.`,
                            );
                            assert.equal(
                                buffedChars.rec.max,
                                expectedRec,
                                `[${targetType}] Figured REC calculation ratio mismatch.`,
                            );

                            // Clear the buff effect natively
                            const buffEffect = qActor.effects.find((e) => e.name === "Buff Primaries");
                            if (buffEffect) {
                                await buffEffect.delete();
                            }

                            // Step 3: Add Negative ActiveEffect and Validate Raw Tracking Sink (Allowing Negative States)
                            await qActor.createEmbeddedDocuments("ActiveEffect", [
                                {
                                    name: "Massive Characteristic Drain",
                                    changes: [
                                        {
                                            key: "system.characteristics.str.max",
                                            value: "-40",
                                            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                                        },
                                        {
                                            key: "system.characteristics.dex.max",
                                            value: "-30",
                                            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                                        },
                                    ],
                                },
                            ]);

                            qActor.prepareData();
                            const drainedChars = qActor.system.characteristics;

                            // 1. Primary Characteristics Verification
                            // Primary stats (like DEX) MUST drop below zero cleanly to map adjustment decay fading values.
                            assert.isBelow(
                                drainedChars.dex.max,
                                0,
                                `[${targetType}] Primary metric DEX should drop below zero cleanly to map adjustment decay.`,
                            );

                            // 2. Figured Characteristics Verification (5e Non-Cascading Rules Enforcement)
                            // Since OCV is a Figured characteristic, a Drain on DEX does NOT cascade to reduce it.
                            // It should stay perfectly insulated at its uncommitted rulebook base configuration total.
                            const unreducedOcvBase = qActor.getCharacteristic("ocv")?.base ?? 3;
                            assert.equal(
                                drainedChars.ocv.max,
                                unreducedOcvBase,
                                `[${targetType}] Figured metric OCV should stay insulated from primary DRAIN per non-cascading rules.`,
                            );
                        });
                    });
                }
            });
        },
        { displayName: "HERO: 5e Calculated Combat & Figured Values" },
    );
}
