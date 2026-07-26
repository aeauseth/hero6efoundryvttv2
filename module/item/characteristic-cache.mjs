/**
 * Recalculates and caches ruleset baselines and figured dependencies for an actor's characteristics.
 * Operates purely on database mutations to keep world loads fast.
 * @param {Actor} actor - The target actor instance to evaluate
 * @param {object} [changedData] - Optional update tracking object to pinpoint specific modifications
 * @returns {Promise<void>} Direct database mutation transaction execution
 */
export async function refreshActorCharacteristicCache(actor, changedData = {}) {
    if (!actor) return;
    const itemUpdates = [];
    const charItems = actor.items.filter((i) => i.type === "characteristic");

    for (const item of charItems) {
        const updatePayload = { _id: item.id };
        let needsUpdate = false;

        // A. Sync Dynamic Rulebook Baselines from config.mjs helpers
        const charConfig = CONFIG.HERO.characteristics?.[item.system.XMLID];
        const calculatedBase = typeof charConfig?.base === "function" ? charConfig.base(actor) : 10;

        if (item.system.rulebookBase !== calculatedBase) {
            updatePayload["system.rulebookBase"] = calculatedBase;
            needsUpdate = true;
        }

        // B. Sync 5e Figured Matrix Dependencies (e.g., DEX / 3 modifying DCV)
        if (actor.system.is5e && item.system.XMLID === "DCV") {
            const dexItem = charItems.find((i) => i.system.XMLID === "DEX");

            // Read directly from updateData if an active edit is mid-flight, otherwise fall back to cache
            const dexLevels =
                changedData.id === dexItem?.id && changedData["system.LEVELS"] !== undefined
                    ? parseInt(changedData["system.LEVELS"]) || 0
                    : parseInt(dexItem?.system.LEVELS) || 0;

            const dexBase = dexItem?.system.rulebookBase ?? 10;
            const calculatedFigured = Math.floor((dexBase + dexLevels) / 3);

            if (item.system.figuredModifiers !== calculatedFigured) {
                updatePayload["system.figuredModifiers"] = calculatedFigured;
                needsUpdate = true;
            }
        }

        if (needsUpdate) itemUpdates.push(updatePayload);
    }

    // Commit all adjustments to the database cache in a single transaction pass
    if (itemUpdates.length > 0) {
        await actor.updateEmbeddedDocuments("Item", itemUpdates);
    }
}

/**
 * Bootstraps and registers all database cache event hooks.
 * Call this inside your main system entry point (e.g., Hooks.once("init")).
 */
export function initializeCharacteristicCache() {
    // A. Refresh the cache when a fresh characteristic item is dropped or imported onto a sheet
    Hooks.on("createItem", async (item, options, userId) => {
        if (game.user.id !== userId || item.type !== "characteristic" || !item.parent) return;
        await refreshActorCharacteristicCache(item.parent);
    });

    // B. Refresh the cache instantly when a user edits characteristic LEVELS
    Hooks.on("updateItem", async (item, updateData, options, userId) => {
        if (game.user.id !== userId || item.type !== "characteristic" || !item.parent) return;
        if (foundry.utils.hasProperty(updateData, "system.LEVELS")) {
            await refreshActorCharacteristicCache(item.parent, { id: item.id, ...updateData });
        }
    });

    // C. Refresh the cache across all items if the top-level Actor type or ruleset flags transition
    Hooks.on("updateActor", async (actor, updateData, options, userId) => {
        if (game.user.id !== userId) return;
        if (updateData.type || foundry.utils.hasProperty(updateData, "system.is5e")) {
            await refreshActorCharacteristicCache(actor);
        }
    });
}
