import { HeroProgressBar } from "./utility/progress-bar.mjs";
import { CreateHeroCompendiums } from "./heroCompendiums.mjs";

function getAllActorsInGame() {
    return [
        ...game.actors.contents,
        ...game.scenes.contents
            .map((scene) => [...scene.tokens.map((t) => t.actor)])
            .flat()
            .filter((a) => a),
    ];
}

async function willNotMigrate(lastMigration) {
    // We no longer support migration of things which are too old so that migration doesn't become too complicated.
    // If anything is too old (based on the elements it supports) then we won't update anything. That list is:
    // - Last migrated version is before 3.0.76 which is the last version that had custom migration methods
    if (!foundry.utils.isNewerVersion(lastMigration, "3.0.75")) {
        const message = `<strong>FATAL ERROR</strong><br>The compendia, actors, and items in this world were were created with an older ${game.system.title || game.system.name} version that is no longer supported for automatic migration. Please re-upload everything from HDC or migrate through one, or more, supported versions (3.0.76 - 4.0.5) before upgrading to ${game.system.version}.`;

        const chatData = {
            author: game.user._id,
            style: CONST.CHAT_MESSAGE_STYLES.OTHER,
            content: message,
        };

        await Promise.all([ChatMessage.create(chatData), ui.notifications.error(message)]);

        return true;
    }

    return false;
}

/**
 * Run asyncFn against all elements of the provided queue if:
 *  * a lastMigration isn't provided or if
 *  * the lastMigration < migratesToVersion
 *
 * @param {string} migratesToVersion
 * @param {string} lastMigration
 * @param {Array<Object>} queue
 * @param {string} queueType
 * @param {async fn(queueElement)} asyncFn
 */
async function migrateToVersion(migratesToVersion, lastMigration, queue, queueType, asyncFn) {
    if (!lastMigration || foundry.utils.isNewerVersion(migratesToVersion, lastMigration)) {
        const originalTotal = queue.length;
        const migrationProgressBar = new HeroProgressBar(
            `Migrating ${originalTotal} ${queueType} to ${migratesToVersion}`,
            originalTotal + 1,
        );

        while (queue.length > 0) {
            const queueElement = queue.pop();

            migrationProgressBar.advance(
                `Migrating ${queueType} ${originalTotal - queue.length} of ${originalTotal} to ${migratesToVersion}`,
            );

            try {
                await asyncFn(queueElement);
            } catch (error) {
                console.error(
                    `Exception executing migration (${migratesToVersion}) function ${asyncFn.name} with queue (${queue.length}): `,
                    error,
                    queueElement,
                );
            }
        }

        migrationProgressBar.close(`Done migrating ${originalTotal} ${queueType} to ${migratesToVersion}`);
    }
}

