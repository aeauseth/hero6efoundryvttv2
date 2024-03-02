import { HeroSystem6eActor } from "../actor/actor.js";
import { HeroSystem6eItem } from "../item/item.js";
import { getPowerInfo } from "../utility/util.js";

export async function UpdateCompendiumFromSource() {
    console.log("UpdateCompendiumFromSource");

    try {
        const compendium = game.packs.get(game.system.id + ".powers-6e");
        if (compendium.locked) return;

        // We are going to load compendium6e.hdc
        // which has every possible power, skill, etc
        // Use these XML fragments to create items in the compendium.

        const response = await fetch(
            "/systems/hero6efoundryvttv2/tools/compendium6e.hdc",
        );
        if (!response.ok) {
            console.error(response);
            return;
        }

        const buffer = await response.arrayBuffer();
        const text = new TextDecoder("UTF-16BE").decode(buffer);

        //const text = await response.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, "text/xml");

        // Convert XML into JSON
        const heroJson = {};
        HeroSystem6eActor._xmlToJsonNode(heroJson, xml.children);

        // REF: https://discord.com/channels/732325252788387980/754127569246355477/862517136390750218

        // Delete all items in the compendium
        const index = await compendium.getIndex(); //get all documents in the pack
        await HeroSystem6eItem.deleteDocuments(
            index.map((o) => o._id),
            {
                pack: compendium.collection,
            },
        );

        // Loop thru all the powers
        for (const itemTag of HeroSystem6eItem.ItemXmlTags) {
            if (heroJson.CHARACTER[itemTag]) {
                for (let system of heroJson.CHARACTER[itemTag]) {
                    const configPowerInfo = getPowerInfo({
                        xmlid: system.XMLID,
                    });

                    const itemData = {
                        ...system,
                    };

                    // Some of the XML properties are unique to Hero Designer and are not needed.
                    // They likely don't cause any issues. Saving space by removing?
                    // We should ensure things like ID are cleared upon drag/drop operation anyway.
                    delete itemData.ID;
                    delete itemData.POSITION;
                    delete itemData.GRAPHIC;
                    delete itemData.COLOR;

                    console.log("Adding", itemData);

                    let _type = "power";
                    if (configPowerInfo.powerType?.includes("skill")) {
                        _type = "skill";
                    }
                    if (configPowerInfo.powerType?.includes("perk")) {
                        _type = "perk";
                    }
                    if (configPowerInfo.powerType?.includes("talent")) {
                        _type = "talent";
                    }

                    try {
                        const item = await compendium.documentClass.create(
                            {
                                name: `${
                                    itemData.ALIAS || itemData.XMLID
                                } (${_type})`,
                                type: _type,
                                data: itemData,
                            },
                            { pack: compendium.collection },
                        );
                        item.updateItemDescription();
                        await item._postUpload();
                    } catch (err) {
                        console.log(itemData.XMLID, err);
                    }
                }
            }
        }
    } catch (err) {
        console.error(err);
    }
}
