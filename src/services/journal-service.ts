import { App, TFile, Notice } from 'obsidian';
import type { Settings, MeasurementRecord } from '../types';
import { createNewNote } from '../note-creator';
import type { NoteCreatorSettings } from '../note-creator';
import { getJournalPath } from './path-service';

export class JournalService {
    private fileCreationInProgress: { [key: string]: Promise<TFile> } = {};

    constructor(private app: App, private settings: Settings) { }

    private formatTimestamp(timestamp: number): string {
        const moment = (window as any).moment;
        return moment(timestamp * 1000).format('HH:mm');
    }

    private getDateFromTimestamp(timestamp: number): string {
        const moment = (window as any).moment;
        return moment(timestamp * 1000).format('YYYY-MM-DD');
    }

    private formatDuration(duration: string): string {
        return parseFloat(duration).toFixed(1);
    }

    private extractTimestampFromContent(content: string, referenceDate?: string): number {
        const timeMatch = content.match(/\((asleep|awake)::\s*(\d{2}:\d{2})\)/);
        if (!timeMatch) return 0;
        
        const [, type, timeStr] = timeMatch;
        const [hours, minutes] = timeStr.split(':').map(Number);
        
        // Use the reference date if provided, otherwise use current date
        const date = referenceDate ? 
            new Date(referenceDate) : 
            new Date();
        
        // Adjust date for sleep times that might cross midnight
        if (type === 'asleep' && hours < 12) {
            // If it's an asleep time before noon, it's likely from the previous day
            date.setDate(date.getDate() - 1);
        }
        
        date.setHours(hours, minutes, 0, 0);
        return Math.floor(date.getTime() / 1000);
    }

    private hasExistingSleepEntry(content: string, timestamp: number): boolean {
        const prefix = `- [${this.settings.stringPrefixLetter}]`;
        const lines = content.split('\n');
        const referenceDate = this.getDateFromTimestamp(timestamp);
        
        for (const line of lines) {
            if (line.startsWith(prefix)) {
                // Extract both asleep and awake times if they exist
                const asleepMatch = line.match(/\(asleep::\s*(\d{2}:\d{2})\)/);
                const awakeMatch = line.match(/\(awake::\s*(\d{2}:\d{2})\)/);
                
                if (asleepMatch || awakeMatch) {
                    const lineTimestamp = this.extractTimestampFromContent(line, referenceDate);
                    if (lineTimestamp > 0) {
                        // Use a 30-second threshold for more precise comparison
                        const timeDiff = Math.abs(lineTimestamp - timestamp);
                        if (timeDiff < 30) {
                            return true;
                        }
                    }
                }
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

        // Simple check - if the exact string already exists, don't add it again
        if (!journalContent.includes(content.trim())) {
            // Append the new entry to the file
            const newContent = journalContent.trim() === '' 
                ? content 
                : journalContent.trim() + '\n' + content;

            // Update the file with retry
            if (file instanceof TFile) {
                for (let attempt = 0; attempt < 3; attempt++) {
                    try {
                        await this.app.vault.modify(file, newContent);
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
                
                await this.ensureFolderExists(this.settings.journalFolder);
                
                const moment = (window as any).moment;
                const titleDate = moment(date);
                const title = '# ' + titleDate.format('dddd, MMMM D, YYYY') + '\n\n';
                const file = await this.app.vault.create(journalPath, title);
                
                delete this.fileCreationInProgress[journalPath];
                return file;
            }
        })();

        return await this.fileCreationInProgress[journalPath];
    }

    async appendToJournal(data: MeasurementRecord) {
        try {
            const asleepTime = parseInt(data.asleepTime || '0');
            const awakeTime = parseInt(data.awakeTime || '0');
            const duration = data.sleepDuration || '0';

            // Get the correct dates for both asleep and awake times
            const asleepDate = this.getDateFromTimestamp(asleepTime);
            const awakeDate = this.getDateFromTimestamp(awakeTime);

            const prefix = `- [${this.settings.stringPrefixLetter}] `;

            // Add asleep entry to the correct day
            const asleepEntry = prefix + this.settings.asleepEntryTemplate
                .replace('<time>', this.formatTimestamp(asleepTime)) + '\n';
            await this.appendEntry(asleepDate, asleepEntry);

            // Add awake entry to the correct day
            const awakeEntry = prefix + this.settings.awakeEntryTemplate
                .replace('<time>', this.formatTimestamp(awakeTime))
                .replace('<duration>', this.formatDuration(duration)) + '\n';
            await this.appendEntry(awakeDate, awakeEntry);

        } catch (error) {
            console.error('Failed to update journal:', error);
            new Notice('Failed to update journal. Please try again.');
            throw error;
        }
    }
}