export async function migrateWorld() {
    const lastMigration = game.settings.get(game.system.id, "lastMigration");

    // NOTE: If there has never been a migration then the lastMigration is "1.0.0". We don't need to give a warning in this case
    // as we know that this system was not around then.
    // Newly created worlds have a lastMigration === "1.0.0" and we should CreateHeroCompendiums
    if (lastMigration === "1.0.0") {
        await CreateHeroCompendiums();
        return;
    }

    if (await willNotMigrate(lastMigration)) return;

    // Chat Card for GM about new version
    const content = `Version ${
        game.system.version
    } of <a href="https://github.com/dmdorman/hero6e-foundryvtt/blob/main/README.md">${
        game.system.title || game.system.name
    }</a> has been installed. Details about recent changes can be viewed at <a href="https://github.com/dmdorman/hero6e-foundryvtt/blob/main/CHANGELOG.md">CHANGELOG</a>.<br><br>If you find any problems, are missing things, or just would like a feature that is lacking, please report these <a href="https://github.com/dmdorman/hero6e-foundryvtt/issues">HERE</a>.<br><br>Check out our <a href="https://www.youtube.com/channel/UCcmq0WFFNZNhRSGwuEHOgRg">YouTube channel</a>.  There is also a <a href="https://discord.com/channels/609528652878839828/770825017729482772">Discord channel</a> where you can interactively communicate with others using <a href="https://github.com/dmdorman/hero6e-foundryvtt/blob/main/README.md">${
        game.system.title || game.system.name
    }</a>.`;
    const chatData = {
        author: game.user._id,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        content: content,
    };
    await ChatMessage.create(chatData);

    // Create or recreate Compendiums
    await CreateHeroCompendiums();

    // Migrate maneuvers for all things that have strength (PC, NPC) but ignore Vehicles and automatons since we don't give them free stuff at this point.
    let _start = Date.now();
    await migrateToVersion(
        "4.0.14",
        lastMigration,
        getAllActorsInGame(),
        "rebuilding all built in maneuvers for PC and NPCs",
        async (actor) => await replaceActorsBuiltInManeuvers(actor),
    );
    console.log(`%c Took ${Date.now() - _start}ms to migrate to version 4.0.14`, "background: #1111FF; color: #FFFFFF");

    await migrateToVersion(
        "4.0.15",
        lastMigration,
        getAllActorsInGame().filter((actor) => actor.type === "automaton"),
        "adding freebees for Automatons",
        async (actor) => await addManeuversForAutomaton(actor),
    );
    console.log(`%c Took ${Date.now() - _start}ms to migrate to version 4.0.15`, "background: #1111FF; color: #FFFFFF");

    await migrateToVersion(
        "4.0.16",
        lastMigration,
        getAllActorsInGame().filter(
            (actor) => actor.system.is5e && (actor.type === "automaton" || actor.type === "pc" || actor.type === "npc"),
        ),
        "adding other attacks for 5e automaton, pc, and npc",
        async (actor) => await addOtherAttacksManeuversForAutomatonPcNpc(actor),
    );
    console.log(`%c Took ${Date.now() - _start}ms to migrate to version 4.0.16`, "background: #1111FF; color: #FFFFFF");

    await migrateToVersion(
        "4.0.26",
        lastMigration,
        getAllActorsInGame(),
        "removing STR placeholder",
        async (actor) => await removeStrengthPlaceholderAndCreateActivePropertyAndRemoveHeroicProperty(actor),
    );
    console.log(`%c Took ${Date.now() - _start}ms to migrate to version 4.0.26`, "background: #1111FF; color: #FFFFFF");

    await migrateToVersion(
        "4.1.0",
        lastMigration,
        getAllActorsInGame(),
        "flag scopes",
        async (actor) => await flagScopes(actor),
    );
    console.log(`%c Took ${Date.now() - _start}ms to migrate to version 4.1.0`, "background: #1111FF; color: #FFFFFF");

    await migrateToVersion(
        "4.1.13",
        lastMigration,
        getAllActorsInGame(),
        "remove placeholder weapon item",
        async (actor) => await removePlaceholderWeaponItem(actor),
    );
    console.log(`%c Took ${Date.now() - _start}ms to migrate to version 4.1.13`, "background: #1111FF; color: #FFFFFF");

    await migrateToVersion(
        "4.2.0",
        lastMigration,
        getAllActorsInGame(),
        "Coerce is5e===undefined to boolean value",
        async (actor) => await migrateTo4_2_0(actor),
    );
    console.log(`%c Took ${Date.now() - _start}ms to migrate to version 4.1.18`, "background: #1111FF; color: #FFFFFF");

    // Always rebuild the database for all actors by recreating actors and all their items (description, cost, etc)
    _start = Date.now();
    await migrateToVersion(
        game.system.version,
        undefined,
        getAllActorsInGame(),
        "rebuilding actors and their items",
        async (actor) => await rebuildActors(actor),
    );
    console.log(`%c Took ${Date.now() - _start}ms to migrate to latest version`, "background: #1111FF; color: #FFFFFF");

    await ui.notifications.info(`Migration complete to ${game.system.version}`);
}

