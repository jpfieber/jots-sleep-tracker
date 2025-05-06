import { Settings } from './types';

/**
 * Get the timezone offset in ISO format (e.g. +05:30 or -04:00)
 */
export function getTimezoneOffset(date: Date): string {
    const offset = date.getTimezoneOffset();
    const sign = offset <= 0 ? '+' : '-';
    const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    const minutes = String(Math.abs(offset) % 60).padStart(2, '0');
    return `${sign}${hours}:${minutes}`;
}

/**
 * Converts SVG data to a Data URI for use in CSS
 * @param svgData The raw SVG markup
 * @returns A data URI string that can be used in CSS
 */
export function svgToDataUri(svgData: string): string {
    try {
        // Remove any newlines and extra spaces
        let cleanedSvg = svgData.replace(/\s+/g, ' ').trim();

        // Handle SVGs from common sites that wrap content in groups
        if (cleanedSvg.includes('SVGRepo')) {
            // Extract the actual icon content from SVGRepo's wrapper groups
            const iconCarrierMatch = cleanedSvg.match(/<g id="SVGRepo_iconCarrier">(.*?)<\/g>/);
            if (iconCarrierMatch) {
                cleanedSvg = iconCarrierMatch[1].trim();
                // Wrap back in svg tag with necessary attributes
                cleanedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${cleanedSvg}</svg>`;
            }
        }

        // Replace specific fill colors with currentColor for theme compatibility
        cleanedSvg = cleanedSvg
            .replace(/fill="#[0-9A-Fa-f]{3,6}"/g, 'fill="currentColor"')
            .replace(/fill="black"/g, 'fill="currentColor"')
            .replace(/fill="none"/g, '')
            .replace(/fill="white"/g, 'fill="currentColor"');

        // URI encode the SVG
        const encodedSvg = encodeURIComponent(cleanedSvg)
            .replace(/'/g, '%27')
            .replace(/"/g, '%22');

        // Create the data URI
        return `data:image/svg+xml,${encodedSvg}`;
    } catch (error) {
        console.error('SVG processing error:', error, '\nOriginal SVG:', svgData);
        throw error;
    }
}

/**
 * Checks if a string could be an emoji based on length
 * @param str The string to check
 * @returns boolean indicating if the string is likely an emoji (1-2 characters)
 */
export function isEmoji(str: string): boolean {
    // Trim and check length - emojis are 1-2 characters
    const trimmed = str.trim();
    const len = trimmed.length;
    return len === 1 || len === 2;
}

// Cache for location lookups to minimize API requests
const locationCache: { [key: string]: string } = {};

interface LocationInfo {
    rawCoords: string;
    formattedLocation: string;
}

/**
 * Convert coordinates to a readable location name using OpenStreetMap's Nominatim service
 * Returns both raw coordinates and formatted city with state/country
 */
export async function coordsToLocationInfo(location: string, settings: Settings): Promise<LocationInfo> {
    try {
        // Check if location has coordinates in format "lat,long"
        const coords = location.split(',').map(n => parseFloat(n.trim()));
        if (coords.length !== 2 || isNaN(coords[0]) || isNaN(coords[1])) {
            return {
                rawCoords: location,
                formattedLocation: location
            };
        }

        const [lat, long] = coords;
        const cacheKey = `${lat},${long}`;

        // Check cache first
        if (settings.locationCache[cacheKey]) {
            return {
                rawCoords: location,
                formattedLocation: settings.locationCache[cacheKey]
            };
        }

        // Rate limiting - wait 1 second between requests as per Nominatim usage policy
        await new Promise(resolve => setTimeout(resolve, 1000));

        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${long}&format=json`,
            {
                headers: {
                    'User-Agent': 'Obsidian-Sleep-Tracker/1.0',
                    'Accept-Language': 'en'
                }
            }
        );

        if (!response.ok) {
            console.error('Failed to fetch location data:', response.statusText);
            return {
                rawCoords: location,
                formattedLocation: location
            };
        }

        const data = await response.json();
        console.log('Raw location data from Nominatim:', data); // Debug log

        // Extract location components
        const city = data.address?.city ||
            data.address?.town ||
            data.address?.village ||
            data.address?.municipality ||
            data.address?.county ||
            '';

        let region = '';
        // Handle US states - try multiple possible state code fields
        if (data.address?.country_code?.toLowerCase() === 'us' ||
            data.address?.country?.toLowerCase().includes('united states')) {
            region = data.address?.state_code || // Try state_code first
                data.address?.['ISO3166-2-lvl4']?.split('-')[1] || // Try ISO code
                data.address?.state?.substring(0, 2).toUpperCase(); // Fallback to first 2 chars of state name
        }
        // Handle other countries
        else if (data.address?.country &&
            (!data.address?.country_code ||
                data.address?.country_code?.toLowerCase() !== 'us')) {
            region = data.address.country;
        }

        console.log('Extracted city:', city, 'region:', region); // Debug log

        // Format location string
        const formattedLocation = city && region ? `${city}, ${region}` : (city || location);

        // Cache the result
        settings.locationCache[cacheKey] = formattedLocation;

        return {
            rawCoords: location,
            formattedLocation
        };
    } catch (error) {
        console.error('Failed to convert coordinates to location:', error);
        return {
            rawCoords: location,
            formattedLocation: location
        };
    }
}