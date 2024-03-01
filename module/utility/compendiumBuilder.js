export async function UpdateCompendiumFromSource() {
    console.log("UpdateCompendiumFromSource");

    try {
        //     let x = await FilePicker.browse(`
        //         "data",
        //         "systems/" + game.system.id + "/packs/powers-6e/_source",
        //     );

        //     console.log(x);

        // REF: https://discord.com/channels/732325252788387980/754127569246355477/862517136390750218
        const compendium = game.packs.get(game.system.id + ".powers-6e");
        if (compendium.locked) return;

        // Delete all item in the compendium
        while (
            game.packs.get(game.system.id + ".powers-6e").index.contents[0]
        ) {
            await compendium.delete(compendium.index.contents[0]._id);
        }

        // Loop thru all the powers
        for (const configPower of CONFIG.HERO.powers) {
            console.log(configPower);
            if (!configPower.powerType) continue;
            if (
                ["attack", "defense"].some((o) =>
                    configPower.powerType.includes(o),
                ) &&
                !configPower.powerType.includes("characteristic")
            ) {
                const itemData = {
                    name: configPower.name || configPower.key,
                    system: {
                        XMLID: configPower.key,
                    },
                };

                // Check if this item is already in the compendium
                if (
                    !game.packs
                        .get(game.system.id + ".powers-6e")
                        .index.find((o) => o.name === itemData.name)
                ) {
                    await compendium.documentClass.create(
                        {
                            name: itemData.name,
                            type: "power",
                            data: itemData,
                        },
                        { pack: compendium.collection },
                    );
                    console.log("Added", itemData.name);
                }
            }
        }
    } catch (err) {
        console.error(err);
    }
}
