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
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Add Sleep Record' });

        const dateTimeContainer = contentEl.createDiv({ cls: 'jots-sleep-tracker-date-time-container' });

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

        new Setting(dateTimeContainer)
            .setName('Time')
            .setClass('time-setting')
            .addText(text => {
                text.inputEl.type = 'time';
                const moment = (window as any).moment;
                const now = moment().format('HH:mm');
                text.setValue(now);
                this.values.currentTime = now;
                text.onChange((value) => {
                    this.values.currentTime = value;
                });
                return text;
            });

        new Setting(contentEl)
            .setName('State')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('asleep', 'Asleep')
                    .addOption('awake', 'Awake')
                    .setValue('asleep');
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

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Submit')
                .setCta()
                .onClick(async () => {
                    const dateStr = (dateTimeContainer.querySelector('input[type="date"]') as HTMLInputElement).value;
                    const timeStr = this.values.currentTime;
                    const stateSelect = contentEl.querySelector('.dropdown') as HTMLSelectElement;

                    if (!dateStr || !timeStr || !stateSelect?.value) {
                        new Notice('Please fill in all required fields');
                        return;
                    }

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
                            if (this.values.asleepTime) {
                                const asleepMoment = (window as any).moment(`${dateStr} ${this.values.asleepTime}`, 'YYYY-MM-DD HH:mm');
                                const awakeMoment = (window as any).moment(`${dateStr} ${timeStr}`, 'YYYY-MM-DD HH:mm');
                                const duration = awakeMoment.diff(asleepMoment, 'hours', true);
                                measurementData.sleepDuration = duration.toFixed(1);
                            }
                        }

                        console.log('Sending measurement data:', measurementData);

                        this.settings.enableJournalEntry = this.settings.enableJournalEntry && this.values.addToJournal;
                        this.settings.enableSleepNote = this.settings.enableSleepNote && this.values.addToSleepNote;

                        await this.plugin.saveMeasurement(measurementData);
                        new Notice('Sleep record saved successfully');
                        this.close();
                    } catch (error) {
                        console.error('Failed to save sleep record:', error);
                        new Notice('Failed to save sleep record. Please try again.');
                    } finally {
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