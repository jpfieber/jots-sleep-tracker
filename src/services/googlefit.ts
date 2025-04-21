import { request, Notice, App } from 'obsidian';
import type { Settings } from '../types';
import { OAuthCallbackServer } from './oauth-server';

interface GoogleFitAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scope: string[];
}

interface GoogleFitSleepSession {
    activityType: number;
    startTimeMillis: number;
    endTimeMillis: number;
    name: string;
    description: string;
    application: { packageName: string };
    sleepQuality?: number;
    sleepSegments?: Array<{
        sleepStage: string;
        startTimeMillis: number;
        endTimeMillis: number;
    }>;
}

interface GoogleFitSleepMeasurement {
    startTime: number;  // Unix timestamp in seconds
    endTime: number;    // Unix timestamp in seconds
    sleepDuration?: number;
    deepSleep?: number;
    lightSleep?: number;
    remSleep?: number;
    sleepQuality?: number;
}

interface GoogleFitServiceConfig extends GoogleFitAuthConfig {
    onSettingsChange: (settings: Settings) => Promise<void>;
    app: any; // Obsidian App instance
}

const SCOPES = [
    'https://www.googleapis.com/auth/fitness.sleep.read',
    'https://www.googleapis.com/auth/fitness.sleep.write'
];

export class GoogleFitService {
    private settings: Settings;
    private clientId: string;
    private clientSecret: string;
    private redirectUri: string;
    private scope: string[];
    private onSettingsChange: (settings: Settings) => Promise<void>;
    private app: App;
    private lastRequestTime = 0;
    private readonly minRequestInterval = 1000; // 1 second between requests
    readonly oauthServer: OAuthCallbackServer;
    private moment = (window as any).moment;

    constructor(settings: Settings, config: {
        clientId: string;
        clientSecret: string;
        redirectUri: string;
        scope: string[];
        onSettingsChange: (settings: Settings) => Promise<void>;
        app: App;
    }) {
        this.settings = settings;
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret;
        this.redirectUri = config.redirectUri;
        this.scope = config.scope;
        this.onSettingsChange = config.onSettingsChange;
        this.app = config.app;
        this.oauthServer = new OAuthCallbackServer(config.app);
        if (!this.moment) {
            throw new Error('Moment.js is required');
        }
    }

