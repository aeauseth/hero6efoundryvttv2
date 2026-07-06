export async function createQuenchActor({ quench, contents, is5e, actorType = "pc" }) {
    const CHARACTER_NAME = contents?.match(/CHARACTER_NAME=".*?"/)?.[0];
    const name = CHARACTER_NAME?.match(/CHARACTER_NAME="(.*?)"/)?.[1] || "";

    function generateQuenchTitleRecursive(quench) {
        // '__root/hero6efoundryvttv2.utils.defense_root/Resistant Protection/rPD 1'
        if (!quench.parent) {
            return quench.title.replace(/\W+/g, "");
        }
        return `${generateQuenchTitleRecursive(quench.parent)}/${quench.title.replace(/\W+/g, "")}`;
    }

    // Need to be a bit careful as we can create invalid XML if name has special characters
    const quenchName = `_Quench ${Date.now().toString()} ${name.replace(
        /\W+/g,
        " ",
    )} ${generateQuenchTitleRecursive(quench.currentTest || quench.test)}`;

    // Delete any previous leftover actors for this test
    const oldQuenchActors = game.actors.filter((a) => a.name.includes(quench.title));
    await Actor.deleteDocuments(oldQuenchActors.map((m) => m.id));

    if (is5e === undefined) {
        throw new Error("missing is5e");
    }

    // Create new actor for this test
    const actor = await Actor.create(
        {
            name: quenchName,
            type: actorType,
        },
        { is5e, quenchCreate: true },
    );

    if (contents) {
        // Is this a full actor
        if (contents.includes("CHARACTER_NAME")) {
            await actor.uploadFromXml(contents.replace(CHARACTER_NAME, `CHARACTER_NAME="${quenchName}"`), {
                quenchUpload: true,
            });
            if (actor.is5e !== is5e) {
                throw new Error(`${actor.name} has mismatched is5e`);
            }
        } // Likely item contents
        else {
            // Add item
            await actor.items.create(HeroSystem6eItem.itemDataFromXml(contents, actor));
        }
    }

    // PH: FIXME: This is done as a part of the uploadFromXml... why do we need to do it here? Is it needed only for
    // where we create via itemDataFromXml? It creates one failure which indicates incorrect code.
    await actor.fullHealth();

    return actor;
}

export async function deleteQuenchActor({ quench, actor }) {
    if (actor == null) {
        throw "missing actor";
    } else if (quench == null) {
        throw "missing quench";
    }

    // Careful undefined comparisons are tricky
    if (
        quench.tests?.find((t) => t?.state !== "passed") ||
        quench.currentTest?.state === "failed" ||
        quench.suites?.find((s) => s.tests.find((t) => t.state !== "passed")) ||
        quench.test.parent.suites?.find((s) => s.tests.find((t) => t.state === "failed")) ||
        quench.test.parent.tests?.find((t) => t.state === "failed")
    ) {
        console.error("skipping deletion of actor because tests failed");
        return;
    }

    await actor.delete();
}

export function registerGlobalSetup(quench) {
    quench.registerBatch(
        `${game.system.id}.a.global-setup`,
        (context) => {
            const { describe, it } = context;

            describe("Global Module Setup", function () {
                it("Delete '_Quench' actors", async () => {
                    await Actor.deleteDocuments(
                        game.actors.filter((a) => a.name.startsWith("_Quench")).map((o) => o.id),
                    );
                });
            });
        },
        {
            // Display name for the batch in the Quench UI.
            displayName: "Global Setup",
        },
    );
}

export function registerGlobalTeardown(quench) {
    quench.registerBatch(
        `${game.system.id}.z.global-teardown`, // Use a unique key for your module.
        (context) => {
            const { describe, it } = context;

            describe("Global Teardown", function () {
                it("Delete '_Quench' actors", async () => {
                    // The end-to-end tests create tokens, make sure they get deleted
                    const activeScene = game.scenes.active ?? game.scenes.contents?.[0];
                    if (activeScene) {
                        await activeScene.deleteEmbeddedDocuments(
                            "Token",
                            activeScene.tokens.filter((t) => t.name.startsWith("_Quench")).map((o) => o.id),
                        );
                    }

                    // Various tests create actors, make sure they get deleted
                    await Actor.deleteDocuments(
                        game.actors.filter((a) => a.name.startsWith("_Quench")).map((o) => o.id),
                    );
                });
            });
        },
        {
            // Display name for the batch in the Quench UI.
            displayName: "Global Teardown",
        },
    );
}

/**
 * Wait until a Token's canvas placeable has finished drawing.
 *
 * @param {TokenDocument} tokenDoc The token document whose placeable should be drawn.
 * @param {number} timeoutMs How long to wait before giving up.
 * @returns {Promise<Token|null>} The drawn token placeable, or whatever object is available on timeout.
 */
export async function waitForTokenDrawn(tokenDoc, timeoutMs = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const obj = tokenDoc.object ?? canvas.tokens?.get(tokenDoc.id);
        // targetArrows is created at the end of Token#_draw(), so its presence means drawing finished.
        if (obj?.targetArrows) {
            return obj;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return tokenDoc.object ?? canvas.tokens?.get(tokenDoc.id) ?? null;
}

/**
 * Waits for a specific DOM element to render within a Foundry chat card message.
 * Prioritizes thread-safe performance by cleaning up background tasks immediately upon settling.
 *
 * @param {string} elementSelector - The CSS selector string to query (e.g., ".apply-adjustment-card").
 * @param {number} [timeoutMs=1000] - Hard fallback constraint before intentional rejection.
 * @returns {Promise<Object>} Resolves to an object containing the chat message document and the found DOM node.
 */
export async function waitForElementInChat(elementSelector, timeoutMs = 1000) {
    let messageHookId = null;
    let executionTimerId = null;

    // Clear any existing chat rendering backlog to protect Quench execution time limits
    const isQueueActive = () => {
        const queueLength = ui.chat._renderQueue?.length || ui.chat._pending?.length || ui.chat._batch?.length || 0;
        return queueLength > 0;
    };

    let counter = 500; // 500 * 10ms = 5 seconds maximum backlog buffer clearance
    while (isQueueActive() && counter-- > 0) {
        await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Unified Race Pipeline
    return Promise.race([
        // Pipeline Branch A: Monitored DOM paint tracking
        new Promise((resolve) => {
            messageHookId = Hooks.on("renderChatMessageHTML", (chatMessage, cardHtmlElement) => {
                const foundElement = cardHtmlElement.querySelector(elementSelector);

                if (foundElement) {
                    // Clean up the companion timeout task and the hook listener immediately on success
                    if (executionTimerId) clearTimeout(executionTimerId);
                    Hooks.off("renderChatMessageHTML", messageHookId);

                    // Yield execution thread frames to guarantee the browser has drawn the layout
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            resolve({ chatMessage, foundElement });
                        });
                    });
                }
            });
        }),

        // Pipeline Branch B: Fallback execution safety net
        new Promise((_, reject) => {
            executionTimerId = setTimeout(() => {
                // CRITICAL PROTECTION: Cleanly prune the listener if the timeout races first
                Hooks.off("renderChatMessageHTML", messageHookId);
                reject(new Error(`Timeout: Target element "${elementSelector}" did not render within ${timeoutMs}ms.`));
            }, timeoutMs);
        }),
    ]);
}

/**
 * The default timeout tends to be insufficient with multiple actors being created at the same time.
 * @param {*} quench
 */
export function setQuenchTimeout(quench) {
    quench.timeout(20000);
}
