import { HEROSYS } from '../herosystem6e.js'
import { HeroSystem6eItem } from '../item/item.js'
import { HeroSystem6eAttackCard } from '../card/attack-card.js'
import { createSkillPopOutFromItem } from '../item/skill.js'
import { editSubItem, deleteSubItem, getItemCategory, isPowerSubItem, splitPowerId, subItemUpdate } from '../powers/powers.js'
import { enforceManeuverLimits } from '../item/manuever.js'
import { presenceAttackPopOut } from '../utility/presence-attack.js'
import { HERO } from '../config.js'
import { uploadBasic, uploadTalent, uploadSkill, uploadAttack } from '../utility/upload_hdc.js'
import * as Dice from '../dice.js'

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class HeroSystem6eActorSheet extends ActorSheet {
  /** @override */
  static get defaultOptions() {
    const path = 'systems/hero6efoundryvttv2/templates/actor/actor-sheet.hbs'

    const options = super.defaultOptions;

    const newOptions =  {
      ...options,
      //An array of CSS string classes to apply to the rendered HTML
      classes: [...options.classes, 'herosystem6e', 'sheet', 'actor'],
      //The default HTML template path to render for this Application
      template: path,
      //The default pixel width for the rendered HTML
      width: 800,
      //The default pixel height for the rendered HTML
      height: 700,
      //Whether the rendered application can be drag-resized (popOut only)
      resizable: false,
      //An array of tabbed container configurations which should be enabled for the application.
      tabs: [
        { navSelector: '.sheet-item-tabs', contentSelector: '.sheet-body', initial: 'description' },
        { navSelector: '.sheet-edit-tabs', contentSelector: '.sheet-mode', initial: 'play' }
      ],
      //A list of unique CSS selectors which target containers that should have their vertical scroll positions preserved during a re-render.
      scrollY: [ ...options.scrollY, ".defenses-group" ],

      heroEditable: false,

    }
    //console.log(newOptions)
    return newOptions
  }

  /** @override */
  getData() {
    const data = super.getData()

    // Prepare items (for all actor types)
    // May need exception for vehicles/robots when/if implemented

    // if (this.actor.type === 'character') {
    this._prepareCharacterItems(data)
    // }



    return data
  }

  async _updateObject(event, formData) {
    const expandedData = foundry.utils.expandObject(formData);

    await this.actor.update(expandedData)

    this.render();
  }

  /**
  * Organize and classify Items for Character sheets.
  *
  * @param {Object} actorData The actor to prepare.
  *
  * @return {undefined}
  */
  _prepareCharacterItems(sheetData) {
    const actorData = sheetData.actor

    const characteristicSet = []

    for (const [key, characteristic] of Object.entries(actorData.system.characteristics)) {
      characteristic.key = key
      characteristic.name = CONFIG.HERO.characteristics[key]

      let type = 'undefined'

      if (characteristic.type !== undefined) {
        type = characteristic.type
      }

      if (characteristicSet[type] === undefined) {
        characteristicSet[type] = []
      }

      if (type === 'rollable') {
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

      characteristicSet[type].push(characteristic)
    }

    // Initialize containers.
    const skills = []
    const attacks = []
    const defenses = []
    const powers = []
    const equipment = []
    const maneuvers = []
    const movement = []
    const perk = []
    const talent = []
    const complication = []
    const martialart = []

    // Iterate through items, allocating to containers
    // let totalWeight = 0;
    for (const item of sheetData.items) {
      // const item = i.system

      item.img = item.img || DEFAULT_TOKEN
      // Append to skills.
      if (item.type === 'skill') {
        HeroSystem6eActorSheet._prepareSkillItem(item, this.actor)
        skills.push(item)
      } else if (item.type === 'defense') {
        HeroSystem6eActorSheet._prepareDefenseItem(item)
        defenses.push(item)
      } else if (item.type === 'attack') {
        HeroSystem6eActorSheet._prepareAttackItem(item)
        attacks.push(item)
      } else if (item.type === 'power') {
        const subItems = HeroSystem6eActorSheet._preparePowerItem(item, this.actor)

        skills.push(...subItems.skills)
        attacks.push(...subItems.attacks)
        defenses.push(...subItems.defenses)
        maneuvers.push(...subItems.maneuvers)
        movement.push(...subItems.movement)

        powers.push({ ...item, showToggle: this.actor.effects.find(o => o.origin === this.actor.items.get(item._id).uuid) })
      } else if (item.type === 'equipment') {
        equipment.push(item)
      } else if (item.type === 'maneuver') {
        maneuvers.push(item)
      } else if (item.type === 'movement') {
        movement.push(item)
      } else if (item.type === 'perk') {
        perk.push(item)
      } else if (item.type === 'talent') {
        talent.push(item)
      } else if (item.type === 'complication') {
        complication.push(item)
      } else if (item.type === 'martialart') {
        martialart.push(item)
      }
    }

    // Disposition
    let disposition = 'neutral'
    if ((sheetData.options?.token?.disposition || sheetData.actor.prototypeToken.disposition) == CONST.TOKEN_DISPOSITIONS.FRIENDLY) disposition = 'friendly'
    if ((sheetData.options?.token?.disposition || sheetData.actor.prototypeToken.disposition) == CONST.TOKEN_DISPOSITIONS.HOSTILE) disposition = 'hostile'

    // ActorLink (typically for unique tokens)
    let actorLink = "unlinked"
    if ((sheetData.options?.token?.actorLink || sheetData.actor.prototypeToken.actorLink)) actorLink = "linked"

    // actorTypeChoices extra info
    const choicesExtraInfo = " (" + disposition + "/" + actorLink + ")"

    // Assign and return
    sheetData.skills = skills
    sheetData.defenses = defenses
    sheetData.attacks = attacks
    sheetData.powers = powers
    sheetData.equipment = equipment
    sheetData.maneuvers = maneuvers
    sheetData.movement = movement
    sheetData.perk = perk
    sheetData.talent = talent
    sheetData.complication = complication
    sheetData.martialart = martialart
    sheetData.characteristicSet = characteristicSet
    sheetData.system = actorData.system
    sheetData.actorTypeChoices = { pc: "PC" + choicesExtraInfo, npc: "NPC" + choicesExtraInfo }
    sheetData.isGM = game.user.isGM



    if (game.settings.get('hero6efoundryvttv2', 'hitLocTracking') === 'all') {
      sheetData.hitLocTracking = true
    } else {
      sheetData.hitLocTracking = false
    }

    sheetData.edit = false
  }

  static _prepareSkillItem(item, actor) {
    item.characteristic = CONFIG.HERO.skillCharacteristics[item.system.characteristic]

    // determine Skill Roll
    let roll;
    if (item.system.state === 'untrained') {
      roll = '6-'
    } if (item.system.state === 'everyman') {
      roll = '8-'
    } else if (item.system.state === 'familiar') {
      roll = '8-'
    } else if (item.system.state === 'proficient') {
      roll = '10-'
    } else if (item.system.state === 'trained') {
      const charValue = ((item.system.characteristic.toLowerCase() !== 'general') && (item.system.characteristic.toLowerCase() != '')) ?
        actor.system.characteristics[`${item.system.characteristic.toLowerCase()}`].value : 0

      const rollVal = 9 + Math.round(charValue / 5) + parseInt(item.system.levels)
      roll = rollVal.toString() + '-'
    } else if (item.system.state === 'noroll') {
      roll = "n/a"
    }

    if (!isPowerSubItem(item._id)) {
      actor.items.get(item._id).update({ [`system.roll`]: roll })
    } else {
      const category = getItemCategory(item._id, actor)
      const [powerItemId, subItemId] = splitPowerId(item._id)

      actor.items.get(powerItemId).update({ [`system.subItems.${category}.${subItemId}.system.roll`]: roll })
    }

    item.roll = roll
    item.rollable = item.system.rollable
  }

  static _prepareDefenseItem(item) {
    item.defenseType = CONFIG.HERO.defenseTypes[item.system.defenseType]
    item.active = item.system.active
    item.resistant = CONFIG.HERO.bool[item.system.resistant]
    item.hardened = item.system.hardened
    item.impenetrable = item.system.impenetrable
    item.value = item.system.value
  }

  static _prepareAttackItem(item) {
    item.system = item.system
    item.defense = CONFIG.HERO.defenseTypes[item.system.defense]
    item.piercing = item.system.piercing
    item.penetrating = item.system.penetrating
    item.advantages = item.system.advantages
    item.uses = CONFIG.HERO.attacksWith[item.system.uses]
    item.targets = CONFIG.HERO.defendsWith[item.system.targets]
    item.end = item.system.end
    item.toHitMod = item.system.toHitMod
    //item.knockbackMultiplier = item.system.knockbackMultiplier
    item.usesStrength = item.system.usesStrength

    item.damage = item.system.dice

    switch (item.system.extraDice) {
      case 'zero':
        item.damage += 'D6'
        break
      case 'pip':
        item.damage += 'D6+1'
        break
      case 'half':
        item.damage += '.5D6'
        break
    }

    if (item.system.killing) {
      item.damage += 'K'
    } else {
      item.damage += 'N'
    }
  }

  static _preparePowerItem(item, actor) {
    const skills = []
    const attacks = []
    const defenses = []
    const maneuvers = []
    const movement = []

    function getSubItemKey(powerItem, subItemId) {
      return powerItem._id + '-' + subItemId
    }

    for (const [key, value] of Object.entries(item.system.subItems.skill)) {
      const skillItem = value
      skillItem._id = getSubItemKey(item, key)
      HeroSystem6eActorSheet._prepareSkillItem(skillItem, actor)
      skills.push(skillItem)
    }

    for (const [key, value] of Object.entries(item.system.subItems.attack)) {
      const attackItem = value
      attackItem._id = getSubItemKey(item, key)
      HeroSystem6eActorSheet._prepareAttackItem(attackItem)
      attacks.push(attackItem)
    }

    for (const [key, value] of Object.entries(item.system.subItems.defense)) {
      const defenseItem = value
      defenseItem._id = getSubItemKey(item, key)
      HeroSystem6eActorSheet._prepareDefenseItem(defenseItem)
      defenses.push(defenseItem)
    }

    for (const [key, value] of Object.entries(item.system.subItems.maneuver)) {
      const maneuverItem = value
      maneuverItem._id = getSubItemKey(item, key)
      maneuvers.push(maneuverItem)
    }

    for (const [key, value] of Object.entries(item.system.subItems.movement)) {
      const movementItem = value
      movementItem._id = getSubItemKey(item, key)
      movement.push(movementItem)
    }

    return { skills, attacks, defenses, maneuvers, movement }
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html)

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return

    // Edit sheet control
    html.find('.edit-settings').click(e => {
      switch (e.target.dataset.tab) {
        case "play":
          HEROSYS.log(false, 'play tab!')
          this.options.heroEditable = false
          break;
        case "edit":
          HEROSYS.log(false, 'edit tab!')
          this.options.heroEditable = true
          break;
        default:
          break;
      }

      this.render()
    })

    // Add Inventory Item
    html.find('.item-create').click(this._onItemCreate.bind(this))

    // Update Inventory Item
    html.find('.item-edit').click(ev => {
      const itemId = $(ev.currentTarget).closest("[data-item-id]").data().itemId
      const item = this.actor.items.get(itemId)
      item.sheet.render(true)
    })

    // Update Power Inventory Item
    html.find('.power-item-edit').click(this._onEditPowerItem.bind(this))

    // Delete Inventory Items
    html.find('.item-delete').click(this._onDeleteItem.bind(this))
    html.find('.power-item-delete').click(this._onDeletePowerItem.bind(this))
    html.find('.effect-delete').click(this._onDeleteActiveEffect.bind(this))

    // Power Sub Items
    html.find('.power-maneuver-item-toggle').click(this._onPowerManeuverItemToggle.bind(this))
    html.find('.power-defense-item-toggle').click(this._onPowerDefenseItemToggle.bind(this))
    html.find('.power-rollable-skill').click(this._onPowerRollSkill.bind(this))
    html.find('.power-item-attack').click(this._onPowerItemAttack.bind(this))

    // Rollable abilities.
    html.find('.rollable-characteristic').click(this._onRollCharacteristic.bind(this))
    html.find('.rollable-skill').click(this._onRollSkill.bind(this))
    html.find('.item-attack').click(this._onItemAttack.bind(this))
    html.find('.item-toggle').click(this._onItemToggle.bind(this))
    html.find('.recovery-button').click(this._onRecovery.bind(this))
    html.find('.presence-button').click(this._onPresenseAttack.bind(this))
    html.find('.upload-button').change(this._uploadCharacterSheet.bind(this))

    // Drag events for macros.
    if (this.actor.isOwner) {
      const handler = ev => this._onDragStart(ev)
      html.find('li.item').each((i, li) => {
        if (li.classList.contains('inventory-header')) return
        li.setAttribute('draggable', true)
        li.addEventListener('dragstart', handler, false)
      })

      // Actor Attacks uses a table instead of ol
      html.find('tr.item').each((i, li) => {
        li.setAttribute('draggable', true)
        li.addEventListener('dragstart', handler, false)
      })
    }
  }

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @param {Event} event   The originating click event
   * @private
   */
  async _onItemCreate(event) {
    event.preventDefault()
    const header = event.currentTarget
    // Get the type of item to create.
    const type = header.dataset.type
    // Grab any data associated with this control.
    const data = duplicate(header.dataset)
    // Initialize a default name.
    const name = `New ${type.capitalize()}`

    // Prepare the item object.
    const itemData = {
      name,
      type,
      system: data
    }
    // Remove the type from the dataset since it's in the itemData.type prop.
    delete itemData.system.type




    // Finally, create the item!
    return await HeroSystem6eItem.create(itemData, { parent: this.actor })
  }

  async _onPowerItemAttack(event) {
    event.preventDefault()

    const powerId = event.currentTarget.attributes["data-powerid"].value
    const subId = event.currentTarget.attributes["data-subid"].value

    let attackItemData = this.actor.items.get(powerId).system.items["attack"][`${subId}`]

    const itemData = {
      name: attackItemData.name,
      type: attackItemData.type,
      data: attackItemData,
    }

    let item = new HeroSystem6eItem(itemData)

    const rollMode = 'core'
    const createChatMessage = true

    item.displayCard = displayCard

    return item.displayCard({ rollMode, createChatMessage }, this.actor, powerId + "-" + subId)
  }

  // async _onItemAttack (event) {
  //   event.preventDefault()

  //   // Hold SHIFT when clicking attack roll dice
  //   // to test out new code
  //   if (event.shiftKey )
  //   {
  //     if (game.settings.get(game.system.id, 'betaAttack'))
  //     {
  //       await this._onItemAttackShift (event)
  //     }
  //     return
  //   }

  //   const itemId = event.currentTarget.closest('.item').dataset.itemId

  //   let item;
  //   if (!isPowerSubItem(itemId)) {
  //     item = this.actor.items.get(itemId)
  //   } else {
  //     const [powerItemId, subItemId] = splitPowerId(itemId)
  //     item = this.actor.items.get(powerItemId).system.subItems.attack[subItemId]
  //   }

  //   const rollMode = 'core'
  //   const createChatMessage = true

  //   item.displayCard = displayCard

  //   return item.displayCard({ rollMode, createChatMessage }, this.actor, item.id)
  // }

  async _onItemAttack(event) {
    event.preventDefault()

    console.log($(event.currentTarget).closest("[data-item-id]").data())

    const itemId = $(event.currentTarget).closest("[data-item-id]").data().itemId

    const item = this.actor.items.get(itemId)

    item.roll()
  }

  async _onItemToggle(event) {
    event.preventDefault()
    const itemId = $(event.currentTarget).closest("[data-item-id]").data().itemId

    let item;
    if (!isPowerSubItem(itemId)) {
      item = this.actor.items.get(itemId)
    } else {
      const [powerItemId, subItemId] = splitPowerId(itemId)
      item = this.actor.items.get(powerItemId).system.subItems.defense[subItemId]
    }

    HEROSYS.log(item.name + ": " + item.system.active)

    const attr = 'system.active'
    const newValue = !getProperty(item, attr)

    // only have one combat maneuver selected at a time except for Set or Brace
    if (newValue && item.type === 'maneuver' && newValue) {
      await enforceManeuverLimits(this.actor, itemId, item.name)
    }

    HEROSYS.log(item.name + ": " + JSON.stringify({ [attr]: newValue }))



    if (!isPowerSubItem(itemId)) {
      await item.update({ [attr]: newValue })
    } else {
      await subItemUpdate(itemId, { [attr]: newValue })
    }

    if (item.type === 'maneuver') {
      await updateCombatAutoMod(this.actor, item)
    }

    // Check for associated ActiveEffects
    for (const activeEffect of item.actor.effects.filter(o => o.origin === item.uuid)) {
      await activeEffect.update({ disabled: !item.system.active })
      for(let change of activeEffect.changes) {
        const key = change.key.match(/characteristics\.(.*)\./)[1]
        const max = item.actor.system.characteristics[key].max
        if (item.system.active) {
          let value = parseInt(item.actor.system.characteristics[key].value)
          const levels = change?.value
          if (levels) {
            value += parseInt(levels)
            await item.actor.update({ [`system.characteristics.${key}.value`]: value })
          }

        }

        if (item.actor.system.characteristics[key].value > max) {
          await item.actor.update({ [`system.characteristics.${key}.value`]: max })
        }

      }
      
    }
  }

  async _onPowerManeuverItemToggle(event) {
    const itemId = event.currentTarget.closest('.item').dataset.itemId
    const subItemId = event.currentTarget.closest('.item').dataset.subitemId
    const powerItem = this.actor.items.get(itemId)
    const item = powerItem.system.items.maneuver[subItemId]
    const newValue = !item.active

    await powerItem.update({ [`system.subItems.maneuver.${subItemId}.active`]: newValue })

    const itemData = {
      name: item.name,
      type: item.type,
      data: item
    }

    const newItem = new HeroSystem6eItem(itemData)

    await enforceManeuverLimits(this.actor, subItemId, item.name)

    await updateCombatAutoMod(this.actor, newItem)
  }

  async _onPowerDefenseItemToggle(event) {
    const itemId = event.currentTarget.closest('.item').dataset.itemId
    const subItemId = event.currentTarget.closest('.item').dataset.subitemId
    const powerItem = this.actor.items.get(itemId)
    const item = powerItem.system.items.defense[subItemId]
    const newValue = !item.active

    await powerItem.update({ [`system.subItems.defense.${subItemId}.active`]: newValue })
  }

  /**
  * Handle clickable rolls.
  * @param {Event} event   The originating click event
  * @private
  */
  _onRollCharacteristic(event) {
    event.preventDefault()
    const element = event.currentTarget
    const dataset = element.dataset

    const charRoll = parseInt(element.innerText.slice(0, -1))

    if (dataset.roll) {
      const actor = this.actor

      const roll = new Roll(dataset.roll, this.actor.getRollData())
      roll.evaluate({ async: true }).then(function (result) {
        // let margin = actor.system.characteristics[dataset.label].roll - result.total;
        const margin = charRoll - result.total

        result.toMessage({
          speaker: ChatMessage.getSpeaker({ actor }),
          flavor: dataset.label.toUpperCase() + ' roll ' + (margin >= 0 ? 'succeeded' : 'failed') + ' by ' + Math.abs(margin),
          borderColor: margin >= 0 ? 0x00FF00 : 0xFF0000
        })
      })
    }
  }

  async _onRollSkill(event) {
    event.preventDefault()
    console.log("_onItemRoll")
    const itemId = $(event.currentTarget).closest("[data-item-id]").data().itemId
    const item = this.actor.items.get(itemId)
    item.roll()


    // event.preventDefault()
    // const element = event.currentTarget
    // const dataset = element.dataset

    // HEROSYS.log(dataset.label)

    // if (!isPowerSubItem(dataset.label)) {
    //   const item = this.actor.items.get(dataset.label)
    //   return createSkillPopOutFromItem(item, this.actor)
    // }

    // const [powerItemId, subItemId] = splitPowerId(dataset.label)
    // const item = this.actor.items.get(powerItemId)
    // HEROSYS.log(item)
    // const skillItemData = item.system.subItems.skill[subItemId]

    // HEROSYS.log(skillItemData)

    // return createSkillPopOutFromItem(skillItemData, this.actor)

  }

  async _onPowerRollSkill(event) {
    event.preventDefault()

    const itemId = event.currentTarget.closest('.item').dataset.itemId
    const subItemId = event.currentTarget.closest('.item').dataset.subitemId
    const powerItem = this.actor.items.get(itemId)
    const item = powerItem.system.items.skill[subItemId]

    const itemData = {
      name: item.name,
      type: item.type,
      data: item
    }

    const newItem = new HeroSystem6eItem(itemData)

    createSkillPopOutFromItem(newItem, this.actor)
  }

  async _onRecovery(event) {
    const chars = this.actor.system.characteristics

    let newStun = parseInt(chars.stun.value) + parseInt(chars.rec.value)
    let newEnd = parseInt(chars.end.value) + parseInt(chars.rec.value)

    if (newStun > chars.stun.max) {
      newStun = chars.stun.max
    }

    if (newEnd > chars.end.max) {
      newEnd = chars.end.max
    }

    await this.actor.update({
      'system.characteristics.stun.value': newStun,
      'system.characteristics.end.value': newEnd
    })

    let token = this.actor.token
    let speaker = ChatMessage.getSpeaker({ actor: this.actor, token })
    speaker["alias"] = this.actor.name

    const chatData = {
      user: game.user._id,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      content: this.actor.name + ' recovers!',
      speaker: speaker
    }

    return ChatMessage.create(chatData)
  }

  _onPresenseAttack(event) {
    presenceAttackPopOut(this.actor)
  }

  async _uploadCharacterSheet(event) {
    const file = event.target.files[0]
    if (!file) {
      return
    }
    const reader = new FileReader()
    reader.onload = function (event) {
      const contents = event.target.result

      const parser = new DOMParser()
      const xmlDoc = parser.parseFromString(contents, 'text/xml')
      this._applyCharacterSheet(xmlDoc)
    }.bind(this)
    reader.readAsText(file)
  }

  _applyCharacterSheet(sheet) {
    this._applyCharacterSheetAsync(sheet)
  }

  async _applyCharacterSheetAsync(sheet) {
    const characterTemplate = sheet.getElementsByTagName('CHARACTER')[0].getAttribute("TEMPLATE")
    const characterInfo = sheet.getElementsByTagName('CHARACTER_INFO')[0]
    const characteristics = sheet.getElementsByTagName('CHARACTERISTICS')[0]
    const skills = sheet.getElementsByTagName('SKILLS')[0]
    const powers = sheet.getElementsByTagName('POWERS')[0]
    const perks = sheet.getElementsByTagName('PERKS')[0]
    const talents = sheet.getElementsByTagName('TALENTS')[0]
    const martialarts = sheet.getElementsByTagName('MARTIALARTS')[0]
    const complications = sheet.getElementsByTagName('DISADVANTAGES')[0]
    const equipment = sheet.getElementsByTagName('EQUIPMENT')[0]
    const image = sheet.getElementsByTagName('IMAGE')[0]


    // let elementsToLoad = ["POWERS", "PERKS", "TALENTS", "MARTIALARTS", "DISADVANTAGES"]

    // Individual changes to the actor are not very effecient.
    // Instead save all the changes and perform a bulk update.
    const changes = []
    changes[`system.characterTemplate`] = characterTemplate

    if (characterInfo.getAttribute('CHARACTER_NAME') !== '') {
      let name = characterInfo.getAttribute('CHARACTER_NAME')
      changes[`name`] = name

      // Override name of prototype token if HDC upload was from library
      if (this.actor.prototypeToken) {
        changes[`prototypeToken.name`] = name
      }

      // Overwrite token name if PC
      if (this.token)
      {
        if (this.actor.type == 'pc')
        {
          await this.token.update({name: name})
        }
      }
    }

    // Biography
    let Biography = ""
    for (let child of characterInfo.children) {
      let text = child.textContent.trim();
      if (text) {
        Biography += "<p><b>" + child.nodeName + "</b>: " + text + "</p>"
      }
    }
    changes[`system.biography`] = Biography;

    // Remove all items from
    // for (const item of this.actor.items) {
    //   await item.delete()
    // }
    // This is a faster (bulk) operation to delete all the items
    await this.actor.deleteEmbeddedDocuments("Item", Array.from(this.actor.items.keys()))


    // determine spd upfront for velocity calculations
    let spd
    let value
    for (const characteristic of characteristics.children) {
      const key = CONFIG.HERO.characteristicsXMLKey[characteristic.getAttribute('XMLID')]
      value = CONFIG.HERO.characteristicDefaults[key] + parseInt(characteristic.getAttribute('LEVELS'))

      if (key === 'spd') {
        spd = value
      }
    }

    for (const characteristic of characteristics.children) {
      const key = CONFIG.HERO.characteristicsXMLKey[characteristic.getAttribute('XMLID')]
      value = CONFIG.HERO.characteristicDefaults[key] + parseInt(characteristic.getAttribute('LEVELS'))

      const velocity = Math.round((spd * value) / 12)

      if (key in CONFIG.HERO.movementPowers) {
        let name = characteristic.getAttribute('NAME')
        name = (name === '') ? characteristic.getAttribute('ALIAS') : name

        const itemData = {
          name: name,
          type: 'movement',
          system: {
            type: key,
            editable: false,
            base: value,
            value,
            velBase: velocity,
            velValue: velocity,
            class: key,
          }
        }

        await HeroSystem6eItem.create(itemData, { parent: this.actor })
      } else {
        changes[`system.characteristics.${key}.value`] = value
        changes[`system.characteristics.${key}.max`] = value
        changes[`system.characteristics.${key}.base`] = CONFIG.HERO.characteristicDefaults[key]
      }
    }

    await this.actor.update(changes)

    // Initial 5e support
    // 5th edition has no edition designator, so assuming if there is no 6E then it is 5E.
    if (characterTemplate.includes("builtIn.") && !characterTemplate.includes("6E."))
    {
      const figuredChanges = []
      figuredChanges[`system.is5e`] = true  // used in item-attack.js to modify killing attack stun multiplier

      // One major difference between 5E and 6E is figured characteristics.
      
      // Physical Defense (PD) STR/5
      const pdLevels = this.actor.system.characteristics.pd.max - this.actor.system.characteristics.pd.base;
      const pdFigured = Math.round(this.actor.system.characteristics.str.max/5)
      figuredChanges[`system.characteristics.pd.max`] = pdLevels + pdFigured
      figuredChanges[`system.characteristics.pd.value`] = pdLevels + pdFigured
      figuredChanges[`system.characteristics.pd.base`] = this.actor.system.characteristics.pd.base + pdFigured
      figuredChanges[`system.characteristics.pd.figured`] = pdFigured
      
      // Energy Defense (ED) CON/5
      const edLevels = this.actor.system.characteristics.ed.max - this.actor.system.characteristics.ed.base;
      const edFigured = Math.round(this.actor.system.characteristics.con.max/5)
      figuredChanges[`system.characteristics.ed.max`] = edLevels + edFigured
      figuredChanges[`system.characteristics.ed.value`] = edLevels + edFigured
      figuredChanges[`system.characteristics.ed.base`] = this.actor.system.characteristics.ed.base + edFigured
      figuredChanges[`system.characteristics.ed.figured`] = edFigured

      // Speed (SPD) 1 + (DEX/10)
      const spdLevels = this.actor.system.characteristics.spd.max - this.actor.system.characteristics.spd.base;
      const spdFigured = 1 + Math.floor(this.actor.system.characteristics.dex.max/10)
      figuredChanges[`system.characteristics.spd.max`] = spdLevels + spdFigured
      figuredChanges[`system.characteristics.spd.value`] = spdLevels + spdFigured
      figuredChanges[`system.characteristics.spd.base`] = this.actor.system.characteristics.spd.base + spdFigured
      figuredChanges[`system.characteristics.spd.figured`] = spdFigured

      // Recovery (REC) (STR/5) + (CON/5)
      const recLevels = this.actor.system.characteristics.rec.max - this.actor.system.characteristics.rec.base;
      const recFigured = Math.round(this.actor.system.characteristics.str.max/5) + Math.round(this.actor.system.characteristics.con.max/5)
      figuredChanges[`system.characteristics.rec.max`] = recLevels + recFigured
      figuredChanges[`system.characteristics.rec.value`] = recLevels + recFigured
      figuredChanges[`system.characteristics.rec.base`] = this.actor.system.characteristics.rec.base + recFigured
      figuredChanges[`system.characteristics.rec.figured`] = recFigured

      // Endurance (END) 2 x CON
      const endLevels = this.actor.system.characteristics.end.max - this.actor.system.characteristics.end.base;
      const endFigured = Math.round(this.actor.system.characteristics.con.max*2)
      figuredChanges[`system.characteristics.end.max`] = endLevels + endFigured
      figuredChanges[`system.characteristics.end.value`] = endLevels + endFigured
      figuredChanges[`system.characteristics.end.base`] = this.actor.system.characteristics.end.base + endFigured
      figuredChanges[`system.characteristics.end.figured`] = endFigured

      // Stun (STUN) BODY+(STR/2)+(CON/2) 
      const stunLevels = this.actor.system.characteristics.stun.max - this.actor.system.characteristics.stun.base;
      const stunFigured = Math.round(this.actor.system.characteristics.str.max/2) + Math.round(this.actor.system.characteristics.con.max/2)
      figuredChanges[`system.characteristics.stun.max`] = stunLevels + stunFigured
      figuredChanges[`system.characteristics.stun.value`] = stunLevels + stunFigured
      figuredChanges[`system.characteristics.stun.base`] = this.actor.system.characteristics.stun.base + stunFigured
      figuredChanges[`system.characteristics.stun.figured`] = stunFigured


      // Base OCV & DCV = Attacker’s DEX/3
      const baseCv = Math.round(this.actor.system.characteristics.dex.max/3)
      figuredChanges[`system.characteristics.ocv.max`] = baseCv + this.actor.system.characteristics.ocv.max - this.actor.system.characteristics.ocv.base
      figuredChanges[`system.characteristics.ocv.value`] = baseCv + this.actor.system.characteristics.ocv.max - this.actor.system.characteristics.ocv.base
      figuredChanges[`system.characteristics.ocv.base`] = baseCv + this.actor.system.characteristics.ocv.max - this.actor.system.characteristics.ocv.base
      figuredChanges[`system.characteristics.dcv.max`] = baseCv + this.actor.system.characteristics.dcv.max - this.actor.system.characteristics.dcv.base
      figuredChanges[`system.characteristics.dcv.value`] = baseCv + this.actor.system.characteristics.dcv.max - this.actor.system.characteristics.dcv.base
      figuredChanges[`system.characteristics.dcv.base`] = baseCv + this.actor.system.characteristics.dcv.max - this.actor.system.characteristics.dcv.base

      //Base Ego Combat Value = EGO/3
      const baseEcv = Math.round(this.actor.system.characteristics.ego.max/3)
      figuredChanges[`system.characteristics.omcv.max`] = baseEcv + this.actor.system.characteristics.omcv.max - this.actor.system.characteristics.omcv.base
      figuredChanges[`system.characteristics.omcv.value`] = baseEcv + this.actor.system.characteristics.omcv.max - this.actor.system.characteristics.omcv.base
      figuredChanges[`system.characteristics.omcv.base`] = baseEcv + this.actor.system.characteristics.omcv.max - this.actor.system.characteristics.omcv.base
      figuredChanges[`system.characteristics.dmcv.max`] = baseEcv + this.actor.system.characteristics.dmcv.max - this.actor.system.characteristics.dmcv.base
      figuredChanges[`system.characteristics.dmcv.value`] = baseEcv + this.actor.system.characteristics.dmcv.max - this.actor.system.characteristics.dmcv.base
      figuredChanges[`system.characteristics.dmcv.base`] = baseEcv + this.actor.system.characteristics.dmcv.max - this.actor.system.characteristics.dmcv.base


      await this.actor.update(figuredChanges)
    }



    for (const skill of skills.children) {
      await uploadSkill.call(this, skill)
    }

    const relevantFields = ['BASECOST', 'LEVELS', 'ALIAS', 'MULTIPLIER', 'NAME', 'OPTION_ALIAS', 'SFX',
      'PDLEVELS', 'EDLEVELS', 'MDLEVELS', 'INPUT', 'OPTIONID' // FORCEFIELD
    ]
    for (const power of powers.children) {
      const xmlid = power.getAttribute('XMLID')
      const name = power.getAttribute('NAME')
      const alias = power.getAttribute('ALIAS')
      const levels = power.getAttribute('LEVELS')
      const input = power.getAttribute('INPUT')
      let activeCost = levels * 5;

      if (xmlid === 'GENERIC_OBJECT') { continue; }

      // Check if we have CONFIG info about this power
      let configPowerInfo = CONFIG.HERO.powers[xmlid]
      if (configPowerInfo) {
        // switch (configPowerInfo.powerType)
        // {
        //   case "attack": break // TODO: unimplemented
        //   case "characteristic": break // TODO: unimplemented
        //   case "defense": break // TODO: unimplemented
        //   case "mental": break // TODO: unimplemented
        //   case "movement": break // handled elsewhere?
        //   case "sense": break // handled elsewhere?
        //   case "skill": await uploadSkill.call(this, power); break
        //   default : ui.notifications.warn(`${xmlid} not handle during HDC upload of ${this.actor.name}`)
        // }
        if ((configPowerInfo?.powerType || "").includes("skill")) {
          await uploadSkill.call(this, power);
        }

        // Detect attacks
        //let configPowerInfo = CONFIG.HERO.powers[power.system.rules]
        if (configPowerInfo.powerType.includes("attack")) {
          await uploadAttack.call(this, power);
        }

      }
      else {
        if (game.settings.get(game.system.id, 'alphaTesting')) {
          ui.notifications.warn(`${xmlid} not handled during HDC upload of ${this.actor.name}`)
          console.log(power)
        }

      }

      let itemName = name
      if (name === undefined || name === '') {
        itemName = alias
      }

      const powerData = {}

      for (const attribute of power.attributes) {
        const attName = attribute.name

        if (relevantFields.includes(attName)) {
          const attValue = attribute.value

          powerData[attName] = attValue
        }
      }

      const modifiers = []
      for (const modifier of power.children) {
        const xmlidModifier = modifier.getAttribute('XMLID')

        if (xmlidModifier !== null) {
          modifiers.push({
            xmlid: xmlidModifier,
            alias: modifier.getAttribute('ALIAS'),
            comments: modifier.getAttribute('ALIAS'),
            option: modifier.getAttribute('OPTION'),
            optionId: modifier.getAttribute('OPTIONID'),
            optionAlias: modifier.getAttribute('OPTION_ALIAS'),
            LEVELS: modifier.getAttribute('LEVELS'),
          })
        }
      }
      powerData.modifiers = modifiers

      // Description (eventual goal is to largely match Hero Designer)
      // TODO: This should probably be moved to the sheets code
      // so when the power is modified in foundry, the power
      // description updates as well.
      // If in sheets code it may handle drains/suppresses nicely.
      switch (alias) {
        case "PRE":
          powerData.description = "+" + levels + " PRE";
          activeCost = 0;
          break;
        case "Mind Scan": powerData.description = levels + "d6 Mind Scan (" +
          input + " class of minds)";
          break;
        default:
          powerData.description = alias;

      }

      for (let modifier of powerData.modifiers) {
        if (modifier.alias) powerData.description += "; " + modifier.alias
        if (modifier.comments) powerData.description += "; " + modifier.comments
        if (modifier.option) powerData.description += "; " + modifier.option
        if (modifier.optionId) powerData.description += "; " + modifier.optionId
        if (modifier.optionAlias) powerData.description += "; " + modifier.optionAlias
      }

      powerData.rules = xmlid

      let type = ''
      let itemData = {}
      if (xmlid.toLowerCase() in CONFIG.HERO.movementPowers) {
        type = 'movement'

        const velocity = Math.round((spd * levels) / 12)

        powerData.max = levels
        powerData.value = levels
        powerData.velBase = velocity
        powerData.velValue = velocity


        itemData = {
          name: itemName,
          type,
          system: powerData,
          levels
        }



      } else {
        type = 'power'

        itemName = (itemName === '') ? 'unnamed' : itemName

        // TODO: END estimate is too simple for publishing.  
        // Want to minimize incorrect info.  Needs improvment.
        //powerData.end = math.round(activeCost/10);

        itemData = {
          name: itemName,
          type,
          system: powerData,
          levels,
          input
        }
      }

      let newPower = await HeroSystem6eItem.create(itemData, { parent: this.actor })

      // // ActiveEffect for Characteristics
      // if (configPowerInfo && configPowerInfo.powerType.includes("characteristic")) {
      //   console.log(newPower.system.rules)

      //   let activeEffect =
      //   {
      //     label: newPower.name + " (" + levels + ")",
      //     //id: newPower.system.rules,
      //     //icon: 'icons/svg/daze.svg',
      //     changes: [
      //       {
      //         key: "data.characteristics." + newPower.system.rules.toLowerCase() + ".value",
      //         value: parseInt(levels),
      //         mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE
      //       }
      //     ]
      //   }
      //   await this.actor.addActiveEffect(activeEffect)

      //}


    }

    for (const perk of perks.children) {
      await uploadBasic.call(this, perk, 'perk')
    }

    for (const talent of talents.children) {
      await uploadTalent.call(this, talent, 'talent')
    }

    for (const complication of complications.children) {
      await uploadBasic.call(this, complication, 'complication')
    }

    for (const equip of equipment.children) {
      await uploadBasic.call(this, equip, 'equipment')
    }

    for (const martialart of martialarts.children) {
      await uploadBasic.call(this, martialart, 'martialart')
    }

    // combat maneuvers
    async function loadCombatManeuvers(dict, actor) {
      for (const entry of Object.entries(dict)) {
        const v = entry[1]
        const itemData = {
          name: entry[0],
          type: 'maneuver',
          data: {
            phase: v[0],
            ocv: v[1],
            dcv: v[2],
            effects: v[3],
            active: false
          }
        }

        await HeroSystem6eItem.create(itemData, { parent: actor })
      }
    }

    await loadCombatManeuvers(CONFIG.HERO.combatManeuvers, this.actor)

    if (game.settings.get('hero6efoundryvttv2', 'optionalManeuvers')) {
      await loadCombatManeuvers(CONFIG.HERO.combatManeuversOptional, this.actor)
    }

    // ActiveEffects
    // TODO: Creating ActiveEffects initially on the Item should
    // allow easier implementation of power toggles and associated ActiveEffects.
    await this.actor.applyPowerEffects()

    

    // Actor Image
    if (image) {
      let filename = image.getAttribute("FileName")
      let extension = filename.split('.').pop()
      let base64 = "data:image/" + extension + ";base64," + image.textContent
      let path = "worlds/" + game.world.id
      if (this.actor.img.indexOf(filename) == -1) {
        await ImageHelper.uploadBase64(base64, filename, path)
        await this.actor.update({ [`img`]: path + '/' + filename })
      }
    }


    // Default Strike attack
    let itemData = {
      type: "attack",
      name: "strike",
      system: {
        //xmlid: "HANDTOHANDATTACK",
        knockbackMultiplier: 1,
        usesStrength: true,
        rules: "This is the basic attack maneuver"
      }
      
    }
    await HeroSystem6eItem.create(itemData, { parent: this.actor })

    
    

    ui.notifications.info(`${this.actor.name} upload complete`)

  }

  async _updateName(name) {
    // this needed to be pulled out of the listener for some reason
    const changes = []
    changes.name = name
    await this.actor.update(changes)
  }

  async _onEditPowerItem(event) {
    const id = event.currentTarget.id.split(' ')[0]
    const item = this.object.system.items.get(id)

    await editSubItem(event, item)
  }

  async _onDeleteItem (event) {
    const itemId = $(event.currentTarget).closest("[data-item-id]").data().itemId
    const item = this.actor.items.get(itemId)

    const confirmed = await Dialog.confirm({
      title: game.i18n.localize("HERO6EFOUNDRYVTTV2.confirms.deleteConfirm.Title"),
      content: game.i18n.localize("HERO6EFOUNDRYVTTV2.confirms.deleteConfirm.Content")
    });

    if (confirmed) {
        item.delete()
        this.render();
    }
  }

  async _onDeletePowerItem(event) {
    const id = event.currentTarget.key
    const item = this.object.system.items.get(id)

    const confirmed = await Dialog.confirm({
      title: game.i18n.localize("HERO6EFOUNDRYVTTV2.confirms.deleteConfirm.Title"),
      content: game.i18n.localize("HERO6EFOUNDRYVTTV2.confirms.deleteConfirm.Content")
    });

    if (confirmed) {
      await deleteSubItem(event, item)
    }
  }

  async _onDeleteActiveEffect(event) {
    const li = $(event.currentTarget).parents('.item')
    const actor = game.actors.get(li[0].dataset.actorId)
    const id = li[0].dataset.eventId
    const effect = actor.effects.find(o => o.id == id)

    const confirmed = await Dialog.confirm({
      title: game.i18n.localize("HERO6EFOUNDRYVTTV2.confirms.deleteConfirm.Title") + " (" + effect.label + ")",
      content: game.i18n.localize("HERO6EFOUNDRYVTTV2.confirms.deleteConfirm.Content")
    });

    if (confirmed) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", [id])
    }
  }
}

