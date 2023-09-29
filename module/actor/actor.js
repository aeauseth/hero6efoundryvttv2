import { HeroSystem6eActorActiveEffects } from "./actor-active-effects.js"
import { HeroSystem6eItem } from '../item/item.js'
import { HEROSYS } from "../herosystem6e.js";
import { updateItemDescription } from "../utility/upload_hdc.js";
import { getPowerInfo, getCharactersticInfoArrayForActor } from "../utility/util.js"

/**
 * Extend the base Actor entity by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
export class HeroSystem6eActor extends Actor {

    /** @inheritdoc */
    async _preCreate(data, options, user) {
        await super._preCreate(data, options, user);

        //TODO: Add user configuration for initial prototype settings

        HEROSYS.log(false, "_preCreate")
        let prototypeToken = {
            // Leaving sight disabled.
            // TODO: Implement various Enhanced Visions
            // sight: { enabled: true }, 
            displayBars: CONST.TOKEN_DISPLAY_MODES.HOVER,
            displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
            // flags: {
            //     [game.system.id]: {
            //         bar3: {
            //             attribute: "characteristics.end"
            //         }
            //     }
            // }

        }

        if (this.type != "npc") {
            prototypeToken = {
                ...prototypeToken,
                actorLink: true,
                disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY,
                displayBars: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
                displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,

            };

        }

        this.updateSource({ prototypeToken });

        // Bar3 is a flag
        //await this.prototypeToken.setFlag(game.system.id, "bar3", { "attribute": "characteristics.end" })



    }

    async removeActiveEffect(activeEffect) {
        //const existingEffect = this.effects.find(o => o.statuses.has(activeEffect.id));
        const existingEffect = Array.from(this.allApplicableEffects()).find(o => o.id === activeEffect.id)
        if (existingEffect) {

            if (activeEffect.id == "knockedOut") {
                //When he wakes up, his END equals his
                //current STUN total.
                let newEnd = Math.min(parseInt(this.system.characteristics.stun.value), parseInt(this.system.characteristics.end.max));
                await this.update({ "system.characteristics.end.value": newEnd });
            }

            //await existingEffect.update({ disabled: true });

            await existingEffect.delete();
            //await this.deleteEmbeddedDocuments("ActiveEffect", [existingEffect])
        }
    }

    // Adding ActiveEffects seems complicated.
    // Make sure only one of the same ActiveEffect is added
    // Assumes ActiveEffect is a statusEffects.
    // TODO: Allow for a non-statusEffects ActiveEffect (like from a power)
    async addActiveEffect(activeEffect) {



        const newEffect = deepClone(activeEffect)
        newEffect.label = `${game.i18n.localize(newEffect.label)}`


        // Check for standard StatusEffects
        // statuses appears to be necessary to associate with StatusEffects
        if (activeEffect.id) {
            newEffect.statuses = [activeEffect.id]

            // Check if this ActiveEffect already exists
            const existingEffect = this.effects.find(o => o.statuses.has(activeEffect.id));
            if (!existingEffect) {
                await this.createEmbeddedDocuments("ActiveEffect", [newEffect])
            }
        }



        if (activeEffect.id == "knockedOut") {
            // Knocked Out overrides Stunned
            await this.removeActiveEffect(HeroSystem6eActorActiveEffects.stunEffect);
        }

    }

    async ChangeType() {
        const template = "systems/hero6efoundryvttv2/templates/chat/actor-change-type-dialog.hbs"
        const actor = this
        let cardData = {
            actor,
            groupName: "typeChoice",
            choices: Actor.TYPES.filter(o => o != 'character' && o != 'base').reduce((a, v) => ({ ...a, [v]: v.replace("2", "") }), {}), // base is internal type and/or keyword. BASE2 is for bases.
            chosen: actor.type,
        }
        const html = await renderTemplate(template, cardData)
        return new Promise(resolve => {
            const data = {
                title: `Change ${this.name} Type`,
                content: html,
                buttons: {
                    normal: {
                        label: "Apply",
                        callback: html => resolve(
                            _processChangeType(html)
                        )
                    },
                    // cancel: {
                    //   label: "cancel",
                    //   callback: html => resolve({canclled: true})
                    // }
                },
                default: "normal",
                close: () => resolve({ cancelled: true })
            }
            new Dialog(data, null).render(true)

            async function _processChangeType(html) {
                await actor.update({ type: html.find('input:checked')[0].value })
            }
        });
    }

    /* -------------------------------------------- */

    /**
     * Handle how changes to a Token attribute bar are applied to the Actor.
     * This allows for game systems to override this behavior and deploy special logic.
     * @param {string} attribute    The attribute path
     * @param {number} value        The target attribute value
     * @param {boolean} isDelta     Whether the number represents a relative change (true) or an absolute change (false)
     * @param {boolean} isBar       Whether the new value is part of an attribute bar, or just a direct value
     * @returns {Promise<documents.Actor>}  The updated Actor document
     */
    async modifyTokenAttribute(attribute, value, isDelta = false, isBar = true) {
        const current = foundry.utils.getProperty(this.system, attribute);

        // Determine the updates to make to the actor data
        let updates;
        if (isBar) {
            if (isDelta) value = Math.clamped(-99, Number(current.value) + value, current.max);  // a negative bar is typically acceptable
            updates = { [`system.${attribute}.value`]: value };
        } else {
            if (isDelta) value = Number(current) + value;
            updates = { [`system.${attribute}`]: value };
        }
        const allowed = Hooks.call("modifyTokenAttribute", { attribute, value, isDelta, isBar }, updates);
        return allowed !== false ? this.update(updates) : this;
    }

    async _preUpdate(changed, options, userId) {
        let data = await super._preUpdate(changed, options, userId)

        // Forwrd changed date to _onUpdate.
        // _preUpdate only seems to run for GM or one user which
        // results in _displayScrollingChange only showing for those users.
        // Where as _onUpdate runs for all users.
        options.displayScrollingChanges = [];

        //if (!ChatMessage.getWhisperRecipients("GM").map(o => o.id).includes(game.user.id)) return;

        let content = "";

        if (changed?.system?.characteristics?.stun?.value) {
            let valueT = parseInt(this.system.characteristics.stun.value);
            let valueC = parseInt(changed.system.characteristics.stun.value);
            let valueM = parseInt(this.system.characteristics.stun.max);
            if (valueT != valueC) {
                content = `STUN from ${valueT} to ${valueC}`
            } else {
                content = `STUN changed to ${valueC}`
            }
            if (valueC === valueM) {
                content += " (at max)";
            }

            //this._displayScrollingChange(valueC - valueT, { max: valueM, fill: '0x00FF00' });
            options.displayScrollingChanges.push({ value: valueC - valueT, options: { max: valueM, fill: '0x00FF00' } });

        }

        if (changed?.system?.characteristics?.body?.value) {
            let valueT = parseInt(this.system.characteristics.body.value);
            let valueC = parseInt(changed.system.characteristics.body.value);
            let valueM = parseInt(this.system.characteristics.body.max);
            if (valueT != valueC) {
                content = `BODY from ${valueT} to ${valueC}`
            } else {
                content = `BODY changed to ${valueC}`
            }
            if (valueC === valueM) {
                content += " (at max)";
            }

            //this._displayScrollingChange(valueC - valueT, { max: valueM, fill: '0xFF1111' });
            options.displayScrollingChanges.push({ value: valueC - valueT, options: { max: valueM, fill: '0xFF1111' } });
        }

        if (options.hideChatMessage || !options.render) return;

        if (content) {
            const chatData = {
                user: game.user.id, //ChatMessage.getWhisperRecipients('GM'),
                whisper: ChatMessage.getWhisperRecipients("GM"),
                speaker: ChatMessage.getSpeaker({ actor: this }),
                blind: true,
                content: content,
            }
            await ChatMessage.create(chatData)
        }

    }

    async _onUpdate(data, options, userId) {
        super._onUpdate(data, options, userId);

        // If stun was changed and running under triggering users context
        if (data?.system?.characteristics?.stun && userId === game.user.id) {

            if (data.system.characteristics.stun.value <= 0) {
                this.addActiveEffect(HeroSystem6eActorActiveEffects.knockedOutEffect);
            }

            // Mark as defeated in combat tracker
            if (data.type != 'pc' && data.system.characteristics.stun.value < -10) {
                let combatant = game.combat.combatants.find(o => o.actorId === data._id)
                if (combatant && !combatant.defeated) {
                    combatant.update({ defeated: true });
                }
            }

            // Mark as undefeated in combat tracker
            if (data.type != 'pc' && data.system.characteristics.stun.value > -10) {
                let combatant = game.combat?.combatants?.find(o => o.actorId === data._id)
                if (combatant && combatant.defeated) {
                    combatant.update({ defeated: false });
                }
            }

            if (data.system.characteristics.stun.value > 0) {
                this.removeActiveEffect(HeroSystem6eActorActiveEffects.knockedOutEffect);
            }

        }

        // If STR was change check encumbrance
        if (data?.system?.characteristics?.str && userId === game.user.id) {
            this.applyEncumbrancePenalty();
        }

        // Display changes from _preUpdate
        for (let d of options.displayScrollingChanges) {
            this._displayScrollingChange(d.value, d.options);
        }

    }




    async TakeRecovery(asAction) {

        // RECOVERING
        // Characters use REC to regain lost STUN and expended END.
        // This is known as “Recovering” or “taking a Recovery.”
        // When a character Recovers, add his REC to his current
        // STUN and END totals (to a maximum of their full values, of
        // course). Characters get to Recover in two situations: Post-
        // Segment and when they choose to Recover as a Full Phase
        // Action.

        // RECOVERING AS AN ACTION
        // Recovering is a Full Phase Action and occurs at the end of
        // the Segment (after all other characters who have a Phase that
        // Segment have acted). A character who Recovers during a Phase
        // may do nothing else. He cannot even maintain a Constant Power
        // or perform Actions that cost no END or take no time. However,
        // he may take Zero Phase Actions at the beginning of his Phase
        // to turn off Powers, and Persistent Powers that don’t cost END
        // remain in effect.

        let token = this.token
        let speaker = ChatMessage.getSpeaker({ actor: this, token })
        speaker["alias"] = this.name

        // A character who holds his breath does not get to Recover (even
        // on Post-Segment 12)
        if (this.statuses.has("holdingBreath")) {
            const content = this.name + " <i>is holding their breath</i>."
            if (asAction) {
                const chatData = {
                    user: game.user._id,
                    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
                    content: content,
                    speaker: speaker
                }
                await ChatMessage.create(chatData)
            }
            return content
        }

        const chars = this.system.characteristics

        // Shouldn't happen, but you never know
        if (isNaN(parseInt(chars.stun.value))) {
            chars.stun.value = 0
        }
        if (isNaN(parseInt(chars.end.value))) {
            chars.end.value = 0
        }

        let newStun = parseInt(chars.stun.value) + parseInt(chars.rec.value)
        let newEnd = parseInt(chars.end.value) + parseInt(chars.rec.value)

        if (newStun > chars.stun.max) {
            newStun = Math.max(chars.stun.max, parseInt(chars.stun.value)) // possible > MAX (which is OKish)
        }
        let deltaStun = newStun - parseInt(chars.stun.value)

        if (newEnd > chars.end.max) {
            newEnd = Math.max(chars.end.max, parseInt(chars.end.value)) // possible > MAX (which is OKish)
        }
        let deltaEnd = newEnd - parseInt(chars.end.value)

        await this.update({
            'system.characteristics.stun.value': newStun,
            'system.characteristics.end.value': newEnd
        }, { hideChatMessage: true })



        // let content = this.name + ` <span title="
        // Recovering is a Full Phase Action and occurs at the end of
        // the Segment (after all other characters who have a Phase that
        // Segment have acted). A character who Recovers during a Phase
        // may do nothing else. He cannot even maintain a Constant Power
        // or perform Actions that cost no END or take no time. However,
        // he may take Zero Phase Actions at the beginning of his Phase
        // to turn off Powers, and Persistent Powers that don't cost END
        // remain in effect."><i>Takes a Recovery</i></span>`;

        let content = this.name + ` <i>Takes a Recovery</i>`;
        if (deltaEnd || deltaStun) {
            content += `, gaining ${deltaEnd} endurance and ${deltaStun} stun.`;
        } else {
            content += ".";
        }





        // Endurance Reserve Recovery
        if (!asAction) {
            const enduranceReserve = this.items.find(o => o.system.XMLID === "ENDURANCERESERVE");
            if (enduranceReserve) {
                let erValue = parseInt(enduranceReserve.system.value);
                let erMax = parseInt(enduranceReserve.system.max);
                if (enduranceReserve.system.powers) {
                    const power = enduranceReserve.system.powers.find(o => o.XMLID === "ENDURANCERESERVEREC");
                    if (power) {
                        let erRec = parseInt(power.LEVELS);
                        let deltaEndReserve = Math.min(erRec, erMax - erValue);
                        if (deltaEndReserve) {
                            erValue += deltaEndReserve;
                            enduranceReserve.system.LEVELS.value = erValue;
                            updateItemDescription(enduranceReserve);
                            await enduranceReserve.update({ 'system.LEVELS': enduranceReserve.system.LEVELS, 'system.description': enduranceReserve.system.description });
                            content += ` ${enduranceReserve.name} +${deltaEndReserve} END.`;
                        }
                    }
                }
            }
        }

        const chatData = {
            user: game.user._id,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            content: content,
            speaker: speaker
        }

        if (asAction) {
            await ChatMessage.create(chatData)

            // Remove stunned condition.
            // While not technically part of the rules, it is here as a convenience.
            // For example when Combat Tracker isn't being used.
            await this.removeActiveEffect(HeroSystem6eActorActiveEffects.stunEffect);
        }

        return content;
    }

    // When stunned, knockedout, etc you cannot act
    canAct(uiNotice) {

        if (this.statuses.has("knockedOut")) {
            if (uiNotice) ui.notifications.error(`${this.name} is KNOCKED OUT and cannot act.`);
            return false;
        }

        if (this.statuses.has("stunned")) {
            if (uiNotice) ui.notifications.error(`${this.name} is STUNNED and cannot act.`);
            return false;
        }

        if (this.statuses.has("aborted")) {
            if (uiNotice) ui.notifications.error(`${this.name} has ABORTED and cannot act.`);
            return false;
        }

        // A character
        // who is Stunned or recovering from being
        // Stunned can take no Actions, take no Recoveries
        // (except his free Post-Segment 12 Recovery), cannot
        // move, and cannot be affected by Presence Attacks.

        // Recovering from being Stunned requires a Full
        // Phase, and is the only thing the character can do
        // during that Phase.

        if (this.statuses.has("stunned")) {
            if (uiNotice) ui.notifications.error(`${this.name} is STUNNED and cannot act.`);
            return false;
        }
        return true;
    }

    /**
     * Display changes to health as scrolling combat text.
     * Adapt the font size relative to the Actor's HP total to emphasize more significant blows.
     * @param {*} change 
     * @param {*} options 
     */
    _displayScrollingChange(change, options) {
        if (!change) return;
        const tokens = this.getActiveTokens();
        if (!tokens) return;
        const token = tokens[0];
        if (!token) return;
        options = options || {};

        let fontSize = 50;
        if (options.max) {
            fontSize += Math.floor(Math.abs(change) / options.max * fontSize);
        }

        canvas.interface.createScrollingText(token.center, change.signedString(), {
            anchor: (change < 0) ? CONST.TEXT_ANCHOR_POINTS.BOTTOM : CONST.TEXT_ANCHOR_POINTS.TOP,
            direction: (change < 0) ? 1 : 2,
            fontSize: Math.clamped(fontSize, 50, 100),
            fill: options?.fill || "0xFFFFFF",
            stroke: options?.stroke || 0x00000000,
            strokeThickness: 4,
            jitter: 0.25
        });


    }

    strDetails() {
        let strLiftText = '0';
        let strThrow = 0;
        let value = this.system.characteristics.str.value;
        if (value >= 1) { strLiftText = '8kg'; strThrow = 2 }
        if (value >= 2) { strLiftText = '16kg'; strThrow = 3 }
        if (value >= 3) { strLiftText = '25kg'; strThrow = 4 }
        if (value >= 4) { strLiftText = '38kg'; strThrow = 6 }
        if (value >= 5) { strLiftText = '50kg'; strThrow = 8 }
        if (value >= 8) { strLiftText = '75kg'; strThrow = 12 }
        if (value >= 10) { strLiftText = '16kg'; strThrow = 16 }
        if (value >= 13) { strLiftText = '150kg'; strThrow = 20 }
        if (value >= 15) { strLiftText = '200kg'; strThrow = 24 }
        if (value >= 18) { strLiftText = '300kg'; strThrow = 28 }
        if (value >= 20) { strLiftText = '400kg'; strThrow = 32 }
        if (value >= 23) { strLiftText = '600kg'; strThrow = 36 }
        if (value >= 25) { strLiftText = '800kg'; strThrow = 40 }
        if (value >= 28) { strLiftText = '1,200kg'; strThrow = 44 }
        if (value >= 30) { strLiftText = '1,600kg'; strThrow = 48 }
        if (value >= 35) { strLiftText = '3,200kg'; strThrow = 56 }
        if (value >= 40) { strLiftText = '6,400kg'; strThrow = 64 }
        if (value >= 45) { strLiftText = '12.5 tons'; strThrow = 72 }
        if (value >= 50) { strLiftText = '25 tons'; strThrow = 80 }
        if (value >= 55) { strLiftText = '50 tons'; strThrow = 88 }
        if (value >= 60) { strLiftText = '100 tons'; strThrow = 96 }
        if (value >= 65) { strLiftText = '200 tons'; strThrow = 104 }
        if (value >= 70) { strLiftText = '400 tons'; strThrow = 112 }
        if (value >= 75) { strLiftText = '800 tons'; strThrow = 120 }
        if (value >= 80) { strLiftText = '1.6 ktons'; strThrow = 128 }
        if (value >= 85) { strLiftText = '3.2 ktons'; strThrow = 136 }
        if (value >= 90) { strLiftText = '6.4 ktons'; strThrow = 144 }
        if (value >= 95) { strLiftText = '12.5 ktons'; strThrow = 152 }
        if (value >= 100) { strLiftText = '25 ktons'; strThrow = 160 }
        if (value >= 105) { strLiftText = `${50 + Math.floor((value - 105) / 5) * 25} ktons`; strThrow = 168 + Math.floor((value - 105) / 5) * 8 }

        // Get numeric strLiftKg
        let m = strLiftText.replace(",", "").match(/(\d+)kg/)
        let strLiftKg = m ? m[1] : 0;

        m = strLiftText.replace(",", "").match(/(\d+) tons/)
        strLiftKg = m ? m[1] * 1000 : strLiftKg;

        m = strLiftText.replace(",", "").match(/(\d+) ktons/)
        strLiftKg = m ? m[1] * 1000 * 1000 : strLiftKg;




        return { strLiftText, strThrow, strLiftKg };
    }

    async applyEncumbrancePenalty() {
        // Encumbrance (requires permissions to mess with ActiveEffects)
        if (game.user.isGM) {

            const { strLiftKg } = this.strDetails()
            let encumbrance = 0
            const itemsWithWeight = this.items.filter(o => o.system.WEIGHT && o.system.active);
            for (const item of itemsWithWeight) {
                encumbrance += parseFloat(item.system.WEIGHT);
            }

            // encumbrancePercentage
            const equipmentWeightPercentage = (parseInt(game.settings.get(game.system.id, 'equipmentWeightPercentage'))) / 100.0
            encumbrance *= equipmentWeightPercentage

            // Is actor encumbered?
            let dcvDex = 0;
            let move = 0;
            let end = 0;
            if (encumbrance / strLiftKg >= 0.1) {
                dcvDex = -1;
            }
            if (encumbrance / strLiftKg >= 0.25) {
                dcvDex = -2;
                move = -2;
                end = 1;
            }
            if (encumbrance / strLiftKg >= 0.50) {
                dcvDex = -3;
                move = -4;
                end = 2;
            }
            if (encumbrance / strLiftKg >= 0.75) {
                dcvDex = -4;
                move = -8;
                end = 3;
            }
            if (encumbrance / strLiftKg >= 0.90) {
                dcvDex = -5;
                move = -16;
                end = 4;
            }

            const name = `Encumbered ${Math.floor(encumbrance / strLiftKg * 100)}%`
            let prevActiveEffect = this.effects.find(o => o.flags?.encumbrance);
            if (dcvDex < 0 && prevActiveEffect?.flags?.dcvDex != dcvDex) {
                let activeEffect = {

                    name: name,
                    id: 'encumbered',
                    //icon: 'icons/svg/daze.svg', //'systems/hero6efoundryvttv2/icons/encumbered.svg',
                    icon: 'systems/hero6efoundryvttv2/icons/encumbered.svg',
                    changes: [
                        { key: "system.characteristics.dcv.value", value: dcvDex, mode: CONST.ACTIVE_EFFECT_MODES.ADD },
                        { key: "system.characteristics.dex.value", value: dcvDex, mode: CONST.ACTIVE_EFFECT_MODES.ADD },
                        { key: "system.characteristics.running.value", value: move, mode: CONST.ACTIVE_EFFECT_MODES.ADD },
                        { key: "system.characteristics.swimming.value", value: move, mode: CONST.ACTIVE_EFFECT_MODES.ADD },
                        { key: "system.characteristics.leaping.value", value: move, mode: CONST.ACTIVE_EFFECT_MODES.ADD },
                        { key: "system.characteristics.flight.value", value: move, mode: CONST.ACTIVE_EFFECT_MODES.ADD },
                        { key: "system.characteristics.swinging.value", value: move, mode: CONST.ACTIVE_EFFECT_MODES.ADD },
                        { key: "system.characteristics.teleportation.value", value: move, mode: CONST.ACTIVE_EFFECT_MODES.ADD },
                        { key: "system.characteristics.tunneling.value", value: move, mode: CONST.ACTIVE_EFFECT_MODES.ADD },
                    ],
                    origin: this.uuid,
                    duration: {
                        seconds: 3.154e+7 * 100, // 100 years should be close to infinity
                    },
                    flags: {
                        dcvDex: dcvDex,
                        // temporary: true,
                        encumbrance: true,
                    }
                }

                if (prevActiveEffect) {
                    await prevActiveEffect.delete();
                    prevActiveEffect = null;
                }

                await this.createEmbeddedDocuments("ActiveEffect", [activeEffect]);

            }

            if (dcvDex === 0 && prevActiveEffect) {
                await prevActiveEffect.delete();
            } else if (prevActiveEffect && prevActiveEffect.name != name) {
                await prevActiveEffect.update({ 'name': name });
            }
        }
    }

    async FullHealth() {

        // Remove all status effects
        for (let status of this.statuses) {
            let ae = Array.from(this.effects).find(o => o.statuses.has(status))
            await ae.delete();
        }

        // Remove temporary effects
        let tempEffects = Array.from(this.effects).filter(o => parseInt(o.duration?.seconds || 0) > 0)
        for (let ae of tempEffects) {
            await ae.delete();
        }

        // Set Characterstics VALUE to MAX
        for (let char of Object.keys(this.system.characteristics)) {
            let value = parseInt(this.system.characteristics[char].value);
            let max = parseInt(this.system.characteristics[char].max);
            if (value != max) {
                //this.actor.system.characteristics[char].value = max;
                await this.update({ [`system.characteristics.${char}.value`]: max })
            }
        }

        // We just cleared encumbrance, check if it applies again
        this.applyEncumbrancePenalty();

    }

    // Raw base is insufficient for 5e characters
    getCharacteristicBase(key) {
        let powerInfo = getPowerInfo({ xmlid: key.toUpperCase(), actor: this });

        let base = parseInt(powerInfo?.base) || 0;

        if (!this.system.is5e) return base;

        switch (key.toLowerCase()) {

            // Physical Defense (PD) STR/5
            case "pd":
                return base + Math.round(this.system.characteristics.str.core / 5);

            // Energy Defense (ED) CON/5
            case "ed":
                return base + Math.round(this.system.characteristics.con.core / 5);
                break;

            // Speed (SPD) 1 + (DEX/10)   can be fractional
            case "spd":
                return base + 1 + parseFloat(parseFloat(this.system.characteristics.dex.core / 10).toFixed(1))

            // Recovery (REC) (STR/5) + (CON/5)
            case "rec":
                return base + Math.round(this.system.characteristics.str.core / 5) + Math.round(this.system.characteristics.con.core / 5);

            // Endurance (END) 2 x CON
            case "end":
                return base + Math.round(this.system.characteristics.con.core * 2);

            // Stun (STUN) BODY+(STR/2)+(CON/2) 
            case "stun":
                return base + Math.round(this.system.characteristics.body.core) + Math.round(this.system.characteristics.str.core / 2) + Math.round(this.system.characteristics.con.core / 2);

            // Base OCV & DCV = Attacker’s DEX/3
            case "ocv":
            case "dcv":
                return Math.round(this.system.characteristics.dex.core / 3);

            //Base Ego Combat Value = EGO/3
            case "omcv":
            case "dmcv":
                return Math.round(this.system.characteristics.ego.core / 3);

            case "leaping":
                const str = parseInt(this.system.characteristics.str.core)
                let value = 0;
                if (str >= 3) value = 0.5
                if (str >= 5) value = 1
                if (str >= 8) value = 1.5
                if (str >= 10) value = 2
                if (str >= 13) value = 2.5
                if (str >= 15) value = 3
                if (str >= 18) value = 3.5
                if (str >= 20) value = 4
                if (str >= 23) value = 4.5
                if (str >= 25) value = 5
                if (str >= 28) value = 5.5
                if (str >= 30) value = 6
                if (str >= 35) value = 7
                if (str >= 40) value = 8
                if (str >= 45) value = 9
                if (str >= 50) value = 10
                if (str >= 55) value = 11
                if (str >= 60) value = 12
                if (str >= 65) value = 13
                if (str >= 70) value = 14
                if (str >= 75) value = 15
                if (str >= 80) value = 16
                if (str >= 85) value = 17
                if (str >= 90) value = 18
                if (str >= 95) value = 19
                if (str >= 100) value = 20 + Math.floor((str - 100) / 5)
                return value;

        }

        return base;

        //     const figuredChanges = {}
        //     figuredChanges[`system.is5e`] = true  // used in item-attack.js to modify killing attack stun multiplier

        //     // One major difference between 5E and 6E is figured characteristics.

        //     // Physical Defense (PD) STR/5
        //     const pdLevels = this.actor.system.characteristics.pd.max - CONFIG.HERO.characteristicDefaults5e.pd;
        //     const pdFigured = Math.round(this.actor.system.characteristics.str.max / 5)
        //     figuredChanges[`system.characteristics.pd.max`] = pdLevels + pdFigured
        //     figuredChanges[`system.characteristics.pd.value`] = pdLevels + pdFigured
        //     figuredChanges[`system.characteristics.pd.base`] = pdFigured //this.actor.system.characteristics.pd.base + pdFigured
        //     figuredChanges[`system.characteristics.pd.core`] = pdLevels + pdFigured
        //     figuredChanges[`system.characteristics.pd.figured`] = pdFigured

        //     // Energy Defense (ED) CON/5
        //     const edLevels = this.actor.system.characteristics.ed.max - CONFIG.HERO.characteristicDefaults5e.ed;
        //     const edFigured = Math.round(this.actor.system.characteristics.con.max / 5)
        //     figuredChanges[`system.characteristics.ed.max`] = edLevels + edFigured
        //     figuredChanges[`system.characteristics.ed.value`] = edLevels + edFigured
        //     figuredChanges[`system.characteristics.ed.base`] = edFigured //this.actor.system.characteristics.ed.base + edFigured
        //     figuredChanges[`system.characteristics.ed.core`] = edLevels + edFigured
        //     figuredChanges[`system.characteristics.ed.figured`] = edFigured


        //     // Speed (SPD) 1 + (DEX/10)   can be fractional
        //     const spdLevels = this.actor.system.characteristics.spd.max - CONFIG.HERO.characteristicDefaults5e.spd;
        //     const spdFigured = 1 + parseFloat(parseFloat(this.actor.system.characteristics.dex.max / 10).toFixed(1))
        //     figuredChanges[`system.characteristics.spd.max`] = Math.floor(spdLevels + spdFigured)
        //     figuredChanges[`system.characteristics.spd.value`] = Math.floor(spdLevels + spdFigured)
        //     figuredChanges[`system.characteristics.spd.base`] = spdFigured //this.actor.system.characteristics.spd.base + spdFigured
        //     figuredChanges[`system.characteristics.spd.core`] = Math.floor(spdLevels + spdFigured)
        //     figuredChanges[`system.characteristics.spd.figured`] = spdFigured
        //     figuredChanges[`system.characteristics.spd.realCost`] = Math.ceil((this.actor.system.characteristics.spd.max - spdFigured) * CONFIG.HERO.characteristicCosts5e.spd)


        //     // Recovery (REC) (STR/5) + (CON/5)
        //     const recLevels = this.actor.system.characteristics.rec.max - CONFIG.HERO.characteristicDefaults5e.rec;
        //     const recFigured = Math.round(this.actor.system.characteristics.str.max / 5) + Math.round(this.actor.system.characteristics.con.max / 5)
        //     figuredChanges[`system.characteristics.rec.max`] = recLevels + recFigured
        //     figuredChanges[`system.characteristics.rec.value`] = recLevels + recFigured
        //     figuredChanges[`system.characteristics.rec.base`] = recFigured //this.actor.system.characteristics.rec.base + recFigured
        //     figuredChanges[`system.characteristics.rec.core`] = recLevels + recFigured
        //     figuredChanges[`system.characteristics.rec.figured`] = recFigured
        //     figuredChanges[`system.characteristics.red.realCost`] = recLevels * CONFIG.HERO.characteristicCosts5e.red

        //     // Endurance (END) 2 x CON
        //     const endLevels = this.actor.system.characteristics.end.max - CONFIG.HERO.characteristicDefaults5e.end;
        //     const endFigured = Math.round(this.actor.system.characteristics.con.max * 2)
        //     figuredChanges[`system.characteristics.end.max`] = endLevels + endFigured
        //     figuredChanges[`system.characteristics.end.value`] = endLevels + endFigured
        //     figuredChanges[`system.characteristics.end.base`] = endFigured //this.actor.system.characteristics.end.base + endFigured
        //     figuredChanges[`system.characteristics.end.core`] = endLevels + endFigured
        //     figuredChanges[`system.characteristics.end.figured`] = endFigured


        //     // Stun (STUN) BODY+(STR/2)+(CON/2) 
        //     const stunLevels = this.actor.system.characteristics.stun.max - CONFIG.HERO.characteristicDefaults5e.stun;
        //     const stunFigured = this.actor.system.characteristics.body.max + Math.round(this.actor.system.characteristics.str.max / 2) + Math.round(this.actor.system.characteristics.con.max / 2)
        //     figuredChanges[`system.characteristics.stun.max`] = stunLevels + stunFigured
        //     figuredChanges[`system.characteristics.stun.value`] = stunLevels + stunFigured
        //     figuredChanges[`system.characteristics.stun.base`] = stunFigured //this.actor.system.characteristics.stun.base + stunFigured
        //     figuredChanges[`system.characteristics.stun.core`] = stunLevels + stunFigured
        //     figuredChanges[`system.characteristics.stun.figured`] = stunFigured
        //     figuredChanges[`system.characteristics.stun.realCost`] = stunLevels * CONFIG.HERO.characteristicCosts5e.stun


        //     // Base OCV & DCV = Attacker’s DEX/3
        //     const baseCv = Math.round(this.actor.system.characteristics.dex.max / 3)
        //     figuredChanges[`system.characteristics.ocv.max`] = baseCv // + this.actor.system.characteristics.ocv.max - this.actor.system.characteristics.ocv.base
        //     figuredChanges[`system.characteristics.ocv.value`] = baseCv // + this.actor.system.characteristics.ocv.max - this.actor.system.characteristics.ocv.base
        //     figuredChanges[`system.characteristics.ocv.base`] = 0 //baseCv + this.actor.system.characteristics.ocv.max - this.actor.system.characteristics.ocv.base
        //     figuredChanges[`system.characteristics.dcv.max`] = baseCv // + this.actor.system.characteristics.dcv.max - this.actor.system.characteristics.dcv.base
        //     figuredChanges[`system.characteristics.dcv.value`] = baseCv //+ this.actor.system.characteristics.dcv.max - this.actor.system.characteristics.dcv.base
        //     figuredChanges[`system.characteristics.dcv.base`] = 0 //baseCv + this.actor.system.characteristics.dcv.max - this.actor.system.characteristics.dcv.base
        //     figuredChanges[`system.characteristics.ocv.realCost`] = 0
        //     figuredChanges[`system.characteristics.dcv.realCost`] = 0

        //     //Base Ego Combat Value = EGO/3
        //     const baseEcv = Math.round(this.actor.system.characteristics.ego.max / 3)
        //     figuredChanges[`system.characteristics.omcv.max`] = baseEcv //+ this.actor.system.characteristics.omcv.max - this.actor.system.characteristics.omcv.base
        //     figuredChanges[`system.characteristics.omcv.value`] = baseEcv //+ this.actor.system.characteristics.omcv.max - this.actor.system.characteristics.omcv.base
        //     figuredChanges[`system.characteristics.omcv.base`] = 0 //baseEcv + this.actor.system.characteristics.omcv.max - this.actor.system.characteristics.omcv.base
        //     figuredChanges[`system.characteristics.dmcv.max`] = baseEcv //+ this.actor.system.characteristics.dmcv.max - this.actor.system.characteristics.dmcv.base
        //     figuredChanges[`system.characteristics.dmcv.value`] = baseEcv //+ this.actor.system.characteristics.dmcv.max - this.actor.system.characteristics.dmcv.base
        //     figuredChanges[`system.characteristics.dmcv.base`] = 0 //baseEcv + this.actor.system.characteristics.dmcv.max - this.actor.system.characteristics.dmcv.base
        //     figuredChanges[`system.characteristics.omcv.realCost`] = 0
        //     figuredChanges[`system.characteristics.dmcv.realCost`] = 0

        //     await this.actor.update(figuredChanges, { render: false }, { hideChatMessage: true })
        //}


    }

    async calcCharacteristicsCost() {
        let powers = getCharactersticInfoArrayForActor(this);

        let changes = {};
        for (const powerInfo of powers) {
            let key = powerInfo.key.toLowerCase();
            let characteistic = this.system.characteristics[key];
            let core = parseInt(characteistic?.core) || 0;
            let base = this.getCharacteristicBase(key);
            let levels = core - base;
            let cost = Math.round(levels * (powerInfo.cost || 0))

            // 5e hack for fractional speed
            if (key === 'spd' && cost < 0) {
                cost = Math.ceil(cost / 10);
            }

            if (characteistic.realCost != cost) {
                changes[`system.characteristics.${key}.realCost`] = cost;
                this.system.characteristics[key].realCost = cost;
            }
            // changes[`system.characteristics.${key}.basePointsPlusAdders`] = cost
            // changes[`system.characteristics.${key}.realCost`] = cost
            // changes[`system.characteristics.${key}.activePoints`] = cost
        }
        if (Object.keys(changes).length > 0 && this.id) {
            await this.update(changes);
        }
        return
    }

    getActiveConstantItems() {
        let results = []
        for (let item of this.items.filter(o => o.system.active)) {
            let duration = getPowerInfo({ xmlid: item.system.XMLID, actor: this })?.duration
            if (duration === "constant") {
                results.push(item)
            } else {
                const NONPERSISTENT = item.system.modifiers.find(o => o.XMLID === "NONPERSISTENT")
                if (NONPERSISTENT) {
                    results.push(item)
                }
            }

        }
        return results
    }

    getConstantEffects() {
        return Array.from(this.allApplicableEffects()).filter(o => !o.duration.duration && o.statuses.size === 0 && (!o.flags?.XMLID || getPowerInfo({ xmlid: o.flags?.XMLID, actor: this.actor })?.duration != 'persistent')).sort((a, b) => a.name.localeCompare(b.name))
    }

    getPersistentEffects() {
        return Array.from(this.allApplicableEffects()).filter(o => !o.duration.duration && o.statuses.size === 0 && o.flags?.XMLID && getPowerInfo({ xmlid: o.flags?.XMLID, actor: this.actor })?.duration === 'persistent').sort((a, b) => a.name.localeCompare(b.name))
    }


    async uploadFromXml(xml) {

        // Convert xml string to xml document (if necessary)
        if (typeof xml === "string") {
            const parser = new DOMParser()
            xml = parser.parseFromString(xml.trim(), 'text/xml')
        }

        // Remove all existing effects
        await this.deleteEmbeddedDocuments("ActiveEffect", this.effects.map(o => o.id))

        // Remove all items from
        await this.deleteEmbeddedDocuments("Item", Array.from(this.items.keys()))



        let changes = {}


        // Reset system propety to default
        const _actor = await HeroSystem6eActor.create({
            name: 'Test Actor',
            type: this.type,
        }, { temporary: true })
        const _system = _actor.system

        const schemaKeys = Object.keys(_system)

        for (const key of Object.keys(this.system)) {
            if (!schemaKeys.includes(key)) {
                changes[`system.-=${key}`] = null
            }
        }
        if (this.id) {
            await this.update(changes)
        }
        changes = {}

        // Convert XML into JSON
        const heroJson = {};
        HeroSystem6eActor._xmlToJsonNode(heroJson, xml.children)


        // CHARACTERISTICS
        if (heroJson.CHARACTER?.CHARACTERISTICS) {
            for (const [key, value] of Object.entries(heroJson.CHARACTER.CHARACTERISTICS)) {
                changes[`system.${key}`] = value
                this.system[key] = value
                //changes[`system.characteristics.${ key.toLowerCase() } `] = value
            }
            delete heroJson.CHARACTER.CHARACTERISTICS
        }

        // ITEMS
        for (let itemTag of HeroSystem6eItem.ItemXmlTags) {
            if (heroJson.CHARACTER[itemTag]) {
                for (let system of heroJson.CHARACTER[itemTag]) {
                    //let system = Object.values(itemJson)[0]
                    let itemData = {
                        name: system.NAME || system?.ALIAS || system?.XMLID || itemTag,
                        type: itemTag.toLowerCase().replace(/s$/, ''),
                        system: system,
                    }
                    if (this.id) {
                        const item = await HeroSystem6eItem.create(itemData, { parent: this })
                        await item._postUpload()
                    } else {

                        const item = await HeroSystem6eItem.create(itemData, { temporary: true, parent: this })
                        //item.id = item.system.XMLID + item.system.POSITION
                        this.items.set(item.system.XMLID + item.system.POSITION, item)
                        await item._postUpload()
                    }

                }
                delete heroJson.CHARACTER[itemTag]
            }
        }

        // MANEUVERS
        for (const entry of Object.entries(CONFIG.HERO.combatManeuvers)) {
            const name = entry[0];
            const v = entry[1];
            const PHASE = v[0];
            const OCV = v[1];
            const DCV = v[2];
            const EFFECT = v[3];
            const attack = v[4];
            const XMLID = name.toUpperCase().replace(" ", ""); // A fake XMLID
            const itemData = {
                name,
                type: 'maneuver',
                system: {
                    PHASE,
                    OCV,
                    DCV,
                    EFFECT,
                    active: false,
                    description: EFFECT,
                    XMLID,
                }
            }

            if (this.id) { // Skip if tempoary actor (Quench)
                const item = await HeroSystem6eItem.create(itemData, { parent: this })
                if (attack) {
                    await item.makeAttack()
                }
                await item._postUpload()
            }
        }

        // Actor Image
        if (heroJson.CHARACTER.IMAGE) {
            const filename = heroJson.CHARACTER.IMAGE?.FileName
            try {
                const extension = filename.split('.').pop()
                const base64 = "data:image/" + extension + ";base64," + xml.getElementsByTagName('IMAGE')[0].textContent
                const path = "worlds/" + game.world.id + "/tokens"
                try {
                    await FilePicker.createDirectory("user", path)
                } catch (e) {
                    //console.log(e)
                }
                let oldImage = null
                try {
                    //let files = (await FilePicker.browse("user", path)).files
                    oldImage = (await FilePicker.browse("user", path)).files.includes(encodeURI(path + "/" + filename))
                } catch (e) {
                    //console.log(e)
                }
                if (!oldImage) { //this.img.indexOf(filename) == -1) {
                    await ImageHelper.uploadBase64(base64, filename, path)
                    changes['img'] = path + '/' + filename

                    // Update any tokens images that might exist
                    for (const token of this.getActiveTokens()) {
                        await token.document.update({ 'texture.src': path + '/' + filename })
                    }
                }
            } catch (e) {
                console.log(e)
                ui.notifications.warn(`${this.name} failed to upload ${filename}.`);
            }
            delete heroJson.CHARACTER.IMAGE
        }


        // Non ITEMS stuff in CHARACTER
        changes = {
            ...changes,
            'system.CHARACTER': heroJson.CHARACTER,
            'system.versionHeroSystem6eUpload': game.system.version,
            'name': heroJson.CHARACTER.CHARACTER_INFO.CHARACTER_NAME
        }
        this.system.CHARACTER = heroJson.CHARACTER
        this.system.versionHeroSystem6eUpload = game.system.version
        this.name = heroJson.CHARACTER.CHARACTER_INFO.CHARACTER_NAME

        if (this.prototypeToken) {
            changes[`prototypeToken.name`] = changes.name
            changes[`prototypeToken.img`] = changes.img
        }


        // Save all our changes (unless tempoary actor/quench)
        if (this.id) {
            await this.update(changes)
        }


        // Set base values to HDC LEVELs and calculate costs of things.
        await this._postUpload()
        //await this._resetCharacteristicsFromHdc()
        //await this.calcCharacteristicsCost();
        //await CalcActorRealAndActivePoints(this) // move to Actor?

    }


    static _xmlToJsonNode(json, children) {

        if (children.length === 0) return;


        for (const child of children) {
            const tagName = child.tagName
            //console.log(tagName, child?.attributes?.['XMLID']?.value ?? "")

            let jsonChild = {}
            if (child.childElementCount == 0 && child.attributes.length == 0) {
                jsonChild = child.textContent
            }
            if (HeroSystem6eItem.ItemXmlTags.includes(child.tagName)) {
                // || 
                //(HeroSystem6eItem.ItemXmlChildTags.includes(child.tagName) && !HeroSystem6eItem.ItemXmlTags.includes(child.parentElement.tagName) )) {
                jsonChild = []
            } else {
                for (const attribute of child.attributes) {
                    switch (attribute.value) {
                        case "Yes":
                        case "YES":
                            jsonChild[attribute.name] = true
                            break;
                        case "No":
                        case "NO":
                            jsonChild[attribute.name] = false
                            break;
                        case "GENERIC_OBJECT":
                            jsonChild[attribute.name] = child.tagName.toUpperCase() // e.g. MULTIPOWER
                            break;
                        default:
                            jsonChild[attribute.name] = attribute.value
                    }

                }
            }

            if (child.children.length > 0) {
                this._xmlToJsonNode(jsonChild, child.children)
            }

            //console.log(tagName, child?.attributes?.['XMLID']?.value ?? "")
            //if (HeroSystem6eActor.ItemXmlTags.includes(child.parentElement?.tagName)) {
            if (HeroSystem6eItem.ItemXmlChildTags.includes(child.tagName) && !HeroSystem6eItem.ItemXmlTags.includes(child.parentElement?.tagName)) {
                json[tagName] ??= []
                json[tagName].push(jsonChild)
            } else if (Array.isArray(json)) {
                //if (isEmpty(json)) json = [] //json[child.parentElement.tagName] ??= []
                json.push(jsonChild)
            } else {
                json[tagName] = jsonChild
            }
        }
    }

    async _resetCharacteristicsFromHdc() {
        const changes = {}
        for (const [key, char] of Object.entries(this.system.characteristics)) {
            let powerInfo = getPowerInfo({ xmlid: key.toUpperCase(), actor: this });
            let value = parseInt(char.LEVELS || 0) + parseInt(powerInfo?.base || 0)
            changes[`system.characteristics.${key.toLowerCase()}.core`] = value

            changes[`system.characteristics.${key.toLowerCase()}.max`] = value
            changes[`system.characteristics.${key.toLowerCase()}.value`] = value
        }
        await this.update(changes)
    }

    async _postUpload() {
        const changes = {}
        let changed = false;

        // is5e
        if (this.system.CHARACTER?.TEMPLATE) {
            if (this.system.CHARACTER.TEMPLATE.includes("builtIn.") && !this.system.CHARACTER.TEMPLATE.includes("6E.") && !this.system.is5e) {
                changes[`system.is5e`] = true
                this.system.is5e = true
            }
            if (this.system.CHARACTER.TEMPLATE.includes("builtIn.") && this.system.CHARACTER.TEMPLATE.includes("6E.") && this.system.is5e) {
                changes[`system.is5e`] = false
                this.system.is5e = false
            }
        }
        if (this.system.COM && !this.system.is5e) {
            changes[`system.is5e`] = true
            this.system.is5e = true
        }

        for (const key of Object.keys(this.system.characteristics)) {
            const powerInfo = getPowerInfo({ xmlid: key.toUpperCase(), actor: this });
            let newValue = parseInt(this.system?.[key.toUpperCase()]?.LEVELS || 0)
            newValue += this.getCharacteristicBase(key)
            if (this.system.characteristics[key].max != newValue) {
                changes[`system.characteristics.${key.toLowerCase()}.max`] = Math.floor(newValue)
                this.system.characteristics[key.toLowerCase()].max = Math.floor(newValue)
                changed = true
            }
            if (this.system.characteristics[key].value != newValue) {
                changes[`system.characteristics.${key.toLowerCase()}.value`] = Math.floor(newValue)
                this.system.characteristics[key.toLowerCase()].value = Math.floor(newValue)
                changed = true
            }
            if (this.system.characteristics[key].core != newValue) {
                changes[`system.characteristics.${key.toLowerCase()}.core`] = newValue
                this.system.characteristics[key.toLowerCase()].core = newValue
                changed = true
            }

            // Rollable Characteristics
            this.updateRollable(key.toLowerCase())

        }

        // Save changes
        if (changed && this.id) {
            await this.update(changes)
        }




        // Combat Skill Levels - Enumerate attacks that use OCV
        for (let cslItem of this.items.filter(o => ["MENTAL_COMBAT_LEVELS", "COMBAT_LEVELS"].includes(o.system.XMLID))) {
            let _ocv = 'ocv'
            if (cslItem.system.XMLID === "MENTAL_COMBAT_LEVELS") {
                _ocv = 'omcv'
            }

            let attacks = {}
            let checkedCount = 0;

            for (let attack of this.items.filter(o =>
                (o.type == 'attack' || o.system.subType == 'attack') &&
                o.system.uses === _ocv
            )) {
                let checked = false;

                // Attempt to determine if attack should be checked
                if (cslItem.system.OPTION_ALIAS.toLowerCase().indexOf(attack.name.toLowerCase()) > -1) {
                    checked = true;
                }

                if (cslItem.system.OPTION === "HTH" && (
                    attack.system.XMLID === "HTH" ||
                    attack.system.XMLID === "HANDTOHANDATTACK" ||
                    attack.system.XMLID === "HKA" ||
                    attack.system.XMLID === "MANEUVER" ||
                    (attack.type === "maneuver" && !attack.system.EFFECT?.match(/throw/i))
                )
                ) {
                    checked = true;
                }

                if (cslItem.system.OPTION === "RANGED" && (
                    attack.system.XMLID === "BLAST" ||
                    attack.system.XMLID === "RKA"
                )
                ) {
                    checked = true;
                }

                if (cslItem.system.OPTION === "ALL") {
                    checked = true;
                }

                if (cslItem.system.OPTION === "TIGHT") {

                    // up to three
                    if (cslItem.system.XMLID === "COMBAT_LEVELS" && attack.type != "maneuver" && checkedCount < 3) {
                        checked = true;
                    }

                    // up to three
                    if (cslItem.system.XMLID === "MENTAL_COMBAT_LEVELS" && checkedCount < 3) {
                        checked = true;
                    }
                }


                if (cslItem.system.OPTION === "BROAD") {

                    // A large group is more than 3 but less than ALL (whatever that means).
                    // For now just assume all (non maneuvers).
                    if (cslItem.system.XMLID === "COMBAT_LEVELS" && attack.type != "maneuver") {
                        checked = true;
                    }

                    // For mental BROAD is actuallyl equal to ALL
                    if (cslItem.system.XMLID === "MENTAL_COMBAT_LEVELS") {
                        checked = true;
                    }
                }

                attacks[attack.id] = checked;

                if (checked) checkedCount++;

            }

            // Make sure at least one attacked is checked
            // if (checkedCount === 0 && Object.keys(attacks).length > 0) {
            //     attacks[Object.keys(attacks)[0]] = true;
            // }

            if (cslItem._id) {
                await cslItem.update({ 'system.attacks': attacks }, { hideChatMessage: true });
            }
        }


        await this.calcCharacteristicsCost()
        //await CalcActorRealAndActivePoints(this)
        await this.CalcActorRealAndActivePoints()

        this.render()

        // Update actor sidebar (needed when name is changed)
        ui.actors.render()

        //ui.notifications.info(`${this.name} upload complete`)

        //Hooks.call('hdcUpload')

        return changed

    }

    updateRollable(key) {
        const characteristic = this.system.characteristics[key]
        if (characteristic.type === 'rollable') {
            if (characteristic.value === 0) {
                characteristic.roll = 8
            } else if (characteristic.value <= 2) {
                characteristic.roll = 9
            } else if (characteristic.value <= 7) {
                characteristic.roll = 10
            } else if (characteristic.value <= 12) {
                characteristic.roll = 11
            } else if (characteristic.value <= 17) {
                characteristic.roll = 12
            } else if (characteristic.value <= 22) {
                characteristic.roll = 13
            } else if (characteristic.value <= 27) {
                characteristic.roll = 14
            } else if (characteristic.value <= 32) {
                characteristic.roll = 15
            } else if (characteristic.value <= 37) {
                characteristic.roll = 16
            } else if (characteristic.value <= 42) {
                characteristic.roll = 17
            } else if (characteristic.value <= 47) {
                characteristic.roll = 18
            } else if (characteristic.value <= 52) {
                characteristic.roll = 19
            } else {
                characteristic.roll = 20
            }
        }
    }


    async CalcActorRealAndActivePoints() {
        // Calculate realCost & Active Points for bought as characteristics
        let realCost = 0;
        let activePoints = 0;

        this.system.pointsDetail = {
        }

        const powers = getCharactersticInfoArrayForActor(this);
        for (const powerInfo of powers) {
            realCost += parseInt(this.system.characteristics[powerInfo.key.toLowerCase()]?.realCost || 0);
        }
        this.system.pointsDetail.characteristics = realCost

        activePoints = realCost

        // Add in costs for items
        // let _splitCost = {}
        for (let item of this.items.filter(o => o.type != 'attack' && o.type != 'defense' && o.type != 'movement' && o.type != 'complication' && !o.system.duplicate)) {

            // Equipment is typically purchased with money, not character points
            if (item.type != 'equipment') {
                const _realCost = parseInt(item.system?.realCost || 0);

                if (_realCost != 0) {
                    realCost += _realCost
                    this.system.pointsDetail[item.type] ??= 0
                    this.system.pointsDetail[item.type] += parseInt(item.system?.realCost || 0);
                }

            }
            activePoints += parseInt(item.system?.activePoints || 0);

            //_splitCost[item.type] = (_splitCost[item.type] || 0) + (item.system?.realCost || 0)
        }

        this.system.realCost = realCost
        this.system.activePoints = activePoints
        if (this.id) {
            await this.update({
                'system.points': realCost,
                'system.activePoints': activePoints,
                'system.pointsDetail': this.system.pointsDetail
            }, { render: false }, { hideChatMessage: true });
        }

    }

}


