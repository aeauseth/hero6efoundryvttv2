import { setQuenchTimeout, createQuenchActor, deleteQuenchActor } from "./quench-helper.mjs";
import { HeroSystem6eItem } from "../item/item.mjs";
import { HeroSystem6eActor } from "../actor/actor.mjs";

/**
 * Registers validation suites for parent-child compound systems.
 * @param {object} quench - The external Quench tracking framework instance.
 */
export function registerCompoundPowerTests(quench) {
    // Always register tests using the batch manager framework injection pipeline
    quench.registerBatch(
        `${game.system.id}.compound`,
        (context) => {
            const { describe, it, assert, beforeEach, afterEach } = context;

            // Rule: Keep titles strictly bounded under 60 characters
            describe("Compound Powers", function () {
                setQuenchTimeout(this);

                describe("Unit Tests", function () {
                    let actor;

                    beforeEach(async function () {
                        // Isolate parsing inside a clean 5e rules context actor
                        actor = await createQuenchActor({ quench: this, is5e: false });
                    });

                    afterEach(async function () {
                        // Lifecycle Disposal Guards: Ensure absolute document eviction to maintain client parity
                        if (actor) {
                            await deleteQuenchActor({ quench: this, actor });
                        }
                    });

                    it("Verify PD & ED characteristic sub-power stacking", async function () {
                        assert.ok(actor, "Valid actor profile instance.");
                        assert.strictEqual(actor.system.characteristics.pd.value, 2, "Initial PD standard baseline");
                        assert.strictEqual(actor.system.characteristics.ed.value, 2, "Initial ED standard baseline");

                        let xml = `
                        <POWERS>
                            <POWER XMLID="COMPOUNDPOWER" ID="1785366870578" BASECOST="0.0" LEVELS="0" ALIAS="Compound Power" POSITION="0" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="High Performance Defense" QUANTITY="1" AFFECTS_PRIMARY="Yes" AFFECTS_TOTAL="Yes">
                            <NOTES />
                            <PD XMLID="PD" ID="1785366969331" BASECOST="0.0" LEVELS="3" ALIAS="PD" POSITION="0" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" AFFECTS_PRIMARY="Yes" AFFECTS_TOTAL="Yes" ADD_MODIFIERS_TO_BASE="No">
                                <NOTES />
                            </PD>
                            <ED XMLID="ED" ID="1785366980762" BASECOST="0.0" LEVELS="4" ALIAS="ED" POSITION="1" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" AFFECTS_PRIMARY="Yes" AFFECTS_TOTAL="Yes" ADD_MODIFIERS_TO_BASE="No">
                                <NOTES />
                            </ED>
                            </POWER>
                        </POWERS>
                        `;

                        if (typeof xml === "string") {
                            const parser = new DOMParser();
                            xml = parser.parseFromString(xml.trim(), "text/xml");
                        }

                        const heroJson = {};
                        HeroSystem6eActor._xmlToJsonNode(heroJson, xml.children);

                        const itemsToCreate = HeroSystem6eItem.parseItemsFromHeroJsonToItemDataArray(heroJson, actor, {
                            partial: true,
                        });
                        assert.ok(itemsToCreate.length > 0, "Item structure compilation array generated successfully.");

                        await actor.createEmbeddedDocuments("Item", itemsToCreate);

                        const compoundPower = actor.items.find((item) => item.system.XMLID === "COMPOUNDPOWER");
                        assert.ok(compoundPower, "Target compound manager verified in memory space.");
                        assert.strictEqual(compoundPower.childItems.length, 2, "Both child powers mapped.");

                        // Explicit derived sheet checks mapping separate structural characteristics
                        assert.strictEqual(actor.system.characteristics.pd.value, 5, "PD composite modifier stacked.");
                        assert.strictEqual(actor.system.characteristics.ed.value, 6, "ED composite modifier stacked.");
                    });
                });

                describe("Integration", function () {
                    it.skip("Integration baseline placeholder stub.");
                });
            });
        },
        { displayName: "HERO: Compound Powers" },
    );
}
