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

export interface Settings {
    // Journal settings
    enableJournalEntry: boolean;
    journalFolder: string;
    journalSubDirectory: string;
    journalNameFormat: string;
    asleepEntryTemplate: string;
    awakeEntryTemplate: string;
    stringPrefixLetter: string;
    decoratedTaskSymbol: string;
    taskSvgIcon: string;
    dailyNoteTemplate?: string;

    // Sleep Note settings
    enableSleepNote: boolean;
    sleepNotePath: string;
    asleepNoteTemplate: string;
    awakeNoteTemplate: string;

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

    // Google Fit defaults
    enableGoogleFit: false,
    googleClientId: '',
    googleClientSecret: '',
    googleAutoSyncInterval: 60
};