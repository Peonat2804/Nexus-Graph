import { App, PluginSettingTab, Setting } from 'obsidian';

export class VocabGraphSettingTab extends PluginSettingTab {
    plugin: any;

    constructor(app: App, plugin: any) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // Use Obsidian's official heading API for consistent UI styling
        new Setting(containerEl)
            .setName('Vocabulary Graph Settings')
            .setHeading();

        new Setting(containerEl)
            .setName('Example Setting')
            .setDesc('Configure your graph plugin options here.')
            .addText(text => text
                .setPlaceholder('Enter value')
                .setValue(''));
    }
}