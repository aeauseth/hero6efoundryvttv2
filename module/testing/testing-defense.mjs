import { createQuenchActor, deleteQuenchActor, setQuenchTimeout } from "./quench-helper.mjs";

import { HeroSystem6eActor } from "../actor/actor.mjs";
import { HeroSystem6eItem } from "../item/item.mjs";
import { getActorDefensesVsAttack } from "../utility/defense.mjs";

export function registerDefenseTests(quench) {
    quench.registerBatch(
        `${game.system.id}.utils.defense`,
        (context) => {
            const { afterEach, assert, before, beforeEach, describe, it } = context;

            describe("Defense Tests", function () {
                // The default timeout tends to be insufficient with multiple actors being created at the same time.
                setQuenchTimeout(this);

                describe("Resistant Protection", function () {
                    let actor;
                    beforeEach(async function () {
                        actor = await createQuenchActor({ quench: this, is5e: true });
                    });

                    afterEach(async function () {
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

                        await HeroSystem6eItem.create(HeroSystem6eItem.itemDataFromXml(contents, actor), {
                            parent: actor,
                        });

                        const itemAttack = new HeroSystem6eItem(
                            HeroSystem6eItem.itemDataFromXml(contentsAttack, actor),
                            {
                                parent: actor,
                            },
                        );

                        const defense = getActorDefensesVsAttack(actor, itemAttack);
                        assert.equal(defense.resistantValue, 1);
                    });

                    it("rED 2", async function () {
                        const contents = `
                        <POWER XMLID="FORCEFIELD" ID="1686527339658" BASECOST="0.0" LEVELS="10" ALIAS="Resistant Protection" POSITION="0" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes" PDLEVELS="1" EDLEVELS="2" MDLEVELS="3" POWDLEVELS="4">
                        <NOTES />
                        </POWER>
                    `;

                        const contentsAttack = `
                        <POWER XMLID="ENERGYBLAST" ID="1695402954902" BASECOST="0.0" LEVELS="1" ALIAS="Blast" POSITION="0" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" INPUT="ED" USESTANDARDEFFECT="No" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes">
                        </POWER>
                    `;
                        const itemDefense = new HeroSystem6eItem(HeroSystem6eItem.itemDataFromXml(contents, actor), {
                            parent: actor,
                        });
                        actor.items.set(itemDefense.system.XMLID, itemDefense);

                        const itemAttack = new HeroSystem6eItem(
                            HeroSystem6eItem.itemDataFromXml(contentsAttack, actor),
                            {
                                parent: actor,
                            },
                        );

                        const defense = getActorDefensesVsAttack(actor, itemAttack);
                        assert.equal(defense.resistantValue, 2);
                    });

                    it("rMD 3", async function () {
                        const contents = `
                        <POWER XMLID="FORCEFIELD" ID="1686527339658" BASECOST="0.0" LEVELS="10" ALIAS="Resistant Protection" POSITION="0" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes" PDLEVELS="1" EDLEVELS="2" MDLEVELS="3" POWDLEVELS="4">
                        <NOTES />
                        </POWER>
                    `;

                        const contentsAttack = `
                        <POWER XMLID="EGOATTACK" ID="1695575160315" BASECOST="0.0" LEVELS="1" ALIAS="Mental Blast" POSITION="1" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" USESTANDARDEFFECT="No" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes">
                            <NOTES />
                        </POWER>
                    `;

                        const itemDefense = new HeroSystem6eItem(HeroSystem6eItem.itemDataFromXml(contents, actor), {
                            parent: actor,
                        });
                        actor.items.set(itemDefense.system.XMLID, itemDefense);

                        const itemAttack = new HeroSystem6eItem(
                            HeroSystem6eItem.itemDataFromXml(contentsAttack, actor),
                            {
                                parent: actor,
                            },
                        );

                        const defense = getActorDefensesVsAttack(actor, itemAttack);
                        assert.equal(defense.resistantValue, 3);
                    });

                    it("Power Defense 4", async function () {
                        const contents = `
                    <POWER XMLID="FORCEFIELD" ID="1686527339658" BASECOST="0.0" LEVELS="10" ALIAS="Resistant Protection" POSITION="0" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes" PDLEVELS="1" EDLEVELS="2" MDLEVELS="3" POWDLEVELS="4">
                    <NOTES />
                    </POWER>
                `;

                        const contentsAttack = `
                    <POWER XMLID="DRAIN" ID="1695576093210" BASECOST="0.0" LEVELS="1" ALIAS="Drain" POSITION="2" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" INPUT="BODY" USESTANDARDEFFECT="No" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes">
                    <NOTES />
                    </POWER>
                `;

                        const itemDefense = new HeroSystem6eItem(HeroSystem6eItem.itemDataFromXml(contents, actor), {
                            parent: actor,
                        });
                        actor.items.set(itemDefense.system.XMLID, itemDefense);

                        const itemAttack = new HeroSystem6eItem(
                            HeroSystem6eItem.itemDataFromXml(contentsAttack, actor),
                            {
                                parent: actor,
                            },
                        );

                        const defense = getActorDefensesVsAttack(actor, itemAttack);
                        assert.equal(defense.resistantValue, 4);
                    });
                });

                // See bug #3465
                describe("ACV (Alternative Combat Value)", function () {
                    describe("For Non-Mental Powers", function () {
                        describe("OMCV vs DCV", function () {
                            const contents = `
                            <POWER XMLID="DRAIN" ID="1767547901794" BASECOST="0.0" LEVELS="1" ALIAS="Drain" POSITION="99" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="Drain - OMCV vs DCV" INPUT="BODY" USESTANDARDEFFECT="No" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes">
                                <NOTES />
                                <MODIFIER XMLID="ACV" ID="1767548044029" BASECOST="0.0" LEVELS="0" ALIAS="Alternate Combat Value" POSITION="-1" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" OPTION="NONMENTALOMCV" OPTIONID="NONMENTALOMCV" OPTION_ALIAS="uses OMCV against DCV" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" COMMENTS="" PRIVATE="No" FORCEALLOW="No">
                                    <NOTES />
                                </MODIFIER>
                            </POWER>
                        `;
                            let item;

                            before(async function () {
                                const actor = new HeroSystem6eActor(
                                    {
                                        name: "Quench Actor",
                                        type: "pc",
                                    },
                                    {},
                                );
                                actor.system.is5e = false;

                                item = new HeroSystem6eItem(HeroSystem6eItem.itemDataFromXml(contents, actor), {
                                    parent: actor,
                                });

                                actor.items.set(item.system.XMLID, item);
                            });

                            it("description", function () {
                                assert.equal(
                                    item.system.description,
                                    "Drain BODY 1d6, Alternate Combat Value (uses OMCV against DCV; +0)",
                                );
                            });

                            it("character point cost", function () {
                                assert.equal(item.characterPointCost, 10);
                            });

                            it("realCost", function () {
                                assert.equal(item.realCost, 10);
                            });

                            it("activePoints", function () {
                                assert.equal(item.activePoints, 10);
                            });

                            it("end", function () {
                                assert.equal(item.end, 1);
                            });

                            it("should attack with", function () {
                                assert.equal(item.system.attacksWith, "omcv");
                            });

                            it("should defend with", function () {
                                assert.equal(item.system.defendsWith, "dcv");
                            });
                        });

                        describe("OCV vs DMCV", function () {
                            const contents = `
                            <POWER XMLID="DRAIN" ID="1767547930340" BASECOST="0.0" LEVELS="1" ALIAS="Drain" POSITION="100" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="Drain - OCV vs DMCV" INPUT="BODY" USESTANDARDEFFECT="No" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes">
                                <NOTES />
                                <MODIFIER XMLID="ACV" ID="1767548176982" BASECOST="0.25" LEVELS="0" ALIAS="Alternate Combat Value" POSITION="-1" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" OPTION="NONMENTALDMCV" OPTIONID="NONMENTALDMCV" OPTION_ALIAS="uses OCV against DMCV" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" COMMENTS="" PRIVATE="No" FORCEALLOW="No">
                                    <NOTES />
                                </MODIFIER>
                            </POWER>
                        `;
                            let item;

                            before(async function () {
                                const actor = new HeroSystem6eActor(
                                    {
                                        name: "Quench Actor",
                                        type: "pc",
                                    },
                                    {},
                                );
                                actor.system.is5e = false;

                                item = new HeroSystem6eItem(HeroSystem6eItem.itemDataFromXml(contents, actor), {
                                    parent: actor,
                                });

                                actor.items.set(item.system.XMLID, item);
                            });

                            it("description", function () {
                                assert.equal(
                                    item.system.description,
                                    "Drain BODY 1d6, Alternate Combat Value (uses OCV against DMCV; +1/4)",
                                );
                            });

                            it("character point cost", function () {
                                assert.equal(item.characterPointCost, 12);
                            });

                            it("realCost", function () {
                                assert.equal(item.realCost, 12);
                            });

                            it("activePoints", function () {
                                assert.equal(item.activePoints, 12);
                            });

                            it("end", function () {
                                assert.equal(item.end, 1);
                            });

                            it("should attack with", function () {
                                assert.equal(item.system.attacksWith, "ocv");
                            });

                            it("should defend with", function () {
                                assert.equal(item.system.defendsWith, "dmcv");
                            });
                        });

                        describe("OMCV vs DMCV", function () {
                            const contents = `
                            <POWER XMLID="DRAIN" ID="1767547947321" BASECOST="0.0" LEVELS="1" ALIAS="Drain" POSITION="101" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="Drain - OMCV vs DMCV" INPUT="BODY" USESTANDARDEFFECT="No" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes">
                                <NOTES />
                                <MODIFIER XMLID="ACV" ID="1767548157081" BASECOST="0.25" LEVELS="0" ALIAS="Alternate Combat Value" POSITION="-1" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" OPTION="NONMENTALOMCVDMCV" OPTIONID="NONMENTALOMCVDMCV" OPTION_ALIAS="uses OMCV against DMCV" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" COMMENTS="" PRIVATE="No" FORCEALLOW="No">
                                    <NOTES />
                                </MODIFIER>
                            </POWER>
                        `;
                            let item;

                            before(async function () {
                                const actor = new HeroSystem6eActor(
                                    {
                                        name: "Quench Actor",
                                        type: "pc",
                                    },
                                    {},
                                );
                                actor.system.is5e = false;

                                item = new HeroSystem6eItem(HeroSystem6eItem.itemDataFromXml(contents, actor), {
                                    parent: actor,
                                });

                                actor.items.set(item.system.XMLID, item);
                            });

                            it("description", function () {
                                assert.equal(
                                    item.system.description,
                                    "Drain BODY 1d6, Alternate Combat Value (uses OMCV against DMCV; +1/4)",
                                );
                            });

                            it("character point cost", function () {
                                assert.equal(item.characterPointCost, 12);
                            });

                            it("realCost", function () {
                                assert.equal(item.realCost, 12);
                            });

                            it("activePoints", function () {
                                assert.equal(item.activePoints, 12);
                            });

                            it("end", function () {
                                assert.equal(item.end, 1);
                            });

                            it("should attack with", function () {
                                assert.equal(item.system.attacksWith, "omcv");
                            });

                            it("should defend with", function () {
                                assert.equal(item.system.defendsWith, "dmcv");
                            });
                        });
                    });

                    describe("For Mental Powers", function () {
                        describe("OCV vs DMCV", function () {
                            const contents = `
                            <POWER XMLID="EGOATTACK" ID="1767548201451" BASECOST="0.0" LEVELS="1" ALIAS="Mental Blast" POSITION="102" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="MB - OCV vs DMCV" USESTANDARDEFFECT="No" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes">
                                <NOTES />
                                <MODIFIER XMLID="ACV" ID="1767548369883" BASECOST="0.25" LEVELS="0" ALIAS="Alternate Combat Value" POSITION="-1" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" OPTION="MENTALOCV" OPTIONID="MENTALOCV" OPTION_ALIAS="uses OCV against DMCV" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" COMMENTS="" PRIVATE="No" FORCEALLOW="No">
                                    <NOTES />
                                </MODIFIER>
                            </POWER>
                        `;
                            let item;

                            before(async function () {
                                const actor = new HeroSystem6eActor(
                                    {
                                        name: "Quench Actor",
                                        type: "pc",
                                    },
                                    {},
                                );
                                actor.system.is5e = false;

                                item = new HeroSystem6eItem(HeroSystem6eItem.itemDataFromXml(contents, actor), {
                                    parent: actor,
                                });

                                actor.items.set(item.system.XMLID, item);
                            });

                            it("description", function () {
                                assert.equal(
                                    item.system.description,
                                    "Mental Blast 1d6, Alternate Combat Value (uses OCV against DMCV; +1/4)",
                                );
                            });

                            it("character point cost", function () {
                                assert.equal(item.characterPointCost, 12);
                            });

                            it("realCost", function () {
                                assert.equal(item.realCost, 12);
                            });

                            it("activePoints", function () {
                                assert.equal(item.activePoints, 12);
                            });

                            it("end", function () {
                                assert.equal(item.end, 1);
                            });

                            it("should attack with", function () {
                                assert.equal(item.system.attacksWith, "ocv");
                            });

                            it("should defend with", function () {
                                assert.equal(item.system.defendsWith, "dmcv");
                            });
                        });

                        describe("OMCV vs DCV", function () {
                            const contents = `
                            <POWER XMLID="EGOATTACK" ID="1767548399500" BASECOST="0.0" LEVELS="1" ALIAS="Mental Blast" POSITION="103" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="MB - OMCV vs DCV" USESTANDARDEFFECT="No" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes">
                                <NOTES />
                                <MODIFIER XMLID="ACV" ID="1767548410604" BASECOST="-0.25" LEVELS="0" ALIAS="Alternate Combat Value" POSITION="-1" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" OPTION="MENTALDCV" OPTIONID="MENTALDCV" OPTION_ALIAS="uses OMCV against DCV" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" COMMENTS="" PRIVATE="No" FORCEALLOW="No">
                                    <NOTES />
                                </MODIFIER>
                            </POWER>
                        `;
                            let item;

                            before(async function () {
                                const actor = new HeroSystem6eActor(
                                    {
                                        name: "Quench Actor",
                                        type: "pc",
                                    },
                                    {},
                                );
                                actor.system.is5e = false;

                                item = new HeroSystem6eItem(HeroSystem6eItem.itemDataFromXml(contents, actor), {
                                    parent: actor,
                                });

                                actor.items.set(item.system.XMLID, item);
                            });

                            it("description", function () {
                                assert.equal(
                                    item.system.description,
                                    "Mental Blast 1d6 (10 Active Points); Alternate Combat Value (uses OMCV against DCV; -1/4)",
                                );
                            });

                            it("character point cost", function () {
                                assert.equal(item.characterPointCost, 8);
                            });

                            it("realCost", function () {
                                assert.equal(item.realCost, 8);
                            });

                            it("activePoints", function () {
                                assert.equal(item.activePoints, 10);
                            });

                            it("end", function () {
                                assert.equal(item.end, 1);
                            });

                            it("should attack with", function () {
                                assert.equal(item.system.attacksWith, "omcv");
                            });

                            it("should defend with", function () {
                                assert.equal(item.system.defendsWith, "dcv");
                            });
                        });

                        describe("OCV vs DCV", function () {
                            const contents = `
                            <POWER XMLID="EGOATTACK" ID="1767548405387" BASECOST="0.0" LEVELS="1" ALIAS="Mental Blast" POSITION="104" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="MB - OCV vs DCV" USESTANDARDEFFECT="No" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes">
                                <NOTES />
                                <MODIFIER XMLID="ACV" ID="1767548427865" BASECOST="0.0" LEVELS="0" ALIAS="Alternate Combat Value" POSITION="-1" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" OPTION="MENTALOCVDCV" OPTIONID="MENTALOCVDCV" OPTION_ALIAS="uses OCV against DCV" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" COMMENTS="" PRIVATE="No" FORCEALLOW="No">
                                    <NOTES />
                                </MODIFIER>
                            </POWER>
                        `;
                            let item;

                            before(async function () {
                                const actor = new HeroSystem6eActor(
                                    {
                                        name: "Quench Actor",
                                        type: "pc",
                                    },
                                    {},
                                );
                                actor.system.is5e = false;

                                item = new HeroSystem6eItem(HeroSystem6eItem.itemDataFromXml(contents, actor), {
                                    parent: actor,
                                });

                                actor.items.set(item.system.XMLID, item);
                            });

                            it("description", function () {
                                assert.equal(
                                    item.system.description,
                                    "Mental Blast 1d6, Alternate Combat Value (uses OCV against DCV; +0)",
                                );
                            });

                            it("character point cost", function () {
                                assert.equal(item.characterPointCost, 10);
                            });

                            it("realCost", function () {
                                assert.equal(item.realCost, 10);
                            });

                            it("activePoints", function () {
                                assert.equal(item.activePoints, 10);
                            });

                            it("end", function () {
                                assert.equal(item.end, 1);
                            });

                            it("should attack with", function () {
                                assert.equal(item.system.attacksWith, "ocv");
                            });

                            it("should defend with", function () {
                                assert.equal(item.system.defendsWith, "dcv");
                            });
                        });
                    });
                });

                describe("BOECV (Based on EGO Combat Value", function () {
                    describe("OMCV vs DMCV", function () {
                        const contents = `
                        <POWER XMLID="DRAIN" ID="1767549550225" BASECOST="0.0" LEVELS="1" ALIAS="Drain" POSITION="163" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="Mental Drain - OMCV vs DMCV" INPUT="BODY" USESTANDARDEFFECT="No" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes">
                            <NOTES />
                            <MODIFIER XMLID="BOECV" ID="1767549766137" BASECOST="1.0" LEVELS="0" ALIAS="Based On EGO Combat Value" POSITION="-1" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" OPTION="MENTAL" OPTIONID="MENTAL" OPTION_ALIAS="Mental Defense applies" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" COMMENTS="" PRIVATE="No" FORCEALLOW="No">
                                <NOTES />
                            </MODIFIER>
                        </POWER>
                    `;
                        let item;

                        before(async function () {
                            const actor = new HeroSystem6eActor(
                                {
                                    name: "Quench Actor",
                                    type: "pc",
                                },
                                {},
                            );
                            actor.system.is5e = true;

                            item = new HeroSystem6eItem(HeroSystem6eItem.itemDataFromXml(contents, actor), {
                                parent: actor,
                            });

                            actor.items.set(item.system.XMLID, item);
                        });

                        it("description", function () {
                            assert.equal(
                                item.system.description,
                                "Drain BODY 1d6, Based On EGO Combat Value (Mental Defense applies; +1)",
                            );
                        });

                        it("character point cost", function () {
                            assert.equal(item.characterPointCost, 20);
                        });

                        it("realCost", function () {
                            assert.equal(item.realCost, 20);
                        });

                        it("activePoints", function () {
                            assert.equal(item.activePoints, 20);
                        });

                        it("end", function () {
                            assert.equal(item.end, 2);
                        });

                        it("should attack with", function () {
                            assert.equal(item.system.attacksWith, "omcv");
                        });

                        it("should defend with", function () {
                            assert.equal(item.system.defendsWith, "dmcv");
                        });
                    });

                    describe("OMCV vs DCV (Telekinesis exception)", function () {
                        const contents = `
                        <POWER XMLID="TELEKINESIS" ID="1767554249144" BASECOST="0.0" LEVELS="20" ALIAS="Telekinesis" POSITION="166" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes">
                            <NOTES />
                            <MODIFIER XMLID="BOECV" ID="1767554606427" BASECOST="1.0" LEVELS="0" ALIAS="Based On EGO Combat Value" POSITION="-1" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" OPTION="MENTAL" OPTIONID="MENTAL" OPTION_ALIAS="Mental Defense applies" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" COMMENTS="" PRIVATE="No" FORCEALLOW="No">
                                <NOTES />
                            </MODIFIER>
                        </POWER>
                    `;
                        let item;

                        before(async function () {
                            const actor = new HeroSystem6eActor(
                                {
                                    name: "Quench Actor",
                                    type: "pc",
                                },
                                {},
                            );
                            actor.system.is5e = true;

                            item = new HeroSystem6eItem(HeroSystem6eItem.itemDataFromXml(contents, actor), {
                                parent: actor,
                            });

                            actor.items.set(item.system.XMLID, item);
                        });

                        it("description", function () {
                            assert.equal(
                                item.system.description,
                                'Telekinesis (20 STR) Throw 16", Based On EGO Combat Value (Mental Defense applies; +1)',
                            );
                        });

                        it("character point cost", function () {
                            assert.equal(item.characterPointCost, 60);
                        });

                        it("realCost", function () {
                            assert.equal(item.realCost, 60);
                        });

                        it("activePoints", function () {
                            assert.equal(item.activePoints, 60);
                        });

                        it("end", function () {
                            assert.equal(item.end, 6);
                        });

                        it("should attack with", function () {
                            assert.equal(item.system.attacksWith, "omcv");
                        });

                        it("should defend with", function () {
                            assert.equal(item.system.defendsWith, "dcv");
                        });
                    });
                });
            });
        },
        { displayName: "HERO: Defense" },
    );
}
