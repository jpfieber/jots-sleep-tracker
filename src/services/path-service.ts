import type { Settings } from '../types';

export function getJournalPath(date: string, settings: Settings): string {
    const moment = (window as any).moment;
    if (!moment) {
        throw new Error('Moment.js is required');
    }

    // Create and validate the moment object
    const [year, month, day] = date.split('-').map(num => parseInt(num, 10));
    const mDate = moment([year, month - 1, day]).hours(12);

    if (!mDate.isValid()) {
        throw new Error('Invalid date format');
    }

    // Format path components using settings
    const subDir = mDate.format(settings.journalSubDirectory);
    let fileName = mDate.format(settings.journalNameFormat);

    // Special handling for ddd to ensure continuous iteration through dates
    fileName = fileName.replace('ddd', String.fromCharCode(97 + mDate.day())); // a-g for Sun-Sat

    return `${settings.journalFolder}/${subDir}/${fileName}.md`;
}