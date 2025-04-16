import { App, Modal, Setting } from 'obsidian';
import type { Settings, MeasurementRecord } from './types';

export class MeasurementModal extends Modal {
    private settings: Settings;
    private values: {
        asleepTime?: string;
        awakeTime?: string;
        addToJournal: boolean;
        addToSleepNote: boolean;
    } = {
            addToJournal: true,
            addToSleepNote: false  // Default to false to match settings default
        };

    constructor(app: App, private plugin: any) {
        super(app);
        this.settings = plugin.settings;
        // Initialize values based on current settings
        this.values.addToJournal = this.settings.enableJournalEntry;
        this.values.addToSleepNote = this.settings.enableSleepNote;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // Title
        contentEl.createEl('h2', { text: 'Add Sleep Record' });

        // Create a container for date and time
        const dateTimeContainer = contentEl.createDiv('date-time-container');

        // Date picker
        new Setting(dateTimeContainer)
            .setName('Date')
            .setClass('date-setting')
            .addText(text => {
                text.inputEl.type = 'date';
                const moment = (window as any).moment;
                const today = moment().format('YYYY-MM-DD');
                text.setValue(today);
                return text;
            });

        // Time picker
        new Setting(dateTimeContainer)
            .setName('Time')
            .setClass('time-setting')
            .addText(text => {
                text.inputEl.type = 'time';
                return text;
            });

        // Sleep state dropdown
        new Setting(contentEl)
            .setName('State')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('asleep', 'Asleep')
                    .addOption('awake', 'Awake')
                    .setValue('asleep');
                dropdown.onChange(value => {
                    const time = dateTimeContainer.querySelector('input[type="time"]') as HTMLInputElement;
                    if (value === 'asleep') {
                        this.values.asleepTime = time.value;
                        this.values.awakeTime = undefined;
                    } else {
                        this.values.awakeTime = time.value;
                        this.values.asleepTime = undefined;
                    }
                });
            });

        // Only show these options if they are configured in settings
        if (this.settings.enableJournalEntry || this.settings.enableSleepNote) {
            contentEl.createEl('h3', { text: 'Save Options' });
        }

        // Checkbox for adding to journal - only show if journal entries are enabled in settings
        if (this.settings.enableJournalEntry) {
            new Setting(contentEl)
                .setName('Add to Journal')
                .setDesc('Add this sleep record to your daily journal')
                .addToggle(toggle => {
                    toggle
                        .setValue(this.values.addToJournal)
                        .onChange(value => {
                            this.values.addToJournal = value;
                        });
                });
        }

        // Checkbox for adding to sleep note - only show if sleep note is enabled and configured in settings
        if (this.settings.enableSleepNote && this.settings.sleepNotePath) {
            new Setting(contentEl)
                .setName('Add to Sleep Note')
                .setDesc('Add this sleep record to your sleep tracking note')
                .addToggle(toggle => {
                    toggle
                        .setValue(this.values.addToSleepNote)
                        .onChange(value => {
                            this.values.addToSleepNote = value;
                        });
                });
        }

        // Submit button
        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Submit')
                .setCta()
                .onClick(() => {
                    const dateStr = (dateTimeContainer.querySelector('input[type="date"]') as HTMLInputElement).value;
                    const timeStr = (dateTimeContainer.querySelector('input[type="time"]') as HTMLInputElement).value;
                    const stateSelect = contentEl.querySelector('.dropdown') as HTMLSelectElement;

                    console.log('Modal submit - Date:', dateStr, 'Time:', timeStr, 'State:', stateSelect.value);
                    console.log('Current settings:', this.settings);

                    const measurementData: MeasurementRecord = {
                        date: `${dateStr} ${timeStr}`,
                        userId: this.settings.defaultUser || this.settings.users[0]?.id || '',
                    };

                    if (stateSelect.value === 'asleep') {
                        measurementData.asleepTime = timeStr;
                    } else {
                        measurementData.awakeTime = timeStr;
                        // Calculate duration if we have both times
                        if (this.values.asleepTime) {
                            const asleepMoment = (window as any).moment(`${dateStr} ${this.values.asleepTime}`, 'YYYY-MM-DD HH:mm');
                            const awakeMoment = (window as any).moment(`${dateStr} ${timeStr}`, 'YYYY-MM-DD HH:mm');
                            const duration = awakeMoment.diff(asleepMoment, 'hours', true);
                            measurementData.sleepDuration = duration.toFixed(1);
                        }
                    }

                    console.log('Sending measurement data:', measurementData);

                    // Temporarily override settings based on user's choices
                    const originalJournalSetting = this.settings.enableJournalEntry;
                    const originalSleepNoteSetting = this.settings.enableSleepNote;

                    this.settings.enableJournalEntry = this.settings.enableJournalEntry && this.values.addToJournal;
                    this.settings.enableSleepNote = this.settings.enableSleepNote && this.values.addToSleepNote;

                    this.plugin.saveMeasurement(measurementData);

                    // Restore original settings
                    this.settings.enableJournalEntry = originalJournalSetting;
                    this.settings.enableSleepNote = originalSleepNoteSetting;

                    this.close();
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// Add some CSS
document.head.createEl('style').setText(`
.measurements-container {
    max-height: 300px;
    overflow-y: auto;
    margin: 1em 0;
}
.measurement-unit {
    opacity: 0.7;
    margin-left: 0.5em;
}
.date-time-container {
    display: flex;
    gap: 1em;
    margin-bottom: 1em;
}
.date-time-container .date-setting {
    flex: 2;
}
.date-time-container .time-setting {
    flex: 1;
}
`);