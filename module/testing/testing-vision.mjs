import {
    setQuenchTimeout,
    createQuenchScene,
    deleteQuenchScenes,
    deleteQuenchActor,
    waitForNotificationQueueToClear,
} from "./quench-helper.mjs";
import { calculateDistanceBetween } from "../utility/range.mjs";

/**
 * Structured vision verification pipeline optimized for rapid iteration.
 * Directly injects the external quench tracking instance at execution runtime.
 * @param {object} quench - The external Quench tracking framework instance.
 */
export function registerVisionTests(quench) {
    quench.registerBatch(
        `${game.system.id}.Vision`,
        (context) => {
            const { describe, it, assert, before, after } = context;

            // Targeted Iteration Isolation: Focus execution entirely on the Vision module
            describe("Vision", function () {
                setQuenchTimeout(this);

                // --- UNIT TESTS LEVEL ---
                describe("Unit tests", function () {
                    it("Should resolve true via SIGHT FRINGE math if adjacent despite active invisibility", () => {
                        const detectionMode = CONFIG.Canvas.detectionModes["heroTargetingV14"];

                        const activeSenses = {
                            NORMALSIGHT: { ACTIVE: true, RANGED: true, TARGETING: true, SENSEGROUP: "SIGHTGROUP" },
                        };

                        const targetInvisibility = {
                            SIGHTGROUP: true,
                            NORMALSIGHT: true,
                            NO_FRINGE: false,
                            BRIGHT_FRINGE: false,
                        };

                        // Mock distance exactly evaluating to 1.5 meters / 1 grid space
                        const calculatedDistance = { distance: 1.5, gridSpaces: 1 };

                        const originalLog = console.log;
                        console.log = () => {}; // Suppress output text strings during strict math validation

                        try {
                            const isDetected = detectionMode._resolveSensoryMatrix(
                                activeSenses,
                                targetInvisibility,
                                calculatedDistance,
                                false,
                                {},
                                {},
                                true,
                            );
                            assert.isTrue(
                                isDetected,
                                "Matrix processor failed to unlock adjacent proximity fringe overrides.",
                            );
                        } finally {
                            console.log = originalLog;
                        }
                    });
                });

                // --- WORKFLOW / SCENE WORKFLOW TESTS LEVEL ---
                describe("Integration", function () {
                    let quenchScene;
                    let pcActor;
                    let invisibleActor;
                    let tokenDocA;
                    let tokenDocB;

                    before(async () => {
                        // Recommended when doing integration test with the UI
                        await waitForNotificationQueueToClear();
                        quenchScene = await createQuenchScene({
                            quench: this,
                            width: 1000,
                            height: 750,
                        });

                        pcActor = await foundry.documents.Actor.create({
                            name: "Breeze 5e",
                            type: "pc",
                            system: { is5e: true },
                            img: "icons/svg/sword.svg",
                        });

                        invisibleActor = await foundry.documents.Actor.create({
                            name: "Spectral Knight",
                            type: "npc",
                            system: { is5e: false },
                            img: "icons/svg/shield.svg",
                        });

                        const createdTokens = await quenchScene.createEmbeddedDocuments("Token", [
                            { name: pcActor.name, actorId: pcActor.id, x: 0, y: 0, actorLink: true },
                            { name: invisibleActor.name, actorId: invisibleActor.id, x: 500, y: 0, actorLink: true },
                        ]);

                        tokenDocA = createdTokens[0];
                        tokenDocB = createdTokens[1];
                    });

                    after(async () => {
                        await deleteQuenchScenes();
                        await deleteQuenchActor({ quench: this, actor: pcActor });
                        await deleteQuenchActor({ quench: this, actor: invisibleActor });
                    });

                    it("Should accurately track canvas distance separation parameters via live scene token metrics", () => {
                        // Proxy Actor Isolation: Call distance validation loops on the live token instances directly
                        const calculatedDistance = calculateDistanceBetween(tokenDocA, tokenDocB);

                        assert.equal(
                            calculatedDistance.gridSpaces,
                            5,
                            "Canvas scene spacing matrix grid spaces evaluated incorrectly.",
                        );
                    });
                });
            });
        },
        { displayName: "HERO: Vision" },
    );
}
