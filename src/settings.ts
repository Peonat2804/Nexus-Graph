import { App, PluginSettingTab, Setting, SettingDefinitionItem, Plugin } from 'obsidian';

export class VocabGraphSettingTab extends PluginSettingTab {
    plugin: Plugin;

    constructor(app: App, plugin: Plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Vocabulary Graph')
            .setHeading();

        new Setting(containerEl)
            .setName('Example Setting')
            .setDesc('Configure your graph plugin options here.')
            .addText(text => text
                .setPlaceholder('Enter value')
                .setValue(''));
    }

    getSettingDefinitions(): SettingDefinitionItem[] {
        return [];
    }
}