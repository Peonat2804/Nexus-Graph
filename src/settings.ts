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
        containerEl.createEl('h2', { text: 'Vocabulary Graph Settings' });

        new Setting(containerEl)
            .setName('Example Setting')
            .setDesc('Configure your graph plugin options here.')
            .addText(text => text
                .setPlaceholder('Enter value')
                .setValue(''));
    }
}