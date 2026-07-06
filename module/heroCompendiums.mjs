import { HEROSYS } from "./herosystem6e.mjs";

// v13 has namespaced these. Remove when support is no longer provided. Also remove from eslint template.
const FoundryVttCompendiumCollection = foundry.documents?.collections?.CompendiumCollection || CompendiumCollection;

export async function CreateHeroCompendiums() {
    if (!game.user.isGM) return;

    try {
        await CreateHeroItems();
        await CreateHeroMacros();
    } catch (e) {
        console.error(e);
    }
}

async function createItem(itemDataArray, packId) {
    try {
        await Item.createDocuments(itemDataArray, {
            pack: packId,
        });
    } catch (e) {
        console.error(e);
    }
}

async function CreateHeroMacros() {
    const label = "HeroMacro";
    const metadata = { label: label, name: label.slugify({ strict: true }), type: "Macro" };

    // Delete compendium and re-create it.
    let pack = game.packs.get(`world.${metadata.name}`);
    if (pack) {
        await pack.configure({ locked: false });
        await pack.deleteCompendium();
    }
    pack = await FoundryVttCompendiumCollection.createCompendium(metadata);

    // V13 seems to default new compendiums to locked
    if (pack.locked) {
        await pack.configure({ locked: false });
    }

    const macroItemsArray = [];

    macroItemsArray.push({
        img: "icons/svg/regen.svg",
        name: "Full Health all owned tokens in scene",
        type: "script",
        command: `
        const confirmed = await foundry.applications.api.DialogV2.confirm({
  window: { title: "Full Health" },
  content: '<p>You are about to heal ' + game.scenes.current.tokens.filter(o=>o.isOwner).length + ' tokens in this scene. This is the same as clicking "Full Health" on each actor sheet. This includes setting all characteristics to max, removing status effects and removing temporary effects.  Do you want to continue?</p>',
});
if (confirmed) {
  for(const token of game.scenes.current.tokens.filter(o=>o.isOwner)) {
    console.log(token);
    token.actor?.fullHealth();
  }
}
        `,
        flags: {
            [`${game.system.id}.versionHeroSystem6eManuallyCreated`]: game.system.version,
        },
    });

    macroItemsArray.push({
        img: "icons/tools/scribal/magnifying-glass.webp",
        name: "Pan canvas to last Actor opened",
        type: "script",
        command: `const user_token = window.actor.getActiveTokens()[0];
if(user_token)
{
  canvas.animatePan({ x : user_token.x, y : user_token.y, scale:1});
  canvas.ping(user_token.center);
}
        `,
        flags: {
            [`${game.system.id}.versionHeroSystem6eManuallyCreated`]: game.system.version,
        },
    });

    await Macro.createDocuments(macroItemsArray, {
        pack: pack.metadata.id,
    });

    // Lock Compendium
    await pack.configure({ locked: true });
}

