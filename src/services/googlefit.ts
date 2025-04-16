import { requestUrl, Notice } from 'obsidian';
import type { Settings } from '../types';

interface GoogleFitAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scope: string[];
}

interface GoogleFitMeasurement {
    date: number;
    weight?: number;
    bodyFat?: number;
}

interface GoogleFitSleepMeasurement {
    date: number;
    sleepDuration?: number;
    deepSleep?: number;
    lightSleep?: number;
    remSleep?: number;
    sleepQuality?: number;
}

interface GoogleFitServiceConfig extends GoogleFitAuthConfig {
    onSettingsChange: (settings: Settings) => Promise<void>;
}

const SCOPES = [
    'https://www.googleapis.com/auth/fitness.body.read',
    'https://www.googleapis.com/auth/fitness.body.write',
    'https://www.googleapis.com/auth/fitness.sleep.read',
    'https://www.googleapis.com/auth/fitness.sleep.write'
];

export class GoogleFitService {
    private lastRequestTime = 0;
    private readonly minRequestInterval = 1000; // 1 second between requests

    constructor(
        private settings: Settings,
        private config: GoogleFitServiceConfig
    ) { }

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
        await this.config.onSettingsChange(this.settings);

        const params = new URLSearchParams({
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri,
            response_type: 'code',
            scope: SCOPES.join(' '),
            access_type: 'offline',
            state: state
        });

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
        window.open(authUrl);

        new Notice(
            'Google Fit Authentication:\n\n' +
            '1. Complete authorization in your browser\n' +
            '2. After authorizing, you will be redirected\n' +
            '3. Copy both the "code" and "state" parameters\n' +
            '4. Use Command Palette and run "Complete Google Fit Authentication"\n' +
            '5. Paste the code and state in the dialog',
            20000
        );

