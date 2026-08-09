import { endHaymakerManeuver } from "../item/maneuver.mjs";

/**
 * Chat-card machinery for delayed attacks (Haymaker landings, Extra Time
 * resolutions): resolving the stored declaration back into an item, gating who
 * may act on it, consuming the card, and wiring its roll/fail buttons.
 * Registered as its own renderChatMessageHTML hook via side-effect import.
 */

/**
 * Resolves the item a delayed-attack chat payload refers to: the (usually
 * temporary) declared uuid, the original DB item, or the dehydrated snapshot.
 * @param {object} payload - The message's delayedAttack flag
 * @returns {Promise<Item|null>}
 */
async function resolveDelayedAttackItem(payload) {
    // The snapshot comes FIRST: the declared item is usually a temporary
    // effective clone (pushed CP, effective STR, HTH add-ons…) whose uuid never
    // resolves later, and the raw DB item would drop all of that state
    let item = null;
    if (payload.itemJson) {
        const owner = payload.actorUuid ? fromUuidSync(payload.actorUuid) : null;
        try {
            // TODO(post-alpha): remove — cards from builds before a898f687 double-stringified the snapshot
            let itemJsonStr = payload.itemJson;
            const parsed = JSON.parse(itemJsonStr);
            if (typeof parsed === "string") itemJsonStr = parsed;
            const { rehydrateAttackItem } = await import("../item/item-attack.mjs");
            item = rehydrateAttackItem(itemJsonStr, owner)?.item ?? null;
        } catch (e) {
            console.error(`Unable to rehydrate the delayed attack item`, e);
        }
    }
    item ??= payload.itemUuid ? fromUuidSync(payload.itemUuid) : null;
    item ??= payload.originalItemUuid ? fromUuidSync(payload.originalItemUuid) : null;
    return item;
}

/**
 * Whether the current user may act on a delayed-attack payload's item.
 * @param {Item} item
 * @param {object} payload
 * @returns {boolean}
 */
function canActOnDelayedAttack(item, payload) {
    const owningActor = item.actor ?? (payload.actorUuid ? fromUuidSync(payload.actorUuid) : null);
    return !!(item.isOwner || owningActor?.isOwner || game.user.isGM);
}

/**
 * Marks a landing card consumed so its roll/fail buttons can't fire twice
 * (players can't update the GM-authored message, so they relay).
 * @param {ChatMessage} message
 */
async function markDelayedCardResolved(message) {
    if (game.user.isGM) {
        await message.setFlag(game.system.id, "delayedAttack.resolved", true);
    } else {
        game.socket.emit(`system.${game.system.id}`, {
            operation: "markDelayedCardResolved",
            userId: game.user.id,
            messageId: message.id,
        });
    }
}

/**
 * Shared prologue of the roll/fail button handlers: fetch the payload, refuse
 * consumed cards, resolve the declared item, and gate on ownership — with the
 * button disabled for the duration.
 * @param {ChatMessage} app - The rendered message
 * @param {HTMLButtonElement} button
 * @param {(item: Item, payload: object) => Promise<unknown>} handler
 * @param {object} [options]
 * @param {string} [options.notPermittedWarning] - Ownership-gate warning; the roll/fail cards phrase it differently
 */
async function withDelayedAttackPayload(app, button, handler, { notPermittedWarning } = {}) {
    button.disabled = true;
    try {
        const payload = app.getFlag(game.system.id, "delayedAttack");
        if (!payload) return ui.notifications.error(`Attack details are no longer available.`);
        if (payload.resolved) return ui.notifications.warn(`This attack has already been resolved.`);
        const item = await resolveDelayedAttackItem(payload);
        if (!item) return ui.notifications.error(`Attack details are no longer available.`);
        if (!canActOnDelayedAttack(item, payload)) {
            return ui.notifications.warn(notPermittedWarning ?? `Only the attacker (or GM) can resolve this attack.`);
        }
        return await handler(item, payload);
    } finally {
        button.disabled = false;
    }
}

Hooks.on("renderChatMessageHTML", (app, html) => {
    // A consumed landing card greys its buttons rather than hard-disabling
    // them; a click still explains that the attack already resolved
    if (app.getFlag?.(game.system.id, "delayedAttack")?.resolved) {
        html.querySelectorAll("button.hero-delayed-roll, button.hero-delayed-fail").forEach((button) => {
            button.classList.add("hero-delayed-spent");
        });
    }

    // Failed Haymaker: the Phase is wasted but the END is still owed —
    // charge the attack's resources without rolling anything
    html.querySelectorAll("button.hero-delayed-fail").forEach((button) => {
        button.addEventListener("click", async (event) => {
            event.preventDefault();
            await withDelayedAttackPayload(
                app,
                button,
                async (item, payload) => {
                    const { userInteractiveVerifyOptionallyPromptThenSpendResources } =
                        await import("../item/item-resources.mjs");
                    const { error, resourcesUsedDescription, resourcesUsedDescriptionRenderedRoll } =
                        await userInteractiveVerifyOptionallyPromptThenSpendResources(item, payload.formData ?? {});
                    if (error) return ui.notifications.error(`${item.name} ${error}`);
                    // Consume the card only once the spend has gone through — marking
                    // first left a cancelled prompt with a dead card and no resolution
                    await markDelayedCardResolved(app);
                    const actor = item.actor ?? (payload.actorUuid ? fromUuidSync(payload.actorUuid) : null);
                    // The Haymaker is over: the roll path's tail would end the maneuver
                    // after the attack rolls, but nothing rolls here — tear it down now
                    // or the -5 DCV persists and the next attack gets re-intercepted
                    await endHaymakerManeuver(actor);
                    await ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({ actor }),
                        content: `${actor?.name}'s Haymaker fails — the Phase is wasted${
                            resourcesUsedDescription
                                ? `, and ${resourcesUsedDescription} is spent anyway${resourcesUsedDescriptionRenderedRoll ?? ""}`
                                : ""
                        }.`,
                    });
                },
                { notPermittedWarning: `Only the attacker (or GM) can resolve this attack.` },
            );
        });
    });

    // Delayed Extra Time attack: the roll happens when the power goes off. The
    // stored declaration (dialog inputs + targets) rides on the message flag.
    html.querySelectorAll("button.hero-delayed-roll").forEach((button) => {
        button.addEventListener("click", async (event) => {
            event.preventDefault();
            await withDelayedAttackPayload(
                app,
                button,
                async (item, payload) => {
                    const { processActionToHit } = await import("../item/item-attack.mjs");
                    // Restore the declaration's targets for the rolling user
                    if (payload.targetTokenIds?.length) {
                        canvas.tokens.setTargets(payload.targetTokenIds);
                    }
                    await processActionToHit(
                        item,
                        // prepaid (Extra Time): resources/rolls were paid at declaration.
                        // A Haymaker instead pays its END with THIS roll.
                        {
                            ...(payload.formData ?? {}),
                            userId: game.user.id,
                            delayedResolution: true,
                            ...(payload.prepaid ? { prepaid: true, noResourceUse: true } : {}),
                        },
                        { delayedResolution: true },
                    );
                    // Consume the card only after the roll pipeline ran — marking first
                    // left a thrown/cancelled roll with a dead card and a paid, unrollable attack
                    await markDelayedCardResolved(app);
                },
                { notPermittedWarning: `Only the attacker (or GM) rolls this attack.` },
            );
        });
    });
});
