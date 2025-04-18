import { App, TFile, Notice } from 'obsidian';
import type { Settings, MeasurementRecord } from '../types';

export class MeasurementService {
    constructor(private app: App, private settings: Settings) { }

    private formatMermaidChart(data: Array<{ date: string, value: string }>): string {
        const chartData = data
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(item => `    "${item.date}" : ${item.value}`);

        return `\`\`\`mermaid
xychart-beta
    title Sleep Duration Over Time
    x-axis [${data[0].date} to ${data[data.length - 1].date}]
    y-axis "Hours"
    line
${chartData.join('\n')}
\`\`\``;
    }

    private formatQualityChart(data: Array<{ date: string, value: string }>): string {
        const chartData = data
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(item => `    "${item.date}" : ${item.value}`);

        return `\`\`\`mermaid
xychart-beta
    title Sleep Quality Over Time
    x-axis [${data[0].date} to ${data[data.length - 1].date}]
    y-axis "Quality (%)"
    line
${chartData.join('\n')}
\`\`\``;
    }

    async updateMeasurementFiles(data: MeasurementRecord) {
        try {
            // Create the measurements folder if it doesn't exist
            await this.app.vault.createFolder(this.settings.measurementFolder).catch(() => { });

            // Update each measurement file
            for (const measurement of this.settings.measurements) {
                const value = data[measurement.name];
                if (value !== undefined) {
                    const user = this.settings.users.find(u => u.id === data.userId);

                    // Create file name using template
                    const fileName = this.settings.measurementFileNameFormat
                        .replace(/<measure>/g, measurement.name)
                        .replace(/<user>/g, user?.name || 'Unknown');

                    const filePath = `${this.settings.measurementFolder}/${fileName}.md`;

                    // Create entry line using template
                    const entry = this.settings.measurementEntryTemplate
                        .replace(/<date>/g, data.date)
                        .replace(/<user>/g, user?.name || 'Unknown')
                        .replace(/<measure>/g, value)
                        .replace(/<unit>/g, measurement.unit);

                    // Get or create file with template
                    let content = '';
                    let measurementData: Array<{ date: string, value: string }> = [];
                    const existingFile = this.app.vault.getAbstractFileByPath(filePath);

                    if (existingFile instanceof TFile) {
                        content = await this.app.vault.read(existingFile);
                        // Parse existing data from the table
                        const tableLines = content.split('\n').filter(line => line.startsWith('|') && line.includes(measurement.unit));
                        measurementData = tableLines.map(line => {
                            const [date, , value] = line.split('|').map(cell => cell.trim());
                            return { date, value: value.replace(measurement.unit, '').trim() };
                        });
                    } else {
                        // Create new file with template if it exists
                        if (this.settings.measurementFileTemplate) {
                            const templateFile = this.app.vault.getAbstractFileByPath(this.settings.measurementFileTemplate);
                            if (templateFile instanceof TFile) {
                                content = await this.app.vault.read(templateFile);
                                // Replace template variables
                                content = content
                                    .replace(/<measurementName>/g, measurement.name)
                                    .replace(/<measurementType>/g, measurement.type)
                                    .replace(/<unit>/g, measurement.unit);
                            }
                        }

                        // If no template or template file not found, use default header
                        if (!content) {
                            content = `# ${measurement.name} History\n\n| Date | User | Value |\n|------|------|-------|\n`;
                        }
                    }

                    // Add new data point
                    measurementData.push({ date: data.date, value });

                    // Create chart section with appropriate formatter
                    const chartSection = measurement.type === 'quality'
                        ? this.formatQualityChart(measurementData)
                        : this.formatMermaidChart(measurementData);

                    // Add new entry and chart
                    let newContent = content.trim();
                    if (newContent.includes('```mermaid')) {
                        // Replace existing chart
                        newContent = newContent.replace(/```mermaid[\s\S]*?```/, chartSection);
                    } else {
                        // Add new chart after the table
                        newContent = newContent + '\n' + entry + '\n\n' + chartSection;
                    }

                    if (existingFile instanceof TFile) {
                        await this.app.vault.modify(existingFile, newContent);
                        new Notice(`Updated measurement file: ${fileName}`);
                    } else {
                        await this.app.vault.create(filePath, newContent);
                        new Notice(`Created new measurement file: ${fileName}`);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to update measurement files:', error);
            throw error;
        }
    }

    getUnitForMeasurement(type: 'duration' | 'quality'): { metric: string, imperial: string } {
        return type === 'duration'
            ? { metric: 'hours', imperial: 'hours' }
            : { metric: 'percent', imperial: 'percent' };
    }
}