async function CreateHeroItems() {
    const label = "HeroItems";
    const metadata = { label: label, name: label.slugify({ strict: true }), type: "Item" };

    // Delete compendium and re-create it.
    let pack = game.packs.get(`world.${metadata.name}`);
    if (pack) {
        await pack.configure({ locked: false });
        await pack.deleteCompendium();
    }
    pack = await FoundryVttCompendiumCollection.createCompendium(metadata);

    if (pack.locked) {
        await pack.configure({ locked: false });
    }

    // 5e vs 6e
    const DefaultEdition = game.settings.get(HEROSYS.module, "DefaultEdition");
    const powers = DefaultEdition === "five" ? CONFIG.HERO.powers5e : CONFIG.HERO.powers6e;
    const bogusActor = {
        system: { is5e: DefaultEdition === "five" ? true : false },
    };

    // POWERS
    const folderPower = await Folder.createDocuments(
        [{ name: "Powers", type: "Item", color: CONFIG.HERO.folderColors["Powers"] }],
        {
            pack: pack.metadata.id,
        },
    );

    const folderPowerCharacteristic = await Folder.createDocuments(
        [
            {
                name: "Characteristics",
                type: "Item",
                color: CONFIG.HERO.folderColors["Characteristics"],
                folder: folderPower[0].id,
            },
        ],
        {
            pack: pack.metadata.id,
        },
    );

    const folderPowerPerk = await Folder.createDocuments(
        [
            {
                name: "Perks",
                type: "Item",
                color: CONFIG.HERO.folderColors["Powers.Perks"],
                folder: folderPower[0].id,
            },
        ],
        {
            pack: pack.metadata.id,
        },
    );

    const folderPowerSkill = await Folder.createDocuments(
        [
            {
                name: "Skills",
                type: "Item",
                color: CONFIG.HERO.folderColors["Powers.Skill"],
                folder: folderPower[0].id,
            },
        ],
        {
            pack: pack.metadata.id,
        },
    );

    const folderPowerTalent = await Folder.createDocuments(
        [
            {
                name: "Talents",
                type: "Item",
                color: CONFIG.HERO.folderColors["Powers.Talents"],
                folder: folderPower[0].id,
            },
        ],
        {
            pack: pack.metadata.id,
        },
    );

    const itemDataArray = [];

    for (const power of powers.filter(
        (o) =>
            o.type != undefined &&
            !o.type.includes("martial") &&
            !o.type.includes("enhancer") &&
            !o.type.includes("disadvantage") &&
            !o.behaviors.includes("modifier") &&
            !o.behaviors.includes("adder") &&
            o.xml &&
            !o.key.startsWith("__"),
    )) {
        const itemData = HeroSystem6eItem.itemDataFromXml(power.xml, bogusActor);
        itemData.system.versionHeroSystem6eManuallyCreated = game.system.version;
        //console.log(power, itemData, bogusActor);
        if (power.type.includes("characteristic")) {
            itemData.folder = folderPowerCharacteristic[0].id;
        } else if (power.type.includes("perk")) {
            itemData.folder = folderPowerPerk[0].id;
        } else if (power.type.includes("skill")) {
            itemData.folder = folderPowerSkill[0].id;
        } else if (power.type.includes("talent")) {
            itemData.folder = folderPowerTalent[0].id;
        } else if (itemData.system.XMLID !== "LIST") {
            itemData.folder = folderPower[0].id;
        }
        // LIST will not be in a folder (to match SEPARATOR below)

        itemDataArray.push(itemData);
    }

    // SEPARATOR is a LIST with no name
    const seperatorItemData = HeroSystem6eItem.itemDataFromXml(powers.find((p) => p.key === "LIST")?.xml, bogusActor);
    if (seperatorItemData.name) {
        seperatorItemData.name = "Separator";
        seperatorItemData.system.ALIAS = "";
        seperatorItemData.system.NAME = "";
        itemDataArray.push(seperatorItemData);
    } else {
        console.error(`Failed to create separator item`);
    }

    //////////////////////////////////////////////////////////////////////////////
    // PERKS
    const folderPerk = await Folder.createDocuments(
        [{ name: "Perks", type: "Item", color: CONFIG.HERO.folderColors["Perks"] }],
        {
            pack: pack.metadata.id,
        },
    );

    for (const power of powers.filter((o) => o.type?.includes("perk") && o.xml)) {
        // Only include powers where XML is defined
        const itemData = HeroSystem6eItem.itemDataFromXml(power.xml, bogusActor);
        itemData.system.versionHeroSystem6eManuallyCreated = game.system.version;
        itemData.folder = folderPerk[0].id;
        itemDataArray.push(itemData);
    }

    //////////////////////////////////////////////////////////////////////////////
    // SKILLS
    const folderSkill = await Folder.createDocuments(
        [{ name: "Skills", type: "Item", color: CONFIG.HERO.folderColors["Skills"] }],
        {
            pack: pack.metadata.id,
        },
    );

    for (const power of powers.filter((o) => o.type?.includes("skill") && o.xml)) {
        // Only include powers where XML is defined
        const itemData = HeroSystem6eItem.itemDataFromXml(power.xml, bogusActor);
        itemData.system.versionHeroSystem6eManuallyCreated = game.system.version;
        itemData.folder = folderSkill[0].id;
        itemDataArray.push(itemData);
    }

    //////////////////////////////////////////////////////////////////////////////
    // TALENT
    const folderTalent = await Folder.createDocuments(
        [{ name: "Talents", type: "Item", color: CONFIG.HERO.folderColors["Talents"] }],
        {
            pack: pack.metadata.id,
        },
    );

    for (const power of powers.filter((o) => o.type?.includes("talent") && o.xml)) {
        // Only include powers where XML is defined
        const itemData = HeroSystem6eItem.itemDataFromXml(power.xml, bogusActor);
        itemData.system.versionHeroSystem6eManuallyCreated = game.system.version;
        itemData.folder = folderTalent[0].id;
        itemDataArray.push(itemData);
    }

    // Compendium should be unlocked, but for some reason it may not be
    if (pack.locked) {
        console.error(`${pack.name} compendium was unexpectedly locked`);
        await pack.configure({ locked: false });
    }

    // Create the array of items in the compendium
    try {
        await createItem(itemDataArray, pack.metadata.id);
    } catch (e) {
        console.error(e);
    }

    // Lock Compendium
    await pack.configure({ locked: true });
}
