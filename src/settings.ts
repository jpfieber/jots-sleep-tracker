import { App, PluginSettingTab, Setting, setIcon, SearchComponent } from 'obsidian';
import { Settings, User, Measurement, MeasurementUnit, MeasurementType } from './types';
import { FolderSuggest } from './foldersuggester';
import { FileSuggest } from './filesuggester';
import SleepTrackerPlugin from './main';

export class SleepTrackerSettingsTab extends PluginSettingTab {
    plugin: SleepTrackerPlugin;

    constructor(app: App, plugin: SleepTrackerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // Google Fit Integration Settings
        containerEl.createEl('h3', { text: 'Google Fit Integration' });

        new Setting(containerEl)
            .setName('Enable Google Fit Integration')
            .setDesc('Sync sleep data from your Google Fit account')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableGoogleFit ?? false)
                .onChange(async (value) => {
                    this.plugin.settings.enableGoogleFit = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        if (this.plugin.settings.enableGoogleFit) {
            new Setting(containerEl)
                .setName('Client ID')
                .setDesc('Your Google Fit API Client ID')
                .setClass('settings-indent')
                .addText(text => text
                    .setPlaceholder('Enter Client ID')
                    .setValue(this.plugin.settings.googleClientId || '')
                    .onChange(async (value) => {
                        this.plugin.settings.googleClientId = value;
                        await this.plugin.saveSettings();
                        this.plugin.setupGoogleFitService();
                    }));

            new Setting(containerEl)
                .setName('Client Secret')
                .setDesc('Your Google Fit API Client Secret')
                .setClass('settings-indent')
                .addText(text => text
                    .setPlaceholder('Enter Client Secret')
                    .setValue(this.plugin.settings.googleClientSecret || '')
                    .onChange(async (value) => {
                        this.plugin.settings.googleClientSecret = value;
                        await this.plugin.saveSettings();
                        this.plugin.setupGoogleFitService();
                    }));

            const authStatus = this.plugin.settings.googleAccessToken ? 'Connected' : 'Not Connected';
            new Setting(containerEl)
                .setName('Connection Status')
                .setDesc(`Status: ${authStatus}`)
                .setClass('settings-indent')
                .addButton(button => button
                    .setButtonText(authStatus === 'Connected' ? 'Disconnect' : 'Connect')
                    .setCta()
                    .onClick(async () => {
                        if (authStatus === 'Connected') {
                            // Clear tokens
                            this.plugin.settings.googleAccessToken = '';
                            this.plugin.settings.googleRefreshToken = '';
                            this.plugin.settings.googleTokenExpiry = undefined;
                            await this.plugin.saveSettings();
                            this.display();
                        } else {
                            // Start OAuth flow
                            await this.plugin.googleFitService?.authenticate();
                        }
                    }));

            new Setting(containerEl)
                .setName('Auto-Sync Interval')
                .setDesc('How often to automatically sync with Google Fit (in minutes, 0 to disable)')
                .setClass('settings-indent')
                .addText(text => text
                    .setPlaceholder('60')
                    .setValue(String(this.plugin.settings.googleAutoSyncInterval || 0))
                    .onChange(async (value) => {
                        const interval = parseInt(value) || 0;
                        this.plugin.settings.googleAutoSyncInterval = interval;
                        await this.plugin.saveSettings();
                        this.plugin.setupGoogleFitSync();
                    }));
        }

        // Journal Entry Settings
        containerEl.createEl('h3', { text: 'Journal Entries' });

        new Setting(containerEl)
            .setName('Enable Journal Entries')
            .setDesc('Add measurements to your daily journal')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableJournalEntry)
                .onChange(async (value) => {
                    this.plugin.settings.enableJournalEntry = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        if (this.plugin.settings.enableJournalEntry) {
            new Setting(containerEl)
                .setName('Journal Folder')
                .setDesc('Folder where your daily journal entries are stored')
                .setClass('settings-indent')
                .addSearch((cb) => {
                    new FolderSuggest(this.app, cb.inputEl);
                    cb.setPlaceholder("Journal")
                        .setValue(this.plugin.settings.journalFolder)
                        .onChange(async (value) => {
                            this.plugin.settings.journalFolder = value;
                            await this.plugin.saveSettings();
                        });
                });

            new Setting(containerEl)
                .setName('Journal Subdirectory Format')
                .setDesc('Format for organizing journal files in subfolders (e.g. YYYY/YYYY-MM)')
                .setClass('settings-indent')
                .addText(text => text
                    .setPlaceholder('YYYY/YYYY-MM')
                    .setValue(this.plugin.settings.journalSubDirectory)
                    .onChange(async (value) => {
                        this.plugin.settings.journalSubDirectory = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Journal Name Format')
                .setDesc('Format for journal filenames (e.g. YYYY-MM-DD_DDD for 2025-04-13_Sun)')
                .setClass('settings-indent')
                .addText(text => text
                    .setPlaceholder('YYYY-MM-DD_DDD')
                    .setValue(this.plugin.settings.journalNameFormat)
                    .onChange(async (value) => {
                        this.plugin.settings.journalNameFormat = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Daily Note Template')
                .setDesc('Template file to use when creating new daily notes (.md files only)')
                .setClass('settings-indent')
                .addSearch((cb) => {
                    new FileSuggest(this.app, cb.inputEl);
                    cb.setPlaceholder("templates/daily.md")
                        .setValue(this.plugin.settings.dailyNoteTemplate || '')
                        .onChange((new_path) => {
                            this.plugin.settings.dailyNoteTemplate = new_path;
                            this.plugin.saveSettings();
                        });
                });

            new Setting(containerEl)
                .setName('Asleep Entry Template')
                .setDesc('Template for the asleep time part of the entry. Use <time> as placeholder for the time.')
                .setClass('settings-indent')
                .addText(text => text
                    .setPlaceholder('(asleep:: <time>)')
                    .setValue(this.plugin.settings.asleepEntryTemplate)
                    .onChange(async (value) => {
                        this.plugin.settings.asleepEntryTemplate = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Awake Entry Template')
                .setDesc('Template for the wake time and duration part. Use <time> for wake time and <duration> for duration.')
                .setClass('settings-indent')
                .addText(text => text
                    .setPlaceholder('(awake:: <time>) = (duration:: <duration>h)')
                    .setValue(this.plugin.settings.awakeEntryTemplate)
                    .onChange(async (value) => {
                        this.plugin.settings.awakeEntryTemplate = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Task SVG Icon')
                .setDesc('Data URI for the SVG icon to use for sleep entries (must be a valid data:image/svg+xml;base64 URI)')
                .setClass('settings-indent')
                .addText(text => text
                    .setPlaceholder('data:image/svg+xml;base64,...')
                    .setValue(this.plugin.settings.taskSvgIcon)
                    .onChange(async (value) => {
                        this.plugin.settings.taskSvgIcon = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Task Prefix')
                .setDesc('The letter to use as prefix in sleep entries (e.g. "s" for "- [s]")')
                .setClass('settings-indent')
                .addText(text => text
                    .setPlaceholder('s')
                    .setValue(this.plugin.settings.stringPrefixLetter)
                    .onChange(async (value) => {
                        this.plugin.settings.stringPrefixLetter = value;
                        await this.plugin.saveSettings();
                    }));
        }

        // Sleep Note Settings
        containerEl.createEl('h3', { text: 'Sleep Note' });

        new Setting(containerEl)
            .setName('Enable Sleep Note')
            .setDesc('Add sleep entries to a dedicated sleep tracking note')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableSleepNote)
                .onChange(async (value) => {
                    this.plugin.settings.enableSleepNote = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        if (this.plugin.settings.enableSleepNote) {
            new Setting(containerEl)
                .setName('Sleep Note Location')
                .setDesc('Path to your dedicated sleep tracking note')
                .setClass('settings-indent')
                .addSearch((cb) => {
                    new FileSuggest(this.app, cb.inputEl);
                    cb.setPlaceholder("Sleep/sleep-tracking.md")
                        .setValue(this.plugin.settings.sleepNotePath)
                        .onChange((new_path) => {
                            this.plugin.settings.sleepNotePath = new_path;
                            this.plugin.saveSettings();
                        });
                });

            new Setting(containerEl)
                .setName('Sleep Note Entry Template')
                .setDesc('Template for sleep entries. Use <date>, <time>, <type>, and <duration> as placeholders')
                .setClass('settings-indent')
                .addText(text => text
                    .setPlaceholder('| <date> | <time> | <type> | <duration> |')
                    .setValue(this.plugin.settings.sleepNoteTemplate)
                    .onChange(async (value) => {
                        this.plugin.settings.sleepNoteTemplate = value;
                        await this.plugin.saveSettings();
                    }));
        }
    }
}