    private async rateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
            await new Promise(resolve =>
                setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest)
            );
        }
        this.lastRequestTime = Date.now();
    }

    async authenticate(): Promise<boolean> {
        const state = Math.random().toString(36).substring(7);
        this.settings.googleAuthState = state;
        await this.onSettingsChange(this.settings);

        const params = new URLSearchParams({
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            response_type: 'code',
            scope: SCOPES.join(' '),
            access_type: 'offline',
            state: state
        });

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

        // Start the OAuth server before opening the URL
        await this.oauthServer.start();

        // Open the auth URL and wait for callback
        window.open(authUrl);

        try {
            // Wait for the callback to be processed
            const { code, state: returnedState } = await this.oauthServer.waitForCallback();

            if (!code || !returnedState) {
                throw new Error('Authentication failed - no code or state received');
            }

            // Complete authentication with received code
            return await this.completeAuthentication(code, returnedState);
        } catch (error) {
            console.error('Authentication failed:', error);
            new Notice('Authentication failed. Please try again.');
            return false;
        } finally {
            await this.oauthServer.close();
        }
    }

    async completeAuthentication(code: string, state: string): Promise<boolean> {
        if (state !== this.settings.googleAuthState) {
            throw new Error('Invalid authentication state');
        }

        try {
            const response = await request({
                url: 'https://oauth2.googleapis.com/token',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    code: code,
                    grant_type: 'authorization_code',
                    redirect_uri: this.redirectUri
                }).toString()
            });

            const tokens = JSON.parse(response);
            this.settings.googleAccessToken = tokens.access_token;
            this.settings.googleRefreshToken = tokens.refresh_token;
            this.settings.googleTokenExpiry = Date.now() + (tokens.expires_in * 1000);

            // Save settings and immediately force refresh any open settings tabs
            await this.onSettingsChange(this.settings);

            // Force an immediate refresh of any open settings tabs
            const settingTab = (this.app as any).setting?.activeTab;
            if (settingTab?.id === 'jots-sleep-tracker') {
                setTimeout(() => settingTab.display(), 0);
            }

            new Notice('Successfully connected to Google Fit');
            return true;
        } catch (error) {
            console.error('Google Fit token request error:', error);
            throw error;
        }
    }

    private async refreshAccessToken(): Promise<void> {
        if (!this.settings.googleRefreshToken) {
            throw new Error('No refresh token available');
        }

        try {
            const response = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    refresh_token: this.settings.googleRefreshToken,
                    grant_type: 'refresh_token',
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('Failed to refresh token:', errorData);

                // Only clear tokens if we get specific error codes indicating the refresh token is invalid
                if (response.status === 400 || response.status === 401) {
                    this.settings.googleAccessToken = '';
                    this.settings.googleRefreshToken = '';
                    this.settings.googleTokenExpiry = undefined;
                    await this.onSettingsChange(this.settings);
                    throw new Error('Failed to refresh token - please reconnect your account');
                }

                throw new Error('Failed to refresh token - please try again later');
            }

            const data = await response.json();
            if (!data.access_token) {
                throw new Error('Invalid response from token endpoint');
            }

            this.settings.googleAccessToken = data.access_token;
            this.settings.googleTokenExpiry = Date.now() + (data.expires_in * 1000);
            // If we get a new refresh token, update it
            if (data.refresh_token) {
                this.settings.googleRefreshToken = data.refresh_token;
            }
            await this.onSettingsChange(this.settings);
        } catch (error) {
            console.error('Failed to refresh access token:', error);
            // Don't clear tokens for network errors or other temporary issues
            if (error instanceof Error && error.message.includes('please reconnect')) {
                throw error;
            }
            throw new Error('Failed to refresh token - please try again later');
        }
    }

    private async ensureValidToken(): Promise<void> {
        // If we have an expiry time and the token is expired or about to expire (within 5 minutes)
        if (this.settings.googleTokenExpiry && Date.now() + 300000 > this.settings.googleTokenExpiry) {
            await this.refreshAccessToken();
        }
    }

    public async refreshTokenIfNeeded(): Promise<void> {
        // Check if we have any authentication tokens
        if (!this.settings.googleAccessToken && !this.settings.googleRefreshToken) {
            throw new Error('Not authenticated with Google Fit. Please disconnect and reconnect your account.');
        }

        const now = Date.now();
        const expiryTime = this.settings.googleTokenExpiry || 0;

        // If we don't have an access token or it's expired/about to expire, try to refresh
        if (!this.settings.googleAccessToken || (now >= expiryTime - 60000)) {
            if (!this.settings.googleRefreshToken) {
                // Only clear access token and expiry if refresh token is missing
                this.settings.googleAccessToken = undefined;
                this.settings.googleTokenExpiry = undefined;
                await this.onSettingsChange(this.settings);
                throw new Error('Not authenticated with Google Fit. Please disconnect and reconnect your account.');
            }

            try {
                await this.refreshAccessToken();
            } catch (error) {
                // Let the error from refreshAccessToken propagate up
                throw error;
            }
        }
    }

    private formatTimeAndDate(timestamp: number): { timeStr: string, dateStr: string } {
        const m = this.moment(timestamp * 1000);
        return {
            timeStr: m.format('HH:mm'),
            dateStr: m.format('YYYY-MM-DD')
        };
    }

    async getSleepMeasurements(startTime: number, endTime: number): Promise<GoogleFitSleepMeasurement[]> {
        await this.rateLimit();
        await this.refreshTokenIfNeeded();

        try {
            // Get sleep sessions data
            const sleepResponse = await request({
                url: `https://www.googleapis.com/fitness/v1/users/me/sessions?startTime=${new Date(startTime * 1000).toISOString()}&endTime=${new Date(endTime * 1000).toISOString()}&activityType=72`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.settings.googleAccessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const sleepData = JSON.parse(sleepResponse);
            const measurements: GoogleFitSleepMeasurement[] = [];

            if (sleepData.session) {
                for (const session of sleepData.session) {
                    // Convert milliseconds to seconds
                    const startTimeSeconds = Math.floor(session.startTimeMillis / 1000);
                    const endTimeSeconds = Math.floor(session.endTimeMillis / 1000);
                    const duration = (session.endTimeMillis - session.startTimeMillis) / (1000 * 60 * 60); // Convert to hours

                    measurements.push({
                        startTime: startTimeSeconds,
                        endTime: endTimeSeconds,
                        sleepDuration: duration,
                        sleepQuality: session.sleepQuality || undefined
                    });

                    // Get detailed sleep stages if available
                    if (session.sleepSegments) {
                        let deepSleep = 0;
                        let lightSleep = 0;
                        let remSleep = 0;

                        for (const segment of session.sleepSegments) {
                            const duration = (segment.endTimeMillis - segment.startTimeMillis) / (1000 * 60 * 60);
                            switch (segment.sleepStage) {
                                case 'deep':
                                    deepSleep += duration;
                                    break;
                                case 'light':
                                    lightSleep += duration;
                                    break;
                                case 'rem':
                                    remSleep += duration;
                                    break;
                            }
                        }

                        const measurement = measurements[measurements.length - 1];
                        measurement.deepSleep = deepSleep;
                        measurement.lightSleep = lightSleep;
                        measurement.remSleep = remSleep;
                    }
                }
            }

            return measurements;
        } catch (error) {
            console.error('Failed to fetch Google Fit sleep data:', error);
            throw error;
        }
    }

    async addSleepSession(
        startTime: number,
        endTime: number,
        sleepQuality?: number,
        segments?: Array<{ type: 'deep' | 'light' | 'rem', startTime: number, endTime: number }>
    ): Promise<void> {
        await this.rateLimit();
        await this.refreshTokenIfNeeded();

        try {
            const session: GoogleFitSleepSession = {
                activityType: 72, // Sleep
                startTimeMillis: startTime * 1000,
                endTimeMillis: endTime * 1000,
                name: 'Sleep session',
                description: 'Sleep session recorded via Obsidian Sleep Tracker',
                application: {
                    packageName: 'obsidian.sleep.tracker'
                }
            };

            if (sleepQuality !== undefined) {
                session.sleepQuality = sleepQuality;
            }

            if (segments) {
                session.sleepSegments = segments.map(segment => ({
                    sleepStage: segment.type,
                    startTimeMillis: segment.startTime * 1000,
                    endTimeMillis: segment.endTime * 1000
                }));
            }

            const response = await request({
                url: 'https://www.googleapis.com/fitness/v1/users/me/sessions',
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.settings.googleAccessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(session)
            });

            new Notice('Sleep session added to Google Fit');
        } catch (error) {
            console.error('Failed to add Google Fit sleep session:', error);
            throw error;
        }
    }
}