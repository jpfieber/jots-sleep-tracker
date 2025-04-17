import { App, PluginSettingTab, Setting, setIcon, SearchComponent, Notice } from 'obsidian';
import { Settings, User, Measurement, MeasurementUnit, MeasurementType } from './types';
import { FolderSuggest } from './foldersuggester';
import { FileSuggest } from './filesuggester';
import SleepTrackerPlugin from './main';

export class SleepTrackerSettingsTab extends PluginSettingTab {
    plugin: SleepTrackerPlugin;
    private boundHandlers: Array<{ element: HTMLElement, type: string, handler: EventListener }> = [];

    constructor(app: App, plugin: SleepTrackerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    show() {
        // Force a fresh display when tab is shown
        setTimeout(() => this.display(), 0);
    }

    hide() {
        // Clean up event listeners when tab is hidden
        this.boundHandlers.forEach(({ element, type, handler }) => {
            element.removeEventListener(type, handler);
        });
        this.boundHandlers = [];
        super.hide();
    }

    private addSafeEventListener(element: HTMLElement, type: string, handler: EventListener) {
        element.addEventListener(type, handler);
        this.boundHandlers.push({ element, type, handler });
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // Google Fit Integration Settings
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
                .setClass('jots-sleep-tracker-settings-indent')
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
                .setClass('jots-sleep-tracker-settings-indent')
                .addText(text => text
                    .setPlaceholder('Enter Client Secret')
                    .setValue(this.plugin.settings.googleClientSecret || '')
                    .onChange(async (value) => {
                        this.plugin.settings.googleClientSecret = value;
                        await this.plugin.saveSettings();
                        this.plugin.setupGoogleFitService();
                    }));

            const isConnected = !!this.plugin.settings.googleAccessToken;
            const authSetting = new Setting(containerEl)
                .setName('Connection Status')
                .setDesc(`Status: ${isConnected ? 'Connected' : 'Not Connected'}`)
                .setClass('jots-sleep-tracker-settings-indent');

            if (this.plugin.settings.googleClientId && this.plugin.settings.googleClientSecret) {
                authSetting.addButton(button => button
                    .setButtonText(isConnected ? 'Disconnect' : 'Connect')
                    .setCta()
                    .onClick(async () => {
                        if (isConnected) {
                            // Clear tokens
                            this.plugin.settings.googleAccessToken = '';
                            this.plugin.settings.googleRefreshToken = '';
                            this.plugin.settings.googleTokenExpiry = undefined;
                            await this.plugin.saveSettings();
                            this.display();
                        } else {
                            // Start OAuth flow
                            await this.plugin.googleFitService?.authenticate();
                            // Force refresh after a short delay to ensure settings are updated
                            setTimeout(() => this.display(), 100);
                        }
                    }));
            }

            // Only show auto-sync setting if connected
            if (isConnected) {
                new Setting(containerEl)
                    .setName('Auto-Sync Interval')
                    .setDesc('How often to automatically sync with Google Fit (in minutes, 0 to disable)')
                    .setClass('jots-sleep-tracker-settings-indent')
                    .addText(text => text
                        .setPlaceholder('60')
                        .setValue(String(this.plugin.settings.googleAutoSyncInterval || 0))
                        .onChange(async (value) => {
                            const interval = parseInt(value) || 0;
                            this.plugin.settings.googleAutoSyncInterval = interval;
                            await this.plugin.saveSettings();
                            this.plugin.setupGoogleFitSync();
                        }));

                // Manual sync section now as a subsection
                const manualSyncHeader = containerEl.createEl('div', { cls: 'jots-sleep-tracker-settings-indent' });
                manualSyncHeader.createEl('h4', { text: 'Manual Data Sync' });
                manualSyncHeader.createEl('p', { text: 'Useful for retrieving old data when you first start using the plugin, or grabbing data you missed if you haven\'t used Obsidian in over a week.' });

                const syncDiv = manualSyncHeader.createDiv({ cls: 'jots-sleep-tracker-sync-controls' });
                const dateInputsDiv = syncDiv.createDiv({ cls: 'jots-sleep-tracker-date-inputs' });
                const startDateDiv = dateInputsDiv.createDiv();
                startDateDiv.createEl('label', { text: 'Start Date: ' }).style.marginRight = '5px';
                const startDateInput = startDateDiv.createEl('input', {
                    attr: {
                        type: 'date',
                        required: 'required',
                        value: this.plugin.settings.lastSyncStartDate || ''
                    }
                });
                if (startDateInput) {
                    const startDateHandler = async () => {
                        this.plugin.settings.lastSyncStartDate = startDateInput.value;
                        await this.plugin.saveSettings();
                    };
                    this.addSafeEventListener(startDateInput, 'change', startDateHandler);
                }

                const endDateDiv = dateInputsDiv.createDiv();
                endDateDiv.createEl('label', { text: 'End Date: ' }).style.marginRight = '5px';
                const endDateInput = endDateDiv.createEl('input', {
                    attr: {
                        type: 'date',
                        required: 'required',
                        value: this.plugin.settings.lastSyncEndDate || ''
                    }
                });
                if (endDateInput) {
                    const endDateHandler = async () => {
                        this.plugin.settings.lastSyncEndDate = endDateInput.value;
                        await this.plugin.saveSettings();
                    };
                    this.addSafeEventListener(endDateInput, 'change', endDateHandler);
                }

                // Add sync destination options
                const destinationDiv = syncDiv.createDiv({ cls: 'jots-sleep-tracker-destination-options' });

                // Journal entry checkbox
                const journalDiv = destinationDiv.createDiv('jots-sleep-tracker-settings-indent');
                journalDiv.style.display = 'flex';
                journalDiv.style.alignItems = 'center';
                journalDiv.style.gap = '5px';
                const journalCheck = journalDiv.createEl('input', {
                    attr: {
                        type: 'checkbox'
                    }
                });
                journalCheck.checked = this.plugin.settings.lastSyncJournalEnabled;
                journalDiv.createEl('span', { text: 'Add to Journal' });

                // Sleep note checkbox
                const sleepNoteDiv = destinationDiv.createDiv();
                sleepNoteDiv.style.display = 'flex';
                sleepNoteDiv.style.alignItems = 'center';
                sleepNoteDiv.style.gap = '5px';
                const sleepNoteCheck = sleepNoteDiv.createEl('input', {
                    attr: {
                        type: 'checkbox'
                    }
                });
                sleepNoteCheck.checked = this.plugin.settings.lastSyncSleepNoteEnabled;
                sleepNoteDiv.createEl('span', { text: 'Add to Sleep Note' });

                // Save checkbox states when changed
                if (journalCheck) {
                    const journalHandler = async () => {
                        this.plugin.settings.lastSyncJournalEnabled = journalCheck.checked;
                        await this.plugin.saveSettings();
                    };
                    this.addSafeEventListener(journalCheck, 'change', journalHandler);
                }

                if (sleepNoteCheck) {
                    const sleepNoteHandler = async () => {
                        this.plugin.settings.lastSyncSleepNoteEnabled = sleepNoteCheck.checked;
                        await this.plugin.saveSettings();
                    };
                    this.addSafeEventListener(sleepNoteCheck, 'change', sleepNoteHandler);
                }

                // Progress container with progress bar and cancel button
                const progressDiv = syncDiv.createDiv();
                progressDiv.style.display = 'none'; // This needs to stay as it's dynamically toggled

                const progressBarContainer = progressDiv.createDiv('jots-sleep-tracker-progress-container');
                const progressBar = progressBarContainer.createDiv('jots-sleep-tracker-progress-bar');
                const progressStatusDiv = progressDiv.createDiv('jots-sleep-tracker-progress-status');
                const progressText = progressStatusDiv.createSpan({ cls: 'jots-sleep-tracker-progress-text' });
                const cancelButton = progressStatusDiv.createEl('button', {
                    text: 'Cancel',
                    cls: ['mod-warning', 'jots-sleep-tracker-cancel-button']
                });

                // Single sync button
                const buttonDiv = syncDiv.createDiv();

                const syncRangeButton = buttonDiv.createEl('button', {
                    text: 'Sync Date Range',
                    cls: 'mod-cta'
                });
                syncRangeButton.disabled = !this.plugin.settings.googleAccessToken;

                let currentAbortController: AbortController | null = null;

                const startSync = async (startDate?: string, endDate?: string) => {
                    if (currentAbortController) {
                        currentAbortController.abort();
                    }
                    currentAbortController = new AbortController();

                    progressDiv.style.display = 'block';
                    cancelButton.style.display = 'inline-block';
                    syncRangeButton.disabled = true;
                    syncRangeButton.style.opacity = '0.5';

                    const tempSettings = {
                        enableJournalEntry: journalCheck.checked,
                        enableSleepNote: sleepNoteCheck.checked
                    };

                    try {
                        await this.plugin.syncGoogleFit(startDate, endDate, (current, total) => {
                            if (currentAbortController?.signal.aborted) {
                                throw new Error('Sync cancelled');
                            }
                            const percent = (current / total) * 100;
                            progressBar.style.width = `${percent}%`;
                            progressText.setText(`Syncing sleep data... ${current}/${total} days`);
                        }, tempSettings);
                        progressBar.style.width = '100%';
                        progressText.setText('Sync completed successfully!');
                        setTimeout(() => {
                            progressDiv.style.display = 'none';
                            progressBar.style.width = '0%';
                            cancelButton.style.display = 'none';
                        }, 3000);
                    } catch (error) {
                        if (error instanceof Error && error.message === 'Sync cancelled') {
                            progressText.setText('Sync cancelled');
                        } else {
                            progressText.setText('Sync failed. Check console for details.');
                            console.error('Sync error:', error);
                        }
                        setTimeout(() => {
                            progressDiv.style.display = 'none';
                            progressBar.style.width = '0%';
                            cancelButton.style.display = 'none';
                        }, 3000);
                    } finally {
                        currentAbortController = null;
                        syncRangeButton.disabled = !this.plugin.settings.googleAccessToken;
                        syncRangeButton.style.opacity = '1';
                    }
                };

                cancelButton.onclick = () => {
                    if (currentAbortController) {
                        currentAbortController.abort();
                    }
                };

                syncRangeButton.onclick = async () => {
                    const startDate = startDateInput.value;
                    const endDate = endDateInput.value;

                    if (!startDate || !endDate) {
                        new Notice('Please enter both start and end dates');
                        return;
                    }

                    if (startDate > endDate) {
                        new Notice('Start date must be before or equal to end date');
                        return;
                    }

                    await startSync(startDate, endDate);
                };
            }
        }

        // Journal Entry Settings
        new Setting(containerEl)
            .setName('Enable Journal Entries')
            .setDesc('Add sleep data to your daily journal')
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
                .setDesc('Root folder where your daily journal entries are stored')
                .setClass('jots-sleep-tracker-settings-indent')
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
                .setClass('jots-sleep-tracker-settings-indent')
                .addText(text => text
                    .setPlaceholder('YYYY/YYYY-MM')
                    .setValue(this.plugin.settings.journalSubDirectory)
                    .onChange(async (value) => {
                        this.plugin.settings.journalSubDirectory = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Journal Name Format')
                .setDesc('Format for journal filenames (e.g. YYYY-MM-DD_ddd for 2025-04-13_Sun)')
                .setClass('jots-sleep-tracker-settings-indent')
                .addText(text => text
                    .setPlaceholder('YYYY-MM-DD_ddd')
                    .setValue(this.plugin.settings.journalNameFormat)
                    .onChange(async (value) => {
                        this.plugin.settings.journalNameFormat = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Daily Note Template')
                .setDesc('Template file to use when creating new daily notes (.md files only)')
                .setClass('jots-sleep-tracker-settings-indent')
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
                .setName('Asleep Entry Format')
                .setDesc('Format for the asleep time part of the entry. Use <time> (eg. 2:00PM) or <mtime> (eg. 14:00) as placeholder for the time.')
                .setClass('jots-sleep-tracker-settings-indent')
                .addText(text => text
                    .setPlaceholder('(time:: <mtime>) (type:: 💤) Asleep')
                    .setValue(this.plugin.settings.asleepEntryTemplate)
                    .onChange(async (value) => {
                        this.plugin.settings.asleepEntryTemplate = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Awake Entry Format')
                .setDesc('Format for the wake time and duration entry. Use <time> (eg. 2:00PM) or <mtime> (eg. 14:00) for wake time and <duration> for duration.')
                .setClass('jots-sleep-tracker-settings-indent')
                .addText(text => text
                    .setPlaceholder('(time:: <mtime>) (type::⏰) Awake ((duration:: <duration>) hours of sleep)')
                    .setValue(this.plugin.settings.awakeEntryTemplate)
                    .onChange(async (value) => {
                        this.plugin.settings.awakeEntryTemplate = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Task Prefix')
                .setDesc('The letter to use as prefix in sleep entries (e.g. "s" for "- [s]")')
                .setClass('jots-sleep-tracker-settings-indent')
                .addText(text => text
                    .setPlaceholder('s')
                    .setValue(this.plugin.settings.stringPrefixLetter)
                    .onChange(async (value) => {
                        this.plugin.settings.stringPrefixLetter = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Task SVG Icon')
                .setDesc('Data URI for the SVG icon to use for sleep entries')
                .setClass('jots-sleep-tracker-settings-indent')
                .addText(text => text
                    .setPlaceholder("${SVG_ICON")
                    .setValue(this.plugin.settings.taskSvgIcon)
                    .onChange(async (value) => {
                        this.plugin.settings.taskSvgIcon = value;
                        await this.plugin.saveSettings();
                    }));
        }

        // Sleep Note Settings
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
                .setClass('jots-sleep-tracker-settings-indent')
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
                .setName('Asleep Entry Format')
                .setDesc('Template for Asleep entries. Use <date>, <time>, and <mtime> as placeholders')
                .setClass('jots-sleep-tracker-settings-indent')
                .addText(text => text
                    .setPlaceholder('| <date> | <time> (<mtime>) | 💤 Asleep | |')
                    .setValue(this.plugin.settings.asleepNoteTemplate)
                    .onChange(async (value) => {
                        this.plugin.settings.asleepNoteTemplate = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Awake Entry Format')
                .setDesc('Template for Awake entries. Use <date>, <time>, <mtime>, and <duration> as placeholders')
                .setClass('jots-sleep-tracker-settings-indent')
                .addText(text => text
                    .setPlaceholder('| <date> | <time> (<mtime>) | ⏰ Awake | <duration> |')
                    .setValue(this.plugin.settings.awakeNoteTemplate)
                    .onChange(async (value) => {
                        this.plugin.settings.awakeNoteTemplate = value;
                        await this.plugin.saveSettings();
                    }));
        }

        // Add website and coffee sections at the end
        this.addWebsiteSection(containerEl);
        this.addCoffeeSection(containerEl);
    }

    private addWebsiteSection(containerEl: HTMLElement) {
        const websiteDiv = containerEl.createEl('div', { cls: 'jots-sleep-tracker-website-section' });

        const logoLink = websiteDiv.createEl('a', { href: 'https://jots.life' });
        logoLink.setAttribute('target', '_blank');

        logoLink.createEl('img', {
            attr: {
                src: 'https://jots.life/jots-logo-512/',
                alt: 'JOTS Logo',
            },
        });

        const descriptionDiv = websiteDiv.createEl('div', { cls: 'jots-sleep-tracker-website-description' });

        descriptionDiv.appendText('While this plugin works on its own, it is part of a system called ');
        const jotsLink = descriptionDiv.createEl('a', {
            text: 'JOTS',
            href: 'https://jots.life'
        });
        jotsLink.setAttribute('target', '_blank');
        descriptionDiv.appendText(' that helps capture, organize, and visualize your life\'s details.');
    }

    private addCoffeeSection(containerEl: HTMLElement) {
        const coffeeDiv = containerEl.createEl('div', { cls: 'jots-sleep-tracker-buy-me-coffee' });

        const coffeeLink = coffeeDiv.createEl('a', {
            href: 'https://www.buymeacoffee.com/jpfieber'
        });
        coffeeLink.setAttribute('target', '_blank');

        coffeeLink.createEl('img', {
            attr: {
                src: 'https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png',
                alt: 'Buy Me A Coffee'
            },
            cls: 'jots-sleep-tracker-bmc-button'
        });
    }
}