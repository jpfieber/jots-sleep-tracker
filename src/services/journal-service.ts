import { App, TFile, Notice } from 'obsidian';
import type { Settings, MeasurementRecord } from '../types';
import { createNewNote } from '../note-creator';
import type { NoteCreatorSettings } from '../note-creator';
import { getJournalPath } from './path-service';

export class JournalService {
    private fileCreationInProgress: { [key: string]: Promise<TFile> } = {};

    constructor(private app: App, private settings: any) { }

    private formatTime(timeStr: string): string {
        // Use moment to parse and format the time to ensure it's in HH:mm format
        const moment = (window as any).moment;
        if (!timeStr) return '';
        const time = moment(timeStr, 'HH:mm');
        return time.isValid() ? time.format('h:mmA') : timeStr;
    }

    private formatMilitaryTime(timeStr: string): string {
        // Format time in 24-hour format
        const moment = (window as any).moment;
        if (!timeStr) return '';
        const time = moment(timeStr, 'HH:mm');
        return time.isValid() ? time.format('HH:mm') : timeStr;
    }

    private getDateFromDateAndTime(date: string, time: string): string {
        const moment = (window as any).moment;
        return moment(date + ' ' + time).format('YYYY-MM-DD');
    }

    private hasExistingSleepEntry(content: string, date: string, time: string): boolean {
        const prefix = this.settings.enableJournalEntryCallout 
            ? `> - [${this.settings.stringPrefixLetter}]`
            : `- [${this.settings.stringPrefixLetter}]`;
        const lines = content.split('\n');

        for (const line of lines) {
            if (line.includes(prefix)) {
                const asleepMatch = line.match(/\(asleep::\s*(\d{2}:\d{2})\)/);
                const awakeMatch = line.match(/\(awake::\s*(\d{2}:\d{2})\)/);

                if (asleepMatch && asleepMatch[1] === time) return true;
                if (awakeMatch && awakeMatch[1] === time) return true;
            }
        }

        return false;
    }

