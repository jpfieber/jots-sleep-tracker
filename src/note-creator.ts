import { App, normalizePath, Notice, TFile } from 'obsidian';
import * as moment from 'moment';

export interface NoteCreatorSettings {
    rootFolder: string;
    subFolder: string;
    nameFormat: string;
    templatePath?: string;
}

/**
 * Process a template file with Obsidian template variables
 */
async function processTemplate(app: App, dateStr: string, templateContent: string, settings: NoteCreatorSettings): Promise<string> {
    // Create moment instance for template processing
    const momentDate = moment.default(dateStr).hours(12).minutes(0).seconds(0);
    const now = moment.default().hours(12).minutes(0).seconds(0);

    console.log('[NoteCreator] Processing template with date:', {
        inputDate: dateStr,
        momentDate: momentDate.format('YYYY-MM-DD HH:mm:ss'),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });

    // Handle formatted target date variables like {{date:YYYY-MM-DD}}
    let content = templateContent.replace(/{{date:([^}]+)}}/g, (match, format) => {
        return momentDate.format(format);
    });

    // Handle formatted current date variables like {{tdate:YYYY-MM-DD}}
    content = content.replace(/{{tdate:([^}]+)}}/g, (match, format) => {
        return now.format(format);
    });

    // Get the filename without extension for the title
    const fileName = momentDate.format('YYYY-MM-DD_ddd');

    return content
        .replace(/{{title}}/g, fileName)
        // Use target date for date variables
        .replace(/{{date}}/g, momentDate.format('MMMM D, YYYY'))
        // Add new variables for current date
        .replace(/{{tdate}}/g, now.format('MMMM D, YYYY'));
}

/**
 * Get the full path for a note based on date and settings
 */
export function getNotePath(dateStr: string, settings: NoteCreatorSettings): { notePath: string, noteName: string } {
    const momentDate = moment.default(dateStr).hours(12);
    const placeholders = createDatePlaceholders(momentDate);
    const noteName = replacePlaceholders(settings.nameFormat, placeholders) + (!settings.nameFormat.endsWith('.md') ? '.md' : '');
    const subFolder = replacePlaceholders(settings.subFolder, placeholders);
    const notePath = normalizePath(`${settings.rootFolder}/${subFolder}/${noteName}`);

    return { notePath, noteName };
}

/**
 * Create date-based placeholders for file naming
 */
function createDatePlaceholders(momentDate: moment.Moment) {
    return {
        'YYYY': momentDate.format('YYYY'),
        'YY': momentDate.format('YY'),
        'MMMM': momentDate.format('MMMM'),
        'MMM': momentDate.format('MMM'),
        'MM': momentDate.format('MM'),
        'M': momentDate.format('M'),
        'DDDD': momentDate.format('dddd'),
        'DDD': momentDate.format('ddd'),
        'DD': momentDate.format('DD'),
        'D': momentDate.format('D')
    };
}

/**
 * Replace date placeholders in a string
 */
function replacePlaceholders(str: string, placeholders: Record<string, string | number>): string {
    return str.replace(/YYYY|YY|MMMM|MMM|MM|M|DDDD|DDD|DD|D/g,
        (match: string) => String(placeholders[match] || match)
    );
}

/**
 * Create a new note with template or default content
 */
export async function createNewNote(
    app: App,
    dateStr: string,
    notePath: string,
    settings: NoteCreatorSettings,
    defaultContent?: string
): Promise<TFile> {
    let content: string;
    if (settings.templatePath) {
        try {
            const templateFile = app.vault.getAbstractFileByPath(settings.templatePath);
            if (templateFile && templateFile instanceof TFile) {
                const templateContent = await app.vault.read(templateFile);
                content = await processTemplate(app, dateStr, templateContent, settings);
            } else {
                throw new Error(`Template file not found: ${settings.templatePath}`);
            }
        } catch (error) {
            console.error("Error reading template file:", error);
            content = defaultContent || createDefaultContent(dateStr);
        }
    } else {
        content = defaultContent || createDefaultContent(dateStr);
    }

    // Create the file's directory if it doesn't exist
    const dirPath = notePath.substring(0, notePath.lastIndexOf('/'));
    try {
        // Check if folder exists first
        const folder = app.vault.getAbstractFileByPath(dirPath);
        if (!folder) {
            await app.vault.adapter.mkdir(normalizePath(dirPath));
        }
    } catch (error) {
        console.log("Folder may already exist:", dirPath);
    }

    // Create the file
    const file = await app.vault.create(notePath, content);
    new Notice(`Created new note: ${notePath}`);

    return file;
}

/**
 * Create default content for a new note
 */
function createDefaultContent(dateStr: string): string {
    const momentDate = moment.default(dateStr);
    return `# ${momentDate.format('dddd, MMMM D, YYYY')}`;
}