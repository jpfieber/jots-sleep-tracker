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

        // Measurement System Selection
        containerEl.createEl('h3', { text: 'Measurement System' });

        new Setting(containerEl)
            .setName('Default Measurement System')
            .setDesc('Choose your preferred measurement system')
            .addDropdown(dropdown =>
                dropdown
                    .addOption('metric', 'Metric')
                    .addOption('imperial', 'Imperial')
                    .setValue(this.plugin.settings.measurementSystem)
                    .onChange(async (value) => {
                        this.plugin.settings.measurementSystem = value as 'metric' | 'imperial';
                        // Update all measurement units based on the new system
                        this.plugin.settings.measurements.forEach(m => {
                            const units = this.plugin.getUnitForMeasurement(m.type);
                            m.unit = value === 'metric' ? units.metric as MeasurementUnit : units.imperial as MeasurementUnit;
                        });
                        await this.plugin.saveSettings();
                        this.display();
                    }));

        // User Management
        containerEl.createEl('h3', { text: 'Users' });

        // Add existing users
        this.plugin.settings.users.forEach((user, index) => {
            const isDefault = this.plugin.settings.defaultUser === user.id;
            const setting = new Setting(containerEl)
                .setName(user.name);

            if (isDefault) {
                setting.setDesc('Default User');
                setting.nameEl.createSpan({
                    cls: 'default-user-star',
                    text: '★'
                });
            }

            setting
                .addButton(btn => btn
                    .setButtonText('Remove')
                    .onClick(async () => {
                        this.plugin.settings.users.splice(index, 1);
                        if (this.plugin.settings.defaultUser === user.id) {
                            this.plugin.settings.defaultUser = undefined;
                        }
                        await this.plugin.saveSettings();
                        this.display();
                    }))
                .addButton(btn => btn
                    .setButtonText(isDefault ? 'Unset Default' : 'Set Default')
                    .onClick(async () => {
                        this.plugin.settings.defaultUser = isDefault ? undefined : user.id;
                        await this.plugin.saveSettings();
                        this.display();
                    }));
        });

        // Add new user button
        new Setting(containerEl)
            .setName('Add New User')
            .addText(text => text
                .setPlaceholder('Enter user name')
                .onChange(() => { }))
            .addButton(btn => btn
                .setButtonText('Add')
                .onClick(async (evt) => {
                    if (!evt.target) return;
                    const element = evt.target as HTMLElement;
                    const textComponent = element.parentElement?.querySelector('input');
                    const userName = textComponent?.value;
                    if (userName) {
                        this.plugin.settings.users.push({
                            id: Date.now().toString(),
                            name: userName
                        });
                        await this.plugin.saveSettings();
                        if (textComponent) textComponent.value = '';
                        this.display();
                    }
                }));

        // Measurements Management
        containerEl.createEl('h3', { text: 'Measurements' });
        const measurementsContainer = containerEl.createDiv('measurements-list');

        // Add table header
        const headerRow = measurementsContainer.createDiv('measurements-table-header');
        headerRow.createDiv().setText('Measure');
        headerRow.createDiv().setText('Type');
        headerRow.createDiv().setText('Controls');

        // Add existing measurements
        this.plugin.settings.measurements.forEach((measurement, index) => {
            const measurementRow = measurementsContainer.createDiv('measurements-table-row');

            // Name cell
            const nameCell = measurementRow.createDiv('measurements-name-cell');
            nameCell.setText(measurement.name);

            // Type dropdown cell
            const typeCell = measurementRow.createDiv('measurements-unit-cell');
            const typeDropdown = new Setting(typeCell);
            typeDropdown.addDropdown(dropdown => {
                dropdown
                    .addOption('duration', 'Duration (hours)')
                    .addOption('quality', 'Quality (%)')
                    .setValue(measurement.type)
                    .onChange(async (value) => {
                        const newType = value as MeasurementType;
                        measurement.type = newType;
                        const units = this.plugin.getUnitForMeasurement(newType);
                        measurement.unit = this.plugin.settings.measurementSystem === 'metric'
                            ? units.metric as MeasurementUnit
                            : units.imperial as MeasurementUnit;
                        await this.plugin.saveSettings();
                        this.display();
                    });
            });

            // Controls cell
            const controlsCell = measurementRow.createDiv('measurements-controls-cell');
            const controlsSettings = new Setting(controlsCell);

            if (index > 0) {
                controlsSettings.addButton(btn => btn
                    .setIcon('up-chevron-glyph')
                    .setTooltip('Move up')
                    .onClick(async () => {
                        const temp = this.plugin.settings.measurements[index];
                        this.plugin.settings.measurements[index] = this.plugin.settings.measurements[index - 1];
                        this.plugin.settings.measurements[index - 1] = temp;
                        await this.plugin.saveSettings();
                        this.display();
                    }));
            }

            if (index < this.plugin.settings.measurements.length - 1) {
                controlsSettings.addButton(btn => btn
                    .setIcon('down-chevron-glyph')
                    .setTooltip('Move down')
                    .onClick(async () => {
                        const temp = this.plugin.settings.measurements[index];
                        this.plugin.settings.measurements[index] = this.plugin.settings.measurements[index + 1];
                        this.plugin.settings.measurements[index + 1] = temp;
                        await this.plugin.saveSettings();
                        this.display();
                    }));
            }

            controlsSettings.addButton(btn => btn
                .setIcon('trash')
                .setTooltip('Remove')
                .onClick(async () => {
                    this.plugin.settings.measurements.splice(index, 1);
                    await this.plugin.saveSettings();
                    this.display();
                }));
        });

        // Add new measurement row
        const newMeasurementRow = measurementsContainer.createDiv('measurements-table-row');

        // Name input
        const newNameCell = newMeasurementRow.createDiv('measurements-name-cell');
        const nameInput = newNameCell.createEl('input', {
            attr: {
                type: 'text',
                placeholder: 'Enter measurement name'
            }
        });

        // Type dropdown
        const newTypeCell = newMeasurementRow.createDiv('measurements-unit-cell');
        const typeSelect = newTypeCell.createEl('select');
        typeSelect.createEl('option', {
            text: 'Duration (hours)',
            value: 'duration'
        });
        typeSelect.createEl('option', {
            text: 'Quality (%)',
            value: 'quality'
        });

        // Add button
        const newControlsCell = newMeasurementRow.createDiv('measurements-controls-cell');
        const addButton = newControlsCell.createEl('button', {
            text: 'Add'
        });
        addButton.addEventListener('click', async () => {
            const measurementName = nameInput.value;
            const measurementType = typeSelect.value as MeasurementType;

            if (measurementName) {
                const units = this.plugin.getUnitForMeasurement(measurementType);
                const unit = this.plugin.settings.measurementSystem === 'metric'
                    ? units.metric
                    : units.imperial;

                this.plugin.settings.measurements.push({
                    name: measurementName,
                    value: '',
                    type: measurementType,
                    unit: unit as MeasurementUnit
                });

                await this.plugin.saveSettings();
                nameInput.value = '';
                this.display();
            }
        });
    }
}