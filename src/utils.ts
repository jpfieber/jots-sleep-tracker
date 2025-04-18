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