        return true;
    }

    async completeAuthentication(code: string, state: string): Promise<boolean> {
        if (state !== this.settings.googleAuthState) {
            throw new Error('Invalid authentication state');
        }

        try {
            const response = await requestUrl({
                url: 'https://oauth2.googleapis.com/token',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    client_id: this.config.clientId,
                    client_secret: this.config.clientSecret,
                    code: code,
                    grant_type: 'authorization_code',
                    redirect_uri: this.config.redirectUri
                }).toString()
            });

            const tokens = response.json;
            this.settings.googleAccessToken = tokens.access_token;
            this.settings.googleRefreshToken = tokens.refresh_token;
            this.settings.googleTokenExpiry = Date.now() + (tokens.expires_in * 1000);
            await this.config.onSettingsChange(this.settings);

            return true;
        } catch (error) {
            console.error('Google Fit token request error:', error);
            throw error;
        }
    }

    private async refreshTokenIfNeeded(): Promise<void> {
        if (!this.settings.googleRefreshToken) return;

        const now = Date.now();
        const expiryTime = this.settings.googleTokenExpiry || 0;

        if (now >= expiryTime - 60000) { // Refresh if token expires in less than a minute
            try {
                const response = await requestUrl({
                    url: 'https://oauth2.googleapis.com/token',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: new URLSearchParams({
                        client_id: this.config.clientId,
                        client_secret: this.config.clientSecret,
                        refresh_token: this.settings.googleRefreshToken,
                        grant_type: 'refresh_token'
                    }).toString()
                });

                const tokens = response.json;
                this.settings.googleAccessToken = tokens.access_token;
                this.settings.googleTokenExpiry = Date.now() + (tokens.expires_in * 1000);
                await this.config.onSettingsChange(this.settings);
            } catch (error) {
                console.error('Failed to refresh token:', error);
                throw error;
            }
        }
    }

    async getMeasurements(startTime: number, endTime: number): Promise<GoogleFitMeasurement[]> {
        await this.rateLimit();
        await this.refreshTokenIfNeeded();

        try {
            // Convert Unix timestamps to nanoseconds
            const startTimeNs = startTime * 1000000000;
            const endTimeNs = endTime * 1000000000;

            console.log('Querying Google Fit for time range:', {
                start: new Date(startTime * 1000).toISOString(),
                end: new Date(endTime * 1000).toISOString(),
                startTimeNs,
                endTimeNs
            });

            // Get weight data
            const weightResponse = await requestUrl({
                url: `https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.weight:com.google.android.gms:merged/datasets/${startTimeNs}-${endTimeNs}`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.settings.googleAccessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log('Google Fit weight response:', {
                status: weightResponse.status,
                data: weightResponse.json,
                url: `https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.weight:com.google.android.gms:merged/datasets/${startTimeNs}-${endTimeNs}`
            });

            const measurements: GoogleFitMeasurement[] = [];

            // Process weight data
            if (weightResponse.json.point) {
                for (const point of weightResponse.json.point) {
                    const timestamp = Math.floor(parseInt(point.startTimeNanos) / 1000000000);
                    measurements.push({
                        date: timestamp,
                        weight: point.value[0].fpVal
                    });
                }
            }

            // Get body fat data
            const bodyFatResponse = await requestUrl({
                url: `https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.body.fat.percentage:com.google.android.gms:merged/datasets/${startTimeNs}-${endTimeNs}`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.settings.googleAccessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log('Google Fit body fat response:', {
                status: bodyFatResponse.status,
                data: bodyFatResponse.json,
                url: `https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.body.fat.percentage:com.google.android.gms:merged/datasets/${startTimeNs}-${endTimeNs}`
            });

            // Process body fat data
            if (bodyFatResponse.json.point) {
                for (const point of bodyFatResponse.json.point) {
                    const timestamp = Math.floor(parseInt(point.startTimeNanos) / 1000000000);
                    const measurement = measurements.find(m => m.date === timestamp);

                    if (measurement) {
                        measurement.bodyFat = point.value[0].fpVal;
                    } else {
                        measurements.push({
                            date: timestamp,
                            bodyFat: point.value[0].fpVal
                        });
                    }
                }
            }

            console.log('Processed Google Fit measurements:', measurements);
            return measurements;
        } catch (error) {
            console.error('Failed to fetch Google Fit measurements:', error);
            throw error;
        }
    }

    async addMeasurement(date: number, weight: number, bodyFat?: number): Promise<void> {
        await this.rateLimit();
        await this.refreshTokenIfNeeded();

        const nanos = `${date}000000000`;

        try {
            // Add weight measurement
            const weightResponse = await requestUrl({
                url: `https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.weight:com.google.android.gms:merge_weight/datasets/${nanos}-${nanos}`,
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${this.settings.googleAccessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    dataSourceId: 'derived:com.google.weight:com.google.android.gms:merge_weight',
                    point: [{
                        startTimeNanos: nanos,
                        endTimeNanos: nanos,
                        dataTypeName: 'com.google.weight',
                        value: [{
                            fpVal: weight
                        }]
                    }]
                })
            });

            console.log('Google Fit weight update response:', {
                status: weightResponse.status,
                data: weightResponse.json
            });

            // Add body fat measurement if provided
            if (bodyFat !== undefined) {
                const bodyFatResponse = await requestUrl({
                    url: `https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.body.fat.percentage:com.google.android.gms:merge_body_fat_percentage/datasets/${nanos}-${nanos}`,
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${this.settings.googleAccessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        dataSourceId: 'derived:com.google.body.fat.percentage:com.google.android.gms:merge_body_fat_percentage',
                        point: [{
                            startTimeNanos: nanos,
                            endTimeNanos: nanos,
                            dataTypeName: 'com.google.body.fat.percentage',
                            value: [{
                                fpVal: bodyFat
                            }]
                        }]
                    })
                });

                console.log('Google Fit body fat update response:', {
                    status: bodyFatResponse.status,
                    data: bodyFatResponse.json
                });
            }
        } catch (error) {
            console.error('Failed to add Google Fit measurement:', error);
            throw error;
        }
    }

    async getSleepMeasurements(startTime: number, endTime: number): Promise<GoogleFitSleepMeasurement[]> {
        await this.rateLimit();
        await this.refreshTokenIfNeeded();

        try {
            console.log('Querying Google Fit for sleep data:', {
                start: new Date(startTime * 1000).toISOString(),
                end: new Date(endTime * 1000).toISOString()
            });

            // Get sleep sessions data
            const sleepResponse = await requestUrl({
                url: `https://www.googleapis.com/fitness/v1/users/me/sessions?startTime=${new Date(startTime * 1000).toISOString()}&endTime=${new Date(endTime * 1000).toISOString()}&activityType=72`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.settings.googleAccessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const measurements: GoogleFitSleepMeasurement[] = [];

            if (sleepResponse.json.session) {
                for (const session of sleepResponse.json.session) {
                    // Convert milliseconds to seconds for the date
                    const startDate = Math.floor(session.startTimeMillis / 1000);
                    measurements.push({
                        date: startDate,
                        sleepDuration: (session.endTimeMillis - session.startTimeMillis) / (1000 * 60 * 60), // Convert to hours
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

                        const measurement = measurements.find(m => m.date === startDate);
                        if (measurement) {
                            measurement.deepSleep = deepSleep;
                            measurement.lightSleep = lightSleep;
                            measurement.remSleep = remSleep;
                        }
                    }
                }
            }

            console.log('Processed Google Fit sleep measurements:', measurements);
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
            const session = {
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
                session['sleepQuality'] = sleepQuality;
            }

            if (segments) {
                session['sleepSegments'] = segments.map(segment => ({
                    sleepStage: segment.type,
                    startTimeMillis: segment.startTime * 1000,
                    endTimeMillis: segment.endTime * 1000
                }));
            }

            const response = await requestUrl({
                url: 'https://www.googleapis.com/fitness/v1/users/me/sessions',
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.settings.googleAccessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(session)
            });

            console.log('Google Fit sleep session update response:', {
                status: response.status,
                data: response.json
            });
        } catch (error) {
            console.error('Failed to add Google Fit sleep session:', error);
            throw error;
        }
    }
}