    private async appendEntry(date: string, content: string): Promise<void> {
        const journalPath = getJournalPath(date, this.settings);
        let file = this.app.vault.getAbstractFileByPath(journalPath);
        let journalContent = '';

        // If file doesn't exist, create it and ensure it's ready
        if (!(file instanceof TFile)) {
            try {
                file = await this.createJournalFile(journalPath, date);
                await new Promise(resolve => setTimeout(resolve, 500));

                const verifiedFile = await this.waitForFile(journalPath);
                if (!verifiedFile) {
                    throw new Error('Failed to verify journal file after creation');
                }
                file = verifiedFile;
                new Notice(`Created journal: ${journalPath}`);
            } catch (error) {
                console.error('Error creating journal file:', error);
                new Notice('Failed to create journal file. Please try again.');
                throw new Error('Failed to create or verify journal file');
            }
        }

        // Read existing content with retry
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                if (file instanceof TFile) {
                    journalContent = await this.app.vault.read(file);
                    if (journalContent.includes('{{')) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                        continue;
                    }
                    break;
                }
            } catch (error) {
                if (attempt === 2) throw error;
                await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
            }
        }

        // Format content as callout if enabled
        const formattedContent = this.settings.enableJournalEntryCallout 
            ? content.split('\n').filter(line => line.trim()).map(line => '> ' + line).join('\n')
            : content;

        // Extract the time from the content using the existing detection logic
        const [time] = content.match(/\((?:asleep|awake)::\s*(\d{2}:\d{2})\)/) || [];
        
        // Check for existing entry using our more robust detection
        if (this.hasExistingSleepEntry(journalContent, date, time)) {
            return;
        }

        // Simple check - if the exact string already exists, don't add it again
        if (!journalContent.includes(formattedContent.trim())) {
            // Append the new entry to the file
            const newContent = journalContent.trim() === ''
                ? formattedContent.trim()
                : journalContent.trim() + '\n' + formattedContent.trim();

            // Update the file with retry
            if (file instanceof TFile) {
                for (let attempt = 0; attempt < 3; attempt++) {
                    try {
                        await this.app.vault.modify(file, newContent);
                        new Notice(`Updated journal: ${journalPath}`);
                        break;
                    } catch (error) {
                        if (attempt === 2) throw error;
                        await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
                    }
                }
            }
        }
    }

    private async waitForFile(filePath: string, maxAttempts = 50, initialDelay = 100): Promise<TFile | null> {
        let delay = initialDelay;
        for (let i = 0; i < maxAttempts; i++) {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file instanceof TFile) {
                try {
                    const content = await this.app.vault.read(file);
                    if (!content.includes('{{')) {
                        return file;
                    }
                } catch (error) {
                    // Continue trying
                }
            }
            delay = Math.min(delay * 1.5, 1000);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        return null;
    }

    private async ensureFolderExists(folderPath: string): Promise<void> {
        try {
            const folder = this.app.vault.getAbstractFileByPath(folderPath);
            if (!folder) {
                await this.app.vault.createFolder(folderPath);
            }
        } catch (error) {
            // Folder likely exists, ignore the error
        }
    }

    private async createJournalFile(journalPath: string, date: string): Promise<TFile> {
        // First check if we're already creating this file
        if (journalPath in this.fileCreationInProgress) {
            return await this.fileCreationInProgress[journalPath];
        }

        // Start the file creation process
        this.fileCreationInProgress[journalPath] = (async () => {
            try {
                await this.ensureFolderExists(this.settings.journalFolder);

                const parentPath = journalPath.substring(0, journalPath.lastIndexOf('/'));
                if (parentPath) {
                    await this.ensureFolderExists(parentPath);
                }

                const settings: NoteCreatorSettings = {
                    rootFolder: this.settings.journalFolder,
                    subFolder: this.settings.journalSubDirectory,
                    nameFormat: this.settings.journalNameFormat,
                    templatePath: this.settings.dailyNoteTemplate
                };

                const moment = (window as any).moment;
                const titleDate = moment(date);
                const title = '# ' + titleDate.format('dddd, MMMM D, YYYY');

                let file = await createNewNote(this.app, date, journalPath, settings, title);

                for (let i = 0; i < 10; i++) {
                    await new Promise(resolve => setTimeout(resolve, 500));

                    const verifiedFile = await this.waitForFile(journalPath);
                    if (verifiedFile) {
                        const content = await this.app.vault.read(verifiedFile);
                        if (!content.includes('{{')) {
                            delete this.fileCreationInProgress[journalPath];
                            return verifiedFile;
                        }
                    }
                }

                throw new Error('Failed to verify template processing');
            } catch (error) {
                console.error('Failed to create note:', error);
                await this.app.vault.createFolder(this.settings.journalFolder);
                const file = await this.app.vault.create(journalPath, '');
                delete this.fileCreationInProgress[journalPath];
                return file;
            }
        })();

        return await this.fileCreationInProgress[journalPath];
    }

    private async findMostRecentSleepTime(input: string): Promise<string | null> {
        // If input is a date, we need to find and read the previous day's journal
        if (input.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const date = input;
            const previousDate = (window as any).moment(date).subtract(1, 'day').format('YYYY-MM-DD');
            const previousJournalPath = getJournalPath(previousDate, this.settings);

            if (await this.app.vault.adapter.exists(previousJournalPath)) {
                const content = await this.app.vault.adapter.read(previousJournalPath);
                return this.extractSleepTimeFromContent(content);
            }
            return null;
        }

        // If input is content, extract sleep time directly
        return this.extractSleepTimeFromContent(input);
    }

    private extractSleepTimeFromContent(content: string): string | null {
        const lines = content.split('\n');
        for (const line of lines) {
            if (line.includes('(type:: 💤)')) {
                const timeMatch = line.match(/\(time:: (\d{2}:\d{2})\)/);
                if (timeMatch) {
                    return timeMatch[1];
                }
            }
        }
        return null;
    }

    private calculateSleepDuration(sleepTime: string, wakeTime: string, date?: string): number {
        const moment = (window as any).moment;
        let sleepMoment, awakeMoment;

        if (date) {
            // If date is provided, use full date-time calculation
            const previousDate = moment(date).subtract(1, 'day').format('YYYY-MM-DD');
            awakeMoment = moment(`${date} ${wakeTime}`, 'YYYY-MM-DD HH:mm');
            sleepMoment = moment(`${previousDate} ${sleepTime}`, 'YYYY-MM-DD HH:mm');

            // If sleep time is actually from same day, adjust the date
            if (awakeMoment.hour() >= 12 || (sleepMoment.hour() >= 12 && awakeMoment.hour() >= sleepMoment.hour())) {
                sleepMoment.add(1, 'day');
            }
        } else {
            // Simple time-only calculation
            sleepMoment = moment(sleepTime, 'HH:mm');
            awakeMoment = moment(wakeTime, 'HH:mm');

            // If wake time is earlier than sleep time, it means the wake time is on the next day
            if (awakeMoment.isBefore(sleepMoment)) {
                awakeMoment.add(1, 'day');
            }
        }

        const duration = awakeMoment.diff(sleepMoment, 'hours', true);
        return duration < 0 ? 0 : Math.round(duration * 10) / 10; // Round to 1 decimal place
    }

    private hasExistingSleepNoteEntry(content: string, date: string, time: string): boolean {
        const lines = content.split('\n');
        const searchEntry = `| ${date} | ${time}`;
        return lines.some(line => line.includes(searchEntry));
    }

    public async appendToSleepNote(data: MeasurementRecord): Promise<void> {
        try {
            if (!this.settings.sleepNotePath) {
                throw new Error('Sleep note path not configured');
            }

            let file = this.app.vault.getAbstractFileByPath(this.settings.sleepNotePath);

            // Create the file if it doesn't exist
            if (!(file instanceof TFile)) {
                const folder = this.settings.sleepNotePath.substring(0, this.settings.sleepNotePath.lastIndexOf('/'));
                if (folder) {
                    await this.ensureFolderExists(folder);
                }
                const initialContent = '# Sleep Tracking\n\n| Date | Time | Type | Duration |\n|------|------|------|----------|\n';
                file = await this.app.vault.create(this.settings.sleepNotePath, initialContent);

                // Wait for the file to be ready with multiple attempts
                for (let i = 0; i < 10; i++) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    const verifiedFile = await this.waitForFile(this.settings.sleepNotePath);
                    if (verifiedFile) {
                        const content = await this.app.vault.read(verifiedFile);
                        if (!content.includes('{{')) {
                            file = verifiedFile;
                            break;
                        }
                    }
                }

                if (!(file instanceof TFile)) {
                    throw new Error('Failed to verify sleep note file after creation');
                }
                new Notice(`Created sleep note: ${this.settings.sleepNotePath}`);
            }

            // Read existing content with retry
            let content = '';
            let readSuccess = false;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    if (file instanceof TFile) {
                        content = await this.app.vault.read(file);
                        if (!content.includes('{{')) {
                            readSuccess = true;
                            break;
                        }
                    }
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
                }
            }

            if (!readSuccess) {
                throw new Error('Could not read sleep note content');
            }

            const [date, time] = data.date.split(' ');
            const formattedTime = this.formatTime(time);
            const militaryTime = this.formatMilitaryTime(time);
            let modifiedContent = false;

            if (data.asleepTime) {
                if (!this.hasExistingSleepNoteEntry(content, date, formattedTime)) {
                    const entry = this.settings.asleepNoteTemplate
                        .replace('<date>', date)
                        .replace('<time>', formattedTime)
                        .replace('<mtime>', militaryTime);
                    content = content.trim() + '\n' + entry;
                    modifiedContent = true;
                }
            }

            if (data.awakeTime) {
                let duration = '0.0';
                if (!data.sleepDuration) {
                    const previousSleepTime = await this.findMostRecentSleepTime(date);
                    if (previousSleepTime) {
                        const durationHours = this.calculateSleepDuration(previousSleepTime, formattedTime, date);
                        duration = durationHours.toFixed(1);
                    }
                } else {
                    duration = data.sleepDuration;
                }

                if (!this.hasExistingSleepNoteEntry(content, date, formattedTime)) {
                    const entry = this.settings.awakeNoteTemplate
                        .replace('<date>', date)
                        .replace('<time>', formattedTime)
                        .replace('<mtime>', militaryTime)
                        .replace('<duration>', duration);
                    content = content.trim() + '\n' + entry;
                    modifiedContent = true;
                }
            }

            // Only modify the file if we actually added new content and have a valid file
            if (modifiedContent && file instanceof TFile) {
                let writeSuccess = false;
                for (let attempt = 0; attempt < 3; attempt++) {
                    try {
                        await this.app.vault.modify(file, content + '\n');
                        writeSuccess = true;
                        new Notice(`Updated sleep note: ${this.settings.sleepNotePath}`);
                        break;
                    } catch (error) {
                        await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
                    }
                }

                if (!writeSuccess) {
                    throw new Error('Failed to write to sleep note after multiple attempts');
                }
            }
        } catch (error) {
            console.error('Failed to update sleep note:', error);
            new Notice('Failed to update sleep note. Please try again.');
            throw error;
        }
    }

    async appendToJournal(data: MeasurementRecord) {
        try {
            if (this.settings.enableJournalEntry) {
                const prefix = `- [${this.settings.stringPrefixLetter}] `;

                if (data.asleepTime) {
                    const [date, time] = data.date.split(' ');
                    const formattedTime = this.formatTime(time);
                    const militaryTime = this.formatMilitaryTime(time);
                    const asleepEntry = prefix + this.settings.asleepEntryTemplate
                        .replace('<time>', formattedTime)
                        .replace('<mtime>', militaryTime) + '\n';
                    await this.appendEntry(date, asleepEntry);
                }

                if (data.awakeTime) {
                    const [date, time] = data.date.split(' ');
                    const formattedTime = this.formatTime(time);
                    const militaryTime = this.formatMilitaryTime(time);
                    let duration = '0.0';

                    if (!data.sleepDuration) {
                        const previousSleepTime = await this.findMostRecentSleepTime(date);
                        if (previousSleepTime) {
                            const durationHours = this.calculateSleepDuration(previousSleepTime, formattedTime, date);
                            duration = durationHours.toFixed(1);
                        }
                    } else {
                        duration = data.sleepDuration.toString();
                    }

                    const awakeEntry = prefix + this.settings.awakeEntryTemplate
                        .replace('<time>', formattedTime)
                        .replace('<mtime>', militaryTime)
                        .replace('<duration>', duration) + '\n';
                    await this.appendEntry(date, awakeEntry);
                }
            }

            if (this.settings.enableSleepNote) {
                await this.appendToSleepNote(data);
            }
        } catch (error) {
            console.error('Failed to update entries:', error);
            new Notice('Failed to update entries. Please try again.');
            throw error;
        }
    }
}