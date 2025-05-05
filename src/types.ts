export type MeasurementType = 'duration' | 'quality';
export type MeasurementSystem = 'metric' | 'imperial';
export type MeasurementUnit = 'hours' | 'minutes' | 'percent';

export interface User {
    id: string;
    name: string;
}

export interface Measurement {
    name: string;
    value: string;
    type: MeasurementType;
    unit: MeasurementUnit;
}

export interface MeasurementRecord {
    [key: string]: string | undefined;
    date: string;
    userId: string;
    asleepTime?: string;
    awakeTime?: string;
    sleepDuration?: string;
}

export interface SleepData {
    startTime: number;
    endTime: number;
    sleepDuration: number;
    location?: string;
    city?: string;
    deepSleepPercent?: number;
    deepSleepMinutes?: number;
    lightSleepMinutes?: number;
    remMinutes?: number;
    awakeMinutes?: number;
    efficiency?: number;
    cycles?: number;
    noisePercent?: number;
    snoringDuration?: string;
    comment?: string;
    graph?: string;
}

export interface Settings {
    // Journal settings
    enableJournalEntry: boolean;
    journalFolder: string;
    journalSubDirectory: string;
    journalNameFormat: string;
    asleepEntryTemplate: string;
    awakeEntryTemplate: string;
    enableJournalEntryCallout: boolean;  // New setting
    stringPrefixLetter: string;
    decoratedTaskSymbol: string;
    taskSvgIcon: string;
    dailyNoteTemplate?: string;

    // Sleep Note settings
    enableSleepNote: boolean;
    sleepNotePath: string;
    asleepNoteTemplate: string;
    awakeNoteTemplate: string;
    sleepNotesFolder: string;
    enableSleepEventNotes: boolean;
    sleepEventNotesSubDirectory: string;  // New setting

    // Measurement file settings
    enableMeasurementFiles: boolean;
    measurementFolder: string;
    measurementFileTemplate?: string;
    measurementEntryTemplate: string;
    measurementFileNameFormat: string;

    // User settings
    users: User[];
    defaultUser?: string;

    // Measurement settings
    measurementSystem: MeasurementSystem;
    measurements: Measurement[];

    // Sleep tracking settings
    trackTotalSleep: boolean;
    trackSleepQuality: boolean;
    trackSleepStages: boolean;

    // Sync settings
    lastSyncJournalEnabled: boolean;
    lastSyncSleepNoteEnabled: boolean;
    lastSyncStartDate?: string;
    lastSyncEndDate?: string;

    // Calendar integration settings
    calendarUrl?: string;
    useCalendarForSleepNotes: boolean;

    // Google Fit integration settings
    enableGoogleFit: boolean;
    googleClientId: string;
    googleClientSecret: string;
    googleAccessToken?: string;
    googleRefreshToken?: string;
    googleTokenExpiry?: number;
    googleAuthState?: string;
    googleAutoSyncInterval: number;
}

export const DEFAULT_SETTINGS: Settings = {
    // Journal settings
    enableJournalEntry: true,
    enableJournalEntryCallout: false,  // New setting with default value
    journalFolder: 'Journal',
    journalSubDirectory: 'YYYY/YYYY-MM',
    journalNameFormat: 'YYYY-MM-DD_ddd',
    asleepEntryTemplate: '(time:: <mtime>) (type:: 💤) Asleep',
    awakeEntryTemplate: '(time:: <mtime>) (type::⏰) Awake ((duration:: <duration>) hours of sleep)',
    stringPrefixLetter: 's',
    decoratedTaskSymbol: '',
    taskSvgIcon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiPjxwYXRoIGZpbGw9ImN1cnJlbnRDb2xvciIgZD0iTTEyLjUgM2MtNS4yNSAwLTkuNSA0LjI1LTkuNSA5LjVzNC4yNSA5LjUgOS41IDkuNWM1LjI1IDAgOS41LTQuMjUgOS41LTkuNVMxNy43NSAzIDEyLjUgM20wIDJjNC4xNSAwIDcuNSAzLjM1IDcuNSA3LjVzLTMuMzUgNy41LTcuNSA3LjVTNSAxNy4xNSA1IDEyLjVTOC4zNSA1IDEyLjUgNW0tMiA4djZoNXYtMmgtM3YtNHoiLz48L3N2Zz4=',

    // Sleep Note settings
    enableSleepNote: false,
    sleepNotePath: 'Sleep/sleep-tracking.md',
    asleepNoteTemplate: '| <date> | <time> (<mtime>) | 💤 Asleep | |',
    awakeNoteTemplate: '| <date> | <time> (<mtime>) | ⏰ Awake | <duration> |',
    sleepNotesFolder: 'Stacks/Sleep',
    enableSleepEventNotes: false,
    sleepEventNotesSubDirectory: '',  // New setting with default value

    enableMeasurementFiles: true,
    measurementFolder: 'Sleep',
    measurementEntryTemplate: '| <date> | <user> | <measure> <unit> |',
    measurementFileNameFormat: '<measure>',

    users: [],
    measurementSystem: 'metric',
    measurements: [
        {
            name: 'Total Sleep',
            value: '',
            type: 'duration',
            unit: 'hours'
        },
        {
            name: 'Deep Sleep',
            value: '',
            type: 'duration',
            unit: 'hours'
        },
        {
            name: 'Sleep Quality',
            value: '',
            type: 'quality',
            unit: 'percent'
        }
    ],

    // Sleep tracking settings
    trackTotalSleep: true,
    trackSleepQuality: true,
    trackSleepStages: true,

    // Sync settings
    lastSyncJournalEnabled: false,
    lastSyncSleepNoteEnabled: false,
    lastSyncStartDate: undefined,
    lastSyncEndDate: undefined,

    // Calendar integration settings
    calendarUrl: 'https://calendar.google.com/calendar/ical/47871a9405310639ad56ab2c42c8230227232bda03838db99458b32ae2cdbdaa%40group.calendar.google.com/private-fd2c6c754cdfa28b0197606c03bf7abe/basic.ics',
    useCalendarForSleepNotes: true,

    // Google Fit defaults
    enableGoogleFit: false,
    googleClientId: '',
    googleClientSecret: '',
    googleAutoSyncInterval: 60
};