async function migrateTo4_2_0(actor) {
    try {
        await coerceIs5eToBoolean(actor);
        await addPerceptionXmlTag(actor);
    } catch (e) {
        console.error(e);
    }
}

async function addPerceptionXmlTag(actor) {
    const perception = actor.items.find((i) => i.system.XMLID === "PERCEPTION" && i.system.xmlTag !== "SKILL");
    if (perception) {
        await perception.update({ "system.xmlTag": "SKILL" });
    }
    return;
}

// https://github.com/dmdorman/hero6e-foundryvtt/issues/2812
async function coerceIs5eToBoolean(actor) {
    if (!actor.system.is5e && actor.system.is5e !== false) {
        await actor.update({ "system.is5e": false });
    }

    const itemUpdates = [];
    for (const item of actor.items.filter((i) => !i.system.is5e && i.system.is5e !== false)) {
        if (!item.baseInfo) {
            if (["maneuver", "attack"].includes(item.type)) {
                console.error(
                    `${actor.name}/${item.detailedName()} deleting invalid ${actor.system.is5e ? "5e" : "6e"} ${item.type}`,
                );
                await item.delete();
                continue;
            }
            console.error(`${actor.name}/${item.detailedName()} has no baseInfo`);
        }
        itemUpdates.push({ _id: item.id, "system.is5e": actor.system.is5e });
    }

    if (itemUpdates.length > 0) {
        await actor.updateEmbeddedDocuments("Item", itemUpdates);
    }
}

// We no longer need __InternalManeuverPlaceholderWeapon as we now have effective attack items. Delete
// it from all actors.
async function removePlaceholderWeaponItem(actor) {
    return actor?.items.find((item) => item.name === "__InternalManeuverPlaceholderWeapon")?.delete();
}

// V13 requires scopes on all flags. Scoped flags work just fine in V12.
// While not absolutely necessasry, we will move all unscoped flags
// into the game.system.id (typically 'hero6efoundryvttv2') scope so any ongoing effects/statuses/movementState/etc don't get lost.
async function flagScopes(actor) {
    try {
        if (!actor) return false;

        const actorUpdates = [];
        for (const prop of Object.keys(actor.flags).filter((f) => f !== game.system.id)) {
            actorUpdates[`flags.-=${prop}`] = null;
            actorUpdates[`flags.${game.system.id}.${prop}`] = actor.flags[prop];
        }
        if (actorUpdates.length > 0) {
            await actor.update(actorUpdates);
        }

        const itemUpdates = [];
        for (const item of actor.items.filter((i) => Object.keys(i.flags).length > 0)) {
            for (const prop of Object.keys(item.flags).filter((f) => f !== game.system.id)) {
                itemUpdates[`flags.-=${prop}`] = null;
                itemUpdates[`flags.${game.system.id}.${prop}`] = item.flags[prop];
            }
        }
        if (itemUpdates.length > 0) {
            await actor.updateEmbeddedDocuments("Item", itemUpdates);
        }

        const effectUpdates = [];
        for (const effect of actor.effects.filter((i) => Object.keys(i.flags).length > 0)) {
            for (const prop of Object.keys(effect.flags).filter((f) => f !== game.system.id)) {
                effectUpdates[`flags.-=${prop}`] = null;
                effectUpdates[`flags.${game.system.id}.${prop}`] = effect.flags[prop];
            }
        }
        if (effectUpdates.length > 0) {
            await actor.updateEmbeddedDocuments("ActiveEffect", effectUpdates);
        }

        // NOTE: we are not upgrading combat & combatants (see warning in 4.1.0 changelog)
    } catch (e) {
        console.error(e);
    }
}

