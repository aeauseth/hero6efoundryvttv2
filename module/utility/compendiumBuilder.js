import { HeroSystem6eActor } from "../actor/actor.js";
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

        // Delete all item in the compendium
        while (
            game.packs.get(game.system.id + ".powers-6e").index.contents[0]
        ) {
            await compendium.delete(compendium.index.contents[0]._id);
        }

        // Loop thru all the powers
        for (const power of heroJson.CHARACTER.POWERS) {
            //if (power.XMLID != "ENERGYBLAST") continue;
            console.log(power);

            const configPowerInfo = getPowerInfo({ xmlid: power.XMLID });

            const itemData = {
                ...power,
            };
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
                        name: `${itemData.ALIAS || itemData.XMLID} (${_type})`,
                        type: _type,
                        data: itemData,
                    },
                    { pack: compendium.collection },
                );
                item.updateItemDescription();
            } catch (err) {
                console.log(itemData.XMLID, err);
            }

            //if (!configPower.powerType) continue;
            // if (
            //     // ["attack", "defense", "standard"].some((o) =>
            //     //     configPower.powerType.includes(o),
            //     // ) &&
            //     !configPower.powerType.includes("characteristic")
            // ) {
            //     const itemData = {
            //         XMLID: configPower.key,
            //         type: "power",
            //         ...configPower.frag,
            //     };

            //     // Check if this item is already in the compendium
            //     if (
            //         !game.packs
            //             .get(game.system.id + ".powers-6e")
            //             .index.find((o) => o.name === itemData.name)
            //     ) {
            //         const item = await compendium.documentClass.create(
            //             {
            //                 name: `${
            //                     configPower.name || configPower.key
            //                 } (power)`,
            //                 type: "power",
            //                 data: itemData,
            //             },
            //             { pack: compendium.collection },
            //         );
            //         console.log("Added", itemData.name);
            //         try {
            //             item.updateItemDescription();
            //             await item.update({ system: item.system });
            //         } catch (err) {
            //             console.log(err);
            //         }
            //     }
            // }
        }
    } catch (err) {
        console.error(err);
    }
}
