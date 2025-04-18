import { Plugin, addIcon, Modal, Notice } from 'obsidian';
import { MeasurementModal } from './modal';
import { SleepTrackerSettingsTab } from './settings';
import { MeasurementService } from './services/measurement-service';
import { JournalService } from './services/journal-service';
import { GoogleFitService } from './services/googlefit';
import { StyleManager } from './services/style-manager';
import { MeasurementType, Settings, DEFAULT_SETTINGS, MeasurementRecord } from './types';

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
                    // Token refresh failed, but we'll keep the refresh token
                    // User can try manual reconnect if needed
                    this.settings.googleAccessToken = '';
                    this.settings.googleTokenExpiry = undefined;
                    await this.saveSettings();
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

        // Add Google Fit commands
        this.addCommands();
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
                () => this.syncGoogleFit(),
                this.settings.googleAutoSyncInterval * 60 * 1000 // Convert minutes to milliseconds
            );
        }
    }

    async syncGoogleFit(startDate?: string, endDate?: string, progressCallback?: (current: number, total: number) => void, tempSettings?: { enableJournalEntry?: boolean, enableSleepNote?: boolean }) {
        if (!this.googleFitService || !this.settings.googleAccessToken) {
            return;
        }

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

            const sleepMeasurements = await this.googleFitService.getSleepMeasurements(startTime, endTime);

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

                // Add wake events that occur within our target range
                if (moment(wakeDateStr).isBetween(moment(startDate), moment(endDate), 'day', '[]')) {
                    const wakeTimeStr = wakeMoment.format('HH:mm');
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

                // Add sleep events that occur within our target range
                if (moment(sleepDateStr).isBetween(moment(startDate), moment(endDate), 'day', '[]')) {
                    const sleepTimeStr = sleepMoment.format('HH:mm');
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
            console.error('Failed to sync with Google Fit:', error);
            if (error instanceof Error && error.message !== 'Sync cancelled') {
                new Notice('Failed to sync with Google Fit. Check the console for details.');
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
            id: 'sync-google-fit',
            name: 'Add Sleep Records via Google Fit',
            checkCallback: (checking: boolean): boolean => {
                const canRun: boolean = !!(
                    this.settings.enableGoogleFit
                    && this.settings.googleAccessToken
                    && this.googleFitService
                );

                if (checking) return canRun;

                if (canRun) {
                    this.syncGoogleFit();
                }

                return canRun;
            }
        });
    }
}