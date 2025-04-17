export const DEFAULT_SETTINGS = {
    measurementUnits: 'hours',
    trackTotalSleep: true,
    trackDeepSleep: true,
    trackSleepQuality: true
};

export const MEASUREMENT_UNITS = ['hours', 'minutes'];

export const MEASUREMENT_TYPES = [
    'Total Sleep',
    'Deep Sleep',
    'Light Sleep',
    'REM Sleep',
    'Sleep Quality',
    'Time to Sleep',
    'Wake Time'
];

export const SVG_ICON = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'currentColor\'%3E%3Cpath d=\'M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20ZM13 12H17V14H11V7H13V12Z\'%3E%3C/path%3E%3C/svg%3E';