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
        await this.loadSettings();
        this.measurementService = new MeasurementService(this.app, this.settings);
        this.journalService = new JournalService(this.app, this.settings);

        // Initialize style manager and apply styles
        this.styleManager = new StyleManager();
        this.styleManager.updateStyles(this.settings);

        // Initialize Google Fit service if enabled
        this.setupGoogleFitService();

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
        // Clean up style manager
        this.styleManager.removeStyles();

        // Clear any sync intervals
        if (this.googleFitSyncInterval) {
            window.clearInterval(this.googleFitSyncInterval);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Update services with new settings
        this.journalService = new JournalService(this.app, this.settings);
        // Update any open settings tabs
        const settingTab = (this.app as any).setting?.activeTab;
        if (settingTab?.id === 'jots-sleep-tracker') {
            settingTab.display();
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

            console.log('Initializing Google Fit service with:', {
                hasClientId: !!this.settings.googleClientId,
                hasClientSecret: !!this.settings.googleClientSecret
            });

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
                startTime = moment(startDate).startOf('day').valueOf() / 1000;
                endTime = moment(endDate).endOf('day').valueOf() / 1000;

                console.log('Using date range:', {
                    startDate,
                    endDate,
                    startTimeFormatted: moment(startTime * 1000).format('YYYY-MM-DD HH:mm:ss'),
                    endTimeFormatted: moment(endTime * 1000).format('YYYY-MM-DD HH:mm:ss')
                });
            } else {
                // Default to last 7 days
                const now = moment();
                endTime = now.endOf('day').valueOf() / 1000;
                startTime = now.subtract(7, 'days').startOf('day').valueOf() / 1000;

                console.log('Using default 7-day range:', {
                    startTimeFormatted: moment(startTime * 1000).format('YYYY-MM-DD HH:mm:ss'),
                    endTimeFormatted: moment(endTime * 1000).format('YYYY-MM-DD HH:mm:ss')
                });
            }

            // Calculate total days for progress tracking
            const totalDays = Math.ceil((endTime - startTime) / (24 * 60 * 60));
            const processedDays = new Set<string>();

            const sleepMeasurements = await this.googleFitService.getSleepMeasurements(startTime, endTime);

            for (const measurement of sleepMeasurements) {
                // Handle sleep (start) time
                const sleepTimeStr = moment(measurement.startTime * 1000).format('HH:mm');
                const sleepDateStr = moment(measurement.startTime * 1000).format('YYYY-MM-DD');

                const sleepRecord: MeasurementRecord = {
                    date: `${sleepDateStr} ${sleepTimeStr}`,
                    userId: this.settings.defaultUser || this.settings.users[0]?.id || '',
                    asleepTime: sleepTimeStr
                };

                // Track processed day and update progress
                processedDays.add(sleepDateStr);
                if (progressCallback) {
                    progressCallback(processedDays.size, totalDays);
                }

                // Add sleep record to appropriate locations
                await this.saveMeasurement(sleepRecord);

                // Handle wake (end) time
                const wakeTimeStr = moment(measurement.endTime * 1000).format('HH:mm');
                const wakeDateStr = moment(measurement.endTime * 1000).format('YYYY-MM-DD');

                const wakeRecord: MeasurementRecord = {
                    date: `${wakeDateStr} ${wakeTimeStr}`,
                    userId: this.settings.defaultUser || this.settings.users[0]?.id || '',
                    awakeTime: wakeTimeStr,
                    sleepDuration: measurement.sleepDuration?.toFixed(1)
                };

                // Track processed day and update progress
                processedDays.add(wakeDateStr);
                if (progressCallback) {
                    progressCallback(processedDays.size, totalDays);
                }

                // Add wake record to appropriate locations
                await this.saveMeasurement(wakeRecord);
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