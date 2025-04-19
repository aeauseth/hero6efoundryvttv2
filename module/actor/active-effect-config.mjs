import { HEROSYS } from "../herosystem6e.mjs";

export class HeroSystemActiveEffectConfig extends ActiveEffectConfig {
    static get defaultOptions() {
        const defaultOptions = super.defaultOptions;
        return foundry.utils.mergeObject(defaultOptions, {
            //classes: ["herosystem6e", "sheet", "item"],
            width: 700,
            // height: 660,
            // scrollY: [".sheet-body"],
            classes: ["sheet", "herosystem-active-effect-config", "active-effect-sheet"],
            template: `systems/${HEROSYS.module}/templates/actor/active-effect-config.hbs`,
        });
    }

    async getData() {
        const context = await super.getData();
        try {
            for (let i = 0; i < context.data.changes.length; i++) {
                context.data.changes[i] = { ...context.data.changes[i], ...context.data.system.changes?.[i] };
            }
            const originItem = fromUuidSync(context.data.origin);
            const token = fromUuidSync(context.data.origin?.match(/(.*).Actor/)?.[1]);
            context.originText = originItem
                ? `${token?.name || originItem.actor?.name}: ${originItem.name}`
                : context.data.origin;

            //sourceText
            for (const change of context.data.changes) {
                if (change.source) {
                    const sourceItem = fromUuidSync(change.source);
                    const token = fromUuidSync(change.source.match(/(.*).Actor/)?.[1]);
                    change.sourceText = `${token?.name || sourceItem.actor?.name}: ${sourceItem.name}`;
                }
            }

            context.data.startTimeDisplay = new Date(context.data.duration.startTime * 1000)
                .toUTCString()
                .replace(" GMT", "");

            context.remaining = context.data.duration.startTime + context.data.duration.seconds - game.time.worldTime;
        } catch (e) {
            console.error(e);
        }
        return context;
    }

    _onEffectControl(event) {
        event.preventDefault();
        const button = event.currentTarget;
        switch (button.dataset.action) {
            case "add":
                return this._addEffectChange();
            case "delete":
                button.closest(".effect-change").remove();
                return this.submit({ preventClose: true }).then(() => this.render());
        }
    }

    async _updateObject(event, formData) {
        await super._updateObject(event, formData);
    }

    _getSubmitData(updateData = {}) {
        const fd = new FormDataExtended(this.form, { editors: this.editors, disabled: true });
        let data = foundry.utils.expandObject(fd.object);
        if (updateData) foundry.utils.mergeObject(data, updateData);
        data.changes = Array.from(Object.values(data.changes || {}));
        data.statuses ??= [];

        // Need to collapse the array (get rid of any sparse indexes that can occur when deleting middle indexes)
        //data.system.changes = Array.from(Object.values(data.system.changes || {}));
        return data;
    }
}
