import { Plugin, addIcon, Modal, Notice } from 'obsidian';
import { MeasurementModal } from './modal';
import { SleepTrackerSettingsTab } from './settings';
import { MeasurementService } from './services/measurement-service';
import { JournalService } from './services/journal-service';
import { GoogleFitService } from './services/googlefit';
import { CalendarService } from './services/calendar-service';
import { StyleManager } from './services/style-manager';
import { MeasurementType, Settings, DEFAULT_SETTINGS, MeasurementRecord, SleepData } from './types';
import { Chart, ChartConfiguration } from 'chart.js/auto';
import { coordsToLocationInfo } from './utils';

export default class SleepTrackerPlugin extends Plugin {
    settings!: Settings;
    measurementService!: MeasurementService;
    googleFitService?: GoogleFitService;
    googleFitSyncInterval?: number;
    styleManager!: StyleManager;
    journalService!: JournalService;

    async onload() {
        console.log('Sleep Tracker: Loading Plugin...');

        // Load settings first
        await this.loadSettings();

        // Initialize services
        this.measurementService = new MeasurementService(this.app, this.settings);
        this.journalService = new JournalService(this.app, this.settings);
        this.styleManager = new StyleManager();
        // Set initial icon from settings
        this.styleManager.setCustomIcon(this.settings.taskSvgIcon);
        this.styleManager.updateStyles(this.settings);

        // Setup Google Fit if enabled
        if (this.settings.enableGoogleFit) {
            await this.setupGoogleFitService();
            // If we have valid tokens, attempt refresh and set up sync
            if (this.settings.googleRefreshToken) {
                try {
                    await this.googleFitService?.refreshTokenIfNeeded();
                    this.setupGoogleFitSync();
                } catch (error) {
                    console.error('Failed to refresh Google Fit token on load:', error);
                    // Clear all tokens and reset Google Fit state
                    this.settings.googleAccessToken = '';
                    this.settings.googleRefreshToken = '';
                    this.settings.googleTokenExpiry = undefined;
                    await this.saveSettings();

                    // Reset Google Fit service
                    this.googleFitService = undefined;
                    if (this.googleFitSyncInterval) {
                        window.clearInterval(this.googleFitSyncInterval);
                        this.googleFitSyncInterval = undefined;
                    }

                    // Show user-friendly notice
                    new Notice('Google Fit connection has expired. Please reconnect your account in Sleep Tracker settings.');
                }
            }
        }

        // Add the settings tab
        this.addSettingTab(new SleepTrackerSettingsTab(this.app, this));

        // Add command for manual sleep entry
        this.addCommand({
            id: 'add-sleep',
            name: 'Add Sleep Record Manually',
            callback: () => {
                new MeasurementModal(this.app, this).open();
            }
        });

        // Add command for generating sleep note
        this.addCommand({
            id: 'generate-sleep-note',
            name: 'Generate Sleep Event Note',
            callback: async () => {
                await this.generateSleepNote();
            }
        });

        // Add Google Fit commands
        this.addCommands();

        // Register markdown processor for sleep charts
        this.registerMarkdownPostProcessor((element, context) => {
            const charts = element.querySelectorAll('canvas[id="sleepChart"]');
            charts.forEach((canvas, index) => {
                // Skip if chart is already initialized
                if ((canvas as any).__chartInitialized) return;

                // Get the script element that follows the canvas
                const script = canvas.parentElement?.querySelector('script');
                if (!script) return;

                try {
                    // Create a temporary function to capture the local Chart variable
                    const initChart = new Function('Chart', 'canvas', script.textContent || '');
                    initChart(Chart, canvas);

                    // Mark as initialized to prevent duplicate charts
                    (canvas as any).__chartInitialized = true;
                } catch (error) {
                    console.error('Failed to initialize sleep chart:', error);
                }
            });
        });

        // Register processor for sleep chart codeblocks
        this.registerMarkdownCodeBlockProcessor("jots-sleep-tracker", (source, el, ctx) => {
            const lines = source.split('\n');
            let startTime = '';
            let endTime = '';
            let data = '';

            // Parse the block content
            lines.forEach(line => {
                const [key, value] = line.split('=').map(s => s.trim());
                switch (key) {
                    case 'startTime':
                        startTime = value;
                        break;
                    case 'endTime':
                        endTime = value;
                        break;
                    case 'data':
                        data = value;
                        break;
                }
            });

            if (!startTime || !endTime || !data) {
                el.createEl('p', { text: 'Error: Missing required fields in sleep chart block' });
                return;
            }

            // Create container and canvas
            const container = el.createDiv({
                cls: 'jots-sleep-tracker-chart',
                attr: { style: 'position: relative; height: 400px; width: 100%; margin: 20px 0;' }
            });
            const canvas = container.createEl('canvas');
            const canvasCtx = canvas.getContext('2d');
            if (!canvasCtx) {
                console.error('Failed to get canvas context');
                return;
            }

            // Calculate time labels
            const moment = (window as any).moment;
            const startMoment = moment(startTime, 'HH:mm');
            const endMoment = moment(endTime, 'HH:mm');
            if (endMoment.isBefore(startMoment)) {
                endMoment.add(1, 'day');
            }
            const duration = moment.duration(endMoment.diff(startMoment));
            const minutesPerPoint = duration.asMinutes() / data.length;

            const labels = Array.from({ length: data.length }, (_, i) => {
                return moment(startMoment).add(i * minutesPerPoint, 'minutes').format('HH:mm');
            });

            // Convert sleep depth data
            const chartData = data.split('').map(char => {
                switch (char) {
                    case '▁': return 1;
                    case '▂': return 2;
                    case '▃': return 3;
                    case '▄': return 4;
                    case '▅': return 5;
                    case '▆': return 6;
                    case '▇': return 7;
                    case '█': return 8;
                    default: return 0;
                }
            });

            // Create the chart
            new Chart(canvas, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Sleep Depth',
                        data: chartData,
                        fill: true,
                        borderColor: 'rgb(127, 82, 255)',
                        backgroundColor: 'rgba(127, 82, 255, 0.2)',
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 8,
                            title: {
                                display: true,
                                text: 'Sleep Depth'
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: 'Sleep Pattern'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        }
                    }
                }
            });
        });
    }

    onunload() {
        console.log('Sleep Tracker: Unloading Plugin...');
        // Clean up style manager
        this.styleManager.removeStyles();

        // Clear any sync intervals
        if (this.googleFitSyncInterval) {
            window.clearInterval(this.googleFitSyncInterval);
        }

        // Close OAuth server if it exists
        if (this.googleFitService?.oauthServer) {
            this.googleFitService.oauthServer.close();
        }
    }

    async loadSettings() {
        const data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

        // Clean up potentially invalid token state
        if (!this.settings.googleRefreshToken) {
            this.settings.googleAccessToken = '';
            this.settings.googleTokenExpiry = undefined;
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Update style manager with new icon and styles
        this.styleManager.setCustomIcon(this.settings.taskSvgIcon);
        this.styleManager.updateStyles(this.settings);
        // Update services with new settings
        this.journalService = new JournalService(this.app, this.settings);

        // Update Google Fit service if needed
        if (this.settings.enableGoogleFit && this.settings.googleClientId && this.settings.googleClientSecret) {
            this.setupGoogleFitService();
            if (this.settings.googleAccessToken && this.settings.googleRefreshToken) {
                this.setupGoogleFitSync();
            }
        }
    }

    getUnitForMeasurement(type: MeasurementType): { metric: string, imperial: string } {
        return type === 'duration'
            ? { metric: 'hours', imperial: 'hours' }
            : { metric: 'percent', imperial: 'percent' };
    }

    setupGoogleFitService() {
        if (this.settings.enableGoogleFit) {
            if (!this.settings.googleClientId || !this.settings.googleClientSecret) {
                console.error('Google Fit service not initialized: Missing client credentials');
                new Notice('Please enter your Google Fit API credentials in the settings');
                return;
            }

            this.googleFitService = new GoogleFitService(this.settings, {
                clientId: this.settings.googleClientId,
                clientSecret: this.settings.googleClientSecret,
                redirectUri: 'http://localhost:16321/callback',
                scope: [
                    'https://www.googleapis.com/auth/fitness.sleep.read',
                    'https://www.googleapis.com/auth/fitness.sleep.write'
                ],
                onSettingsChange: async (settings) => {
                    // Update our settings
                    this.settings = settings;
                    // Save the settings to disk
                    await this.saveData(this.settings);
                    // Force refresh the UI
                    const settingTab = (this.app as any).setting?.activeTab;
                    if (settingTab?.id === 'jots-sleep-tracker') {
                        settingTab.display();
                    }
                },
                app: this.app
            });
            this.setupGoogleFitSync();
        } else {
            this.googleFitService = undefined;
            if (this.googleFitSyncInterval) {
                window.clearInterval(this.googleFitSyncInterval);
                this.googleFitSyncInterval = undefined;
            }
        }
    }

    setupGoogleFitSync() {
        // Clear existing interval if any
        if (this.googleFitSyncInterval) {
            window.clearInterval(this.googleFitSyncInterval);
            this.googleFitSyncInterval = undefined;
        }

        // Set up new sync interval if enabled
        if (this.settings.enableGoogleFit && this.settings.googleAutoSyncInterval > 0) {
            this.googleFitSyncInterval = window.setInterval(
                () => this.syncSleepData(),
                this.settings.googleAutoSyncInterval * 60 * 1000 // Convert minutes to milliseconds
            );
        }
    }

    async syncSleepData(startDate?: string, endDate?: string, progressCallback?: (current: number, total: number) => void, tempSettings?: { enableJournalEntry?: boolean, enableSleepNote?: boolean }) {
        // Store original settings
        const originalJournalSetting = this.settings.enableJournalEntry;
        const originalSleepNoteSetting = this.settings.enableSleepNote;

        // Apply temporary settings if provided
        if (tempSettings !== undefined) {
            this.settings.enableJournalEntry = tempSettings.enableJournalEntry ?? this.settings.enableJournalEntry;
            this.settings.enableSleepNote = tempSettings.enableSleepNote ?? this.settings.enableSleepNote;
        }

        try {
            let startTime: number;
            let endTime: number;
            const moment = (window as any).moment;

            if (startDate && endDate) {
                // Parse dates in local timezone and set to start/end of day
                // Query one day before and after to catch sleep sessions that cross midnight
                startTime = moment(startDate).subtract(1, 'day').startOf('day').valueOf() / 1000;
                endTime = moment(endDate).add(1, 'day').endOf('day').valueOf() / 1000;

                new Notice(`Syncing sleep data from ${startDate} to ${endDate}`);
            } else {
                // Default to last 7 days, plus padding days
                const now = moment();
                endTime = now.add(1, 'day').endOf('day').valueOf() / 1000;
                startTime = now.subtract(8, 'days').startOf('day').valueOf() / 1000;

                new Notice('Syncing sleep data from the last 7 days');
            }

            // Calculate total days for progress tracking (not including padding days)
            const totalDays = Math.ceil((
                moment(endDate || moment()).endOf('day').valueOf() -
                moment(startDate || moment().subtract(7, 'days')).startOf('day').valueOf()
            ) / (24 * 60 * 60 * 1000));
            const processedDays = new Set<string>();

            let sleepMeasurements: SleepData[] = [];

            // Try to get data from calendar first if configured
            if (this.settings.useCalendarForSleepNotes && this.settings.calendarUrl) {
                const calendarService = new CalendarService(this.settings.calendarUrl);
                try {
                    sleepMeasurements = await calendarService.getSleepDataForDateRange(startTime, endTime);
                } catch (error) {
                    console.error('Failed to get calendar sleep data:', error);
                    new Notice('Failed to get calendar sleep data, falling back to Google Fit');
                }
            }

            // Fall back to Google Fit if calendar failed or wasn't configured
            if (sleepMeasurements.length === 0 && this.googleFitService && this.settings.googleAccessToken) {
                sleepMeasurements = await this.googleFitService.getSleepMeasurements(startTime, endTime);
            }

            if (sleepMeasurements.length === 0) {
                throw new Error('No sleep data found from any source');
            }

            // Create arrays to hold sleep and wake events
            type SleepEvent = {
                type: 'sleep' | 'wake';
                date: string;
                time: string;
                record: MeasurementRecord;
            };
            const events: SleepEvent[] = [];

            for (const measurement of sleepMeasurements) {
                const sleepMoment = moment(measurement.startTime * 1000);
                const wakeMoment = moment(measurement.endTime * 1000);
                const sleepDateStr = sleepMoment.format('YYYY-MM-DD');
                const wakeDateStr = wakeMoment.format('YYYY-MM-DD');
                const sleepTimeStr = sleepMoment.format('HH:mm');
                const wakeTimeStr = wakeMoment.format('HH:mm');

                // Add sleep events using sleep date as reference
                if (!startDate || !endDate || moment(sleepDateStr).isBetween(moment(startDate), moment(endDate), 'day', '[]')) {
                    events.push({
                        type: 'sleep',
                        date: sleepDateStr,
                        time: sleepTimeStr,
                        record: {
                            date: `${sleepDateStr} ${sleepTimeStr}`,
                            userId: this.settings.defaultUser || this.settings.users[0]?.id || '',
                            asleepTime: sleepTimeStr
                        }
                    });
                }

                // Add wake events using wake date as reference
                if (!startDate || !endDate || moment(wakeDateStr).isBetween(moment(startDate), moment(endDate), 'day', '[]')) {
                    events.push({
                        type: 'wake',
                        date: wakeDateStr,
                        time: wakeTimeStr,
                        record: {
                            date: `${wakeDateStr} ${wakeTimeStr}`,
                            userId: this.settings.defaultUser || this.settings.users[0]?.id || '',
                            awakeTime: wakeTimeStr,
                            sleepDuration: measurement.sleepDuration?.toFixed(1)
                        }
                    });
                }
            }

            // Sort events by date and time, putting sleep events before wake events on the same datetime
            events.sort((a, b) => {
                const dateCompare = a.date.localeCompare(b.date);
                if (dateCompare !== 0) return dateCompare;

                const timeCompare = a.time.localeCompare(b.time);
                if (timeCompare !== 0) return timeCompare;

                // If date and time are equal, put sleep events first
                return a.type === 'sleep' ? -1 : 1;
            });

            // Process events in order
            for (const event of events) {
                processedDays.add(event.date);
                if (progressCallback) {
                    progressCallback(processedDays.size, totalDays);
                }

                await this.saveMeasurement(event.record);
            }

            const dateRangeStr = startDate && endDate
                ? `from ${startDate} to ${endDate}`
                : 'from the last 7 days';
            new Notice(`Successfully synced sleep data ${dateRangeStr}`);
        } catch (error) {
            console.error('Failed to sync sleep data:', error);
            if (error instanceof Error && error.message !== 'Sync cancelled') {
                new Notice('Failed to sync sleep data. Check the console for details.');
            }
            throw error;
        } finally {
            // Restore original settings
            this.settings.enableJournalEntry = originalJournalSetting;
            this.settings.enableSleepNote = originalSleepNoteSetting;
        }
    }

    async saveMeasurement(data: MeasurementRecord) {
        // Add to measurement files
        if (this.settings.enableMeasurementFiles) {
            await this.measurementService.updateMeasurementFiles(data);
        }

        // Add to journal entry
        if (this.settings.enableJournalEntry) {
            await this.journalService.appendToJournal(data);
        }

        // Add to sleep note
        if (this.settings.enableSleepNote) {
            await this.journalService.appendToSleepNote(data);
        }
    }

    async generateSleepNote() {
        try {
            let sleepData: SleepData | null = null;
            const moment = (window as any).moment;

            // Try calendar first if configured
            if (this.settings.useCalendarForSleepNotes && this.settings.calendarUrl) {
                const calendarService = new CalendarService(this.settings.calendarUrl);
                try {
                    sleepData = await calendarService.getLatestSleepData();
                } catch (error) {
                    console.error('Failed to get calendar sleep data:', error);
                    new Notice('Failed to get calendar sleep data, falling back to Google Fit');
                }
            }

            // Fall back to Google Fit if calendar failed or wasn't configured
            if (!sleepData && this.googleFitService && this.settings.googleAccessToken) {
                const now = moment();
                const startTime = now.subtract(1, 'day').startOf('day').valueOf() / 1000;
                const endTime = now.endOf('day').valueOf() / 1000;

                const sleepMeasurements = await this.googleFitService.getSleepMeasurements(startTime, endTime);
                if (!sleepMeasurements || sleepMeasurements.length === 0) {
                    throw new Error('No sleep data found for the last 24 hours');
                }
                sleepData = sleepMeasurements[sleepMeasurements.length - 1];
            }

            if (!sleepData) {
                throw new Error('No sleep data found from any source');
            }

            const sleepMoment = moment(sleepData.startTime * 1000);
            const wakeMoment = moment(sleepData.endTime * 1000);
            const date = sleepMoment.format('YYYY-MM-DD');

            // Use the configured subdirectory format if available, otherwise default to year/month
            let subDir = '';
            if (this.settings.sleepEventNotesSubDirectory) {
                const placeholders = {
                    YYYY: sleepMoment.format('YYYY'),
                    MM: sleepMoment.format('MM'),
                    DD: sleepMoment.format('DD'),
                    ddd: sleepMoment.format('ddd'),
                    dddd: sleepMoment.format('dddd'),
                };

                // Start with the subdirectory format
                subDir = this.settings.sleepEventNotesSubDirectory;

                // Replace all occurrences of placeholders, not just the first one
                Object.entries(placeholders).forEach(([key, value]) => {
                    subDir = subDir.replace(new RegExp(key, 'g'), value);
                });
            } else {
                // Default format if none specified
                const year = sleepMoment.format('YYYY');
                const yearMonth = sleepMoment.format('YYYY-MM');
                subDir = `${year}/${yearMonth}`;
            }

            const notePath = `${this.settings.sleepNotesFolder}/${subDir}/${date}_Sleep.md`;

            // Ensure the folder structure exists
            await this.createFolderStructure(`${this.settings.sleepNotesFolder}/${subDir}`);

            // Format duration for YAML and note body
            const durationHours = Math.floor(sleepData.sleepDuration);
            const durationMinutes = Math.round((sleepData.sleepDuration - durationHours) * 60);
            const durationFormatted = `${durationHours}h ${durationMinutes}m`;
            const durationYAML = `${durationHours}:${durationMinutes.toString().padStart(2, '0')}`;

            // Calculate sleep stage totals
            const totalSleepMinutes = (sleepData.deepSleepMinutes || 0) + (sleepData.lightSleepMinutes || 0) + (sleepData.remMinutes || 0);
            const hasDetailedSleepStages = totalSleepMinutes > 0;

            // Build sleep quality sections conditionally
            const sleepQualityEntries = [
                sleepData.efficiency !== undefined ? `📊 Sleep Efficiency: ${(sleepData.efficiency * 100).toFixed(1)}%` : '',
                sleepData.cycles ? `📶 Sleep Cycles: ${sleepData.cycles}` : '',
                sleepData.noisePercent !== undefined ? `🔊 Noise Level: ${sleepData.noisePercent.toFixed(1)}%` : '',
                sleepData.snoringDuration ? `😴 Snoring: ${sleepData.snoringDuration}` : ''
            ].filter(entry => entry !== '').join('\n');

            // Build sleep stages section conditionally
            const sleepStagesEntries = hasDetailedSleepStages ? [
                sleepData.deepSleepMinutes ? `🌑 Deep Sleep:  ${sleepData.deepSleepPercent?.toFixed(1)}% (${sleepData.deepSleepMinutes}m)` : '',
                sleepData.lightSleepMinutes ? `🌓 Light Sleep: ${(100 - (sleepData.deepSleepPercent || 0)).toFixed(1)}% (${sleepData.lightSleepMinutes}m)` : '',
                sleepData.remMinutes ? `🌙 REM Sleep:   ${((sleepData.remMinutes / totalSleepMinutes) * 100).toFixed(1)}% (${sleepData.remMinutes}m)` : ''
            ].filter(entry => entry !== '').join('\n') : 'No detailed sleep stage data available.';

            // Create the note content
            const noteContent = `---
type: sleep
date: ${date}
filename: ${date}_Sleep
sleepStartTime: ${sleepMoment.format('HH:mm')}
sleepEndTime: ${wakeMoment.format('HH:mm')}
sleepDuration: ${durationYAML}
sleepLocation: ${sleepData.location || ''}
sleepCity: ${sleepData.city || ''}
sleepDeepPercent: ${sleepData.deepSleepPercent !== undefined ? sleepData.deepSleepPercent.toFixed(1) : 'N/A'}
sleepCycles: ${sleepData.cycles || 'N/A'}
sleepEfficiency: ${sleepData.efficiency !== undefined ? (sleepData.efficiency * 100).toFixed(1) : 'N/A'}
sleepNoiseLevel: ${sleepData.noisePercent !== undefined ? sleepData.noisePercent.toFixed(1) : 'N/A'}${sleepData.graph ? `
sleepGraph: ${sleepData.graph}` : ''}
created: ${moment().format('YYYY-MM-DDTHH:mm:ssZ')}
---
# ${date}: Sleep Data from ${sleepData.city}

## Sleep Times
💤 Went to bed at ${sleepMoment.format('HH:mm')} on ${sleepMoment.format('dddd, MMMM D')}
⏰ Woke up at ${wakeMoment.format('HH:mm')} on ${wakeMoment.format('dddd, MMMM D')}
⏱️ Total time in bed: ${durationFormatted}

## Sleep Analysis${hasDetailedSleepStages ? `

### Sleep Stages:
${sleepStagesEntries}` : '\nNo detailed sleep stage data available.'}

### Sleep Quality:
${sleepQualityEntries}

${sleepData.graph ? `## Sleep Pattern

\`\`\`jots-sleep-tracker
startTime = ${sleepMoment.format('HH:mm')}
endTime = ${wakeMoment.format('HH:mm')}
data = ${sleepData.graph}
\`\`\`` : ''}${sleepData.comment ? `\n\n` : ''}`;

            const file = await this.app.vault.create(notePath, noteContent);
            new Notice(`Created sleep note: ${notePath}`);
        } catch (error) {
            console.error('Failed to generate sleep note:', error);
            new Notice('Failed to generate sleep note. Check the console for details.');
        }
    }

    private async createFolderStructure(folderPath: string) {
        const parts = folderPath.split('/');
        let currentPath = '';
        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            const folder = this.app.vault.getAbstractFileByPath(currentPath);
            if (!folder) {
                await this.app.vault.createFolder(currentPath);
            }
        }
    }

    private addCommands() {
        this.addCommand({
            id: 'connect-google-fit',
            name: 'Connect Google Fit Account',
            checkCallback: (checking: boolean): boolean => {
                const canRun: boolean = !!(
                    this.settings.enableGoogleFit
                    && this.settings.googleClientId
                    && this.settings.googleClientSecret
                    && !this.settings.googleAccessToken
                );

                if (checking) return canRun;

                if (canRun) {
                    this.googleFitService?.authenticate();
                }

                return canRun;
            }
        });

        this.addCommand({
            id: 'sync-sleep-data',
            name: 'Add Sleep Records Automatically',
            checkCallback: (checking: boolean): boolean => {
                const canRun: boolean = !!(
                    (this.settings.useCalendarForSleepNotes && this.settings.calendarUrl) ||
                    (this.settings.enableGoogleFit && this.settings.googleAccessToken)
                );

                if (checking) return canRun;

                if (canRun) {
                    this.syncSleepData();
                }

                return canRun;
            }
        });
    }
}