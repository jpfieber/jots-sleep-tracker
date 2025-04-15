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