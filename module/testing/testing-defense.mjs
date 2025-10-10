import { HeroSystem6eActor } from "../actor/actor.mjs";
import { HeroSystem6eItem } from "../item/item.mjs";
import { getActorDefensesVsAttack } from "../utility/defense.mjs";
import { createQuenchActor, deleteQuenchActor } from "./quench-helper.mjs";

export function registerDefenseTests(quench) {
    quench.registerBatch(
        "hero6efoundryvttv2.utils.defense",
        (context) => {
            const { assert, before, after, describe, it } = context;

            describe("Resistant Protection", function () {
                let actor;
                before(async () => {
                    actor = await createQuenchActor({ quench: this, actor, is5e: false });
                });

                after(async () => {
                    await deleteQuenchActor({ quench: this, actor });
                });

                it("rPD 1", async function () {
                    const contents = `
                        <POWER XMLID="FORCEFIELD" ID="1686527339658" BASECOST="0.0" LEVELS="10" ALIAS="Resistant Protection" POSITION="0" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes" PDLEVELS="1" EDLEVELS="2" MDLEVELS="3" POWDLEVELS="4">
                        <NOTES />
                        </POWER>
                    `;

                    const contentsAttack = `
                        <POWER XMLID="ENERGYBLAST" ID="1695402954902" BASECOST="0.0" LEVELS="1" ALIAS="Blast" POSITION="0" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" INPUT="PD" USESTANDARDEFFECT="No" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes">
                        </POWER>
                    `;
                    // const itemDefense = new HeroSystem6eItem(HeroSystem6eItem.itemDataFromXml(contents, actor), {
                    //     parent: actor,
                    // });
                    // actor.items.set(itemDefense.system.XMLID, itemDefense);

                    await HeroSystem6eItem.create(HeroSystem6eItem.itemDataFromXml(contents, actor), {
                        parent: actor,
                    });

                    const itemAttack = new HeroSystem6eItem(HeroSystem6eItem.itemDataFromXml(contentsAttack, actor), {
                        parent: actor,
                    });
                    //await actor.FullHealth();

                    const defense = getActorDefensesVsAttack(actor, itemAttack);
                    assert.equal(defense.resistantValue, 1);
                });

                it("rED 2", async function () {
                    const contents = `
                        <POWER XMLID="FORCEFIELD" ID="1686527339658" BASECOST="0.0" LEVELS="10" ALIAS="Resistant Protection" POSITION="0" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes" PDLEVELS="1" EDLEVELS="2" MDLEVELS="3" POWDLEVELS="4">
                        <NOTES />
                        </POWER>
                    `;
                    let actor = new HeroSystem6eActor(
                        {
                            name: "Quench Actor",
                            type: "pc",
                        },
                        {},
                    );
                    actor.system.is5e = false;

                    const contentsAttack = `
                        <POWER XMLID="ENERGYBLAST" ID="1695402954902" BASECOST="0.0" LEVELS="1" ALIAS="Blast" POSITION="0" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" INPUT="ED" USESTANDARDEFFECT="No" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes">
                        </POWER>
                    `;
                    const itemDefense = new HeroSystem6eItem(HeroSystem6eItem.itemDataFromXml(contents, actor), {
                        parent: actor,
                    });
                    actor.items.set(itemDefense.system.XMLID, itemDefense);

                    const itemAttack = new HeroSystem6eItem(HeroSystem6eItem.itemDataFromXml(contentsAttack, actor), {
                        parent: actor,
                    });
                    await actor.FullHealth();

                    const defense = getActorDefensesVsAttack(actor, itemAttack);
                    assert.equal(defense.resistantValue, 2);
                });

                it("rMD 3", async function () {
                    const contents = `
                        <POWER XMLID="FORCEFIELD" ID="1686527339658" BASECOST="0.0" LEVELS="10" ALIAS="Resistant Protection" POSITION="0" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes" PDLEVELS="1" EDLEVELS="2" MDLEVELS="3" POWDLEVELS="4">
                        <NOTES />
                        </POWER>
                    `;
                    let actor = new HeroSystem6eActor(
                        {
                            name: "Quench Actor",
                            type: "pc",
                        },
                        {},
                    );
                    actor.system.is5e = false;

                    const contentsAttack = `
                        <POWER XMLID="EGOATTACK" ID="1695575160315" BASECOST="0.0" LEVELS="1" ALIAS="Mental Blast" POSITION="1" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" USESTANDARDEFFECT="No" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes">
                            <NOTES />
                        </POWER>
                    `;
                    const itemDefense = new HeroSystem6eItem(HeroSystem6eItem.itemDataFromXml(contents, actor), {
                        parent: actor,
                    });
                    actor.items.set(itemDefense.system.XMLID, itemDefense);

                    const itemAttack = new HeroSystem6eItem(HeroSystem6eItem.itemDataFromXml(contentsAttack, actor), {
                        parent: actor,
                    });
                    await actor.FullHealth();

                    const defense = getActorDefensesVsAttack(actor, itemAttack);
                    assert.equal(defense.resistantValue, 3);
                });

                it("Power Defense 4", async function () {
                    const contents = `
                    <POWER XMLID="FORCEFIELD" ID="1686527339658" BASECOST="0.0" LEVELS="10" ALIAS="Resistant Protection" POSITION="0" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes" PDLEVELS="1" EDLEVELS="2" MDLEVELS="3" POWDLEVELS="4">
                    <NOTES />
                    </POWER>
                `;
                    let actor = new HeroSystem6eActor(
                        {
                            name: "Quench Actor",
                            type: "pc",
                        },
                        {},
                    );
                    actor.system.is5e = false;

                    const contentsAttack = `
                    <POWER XMLID="DRAIN" ID="1695576093210" BASECOST="0.0" LEVELS="1" ALIAS="Drain" POSITION="2" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" INPUT="BODY" USESTANDARDEFFECT="No" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes">
                    <NOTES />
                    </POWER>
                `;
                    const itemDefense = new HeroSystem6eItem(HeroSystem6eItem.itemDataFromXml(contents, actor), {
                        parent: actor,
                    });
                    actor.items.set(itemDefense.system.XMLID, itemDefense);

                    const itemAttack = new HeroSystem6eItem(HeroSystem6eItem.itemDataFromXml(contentsAttack, actor), {
                        parent: actor,
                    });

                    await actor.FullHealth();

                    const defense = getActorDefensesVsAttack(actor, itemAttack);
                    assert.equal(defense.resistantValue, 4);
                });
            });
        },
        { displayName: "HERO: Defense" },
    );
}
