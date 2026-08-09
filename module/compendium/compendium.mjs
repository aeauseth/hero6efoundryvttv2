// v13 has namespaced this. Remove when support is no longer provided. Also remove from eslint template.
const { Compendium } = foundry.applications.sidebar.apps;

export class HeroSystem6eCompendium extends Compendium {
    async _handleDroppedEntry(target, data) {
        console.log("_handleDroppedEntry", target, data);

        const item = await fromUuid(data.uuid);
        if (!item) {
            console.error("missing item", data.uuid);
            return;
        }

        // Don't allow framework items to be moved within ItemDirectory (they should drag/drop the folder)
        if (item.childItems.length > 0 && item.pack === this.metadata.id) {
            return ui.notifications.warn(
                `"Drag/drop <b>${item.name}</b> item is not allowed in this compendium. Use folder instead"`,
            );
        }

        // Do super if there is no parent or if this framework is already in ItemDirectory
        if (item.childItems.length === 0) {
            return super._handleDroppedEntry(target, data);
        }

        // Find folder we ard dropping to
        const closestFolder = target ? target.closest(".folder") : null;
        if (closestFolder) closestFolder.classList.remove("droptarget");
        const folderTarget = closestFolder ? await fromUuid(closestFolder.dataset.uuid) : null;

        // Create new folder
        await this.dropFrameworkItem(folderTarget, item);
    }

    async dropFrameworkItem(folderTarget, item) {
        if (item.childItems.length > 0) {
            const newFolder = await Folder.create(
                { type: "Item", name: item.name, folder: folderTarget?.id },
                { pack: this.metadata.id },
            );
            await HeroSystem6eItem.create(
                {
                    ...item.toObject(),
                    folder: newFolder?.id,
                },
                { pack: this.metadata.id },
            );
            for (const childItem of item.childItems) {
                await this.dropFrameworkItem(newFolder, childItem);
            }
        } else {
            await HeroSystem6eItem.create(
                {
                    ...item.toObject(),
                    folder: folderTarget?.id,
                },
                { pack: this.metadata.id },
            );
        }
    }
}
