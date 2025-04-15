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

    private formatDuration(duration: string): string {
        return parseFloat(duration).toFixed(1);
    }

    private async waitForFile(filePath: string, maxAttempts = 50, initialDelay = 100): Promise<TFile | null> {
        let delay = initialDelay;
        for (let i = 0; i < maxAttempts; i++) {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file instanceof TFile) {
                // Try to read the file to ensure it's fully written and processed
                try {
                    const content = await this.app.vault.read(file);
                    // File exists and is readable, now check if template is processed
                    if (!content.includes('{{')) {
                        return file;
                    }
                    console.log(`Template not yet processed, attempt ${i + 1}`);
                } catch (error) {
                    console.log(`File exists but not ready for reading, attempt ${i + 1}`);
                }
            }
            // Exponential backoff with a cap
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
                // Ensure journal root folder exists
                await this.ensureFolderExists(this.settings.journalFolder);

                // Ensure parent folders exist
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

                // Create the file
                let file = await createNewNote(this.app, date, journalPath, settings, title);
                
                // Wait for the file to be fully processed
                for (let i = 0; i < 10; i++) {
                    // Add a delay between checks
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Check if file exists and is properly processed
                    const verifiedFile = await this.waitForFile(journalPath);
                    if (verifiedFile) {
                        const content = await this.app.vault.read(verifiedFile);
                        if (!content.includes('{{')) {
                            // File is ready and template is processed
                            delete this.fileCreationInProgress[journalPath];
                            return verifiedFile;
                        }
                    }
                }

                throw new Error('Failed to verify template processing');
            } catch (error) {
                console.error('Failed to create note:', error);
                
                // Ensure folder exists one last time
                await this.ensureFolderExists(this.settings.journalFolder);
                
                // Create empty file with title as fallback
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
        const journalPath = getJournalPath(data.date, this.settings);
        let file = this.app.vault.getAbstractFileByPath(journalPath);
        let journalContent = '';

        // If file doesn't exist, create it and ensure it's ready
        if (!(file instanceof TFile)) {
            try {
                file = await this.createJournalFile(journalPath, data.date);
                // Wait a moment to ensure file system has settled
                await new Promise(resolve => setTimeout(resolve, 500));

                // Get a fresh reference to the file
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

        try {
            // Read existing content with retry
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    if (file instanceof TFile) {
                        journalContent = await this.app.vault.read(file);
                        if (journalContent.includes('{{')) {
                            // Template hasn't been processed yet, wait and retry
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

            // Format sleep record using separate templates
            const asleepTime = parseInt(data.asleepTime || '0');
            const awakeTime = parseInt(data.awakeTime || '0');
            const duration = data.sleepDuration || '0';

            // Create sleep and wake entries on separate lines
            const prefix = `- [${this.settings.stringPrefixLetter}] `;
            const asleepPart = this.settings.asleepEntryTemplate.replace('<time>', this.formatTimestamp(asleepTime));
            const awakePart = this.settings.awakeEntryTemplate
                .replace('<time>', this.formatTimestamp(awakeTime))
                .replace('<duration>', this.formatDuration(duration));

            const sleepEntries = `${prefix}${asleepPart}\n${prefix}${awakePart}`;

            // Append the new sleep records to the file
            if (journalContent.trim() === '') {
                journalContent = sleepEntries + '\n';
            } else {
                journalContent = journalContent.trim() + '\n' + sleepEntries + '\n';
            }

            // Update the file with retry
            if (file instanceof TFile) {
                for (let attempt = 0; attempt < 3; attempt++) {
                    try {
                        await this.app.vault.modify(file, journalContent);
                        break;
                    } catch (error) {
                        if (attempt === 2) throw error;
                        await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
                    }
                }
            }
        } catch (error) {
            console.error('Failed to update journal:', error);
            new Notice('Failed to update journal. Please try again.');
            throw error;
        }
    }
}