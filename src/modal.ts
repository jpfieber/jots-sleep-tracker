import { App, Modal, Setting } from 'obsidian';
import type { Settings, MeasurementRecord } from './types';

export class MeasurementModal extends Modal {
    private settings: Settings;
    private values: {
        asleepTime?: string;
        awakeTime?: string;
        addToJournal: boolean;
        addToSleepNote: boolean;
        currentTime?: string;
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
                const moment = (window as any).moment;
                const now = moment().format('HH:mm');
                text.setValue(now);
                // Set initial value in component state
                this.values.currentTime = now;
                text.onChange((value) => {
                    this.values.currentTime = value;
                });
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
                // Set initial state
                if (this.values.currentTime) {
                    this.values.asleepTime = this.values.currentTime;
                    this.values.awakeTime = undefined;
                }
                dropdown.onChange(value => {
                    if (this.values.currentTime) {
                        if (value === 'asleep') {
                            this.values.asleepTime = this.values.currentTime;
                            this.values.awakeTime = undefined;
                        } else {
                            this.values.awakeTime = this.values.currentTime;
                            this.values.asleepTime = undefined;
                        }
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
                .onClick(async () => {
                    const dateStr = (dateTimeContainer.querySelector('input[type="date"]') as HTMLInputElement).value;
                    const timeStr = this.values.currentTime;
                    const stateSelect = contentEl.querySelector('.dropdown') as HTMLSelectElement;

                    // Validate all required fields
                    if (!dateStr || !timeStr || !stateSelect?.value) {
                        new Notice('Please fill in all required fields');
                        return;
                    }

                    // Store original settings before any changes
                    const originalJournalSetting = this.settings.enableJournalEntry;
                    const originalSleepNoteSetting = this.settings.enableSleepNote;

                    try {
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
                        this.settings.enableJournalEntry = this.settings.enableJournalEntry && this.values.addToJournal;
                        this.settings.enableSleepNote = this.settings.enableSleepNote && this.values.addToSleepNote;

                        await this.plugin.saveMeasurement(measurementData);
                        new Notice('Sleep record saved successfully');
                        this.close();
                    } catch (error) {
                        console.error('Failed to save sleep record:', error);
                        new Notice('Failed to save sleep record. Please try again.');
                    } finally {
                        // Restore original settings
                        this.settings.enableJournalEntry = originalJournalSetting;
                        this.settings.enableSleepNote = originalSleepNoteSetting;
                    }
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