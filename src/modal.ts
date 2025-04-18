import { App, Modal, Setting, Notice } from 'obsidian';
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
            addToSleepNote: false
        };

    constructor(app: App, private plugin: any) {
        super(app);
        this.settings = plugin.settings;
        this.values.addToJournal = this.settings.enableJournalEntry;
        this.values.addToSleepNote = this.settings.enableSleepNote;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl('h2', { text: 'Add Sleep Record' });

        const dateTimeContainer = contentEl.createDiv();
        dateTimeContainer.style.display = 'flex';
        dateTimeContainer.style.gap = '10px';
        dateTimeContainer.style.marginBottom = '1em';

        // Date picker
        const datePicker = dateTimeContainer.createEl('input', {
            type: 'date',
            value: (window as any).moment().format('YYYY-MM-DD')
        });

        // Time picker
        const currentTime = (window as any).moment().format('HH:mm');
        this.values.currentTime = currentTime; // Initialize the current time value
        new Setting(dateTimeContainer)
            .setName('Time')
            .addText(text => {
                text.setPlaceholder('HH:mm');
                text.inputEl.type = 'time';
                text.setValue(currentTime);
                // Read the initial value from the input
                this.values.currentTime = text.inputEl.value;
                text.onChange((value) => {
                    this.values.currentTime = value;
                });
                return text;
            });

        // State dropdown
        new Setting(contentEl)
            .setName('State')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('asleep', 'Asleep')
                    .addOption('awake', 'Awake')
                    .setValue('asleep');
                // Initialize asleep/awake state with current time
                this.values.asleepTime = this.values.currentTime;
                this.values.awakeTime = undefined;
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

        if (this.settings.enableJournalEntry || this.settings.enableSleepNote) {
            contentEl.createEl('h3', { text: 'Save Options' });
        }

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

        // Create submit button setting
        const submitSetting = new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText('Submit')
                    .setCta()
                    .onClick(async (evt) => {
                        const button = evt.target as HTMLButtonElement;
                        if (!button) return;

                        const dateStr = (dateTimeContainer.querySelector('input[type="date"]') as HTMLInputElement).value;
                        const timeStr = this.values.currentTime || (dateTimeContainer.querySelector('input[type="time"]') as HTMLInputElement).value;
                        const stateSelect = contentEl.querySelector('.dropdown') as HTMLSelectElement;

                        if (!dateStr || !timeStr || !stateSelect?.value) {
                            new Notice('Please fill in all required fields');
                            return;
                        }

                        const originalText = button.textContent || 'Submit';

                        try {
                            // Disable button and show loading state
                            button.disabled = true;
                            button.textContent = 'Saving...';

                            const measurementData: MeasurementRecord = {
                                date: `${dateStr} ${timeStr}`,
                                userId: this.settings.defaultUser || this.settings.users[0]?.id || '',
                            };

                            if (stateSelect.value === 'asleep') {
                                measurementData.asleepTime = timeStr;
                            } else {
                                measurementData.awakeTime = timeStr;
                                if (this.values.asleepTime) {
                                    const asleepMoment = (window as any).moment(`${dateStr} ${this.values.asleepTime}`, 'YYYY-MM-DD HH:mm');
                                    const awakeMoment = (window as any).moment(`${dateStr} ${timeStr}`, 'YYYY-MM-DD HH:mm');
                                    const duration = awakeMoment.diff(asleepMoment, 'hours', true);
                                    measurementData.sleepDuration = duration.toFixed(1);
                                }
                            }

                            // Save the current state of journal and sleep note settings
                            const originalJournalEnabled = this.settings.enableJournalEntry;
                            const originalSleepNoteEnabled = this.settings.enableSleepNote;

                            // Temporarily update settings based on toggle values
                            this.settings.enableJournalEntry = this.settings.enableJournalEntry && this.values.addToJournal;
                            this.settings.enableSleepNote = this.settings.enableSleepNote && this.values.addToSleepNote;

                            // Save the measurement with the temporary settings
                            await this.plugin.saveMeasurement(measurementData);

                            // Restore original settings
                            this.settings.enableJournalEntry = originalJournalEnabled;
                            this.settings.enableSleepNote = originalSleepNoteEnabled;

                            new Notice('Sleep record saved successfully');
                            this.close();
                        } catch (error) {
                            console.error('Failed to save sleep record:', error);
                            new Notice('Failed to save sleep record. Please try again.');

                            // Re-enable button and restore original text
                            button.disabled = false;
                            button.textContent = originalText;
                        }
                    });
                return btn;
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}