async function displayCard({ rollMode, createMessage = true } = {}, actor, itemId) {
  await HeroSystem6eAttackCard.createAttackPopOutFromItem(this, actor, itemId)
}

async function updateCombatAutoMod(actor, item) {
  const changes = []

  let ocvEq = 0
  let dcvEq = '+0'

  function dcvEquation(dcvEq, newDcv) {
    if (dcvEq.includes('/') && !newDcv.includes('/')) {
      // don't modify dcvEq
    } else if (!dcvEq.includes('/') && newDcv.includes('/')) {
      dcvEq = newDcv
    } else if (parseFloat(dcvEq) <= parseFloat(newDcv)) {
      dcvEq = newDcv
    } else {
      dcvEq = Math.round(parseFloat(dcvEq) + parseFloat(newDcv)).toString()
    }

    return dcvEq
  }

  for (const i of actor.items) {
    if (i.system.active && i.type === 'maneuver') {
      ocvEq = ocvEq + parseInt(i.system.ocv)

      dcvEq = dcvEquation(dcvEq, i.system.dcv)
    }

    if ((i.type === 'power' || i.type === 'equipment') && ("items" in i.system) && ('maneuver' in i.system.items)) {
      for (const [key, value] of Object.entries(i.system.items.maneuver)) {
        if (value.type && value.visible && value.active) {
          ocvEq = ocvEq + parseInt(value.ocv)

          dcvEq = dcvEquation(dcvEq, value.dcv)
        }
      }
    }
  }

  if (isNaN(ocvEq)) {
    ocvEq = item.system.ocv
  } else if (ocvEq >= 0) {
    ocvEq = '+' + ocvEq.toString()
  } else {
    ocvEq = ocvEq.toString()
  }

  changes['system.characteristics.ocv.autoMod'] = ocvEq
  changes['system.characteristics.omcv.autoMod'] = ocvEq;
  changes['system.characteristics.dcv.autoMod'] = dcvEq
  changes['system.characteristics.dmcv.autoMod'] = dcvEq;

  changes['system.characteristics.ocv.value'] = actor.system.characteristics.ocv.max + parseInt(ocvEq)
  changes['system.characteristics.omcv.value'] = actor.system.characteristics.omcv.max + parseInt(ocvEq);

  if (dcvEq.includes('/')) {
    changes['system.characteristics.dcv.value'] = Math.round(actor.system.characteristics.dcv.max * (parseFloat(dcvEq.split('/')[0]) / parseFloat(dcvEq.split('/')[1])))
    changes['system.characteristics.dmcv.value'] = Math.round(actor.system.characteristics.dmcv.max * (parseFloat(dcvEq.split("/")[0]) / parseFloat(dcvEq.split("/")[1])));
  } else {
    changes['system.characteristics.dcv.value'] = actor.system.characteristics.dcv.max + parseInt(dcvEq)
    changes['system.characteristics.dmcv.value'] = actor.system.characteristics.dmcv.max + parseInt(dcvEq);
  }

  await actor.update(changes)


}
