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
        const prefix = `- [${this.settings.stringPrefixLetter}]`;
        const lines = content.split('\n');

        for (const line of lines) {
            if (line.startsWith(prefix)) {
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
        console.log('JournalService: Attempting to append to path:', journalPath);
        let file = this.app.vault.getAbstractFileByPath(journalPath);
        let journalContent = '';

        // If file doesn't exist, create it and ensure it's ready
        if (!(file instanceof TFile)) {
            console.log('JournalService: File does not exist, creating new file');
            try {
                file = await this.createJournalFile(journalPath, date);
                await new Promise(resolve => setTimeout(resolve, 500));

                const verifiedFile = await this.waitForFile(journalPath);
                if (!verifiedFile) {
                    console.error('JournalService: Failed to verify journal file after creation');
                    throw new Error('Failed to verify journal file after creation');
                }
                file = verifiedFile;
                console.log('JournalService: Successfully created and verified new file');
            } catch (error) {
                console.error('Error creating journal file:', error);
                throw new Error('Failed to create or verify journal file');
            }
        }

        // Read existing content with retry
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                if (file instanceof TFile) {
                    journalContent = await this.app.vault.read(file);
                    console.log('JournalService: Read existing content, length:', journalContent.length);
                    if (journalContent.includes('{{')) {
                        console.log('JournalService: Found template markers, waiting for processing...');
                        await new Promise(resolve => setTimeout(resolve, 500));
                        continue;
                    }
                    break;
                }
            } catch (error) {
                console.log('JournalService: Read attempt', attempt + 1, 'failed:', error);
                if (attempt === 2) throw error;
                await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
            }
        }

        // Check for existing entry
        if (this.hasExistingSleepEntry(journalContent, date, content)) {
            console.log('JournalService: Found existing sleep entry, skipping append');
            return;
        }

        // Simple check - if the exact string already exists, don't add it again
        if (!journalContent.includes(content.trim())) {
            console.log('JournalService: Adding new entry to journal');
            // Append the new entry to the file
            const newContent = journalContent.trim() === ''
                ? content
                : journalContent.trim() + '\n' + content;

            // Update the file with retry
            if (file instanceof TFile) {
                for (let attempt = 0; attempt < 3; attempt++) {
                    try {
                        await this.app.vault.modify(file, newContent);
                        console.log('JournalService: Successfully updated journal file');
                        break;
                    } catch (error) {
                        console.log('JournalService: Update attempt', attempt + 1, 'failed:', error);
                        if (attempt === 2) throw error;
                        await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
                    }
                }
            }
        } else {
            console.log('JournalService: Entry already exists in journal, skipping append');
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
                    console.log(`Template not yet processed, attempt ${i + 1}`);
                } catch (error) {
                    console.log(`File exists but not ready for reading, attempt ${i + 1}`);
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
            console.log('[Sleep Tracker Debug] Previous journal path:', previousJournalPath);

            if (await this.app.vault.adapter.exists(previousJournalPath)) {
                console.log('[Sleep Tracker Debug] Found previous day journal file');
                const content = await this.app.vault.adapter.read(previousJournalPath);
                console.log('[Sleep Tracker Debug] Previous day journal content:', content);
                return this.extractSleepTimeFromContent(content);
            }
            return null;
        }

        // If input is content, extract sleep time directly
        return this.extractSleepTimeFromContent(input);
    }

    private extractSleepTimeFromContent(content: string): string | null {
        console.log('[Sleep Tracker Debug] Searching through lines for asleep entry...');
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

    private hasExistingSleepNoteEntry(content: string, date: string, time: string, type: string): boolean {
        const lines = content.split('\n');
        const searchEntry = `| ${date} | ${time} | ${type}`;
        return lines.some(line => line.includes(searchEntry));
    }

    private async appendToSleepNote(data: MeasurementRecord): Promise<void> {
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
                file = await this.app.vault.create(this.settings.sleepNotePath, '# Sleep Tracking\n\n| Date | Time | Type | Duration |\n|------|------|------|----------|\n');

                const verifiedFile = await this.waitForFile(this.settings.sleepNotePath);
                if (!verifiedFile) {
                    throw new Error('Failed to verify sleep note file after creation');
                }
                file = verifiedFile;
            }

            // Read existing content with retry
            let content = '';
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    if (file instanceof TFile) {
                        content = await this.app.vault.read(file);
                        if (content.includes('{{')) {
                            await new Promise(resolve => setTimeout(resolve, 500));
                            continue;
                        }
                        break;
                    }
                } catch (error) {
                    console.log('Sleep note read attempt', attempt + 1, 'failed:', error);
                    if (attempt === 2) throw error;
                    await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
                }
            }

            if (!content) {
                throw new Error('Could not read sleep note content');
            }

            const [date, time] = data.date.split(' ');
            const formattedTime = this.formatTime(time);
            const militaryTime = this.formatMilitaryTime(time);
            let modifiedContent = false;

            if (data.asleepTime) {
                const type = '💤 Asleep';
                if (!this.hasExistingSleepNoteEntry(content, date, formattedTime, type)) {
                    const entry = this.settings.sleepNoteTemplate
                        .replace('<date>', date)
                        .replace('<time>', formattedTime)
                        .replace('<mtime>', militaryTime)
                        .replace('<type>', type)
                        .replace('<duration>', '') + '\n';
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

                const type = '⏰ Awake';
                if (!this.hasExistingSleepNoteEntry(content, date, formattedTime, type)) {
                    const entry = this.settings.sleepNoteTemplate
                        .replace('<date>', date)
                        .replace('<time>', formattedTime)
                        .replace('<mtime>', militaryTime)
                        .replace('<type>', type)
                        .replace('<duration>', duration) + '\n';
                    content = content.trim() + '\n' + entry;
                    modifiedContent = true;
                }
            }

            // Only modify the file if we actually added new content
            if (modifiedContent && file instanceof TFile) {
                for (let attempt = 0; attempt < 3; attempt++) {
                    try {
                        await this.app.vault.modify(file, content);
                        console.log('Successfully updated sleep note');
                        break;
                    } catch (error) {
                        console.log('Sleep note update attempt', attempt + 1, 'failed:', error);
                        if (attempt === 2) throw error;
                        await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
                    }
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
                console.log('JournalService: Starting appendToJournal with data:', data);
                console.log('JournalService: Using prefix:', prefix);
                console.log('JournalService: Current settings:', this.settings);

                if (data.asleepTime) {
                    const [date, time] = data.date.split(' ');
                    const formattedTime = this.formatTime(time);
                    const militaryTime = this.formatMilitaryTime(time);
                    console.log('JournalService: Adding asleep entry for date:', date, 'time:', formattedTime);
                    const asleepEntry = prefix + this.settings.asleepEntryTemplate
                        .replace('<time>', formattedTime)
                        .replace('<mtime>', militaryTime) + '\n';
                    console.log('JournalService: Generated asleep entry:', asleepEntry);
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

                    console.log('JournalService: Adding awake entry for date:', date, 'time:', formattedTime);
                    const awakeEntry = prefix + this.settings.awakeEntryTemplate
                        .replace('<time>', formattedTime)
                        .replace('<mtime>', militaryTime)
                        .replace('<duration>', duration) + '\n';
                    console.log('JournalService: Generated awake entry:', awakeEntry);
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