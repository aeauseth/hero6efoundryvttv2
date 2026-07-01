export function register5eCalculatedActiveEffectAutomationTests(quench) {
    quench.registerBatch(
        `${game.system.id}.testing.5eCalculatedActiveEffects`,
        (context) => {
            const { describe, it, assert } = context;

            const waitForHook = (hookName) =>
                new Promise((resolve) => Hooks.once(hookName, (...args) => resolve(args)));

            // Filter out base internal configurations
            const actorTypes = Actor.TYPES.filter((t) => t !== "base");

            describe.only("Hero System 5e Calculated and Figured Characteristics State Machine", function () {
                it("Validates Baseline, Buffs, and Floors across complete Actor Type Matrix", async function () {
                    for (const targetType of actorTypes) {
                        // 1. Create a pristine actor per type relying completely on schema defaults
                        const createHook = waitForHook("createActor");
                        const qActor = await Actor.create({
                            name: `_Quench_5e_${targetType}_Tester`,
                            type: targetType,
                            system: {
                                is5e: true,
                            },
                        });
                        await createHook;

                        try {
                            const char = qActor.system.characteristics;

                            // Step 1: Verify Initial 5e Baseline Starting Values from _preCreate / DataModel defaults
                            assert.equal(char.ocv.max, 3, `[${targetType}] Baseline OCV should be 3`);
                            assert.equal(char.spd.max, 2, `[${targetType}] Baseline SPD should be 2`);
                            assert.equal(char.rec.max, 4, `[${targetType}] Baseline REC should be 4`);
                            assert.equal(char.stun.max, 20, `[${targetType}] Baseline STUN should be 20`);

                            // Step 2: Add Positive ActiveEffect and Validate Upward Recalculations
                            let effectHook = waitForHook("createActiveEffect");
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
                            await effectHook;

                            assert.equal(char.ocv.max, 6, `[${targetType}] Recalculated OCV should be 6`);
                            assert.equal(char.pd.max, 4, `[${targetType}] Recalculated PD should be 4`);
                            assert.equal(char.rec.max, 6, `[${targetType}] Recalculated REC should be 6`);

                            // Clear the buff effect before testing floors to keep calculations clean
                            const buffEffect = qActor.effects.find((e) => e.name === "Buff Primaries");
                            if (buffEffect) {
                                const deleteEffectHook = waitForHook("deleteActiveEffect");
                                await buffEffect.delete();
                                await deleteEffectHook;
                            }

                            // Step 3: Add Negative ActiveEffect and Validate Minimum Rule Floors
                            effectHook = waitForHook("createActiveEffect");
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
                            await effectHook;

                            assert.isAtLeast(char.ocv.max, 0, `[${targetType}] OCV must enforce minimum floor of 0`);
                            assert.isAtLeast(char.spd.max, 1, `[${targetType}] SPD must enforce minimum floor of 1`);
                        } finally {
                            // Ensure immediate database clean up even if assertions fail
                            const deleteHook = waitForHook("deleteActor");
                            await qActor.delete();
                            await deleteHook;
                        }
                    }
                });
            });
        },
        { displayName: "HERO: 5e Calculated Combat & Figured Values" },
    );
}
