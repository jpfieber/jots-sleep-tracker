import { request } from 'obsidian';
import ICAL from 'ical.js';
import type { SleepData } from '../types';
import { coordsToLocationInfo } from '../utils';

export class CalendarService {
    constructor(private calendarUrl: string) { }

    async getLatestSleepData(): Promise<SleepData | null> {
        try {
            const response = await request({
                url: this.calendarUrl,
                method: 'GET'
            });

            const jcalData = ICAL.parse(response);
            const comp = new ICAL.Component(jcalData);
            const vevents = comp.getAllSubcomponents('vevent');

            let latestEvent: ICAL.Event | null = null;
            let latestDate = 0;

            // Find the most recent event
            for (const vevent of vevents) {
                const event = new ICAL.Event(vevent);
                const eventDate = event.startDate.toJSDate().getTime();
                if (eventDate > latestDate) {
                    latestDate = eventDate;
                    latestEvent = event;
                }
            }

            if (!latestEvent) return null;

            // Parse the sleep data from the event description
            const description = latestEvent.description || '';
            const location = latestEvent.component.getFirstPropertyValue('location') || '';
            return await this.parseSleepData(latestEvent, description, location);

        } catch (error) {
            console.error('Failed to fetch calendar data:', error);
            throw error;
        }
    }

    async getSleepDataForDateRange(startTime: number, endTime: number): Promise<SleepData[]> {
        try {
            const response = await request({
                url: this.calendarUrl,
                method: 'GET'
            });

            const jcalData = ICAL.parse(response);
            const comp = new ICAL.Component(jcalData);
            const vevents = comp.getAllSubcomponents('vevent');
            const sleepDataPromises: Promise<SleepData>[] = [];

            // Find all events within the date range
            for (const vevent of vevents) {
                const event = new ICAL.Event(vevent);
                const eventStartTime = Math.floor(event.startDate.toJSDate().getTime() / 1000);
                const eventEndTime = Math.floor(event.endDate.toJSDate().getTime() / 1000);

                // Check if event falls within our date range
                if (eventStartTime >= startTime && eventEndTime <= endTime) {
                    const description = event.description || '';
                    const location = event.component.getFirstPropertyValue('location') || '';
                    sleepDataPromises.push(this.parseSleepData(event, description, location));
                }
            }

            return await Promise.all(sleepDataPromises);

        } catch (error) {
            console.error('Failed to fetch calendar data:', error);
            throw error;
        }
    }

    private async parseSleepData(event: ICAL.Event, description: any, location: any): Promise<SleepData> {
        const startTime = event.startDate.toJSDate().getTime();
        const endTime = event.endDate.toJSDate().getTime();
        const sleepDuration = (endTime - startTime) / (1000 * 60 * 60); // Convert to hours

        const locationInfo = await coordsToLocationInfo(location?.toString() || '');

        // Initialize sleep data with required fields
        const sleepData: SleepData = {
            startTime: Math.floor(startTime / 1000),
            endTime: Math.floor(endTime / 1000),
            sleepDuration: sleepDuration,
            location: locationInfo.rawCoords,
            city: locationInfo.formattedLocation
        };

        // Parse the description for detailed sleep data
        const lines = (description?.toString() || '').split('\n');
        let graphData = '';

        lines.forEach((line: string) => {
            const trimmedLine = line.trim();

            if (trimmedLine.startsWith('Duration:')) {
                const duration = this.parseTimeToHours(trimmedLine.substring(9));
                if (duration) sleepData.sleepDuration = duration;
            }
            else if (trimmedLine.startsWith('Deep sleep:')) {
                const percentMatch = trimmedLine.match(/(\d+(?:\.\d+)?)%/);
                if (percentMatch) {
                    const percent = parseFloat(percentMatch[1]);
                    if (!isNaN(percent)) {
                        sleepData.deepSleepPercent = percent;
                        // Calculate deep sleep minutes based on total duration
                        const totalMinutes = sleepData.sleepDuration * 60;
                        sleepData.deepSleepMinutes = Math.round((percent / 100) * totalMinutes);
                        // Calculate light sleep as the remaining time
                        sleepData.lightSleepMinutes = Math.round(totalMinutes - sleepData.deepSleepMinutes);
                    }
                }
            }
            else if (trimmedLine.startsWith('Cycles:')) {
                const cyclesMatch = trimmedLine.match(/(\d+)/);
                if (cyclesMatch) {
                    const cycles = parseInt(cyclesMatch[1]);
                    if (!isNaN(cycles)) sleepData.cycles = cycles;
                }
            }
            else if (trimmedLine.startsWith('Noise:')) {
                const noiseMatch = trimmedLine.match(/(\d+(?:\.\d+)?)%/);
                if (noiseMatch) {
                    const noise = parseFloat(noiseMatch[1]);
                    if (!isNaN(noise)) sleepData.noisePercent = noise;
                }
            }
            else if (trimmedLine.startsWith('Snoring:')) {
                sleepData.snoringDuration = trimmedLine.substring(9).trim();
            }
            else if (trimmedLine.startsWith('Comment:')) {
                sleepData.comment = trimmedLine.substring(8).trim();
            }
            else if (trimmedLine.match(/^[▁▂▃▄▅▆▇█]+$/)) {
                sleepData.graph = trimmedLine;
            }
        });

        // Calculate sleep efficiency based on deep sleep percentage
        if (sleepData.deepSleepPercent !== undefined) {
            sleepData.efficiency = sleepData.deepSleepPercent / 100;
        }

        return sleepData;
    }

    private parseTimeToHours(timeStr: string): number | null {
        const match = timeStr.match(/(\d+):(\d+)/);
        if (match) {
            const hours = parseInt(match[1]);
            const minutes = parseInt(match[2]);
            return hours + (minutes / 60);
        }
        return null;
    }
}