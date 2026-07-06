import { HeroSystem6eActorActiveEffects } from "../actor/actor-active-effects.mjs";

export function registerStatusEffectTests(quench) {
    quench.registerBatch(
        `${game.system.id}.testing.statusEffects`,
        (context) => {
            const { describe, it, before, beforeEach, after, assert } = context;

            // Awaitable promise helper that resolves exactly when a specific Foundry hook settles
            const waitForHook = (hookName) =>
                new Promise((resolve) => Hooks.once(hookName, (...args) => resolve(args)));
            const getSceneTokenDocuments = () =>
                canvas.scene?.tokens?.contents ?? Array.from(canvas.scene?.tokens ?? []);
            const getSceneTokenIdsForActor = (actor) =>
                new Set(
                    getSceneTokenDocuments()
                        .filter(
                            (tokenDocument) =>
                                tokenDocument.actorId === actor.id ||
                                tokenDocument.actor?.id === actor.id ||
                                tokenDocument.actor === actor,
                        )
                        .map((tokenDocument) => tokenDocument.id),
                );
            const tintMatchesExpected = (actualTint, expectedTint) =>
                foundry.utils.Color.from(actualTint).css === foundry.utils.Color.from(expectedTint).css;
            const getTokenUpdateTint = (update) => update?.["texture.tint"] ?? update?.texture?.tint;
            const waitForActorTokenTintUpdate = async (actor, getUpdates, expectedTint, timeoutMs = 1000) => {
                const started = Date.now();
                while (Date.now() - started < timeoutMs) {
                    const tintUpdates = (getUpdates() ?? []).filter(
                        (u) => u["texture.tint"] !== undefined || u.texture?.tint !== undefined,
                    );
                    const actorTokenIds = getSceneTokenIdsForActor(actor);
                    const update = tintUpdates.find(
                        (u) =>
                            (actorTokenIds.has(u._id) || tintUpdates.length === 1) &&
                            tintMatchesExpected(getTokenUpdateTint(u), expectedTint),
                    );
                    if (update) return update;
                    await new Promise((resolve) => setTimeout(resolve, 20));
                }
                return null;
            };

            describe("Actor Status Effect State Machine Matrix", function () {
                let quenchActor = null;
                let effectsObj = null;

                before(async function () {
                    effectsObj = HeroSystem6eActorActiveEffects.statusEffectsObj;

                    quenchActor = await Actor.create({
                        name: "_Quench_Status_Tester",
                        type: "pc",
                        img: "icons/svg/mystery-man.svg",
                    });
                });

                after(async function () {
                    if (quenchActor) {
                        // Await the hook to track document cleanup safely
                        const hookPromise = waitForHook("deleteActor");
                        await quenchActor.delete();
                        await hookPromise;
                    }
                });

                beforeEach(async function () {
                    const effectIds = quenchActor.effects.map((e) => e.id);
                    if (effectIds.length > 0) {
                        const hookPromise = waitForHook("deleteActiveEffect");
                        await quenchActor.deleteEmbeddedDocuments("ActiveEffect", effectIds);
                        await hookPromise; // Blocks until the collection is completely empty
                    }
                });

                it("Dead Lockout Check", async function () {
                    // Track the effect creation step deterministically
                    let hookPromise = waitForHook("createActiveEffect");
                    await quenchActor.toggleStatusEffect(effectsObj.deadEffect.id, { active: true });
                    await hookPromise;

                    assert.ok(quenchActor.statuses.has(effectsObj.deadEffect.id), "Actor successfully seeded as Dead.");

                    const koResult = await quenchActor.toggleStatusEffect(effectsObj.knockedOutEffect.id, {
                        active: true,
                    });
                    const stunResult = await quenchActor.toggleStatusEffect(effectsObj.stunEffect.id, { active: true });

                    assert.strictEqual(koResult, false, "Toggling knockedOut while dead returns false.");
                    assert.strictEqual(stunResult, false, "Toggling stun while dead returns false.");
                    assert.ok(!quenchActor.statuses.has(effectsObj.knockedOutEffect.id), "KnockedOut status blocked.");
                    assert.ok(!quenchActor.statuses.has(effectsObj.stunEffect.id), "Stunned status blocked.");
                });

                it("Prone Implication Chains (KO)", async function () {
                    const hookPromise = waitForHook("createActiveEffect");
                    await quenchActor.toggleStatusEffect(effectsObj.knockedOutEffect.id, { active: true });
                    await hookPromise;

                    assert.ok(quenchActor.statuses.has(effectsObj.knockedOutEffect.id), "KnockedOut applied.");
                    assert.ok(
                        quenchActor.statuses.has(effectsObj.proneEffect.id),
                        "Prone automatically implied via KO.",
                    );
                });

                it("Prone Implication Chains (Asleep)", async function () {
                    const hookPromise = waitForHook("createActiveEffect");
                    await quenchActor.toggleStatusEffect(effectsObj.asleepEffect.id, { active: true });
                    await hookPromise;

                    assert.ok(quenchActor.statuses.has(effectsObj.asleepEffect.id), "Asleep applied.");
                    assert.ok(
                        quenchActor.statuses.has(effectsObj.proneEffect.id),
                        "Prone automatically implied via Asleep.",
                    );
                });

                it("Prone Implication Chains (Unconscious)", async function () {
                    const hookPromise = waitForHook("createActiveEffect");
                    await quenchActor.toggleStatusEffect(effectsObj.unconsciousEffect.id, { active: true });
                    await hookPromise;

                    assert.ok(quenchActor.statuses.has(effectsObj.unconsciousEffect.id), "Unconscious applied.");
                    assert.ok(
                        quenchActor.statuses.has(effectsObj.proneEffect.id),
                        "Prone automatically implied via Unconscious.",
                    );
                });

                it("KnockedOut Cleans Up Stunned", async function () {
                    let hookPromise = waitForHook("createActiveEffect");
                    await quenchActor.toggleStatusEffect(effectsObj.stunEffect.id, { active: true });
                    await hookPromise;
                    assert.ok(quenchActor.statuses.has(effectsObj.stunEffect.id), "Actor is initially Stunned.");

                    // Moving to KO drops stun (deletes an embedded document)
                    hookPromise = waitForHook("deleteActiveEffect");
                    await quenchActor.toggleStatusEffect(effectsObj.knockedOutEffect.id, { active: true });
                    await hookPromise;

                    assert.ok(
                        quenchActor.statuses.has(effectsObj.knockedOutEffect.id),
                        "KnockedOut applied successfully.",
                    );
                    assert.ok(!quenchActor.statuses.has(effectsObj.stunEffect.id), "Stunned was dropped cleanly.");
                });

                it("Dead Cleans Up KnockedOut", async function () {
                    let hookPromise = waitForHook("createActiveEffect");
                    await quenchActor.toggleStatusEffect(effectsObj.knockedOutEffect.id, { active: true });
                    await hookPromise;
                    assert.ok(
                        quenchActor.statuses.has(effectsObj.knockedOutEffect.id),
                        "Actor is initially KnockedOut.",
                    );

                    hookPromise = waitForHook("deleteActiveEffect");
                    await quenchActor.toggleStatusEffect(effectsObj.deadEffect.id, { active: true });
                    await hookPromise;

                    assert.ok(quenchActor.statuses.has(effectsObj.deadEffect.id), "Dead applied successfully.");
                    assert.ok(
                        !quenchActor.statuses.has(effectsObj.knockedOutEffect.id),
                        "KnockedOut was dropped cleanly.",
                    );
                });

                it("Full Health Cleanup Operations", async function () {
                    const effectsObj = HeroSystem6eActorActiveEffects.statusEffectsObj;

                    await quenchActor.toggleStatusEffect(effectsObj.stunEffect.id, { active: true });
                    await quenchActor.toggleStatusEffect(effectsObj.asleepEffect.id, { active: true });
                    await quenchActor.toggleStatusEffect(effectsObj.unconsciousEffect.id, { active: true });

                    await quenchActor.createEmbeddedDocuments("ActiveEffect", [
                        {
                            name: "_Quench_Maneuver",
                            img: "icons/svg/shield.svg",
                            flags: { [game.system.id]: { type: "maneuverNextPhaseEffect" } },
                        },
                    ]);

                    // Intercept the mass document drop inside fullHealth
                    const hookPromise = waitForHook("deleteActiveEffect");
                    await quenchActor.fullHealth();
                    await hookPromise;

                    assert.strictEqual(quenchActor.effects.size, 0, "All core active effects dropped.");
                    assert.ok(!quenchActor.statuses.has(effectsObj.stunEffect.id), "Stunned cleared.");
                    assert.ok(!quenchActor.statuses.has(effectsObj.asleepEffect.id), "Asleep cleared.");
                    assert.ok(!quenchActor.statuses.has(effectsObj.unconsciousEffect.id), "Unconscious cleared.");
                });

                it("Token HUD Interface Click Simulation and FullHealth Cleanup", async function () {
                    const effectsObj = HeroSystem6eActorActiveEffects.statusEffectsObj;

                    const tokenData = await quenchActor.getTokenDocument({ x: 100, y: 100 });

                    let tokenHook = waitForHook("createToken");
                    const [canvasTokenDoc] = await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
                    await tokenHook;

                    const canvasTokenInstance = canvasTokenDoc.object;
                    assert.ok(canvasTokenInstance, "Token instance successfully created.");

                    canvas.tokens.hud.bind(canvasTokenInstance);

                    // Wait for the effect update loop to clear the pipeline
                    let hookPromise = waitForHook("createActiveEffect");
                    await canvas.tokens.hud.actor.toggleStatusEffect(effectsObj.stunEffect.id, {
                        active: true,
                        overlay: true,
                    });
                    await hookPromise;

                    assert.ok(
                        quenchActor.statuses.has(effectsObj.stunEffect.id),
                        "Actor records Stunned state via Token HUD.",
                    );

                    canvas.tokens.hud.clear();

                    hookPromise = waitForHook("deleteActiveEffect");
                    await quenchActor.fullHealth();
                    await hookPromise;

                    assert.strictEqual(
                        quenchActor.effects.size,
                        0,
                        "Actor sheet cleared of the HUD-applied ActiveEffect.",
                    );
                    assert.ok(
                        !quenchActor.statuses.has(effectsObj.stunEffect.id),
                        "Stunned state removed from statuses Set.",
                    );
                    assert.strictEqual(
                        canvasTokenDoc.actor.effects.size,
                        0,
                        "Token actor proxy effects list is clean.",
                    );

                    tokenHook = waitForHook("deleteToken");
                    await canvasTokenDoc.delete();
                    await tokenHook;
                });

                it("Manage knockout states via dynamic PC thresholds", async function () {
                    const tokenHook = waitForHook("createToken");
                    const tokenDocument = await TokenDocument.create(
                        { actorId: quenchActor.id, name: quenchActor.name, x: 0, y: 0 },
                        { parent: canvas.scene },
                    );
                    await tokenHook;

                    let capturedUpdates = null;
                    const originalUpdate = canvas.scene.updateEmbeddedDocuments;
                    canvas.scene.updateEmbeddedDocuments = async function (embeddedName, updates) {
                        if (
                            embeddedName === "Token" &&
                            updates.some(
                                (update) => update["texture.tint"] !== undefined || update.texture?.tint !== undefined,
                            )
                        ) {
                            capturedUpdates = updates;
                        }
                        return originalUpdate.apply(this, arguments);
                    };

                    try {
                        const colors = CONFIG.HERO.statusColors;

                        // A. DOWNWARD DAMAGE PATH
                        // 1. Drop STUN to -1 (Yellow)
                        await quenchActor.update({ "system.characteristics.stun.value": -1 });
                        let tokenTargetUpdate = await waitForActorTokenTintUpdate(
                            quenchActor,
                            () => capturedUpdates,
                            colors.KO_DEFAULT_TINT,
                        );
                        assert.equal(
                            foundry.utils.Color.from(getTokenUpdateTint(tokenTargetUpdate)).css,
                            foundry.utils.Color.from(colors.KO_DEFAULT_TINT).css,
                            "PC at STUN -1 should be assigned the yellowish configuration tint.",
                        );

                        // 2. Drop STUN to -11 (Stays Yellow for PC)
                        capturedUpdates = null;
                        await quenchActor.update({ "system.characteristics.stun.value": -11 });
                        await quenchActor.toggleStatusEffect("knockedOut", { active: true, overlay: true });
                        tokenTargetUpdate = await waitForActorTokenTintUpdate(
                            quenchActor,
                            () => capturedUpdates,
                            colors.KO_DEFAULT_TINT,
                        );
                        assert.equal(
                            foundry.utils.Color.from(getTokenUpdateTint(tokenTargetUpdate)).css,
                            foundry.utils.Color.from(colors.KO_DEFAULT_TINT).css,
                            "PC at STUN -11 should remain assigned the yellowish configuration tint.",
                        );

                        // 3. Drop STUN to -31 (Red)
                        capturedUpdates = null;
                        await quenchActor.update({ "system.characteristics.stun.value": -31 });
                        tokenTargetUpdate = await waitForActorTokenTintUpdate(
                            quenchActor,
                            () => capturedUpdates,
                            colors.KO_COMBAT_TINT,
                        );
                        assert.equal(
                            foundry.utils.Color.from(getTokenUpdateTint(tokenTargetUpdate)).css,
                            foundry.utils.Color.from(colors.KO_COMBAT_TINT).css,
                            "PC at STUN -31 should shift to the critical reddish combat tint.",
                        );

                        // B. NEW: UPWARD HEALING RECOVERY PATH
                        // 4. Heal back up to -1 from -31 (Should shift back from Red to Yellow!)
                        capturedUpdates = null;
                        await quenchActor.update({ "system.characteristics.stun.value": -1 });
                        await quenchActor.toggleStatusEffect("knockedOut", { active: true, overlay: true });
                        tokenTargetUpdate = await waitForActorTokenTintUpdate(
                            quenchActor,
                            () => capturedUpdates,
                            colors.KO_DEFAULT_TINT,
                        );
                        assert.equal(
                            foundry.utils.Color.from(getTokenUpdateTint(tokenTargetUpdate)).css,
                            foundry.utils.Color.from(colors.KO_DEFAULT_TINT).css,
                            "Healing PC back to STUN -1 should return the texture configuration tint to yellow.",
                        );
                    } finally {
                        canvas.scene.updateEmbeddedDocuments = originalUpdate;
                        await tokenDocument.delete();
                    }
                });

                it("Re-tint texture when knockedOut actor changes type", async function () {
                    const npcTestActor = await Actor.create({
                        name: "_Quench_Status_NPC_Tester",
                        type: "pc",
                        img: "icons/svg/mystery-man.svg",
                        system: { characteristics: { stun: { value: 20, max: 20 } } },
                    });

                    await npcTestActor._changeType("npc");

                    const tokenHook = waitForHook("createToken");
                    const tokenDocument = await TokenDocument.create(
                        { actorId: npcTestActor.id, name: npcTestActor.name, x: 0, y: 0 },
                        { parent: canvas.scene },
                    );
                    await tokenHook;

                    let capturedUpdates = null;
                    const originalUpdate = canvas.scene.updateEmbeddedDocuments;
                    canvas.scene.updateEmbeddedDocuments = async function (embeddedName, updates) {
                        if (
                            embeddedName === "Token" &&
                            updates.some(
                                (update) => update["texture.tint"] !== undefined || update.texture?.tint !== undefined,
                            )
                        ) {
                            capturedUpdates = updates;
                        }
                        return originalUpdate.apply(this, arguments);
                    };

                    try {
                        const colors = CONFIG.HERO.statusColors;

                        // A. NPC TO PC PATH
                        // 1. Drop NPC to -11 (Red)
                        await npcTestActor.update({ "system.characteristics.stun.value": -11 });
                        let tokenTargetUpdate = await waitForActorTokenTintUpdate(
                            npcTestActor,
                            () => capturedUpdates,
                            colors.KO_COMBAT_TINT,
                        );
                        assert.equal(
                            foundry.utils.Color.from(getTokenUpdateTint(tokenTargetUpdate)).css,
                            foundry.utils.Color.from(colors.KO_COMBAT_TINT).css,
                            "NPC at STUN -11 should use the critical reddish configuration tint.",
                        );

                        // 2. Convert NPC to PC (Should shift Red ➔ Yellow because threshold is now -30)
                        capturedUpdates = null;
                        await npcTestActor._changeType("pc");
                        await npcTestActor.toggleStatusEffect("knockedOut", { active: true, overlay: true });
                        tokenTargetUpdate = await waitForActorTokenTintUpdate(
                            npcTestActor,
                            () => capturedUpdates,
                            colors.KO_DEFAULT_TINT,
                        );
                        assert.equal(
                            foundry.utils.Color.from(getTokenUpdateTint(tokenTargetUpdate)).css,
                            foundry.utils.Color.from(colors.KO_DEFAULT_TINT).css,
                            "Converting to PC should dynamically adjust the texture target payload back to yellow.",
                        );

                        // B. NEW: PC TO NPC REVERSE PATH
                        // 3. Convert PC back to NPC (Should shift Yellow ➔ Red because threshold drops back to -10)
                        capturedUpdates = null;
                        await npcTestActor._changeType("npc");
                        await npcTestActor.toggleStatusEffect("knockedOut", { active: true, overlay: true });
                        tokenTargetUpdate = await waitForActorTokenTintUpdate(
                            npcTestActor,
                            () => capturedUpdates,
                            colors.KO_COMBAT_TINT,
                        );
                        assert.equal(
                            foundry.utils.Color.from(getTokenUpdateTint(tokenTargetUpdate)).css,
                            foundry.utils.Color.from(colors.KO_COMBAT_TINT).css,
                            "Converting back to NPC should dynamically return the texture layout tint to red.",
                        );
                    } finally {
                        canvas.scene.updateEmbeddedDocuments = originalUpdate;
                        await tokenDocument.delete();
                        await npcTestActor.delete();
                    }
                });
            });
        },
        { displayName: "HERO: Status Effects Logic" },
    );
}
