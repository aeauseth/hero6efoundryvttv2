import { HeroSystem6eItem } from "../item/item.mjs";
import {
    //determineCostPerActivePointWithDefenseMultipler,
    determineCostPerActivePoint,
} from "../utility/adjustment.mjs";
import { getCharacteristicInfoArrayForActor } from "../utility/util.mjs";
export class HeroSystem6eEndToEndTest {
    sceneName = "EndToEndTest";
    //scene;
    actor5Name = "_EndToEndTest5";
    actor6Name = "_EndToEndTest6";
    // actor5;
    // actor6;
    // orderedListElement;

    delay = (ms) => new Promise((res) => setTimeout(res, ms || 100));

    floorCeil(value) {
        if (value >= 0) return Math.floor(value);
        return Math.ceil(value);
    }

    async start() {
        // Close existing dialog window if it exists
        $(".dialog.end-to-end-testing button[data-action='ok']").click();

        // Wait for previous dialog to close
        for (let i = 0; i < 50; i++) {
            if ($(".dialog.end-to-end-testing button[data-action='ok']").length === 0) break;
            await this.delay();
        }

        // Create new dialog
        await new foundry.applications.api.DialogV2({
            window: { title: `End To End Testing` },
            content: `<div style="height:400px; overflow-y:scroll"><ol class="end-to-end-testing">
                <li>Init</li>
            </ol></div>`,
            buttons: [
                {
                    action: "ok",
                    label: "OK",
                },
            ],
        }).render({ force: true });

        for (let i = 0; i < 50; i++) {
            if ((this.orderedListElement = $(".dialog .end-to-end-testing")).length > 0) break;
            await this.delay();
        }
        this.orderedListElement.closest(".dialog").addClass("end-to-end-testing");
        $(".dialog.end-to-end-testing").css("left", 5);

        await this.performTests();
    }

    async performTests() {
        // Keep active effects when AP = 0, do not delete them.
        // This also addes teh worldtime to the beginning of the AE name.
        // Useful for debugging.
        CONFIG.debug.adjustmentFadeKeep = true;

        await this.createTestScene();
        await this.createTestActors();

        // Interactive Testing (change these at will)
        // await this.token6.actor.update({ "system.characteristics.stun.value": 10 });
        // if (!(await this.testAdjustmentStacking(this.token6, this.token6, "HEALING", "STUN"))) return;

        await this.createTestScene();
        await this.createTestActors();

        //if (!(await this.testAdjustmentStacking(this.token5, this.token5, "AID", "OCV"))) return;
        if (!(await this.testAdjustmentStacking(this.token6, this.token6, "AID", "STUN"))) return;
        if (!(await this.testAdjustmentStacking(this.token6, this.token6, "AID", "CON"))) return;
        if (!(await this.testAdjustmentStacking(this.token6, this.token6, "DRAIN", "CON"))) return;
        if (!(await this.testAdjustmentStacking(this.token6, this.token6, "DRAIN", "END"))) return;
        if (!(await this.testAdjustmentStacking(this.token6, this.token6, "DRAIN", "STR"))) return;
        if (!(await this.testAdjustmentStacking(this.token6, this.token6, "DRAIN", "OCV"))) return;
        if (!(await this.testAdjustmentStacking(this.token5, this.token5, "DRAIN", "COM"))) return;
        if (!(await this.testAdjustmentStacking(this.token5, this.token5, "DRAIN", "STUN"))) return;
        // return;

        // AID 6 multiple characteristics + stacking
        // await this.token5.actor.fullHealth();
        // await this.token6.actor.fullHealth();
        // if (!(await this.testAdjustmentStacking(this.token6, this.token5, "AID", "STR, DEX"))) return;
        // if (!(await this.testAdjustmentStacking(this.token6, this.token5, "AID", "END, POWERDEFENSE"))) return;

        // AID 6
        // for (const char of getCharacteristicInfoArrayForActor(this.token6.actor)) {
        //     await this.token5.actor.fullHealth();
        //     await this.token6.actor.fullHealth();
        //     if (!(await this.testAdjustmentStacking(this.token6, this.token6, "AID", char.XMLID))) return;
        // }

        // AID 5
        for (const char of getCharacteristicInfoArrayForActor(this.token5.actor)) {
            await this.token5.actor.fullHealth();
            await this.token6.actor.fullHealth();
            if (!(await this.testAdjustmentStacking(this.token5, this.token5, "AID", char.XMLID))) return;
        }

        // DRAIN 6
        // for (const char of getCharacteristicInfoArrayForActor(this.token6.actor)) {
        //     await this.token5.actor.fullHealth();
        //     await this.token6.actor.fullHealth();
        //     if (!(await this.testAdjustmentStacking(this.token6, this.token6, "DRAIN", char.XMLID))) return;
        // }

        // DRAIN 5
        for (const char of getCharacteristicInfoArrayForActor(this.token5.actor)) {
            await this.token5.actor.fullHealth();
            await this.token6.actor.fullHealth();
            if (!(await this.testAdjustmentStacking(this.token5, this.token5, "DRAIN", char.XMLID))) return;
        }

        CONFIG.debug.adjustmentFadeKeep = false;

        this.log(`Tests completed`, "color:green");
    }

