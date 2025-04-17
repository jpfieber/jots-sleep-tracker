import { App, PluginSettingTab, Setting, setIcon, SearchComponent, Notice } from 'obsidian';
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

            // Manual sync section now as a subsection
            const manualSyncHeader = containerEl.createEl('div', { cls: 'settings-indent' });
            manualSyncHeader.createEl('h4', { text: 'Manual Data Sync' });
            manualSyncHeader.createEl('p', { text: 'Useful for retrieving old data when you first start using the plugin, or grabbing data you missed if you haven\'t used Obsidian in over a week.' });

            const syncDiv = manualSyncHeader.createDiv('sync-controls');
            syncDiv.style.padding = '10px';
            syncDiv.style.marginBottom = '20px';

            // Date inputs in a single row
            const dateInputsDiv = syncDiv.createDiv();
            dateInputsDiv.style.display = 'flex';
            dateInputsDiv.style.gap = '20px';
            dateInputsDiv.style.alignItems = 'center';
            dateInputsDiv.style.marginBottom = '15px';

            // Start date input
            const startDateDiv = dateInputsDiv.createDiv();
            startDateDiv.createEl('label', { text: 'Start Date: ' }).style.marginRight = '5px';
            const startDateInput = startDateDiv.createEl('input', {
                attr: {
                    type: 'date',
                    required: 'required',
                    value: this.plugin.settings.lastSyncStartDate || ''
                }
            });
            startDateInput.addEventListener('change', async () => {
                this.plugin.settings.lastSyncStartDate = startDateInput.value;
                await this.plugin.saveSettings();
            });

            // End date input
            const endDateDiv = dateInputsDiv.createDiv();
            endDateDiv.createEl('label', { text: 'End Date: ' }).style.marginRight = '5px';
            const endDateInput = endDateDiv.createEl('input', {
                attr: {
                    type: 'date',
                    required: 'required',
                    value: this.plugin.settings.lastSyncEndDate || ''
                }
            });
            endDateInput.addEventListener('change', async () => {
                this.plugin.settings.lastSyncEndDate = endDateInput.value;
                await this.plugin.saveSettings();
            });

            // Add sync destination options
            const destinationDiv = syncDiv.createDiv();
            destinationDiv.style.display = 'flex';
            destinationDiv.style.gap = '20px';
            destinationDiv.style.alignItems = 'center';
            destinationDiv.style.marginBottom = '15px';

            // Journal entry checkbox
            const journalDiv = destinationDiv.createDiv();
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
            journalCheck.addEventListener('change', async () => {
                this.plugin.settings.lastSyncJournalEnabled = journalCheck.checked;
                await this.plugin.saveSettings();
            });

            sleepNoteCheck.addEventListener('change', async () => {
                this.plugin.settings.lastSyncSleepNoteEnabled = sleepNoteCheck.checked;
                await this.plugin.saveSettings();
            });

            // Progress container with progress bar and cancel button
            const progressDiv = syncDiv.createDiv();
            progressDiv.style.marginBottom = '15px';
            progressDiv.style.display = 'none'; // Hide initially

            const progressBarContainer = progressDiv.createDiv('progress-container');
            progressBarContainer.style.width = '100%';
            progressBarContainer.style.height = '4px';
            progressBarContainer.style.backgroundColor = 'var(--background-modifier-border)';
            progressBarContainer.style.borderRadius = '2px';
            progressBarContainer.style.overflow = 'hidden';
            progressBarContainer.style.marginBottom = '8px';

            const progressBar = progressBarContainer.createDiv('progress-bar');
            progressBar.style.width = '0%';
            progressBar.style.height = '100%';
            progressBar.style.backgroundColor = 'var(--interactive-accent)';
            progressBar.style.transition = 'width 0.3s ease';

            const progressStatusDiv = progressDiv.createDiv();
            progressStatusDiv.style.display = 'flex';
            progressStatusDiv.style.justifyContent = 'space-between';
            progressStatusDiv.style.alignItems = 'center';
            progressStatusDiv.style.marginTop = '8px';

            const progressText = progressStatusDiv.createSpan();
            progressText.style.fontSize = '12px';
            progressText.style.color = 'var(--text-muted)';

            const cancelButton = progressStatusDiv.createEl('button', {
                text: 'Cancel',
                cls: 'mod-warning'
            });
            cancelButton.style.padding = '4px 8px';
            cancelButton.style.fontSize = '12px';

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
                .setDesc('Format for journal filenames (e.g. YYYY-MM-DD_ddd for 2025-04-13_Sun)')
                .setClass('settings-indent')
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
                .setName('Asleep Entry Format')
                .setDesc('Format for the asleep time part of the entry. Use <time> (eg. 2:00PM) or <mtime> (eg. 14:00) as placeholder for the time.')
                .setClass('settings-indent')
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
                .setClass('settings-indent')
                .addText(text => text
                    .setPlaceholder('(time:: <mtime>) (type::⏰) Awake ((duration:: <duration>) hours of sleep)')
                    .setValue(this.plugin.settings.awakeEntryTemplate)
                    .onChange(async (value) => {
                        this.plugin.settings.awakeEntryTemplate = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Task SVG Icon')
                .setDesc('Data URI for the SVG icon to use for sleep entries')
                .setClass('settings-indent')
                .addText(text => text
                    .setPlaceholder("${SVG_ICON")
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
                .setName('Sleep Note Entry Format')
                .setDesc('Template for sleep entries. Use <date>, <time>, <mtime>, <type>, and <duration> as placeholders')
                .setClass('settings-indent')
                .addText(text => text
                    .setPlaceholder('| <date> | <time> | <type> | <duration> |')
                    .setValue(this.plugin.settings.sleepNoteTemplate)
                    .onChange(async (value) => {
                        this.plugin.settings.sleepNoteTemplate = value;
                        await this.plugin.saveSettings();
                    }));
        }

        // Add website and coffee sections at the end
        this.addWebsiteSection(containerEl);
        this.addCoffeeSection(containerEl);
    }

    private addWebsiteSection(containerEl: HTMLElement) {
        const websiteDiv = containerEl.createEl('div', { cls: 'website-section' });

        const logoLink = websiteDiv.createEl('a', { href: 'https://jots.life' });
        logoLink.setAttribute('target', '_blank');

        logoLink.createEl('img', {
            attr: {
                src: 'https://jots.life/jots-logo-512/',
                alt: 'JOTS Logo',
            },
        });

        const descriptionDiv = websiteDiv.createEl('div', { cls: 'website-description' });

        descriptionDiv.appendText('While this plugin works on its own, it is part of a system called ');
        const jotsLink = descriptionDiv.createEl('a', {
            text: 'JOTS',
            href: 'https://jots.life'
        });
        jotsLink.setAttribute('target', '_blank');
        descriptionDiv.appendText(' that helps capture, organize, and visualize your life\'s details.');
    }

    private addCoffeeSection(containerEl: HTMLElement) {
        const coffeeDiv = containerEl.createEl('div', { cls: 'buy-me-a-coffee' });

        const coffeeLink = coffeeDiv.createEl('a', {
            href: 'https://www.buymeacoffee.com/jpfieber'
        });
        coffeeLink.setAttribute('target', '_blank');

        coffeeLink.createEl('img', {
            attr: {
                src: 'https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png',
                alt: 'Buy Me A Coffee'
            },
            cls: 'bmc-button'
        });
    }
}