async function removeStrengthPlaceholderAndCreateActivePropertyAndRemoveHeroicProperty(actor) {
    try {
        if (!actor) return false;

        // Remove the isHeroic property as it is now calculated on the fly
        await actor.update({ "system.-=isHeroic": null });

        // Delete strength placeholder as we need many of them so will be creating them on the fly.
        await actor.items.find((item) => item.system.ALIAS === "__InternalStrengthPlaceholder")?.delete();

        // Create the _active object for all items
        const updates = actor.items
            .map((item) => {
                if (!item.system._active) {
                    return { _id: item._id, "system._active": {} };
                }

                return undefined;
            })
            .filter(Boolean);

        await actor.updateEmbeddedDocuments("Item", updates);
    } catch (e) {
        const msg = `Migration of actors to 4.0.26 failed for ${actor?.name}. Please report.`;
        console.error(msg, e);
        if (game.user.isGM && game.settings.get(game.system.id, "alphaTesting")) {
            await ui.notifications.warn(msg);
        }
    }
}

async function replaceActorsBuiltInManeuvers(actor) {
    try {
        if (!actor) return false;

        const timer = {};

        // Remove all built in maneuvers
        timer.deleteStart = Date.now();
        await actor.deleteEmbeddedDocuments(
            "Item",
            actor.items.filter((power) => power.type?.includes("maneuver")).map((o) => o.id),
        );
        timer.deleteEnd = Date.now();

        if (actor.type !== "pc" && actor.type !== "npc") {
            return;
        }

        // Add in all built in maneuvers
        timer.maneuversStart = Date.now();
        await actor.addHeroSystemManeuvers();
        timer.maneuversEnd = Date.now();
    } catch (e) {
        const msg = `Migration of maneuvers to 4.0.14 failed for ${actor?.name}. Please report.`;
        console.error(msg, e);
        if (game.user.isGM && game.settings.get(game.system.id, "alphaTesting")) {
            await ui.notifications.warn(msg);
        }
    }
}

/**
 * Automatons had maneuvers stripped out in 4.0.14's migration. Add them back in.
 * @param {*} actor
 * @returns
 */
async function addManeuversForAutomaton(actor) {
    try {
        if (!actor) return false;

        // Delete perception if it has it so that we can start with a blank slate.
        await actor.items.find((item) => item.system.XMLID === "PERCEPTION")?.delete();

        // Add perception and maneuvers
        await actor.addFreeStuff();
    } catch (e) {
        const msg = `Adding freebees to Automaton in 4.0.15 failed for ${actor?.name}. Please report.`;
        console.error(msg, e);
        if (game.user.isGM && game.settings.get(game.system.id, "alphaTesting")) {
            await ui.notifications.warn(msg);
        }
    }
}

/**
 * 5e Automatons, NPCs, and PCs were missing the OTHERATTACKS maneuver accidentally.
 * @param {*} actor
 * @returns
 */
async function addOtherAttacksManeuversForAutomatonPcNpc(actor) {
    try {
        if (!actor) return false;

        // If doesn't already have this maneuver
        const alreadyHasOtherAttacksManeuver = actor.items.find((item) => item.system.XMLID === "OTHERATTACKS");
        if (alreadyHasOtherAttacksManeuver) {
            return false;
        }

        // Add the maneuver
        const otherAttacksManeuver = CONFIG.HERO.powers5e.find((power) => power.key === "OTHERATTACKS");
        await actor.addManeuver(otherAttacksManeuver);
    } catch (e) {
        const msg = `Adding OTHERATTACKS in 4.0.16 failed for ${actor?.name}. Please report.`;
        console.error(msg, e);
        if (game.user.isGM && game.settings.get(game.system.id, "alphaTesting")) {
            await ui.notifications.warn(msg);
        }
    }
}

async function rebuildActors(actor) {
    try {
        if (!actor) return false;

        // Rebuild all item data
        for (const item of actor.items) {
            await item._postUpload();
        }

        await actor._postUpload();
    } catch (e) {
        const msg = `Migration failed for ${actor?.name}. Recommend re-uploading from HDC.`;
        console.error(msg, e);
        if (game.user.isGM && game.settings.get(game.system.id, "alphaTesting")) {
            await ui.notifications.warn(msg);
        }
    }
}
