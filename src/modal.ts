import { App, Modal, Setting } from 'obsidian';
import type { Settings, User, Measurement, MeasurementRecord } from './types';

export class MeasurementModal extends Modal {
    private settings: Settings;
    private measurementValues: { [key: string]: string } = {};

    constructor(app: App, private plugin: any) {
        super(app);
        this.settings = plugin.settings;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // Title
        contentEl.createEl('h2', { text: 'Sleep Record' });

        // Date picker
        new Setting(contentEl)
            .setName('Date')
            .addText(text => {
                text.inputEl.type = 'date';
                // Set today's date in YYYY-MM-DD format
                const moment = (window as any).moment;
                const today = moment().format('YYYY-MM-DD');
                text.setValue(today);
                return text;
            });

        // User dropdown
        const userContainer = new Setting(contentEl)
            .setName('User')
            .addDropdown(dropdown => {
                this.settings.users.forEach(user => {
                    dropdown.addOption(user.id, user.name);
                });
                if (this.settings.defaultUser) {
                    dropdown.setValue(this.settings.defaultUser);
                }
            });

        const measurementsContainer = contentEl.createDiv();
        measurementsContainer.addClass('measurements-container');

        // Sleep measurements
        this.settings.measurements.forEach(measurement => {
            const units = this.plugin.getUnitForMeasurement(measurement.type);
            const currentUnit = this.settings.measurementSystem === 'metric' ? units.metric : units.imperial;

            new Setting(measurementsContainer)
                .setName(`${measurement.name} (${currentUnit})`)
                .addText(text => {
                    text.inputEl.type = 'number';
                    text.inputEl.step = '0.1';
                    text.setPlaceholder(`Enter ${measurement.name.toLowerCase()}`);
                    text.onChange(value => {
                        if (value) {
                            this.measurementValues[measurement.name] = value;
                        } else {
                            delete this.measurementValues[measurement.name];
                        }
                    });
                    return text;
                });
        });

        // Submit button
        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Submit')
                .setCta()
                .onClick(() => {
                    const dateStr = (contentEl.querySelector('input[type="date"]') as HTMLInputElement).value;
                    const userId = (contentEl.querySelector('.dropdown') as HTMLSelectElement).value;
                    this.handleSubmit(dateStr, userId, this.measurementValues);
                    this.close();
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        this.measurementValues = {};
    }

    private handleSubmit(dateStr: string, userId: string, measurements: { [key: string]: string }) {
        const measurementData: MeasurementRecord = {
            date: dateStr,
            userId,
        };

        Object.entries(measurements).forEach(([name, value]) => {
            if (value && value.trim() !== '') {
                measurementData[name] = value;
            }
        });

        this.plugin.saveMeasurement(measurementData);
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
`);