    log(text, css) {
        if (css?.includes("red")) {
            console.error(text);
        } else {
            console.log(text);
        }

        this.orderedListElement.append(`<li style="${css}">${text}</li>`);
        //el[0].scrollIntoView();
        $(`.dialog .end-to-end-testing li:last-child`)[0].scrollIntoView();
    }

    async createTestScene() {
        this.scene = game.scenes.find((s) => s.name === this.sceneName);
        if (this.scene) {
            this.log(`Deleting Scene '${this.sceneName}'`);
            this.scene.delete();
        }
        this.scene = await Scene.create({
            name: "EndToEndTest",
            width: 1000,
            height: 500,
        });
        this.log(`Created scene: ${this.sceneName}`);

        await this.scene.view();

        // Remove all tokens
        // for (const token of this.scene.tokens) {
        //     await token.delete();
        // }
    }

    async createTestActors() {
        // Scene Center
        const x = Math.floor(this.scene.dimensions.width / 200) * 100;
        const y = Math.floor(this.scene.dimensions.height / 200) * 100;

        // You may notice that we increase some characteristics.
        // This is because some characteristics prevent actions or prompt when they go to 0 during DRAIN tests.

        // 5e
        for (const actor of game.actors.filter((a) => a.name === this.actor5Name)) {
            this.log(`Deleting ${actor.name}`);
            await actor.delete();
        }
        this.log(`Creating ${this.actor5Name}`);
        this.actor5 = await Actor.create({
            name: this.actor5Name,
            type: "pc",
            system: {
                is5e: true,
                "characteristics.end.core": 50,
                "characteristics.pre.core": 50,
                "characteristics.stun.core": 50,
            },
        });
        await this.actor5.update({ "system.is5e": true });
        await this.actor5.fullHealth();

        await TokenDocument.create(
            {
                name: this.actor5.name.replace("_", ""),
                actorId: this.actor5.id,
                x: x - 100,
                y,
                displayName: foundry.CONST.TOKEN_DISPLAY_MODES.ALWAYS,
            },
            { parent: this.scene },
        );
        this.token5 = this.actor5.getActiveTokens()[0];

        // 6e
        for (const actor of game.actors.filter((a) => a.name === this.actor6Name)) {
            this.log(`Deleting ${actor.name}`);
            await actor.delete();
        }
        this.log(`Creating ${this.actor6Name}`);
        this.actor6 = await Actor.create({
            name: this.actor6Name,
            type: "pc",
            system: {
                is5e: false,
                "characteristics.end.core": 50,
                "characteristics.pre.core": 50,
                "characteristics.stun.core": 50,
            },
        });
        await this.actor6.fullHealth();
        await TokenDocument.create(
            {
                name: this.actor6.name.replace("_", ""),
                actorId: this.actor6.id,
                x: x + 100,
                y,
                displayName: foundry.CONST.TOKEN_DISPLAY_MODES.ALWAYS,
            },
            { parent: this.scene },
        );
        this.token6 = this.actor6.getActiveTokens()[0];
    }

    async createPower(powerXMLID, targetXMLID, tokenSource) {
        let expandedEffect = 1;
        while (targetXMLID.split(",").length > expandedEffect * 2) {
            expandedEffect++;
        }
        const xml =
            `
            <POWER XMLID="${powerXMLID}" ID="1734814179562" BASECOST="0.0" LEVELS="2" ALIAS="${powerXMLID.titleCase()}" POSITION="1" 
            MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" 
            INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" INPUT="${targetXMLID}" USESTANDARDEFFECT="No" QUANTITY="1" 
            AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes">
            ` +
            `${
                expandedEffect > 1
                    ? `<MODIFIER XMLID="EXPANDEDEFFECT" ID="1735178298410" 
                    BASECOST="-0.5" LEVELS="${expandedEffect}" ALIAS="Expanded Effect (x2 Characteristics or Powers simultaneously)"
                    POSITION="-1" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" 
                    INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" COMMENTS="" PRIVATE="No" FORCEALLOW="No">`
                    : ""
            }` +
            `<NOTES />
            </POWER>
        `;

        const itemData = HeroSystem6eItem.itemDataFromXml(xml, tokenSource.actor);
        const adjustmentItem = await HeroSystem6eItem.create(itemData, { parent: tokenSource.actor });

        this.log(
            `Added <b>${adjustmentItem.name} ${adjustmentItem.system.INPUT}</b> to <b>${adjustmentItem.actor.name}</b>`,
        );

        return adjustmentItem;
    }

    async targetToken(tokenTarget) {
        await game.user.updateTokenTargets([tokenTarget.id]);
        await game.user.broadcastActivity({
            targets: Array.from(game.user.targets.map((t) => t.id)),
        });

        // Control targetToken (when we miss we don't have the APPLY to X button)
        tokenTarget.control();
    }

    async doAdjustment(adjustmentItem, tokenTarget, options) {
        // Keep track of old temporaryEffects so we know when it has been added
        const oldTempEffectIds = tokenTarget.actor.temporaryEffects.map((ae) => ae.id);

        // Roll
        await adjustmentItem.roll();

        // Wait for application to render then Click "Roll to Hit"
        let button;
        for (let i = 0; i < 50; i++) {
            if ((button = $("#item-attack-form-application button")).length === 1) break;
            await this.delay();
        }
        button.click();
        this.log(`CLICK: ${button.text().trim()}`);

        // Wait for chat chard then Roll AID
        for (let i = 0; i < 50; i++) {
            if (
                (button = $(
                    `ol#chat-log .chat-message:last-child button.roll-damage[data-item-id='${adjustmentItem.uuid}']`,
                )).length === 1
            )
                break;
            await this.delay();
        }
        // const actionData = JSON.parse(button[0].dataset.actionData);
        // if (actionData?.current?.attacks?.[0].targets?.[0].targetId !== tokenTarget.id) {
        //     this.log(`FAIL: Missing token target. Known async issue, unclear how to resolve.`, "color:red");
        //     return false;
        // }
        button.click();
        this.log(`CLICK: ${button.text().trim()}`);

        // Wait for chat chard then Apply AID
        for (let i = 0; i < (options.expectToFail ? 5 : 50); i++) {
            if (
                (button = $(
                    `ol#chat-log .chat-message:last-child button.apply-damage[data-item-id='${adjustmentItem.uuid}']:last-child`,
                )).length === 1
            )
                break;
            await this.delay();
        }
        button.click();
        this.log(`CLICK: ${button.text().trim()}`);

        // wait for results & Get AP value
        for (let i = 0; i < (options.expectToFail ? 5 : 50); i++) {
            if ($(`ol#chat-log .chat-message:last-child .card-section:last-child`).length === 1) break;
            await this.delay();
        }
        const ap = parseInt(
            document
                .querySelector(`ol#chat-log .chat-message:last-child .description-activePoints`)
                ?.textContent.match(/(\d+) Character Points/)[0],
        );

        // Get Active Effect
        let adjustmentActiveEffect;
        for (let i = 0; i < (options.expectToFail ? 5 : 50); i++) {
            if (
                (adjustmentActiveEffect = tokenTarget.actor.temporaryEffects.find(
                    (ae) => !oldTempEffectIds.find((oe) => oe === ae.id),
                ))
            )
                break;

            // Healing only has 1 AE
            if (adjustmentItem.system.XMLID === "HEALING") {
                adjustmentActiveEffect ??= tokenTarget.actor.temporaryEffects.find(
                    (ae) => fromUuidSync(ae.origin)?.id === adjustmentItem.id,
                );
            }
            await this.delay();
        }
        if (!adjustmentActiveEffect) {
            if (!options.expectToFail) {
                this.log(`FAIL: unable to locate AE.`, "color:red");
                return { error: true };
            } else {
                this.log(`AE not created, which was expected.`);
            }
        }
        if (adjustmentActiveEffect && options.expectToFail) {
            this.log(`FAIL: Expected AE to fail, but it didn't.`, "color:red");
            return { error: true };
        }
        if (adjustmentActiveEffect) {
            this.log(
                `Active Effect ${adjustmentItem.system.XMLID}: value=${adjustmentActiveEffect.changes?.[0].value} ` +
                    `ap=${adjustmentActiveEffect.flags[game.system.id].adjustmentActivePoints}/${ap} ` +
                    `startTime=${adjustmentActiveEffect.duration.startTime} worldTime=${adjustmentActiveEffect.duration._worldTime}`,
            );
        }
        return { adjustmentActiveEffect, ap };
    }

    async testAdjustmentStacking(tokenSource, tokenTarget, powerXMLID, targetXMLID, stacks = 3) {
        // Create power/item and add to actor
        const adjustmentItem = await this.createPower(powerXMLID, targetXMLID, tokenSource);

        // Target tokenTarget
        await this.targetToken(tokenTarget);

        const aeStacks = [];
        let adjustmentActivePoints;
        let adjustmentValue = {};
        let actorCharacteristicValue = {};
        const costPerActivePoint = {};

        for (let s = 0; s < stacks; s++) {
            if (s > 0) {
                // Advance world time 1 second so we can see the fades of each ae/stack
                this.log(`worldTime + 1 second`);
                await game.time.advance(1);
            }

            // Confirm characteristic.value matches AE adjustment
            const _max = parseInt(adjustmentItem.system.LEVELS) * 6;
            const _ap = aeStacks.reduce((accum, currItem) => accum + currItem.ap, 0);

            // Some AE's are expected to fail
            let expectToFail = _ap >= _max && powerXMLID != "DRAIN";
            if (
                !targetXMLID.includes(",") &&
                !tokenTarget.actor.system.characteristics?.[targetXMLID.toLowerCase()]?.core &&
                !tokenTarget.actor.items.find((i) => i.system.XMLID === targetXMLID.toUpperCase())
            ) {
                expectToFail = true;
            }

            if (powerXMLID === "HEALING") {
                actorCharacteristicValue[targetXMLID.toLowerCase()] =
                    tokenTarget.actor.system.characteristics[targetXMLID.toLowerCase()].value;
            }

            adjustmentValue[`system.characteristics.${targetXMLID.toLowerCase()}.max`] =
                tokenTarget.actor.system.characteristics?.[targetXMLID.toLowerCase()]?.value;

            let { adjustmentActiveEffect, ap, error } = await this.doAdjustment(adjustmentItem, tokenTarget, {
                expectToFail,
            });
            if (error) {
                this.log("early exit");
                return;
            }

            if (adjustmentActiveEffect) {
                // the effect rolled is not necessarily the final ap (maximum effect)
                if (ap !== Math.abs(adjustmentActiveEffect.flags[game.system.id].adjustmentActivePoints)) {
                    this.log(
                        `WARN${s}: rolled ${ap}, applied ${adjustmentActiveEffect.flags[game.system.id].adjustmentActivePoints}. Likely due to maximum effect or costPerPoint.`,
                    );
                    ap = Math.abs(adjustmentActiveEffect.flags[game.system.id].adjustmentActivePoints);
                }
                aeStacks.push({ adjustmentActiveEffect, ap });
            } else {
                continue;
            }

            // Wait for value to change from doAdjustment
            for (let i = 0; i < 50; i++) {
                const char = adjustmentActiveEffect.changes[0].key.match(/([a-z]+)\.max/)?.[1];
                if (
                    tokenTarget.actor.system.characteristics[char]?.value ===
                    tokenTarget.actor.system.characteristics[char]?.max
                    //actorCharaisticValue[adjustmentActiveEffect.changes[0].key]
                )
                    break;
                await this.delay();
            }

            // Positive Adjustment
            if (adjustmentActiveEffect.flags[game.system.id].adjustmentActivePoints >= 0) {
                adjustmentActivePoints = Math.min(
                    parseInt(adjustmentItem.system.LEVELS) * 6,
                    aeStacks.reduce((accum, currItem) => accum + currItem.ap, 0),
                );
            } else {
                // Negative Adjustment
                adjustmentActivePoints = -aeStacks.reduce((accum, currItem) => accum + currItem.ap, 0);
            }

            for (const change of adjustmentActiveEffect.changes) {
                const char = change.key.match(/([a-z]+)\.max/)?.[1] || change.key;
                costPerActivePoint[change.key] = determineCostPerActivePoint(
                    char.toUpperCase(),
                    null,
                    tokenTarget.actor,
                );

                adjustmentValue[change.key] = Math.trunc(adjustmentActivePoints / costPerActivePoint[change.key]);
                if (powerXMLID === "HEALING") {
                    actorCharacteristicValue[change.key] += adjustmentValue[change.key];
                } else {
                    actorCharacteristicValue[change.key] =
                        tokenTarget.actor.system.characteristics[char].core + adjustmentValue[change.key];
                }

                if (tokenTarget.actor.system.characteristics[char].value !== actorCharacteristicValue[change.key]) {
                    this.log(
                        `Actor ${char}.value expecting ${actorCharacteristicValue[change.key]} got ${tokenTarget.actor.system.characteristics[char].value}/${tokenTarget.actor.system.characteristics[char].max}`,
                        "color:red",
                    );
                    return;
                }
                if (
                    tokenTarget.actor.system.characteristics[char].max !== actorCharacteristicValue[change.key] &&
                    powerXMLID !== "HEALING"
                ) {
                    this.log(
                        `Actor ${char}.max expecting ${actorCharacteristicValue[change.key]} got ${tokenTarget.actor.system.characteristics[char].max}`,
                        "color:red",
                    );
                    return;
                }
            }
        }

        // Confirm Characteristic has been aided
        // Positive Adjustment Powers have maximum effects. A character
        // can achieve his maximum with one or more uses of the Positive
        // Adjustment Power.
        // For Aid, this is equal to the maximum amount you can roll
        // on the dice – for example, 3d6 Aid Blast can add a maximum
        // of 18 CP to a Blast. This maximum applies to each target.
        // For example, the Aid Blast above can add a maximum of 18
        // CP of Blast to Sapphire, and a maximum of 18 CP of Blast to
        // Witchcraft.

        // fades
        let fadeCount = 0;
        while (adjustmentValue !== 0 && fadeCount < 50) {
            fadeCount++;

            // Find first AE to expire
            let firstActiveEffectToExpire;
            for (const ae of tokenTarget.actor.temporaryEffects) {
                if (
                    (!firstActiveEffectToExpire ||
                        ae.updateDuration().remaining < firstActiveEffectToExpire.updateDuration().remaining) &&
                    ae.flags[game.system.id].adjustmentActivePoints !== 0 &&
                    ae.updateDuration().remaining > 0
                ) {
                    firstActiveEffectToExpire = ae;
                }
            }

            if (!firstActiveEffectToExpire) {
                this.log("All fades complete");
                return true;
            }

            // fade amout expected
            const _fade =
                firstActiveEffectToExpire.flags[game.system.id].adjustmentActivePoints >= 0
                    ? -Math.min(5, parseInt(firstActiveEffectToExpire.flags[game.system.id].adjustmentActivePoints))
                    : -Math.max(-5, parseInt(firstActiveEffectToExpire.flags[game.system.id].adjustmentActivePoints));
            this.log(
                `Preparing to fade ${firstActiveEffectToExpire.flags[game.system.id].createTime}.${fadeCount} (which has ${firstActiveEffectToExpire.flags[game.system.id].adjustmentActivePoints} AP) by ${_fade} active points`,
            );

            // Advance X seconds to expire firstActiveEffectToExpire
            const seconds =
                firstActiveEffectToExpire.duration.startTime +
                firstActiveEffectToExpire.duration.seconds -
                game.time.worldTime;
            if (seconds <= 0) {
                this.log(`Seconds= ${seconds}`, "color:red");
                return;
            }
            this.log(`worldTime +${seconds} seconds`);
            console.log(firstActiveEffectToExpire);
            await game.time.advance(seconds);

            const newAdjustmentActivePoints =
                firstActiveEffectToExpire.flags[game.system.id].adjustmentActivePoints >= 0
                    ? Math.max(0, adjustmentActivePoints + _fade)
                    : Math.min(0, adjustmentActivePoints + _fade);
            const adjustmentNewValue = {};
            const actorNewCharacteristicValue = {};
            for (const change of firstActiveEffectToExpire.changes) {
                const char = change.key.match(/([a-z]+)\.max/)?.[1];
                //newAdjustmentActivePoints[change.key] = Math.max(0, adjustmentActivePoints - _fade);
                adjustmentNewValue[change.key] = Math.trunc(newAdjustmentActivePoints / costPerActivePoint[change.key]);
                actorNewCharacteristicValue[change.key] =
                    tokenTarget.actor.system.characteristics[char].core + adjustmentNewValue[change.key];
            }

            // Wait for AE to update/fade
            for (let i = 0; i < 50; i++) {
                const char = firstActiveEffectToExpire.changes[0].key.match(/([a-z]+)\.max/)?.[1];
                if (
                    tokenTarget.actor.system.characteristics[char].value ===
                    actorNewCharacteristicValue[firstActiveEffectToExpire.changes[0].key]
                )
                    break;
                await this.delay();
            }

            for (const change of firstActiveEffectToExpire.changes) {
                const char = change.key.match(/([a-z]+)\.max/)?.[1];
                if (tokenTarget.actor.system.characteristics[char].value === actorNewCharacteristicValue[change.key]) {
                    this.log(
                        `Fade ${firstActiveEffectToExpire.flags[game.system.id].createTime}.${fadeCount} from ${adjustmentValue[change.key]} to ` +
                            `${adjustmentNewValue[change.key]} was successful. ${char}=${actorNewCharacteristicValue[change.key]}/` +
                            `${tokenTarget.actor.system.characteristics[char].value}/` +
                            `${tokenTarget.actor.system.characteristics[char].max}`,
                    );
                } else {
                    this.log(
                        `Fade ${firstActiveEffectToExpire.flags[game.system.id].createTime}.${fadeCount} ` +
                            `FAIL: Expected actor ${char}=${actorNewCharacteristicValue[change.key]} got ` +
                            `${tokenTarget.actor.system.characteristics[char].value}/` +
                            `${tokenTarget.actor.system.characteristics[char].max}`,
                        "color:red",
                    );
                    return;
                }
            }

            adjustmentActivePoints = foundry.utils.deepClone(newAdjustmentActivePoints);
            adjustmentValue = foundry.utils.deepClone(adjustmentNewValue);
            foundry.utils.deepClone(actorNewCharacteristicValue);
        }

        this.log("Abandon fade loop");
        return false; // true = success
    }
}
