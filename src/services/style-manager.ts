import { Settings } from '../types';
import { SVG_ICON } from '../constants';
import { svgToDataUri, isEmoji } from '../utils';

export class StyleManager {
    private styleEl: HTMLStyleElement;
    private lastStyles: string = '';
    private pendingUpdate: number | null = null;
    private customIcon: string | null = null;
    private isEmojiIcon: boolean = false;

    constructor() {
        this.styleEl = document.createElement('style');
        document.head.appendChild(this.styleEl);
        this.styleEl.id = 'jots-sleep-tracker-dynamic-styles';
    }

    setCustomIcon(iconData: string) {
        // Handle empty or invalid input
        if (!iconData || iconData.trim() === '') {
            this.isEmojiIcon = false;
            this.customIcon = null;
            return;
        }

        const trimmedData = iconData.trim();
        // If 1-2 characters, treat as emoji
        if (isEmoji(trimmedData)) {
            this.isEmojiIcon = true;
            this.customIcon = trimmedData;
        } else {
            // Otherwise treat as SVG
            this.isEmojiIcon = false;
            this.customIcon = svgToDataUri(trimmedData);
        }
    }

    generateStyles(settings: Settings): string {
        // If no icon is set, don't apply any styles - let Obsidian's defaults take over
        if (!this.customIcon) {
            return '';
        }

        // Icon-specific styles for checkbox
        const iconStyles = this.isEmojiIcon
            ? `input[data-task="${settings.stringPrefixLetter}"],
               li[data-task="${settings.stringPrefixLetter}"]>input,
               li[data-task="${settings.stringPrefixLetter}"]>p>input {
                --checkbox-marker-color: transparent;
                background: none !important;
                border: none !important;
                padding: 0;
                width: 1.5em;
                height: 1.5em;
                line-height: 1.5em;
                text-align: center;
                cursor: pointer;
                appearance: none;
                -webkit-appearance: none;
                position: relative;
            }

            input[data-task="${settings.stringPrefixLetter}"]::before,
            li[data-task="${settings.stringPrefixLetter}"]>input::before,
            li[data-task="${settings.stringPrefixLetter}"]>p>input::before {
                content: "${this.customIcon}";
                font-family: "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
                font-size: 1em;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: none;
                -webkit-mask-image: none;
                mask-image: none;
            }`
            : `input[data-task="${settings.stringPrefixLetter}"],
               li[data-task="${settings.stringPrefixLetter}"]>input,
               li[data-task="${settings.stringPrefixLetter}"]>p>input {
                --checkbox-marker-color: transparent;
                border: none;
                border-radius: 0;
                background-image: none;
                background-color: currentColor;
                pointer-events: none;
                -webkit-mask-size: contain;
                -webkit-mask-position: 50% 50%;
                margin-left: 0;
                -webkit-mask-image: url("${this.customIcon}");
                mask-image: url("${this.customIcon}");
            }`;

        return `
            /* Base styles for sleep tracker tasks */
            .task-list-item[data-task="${settings.stringPrefixLetter}"] {
                position: relative;
                margin: 0;
                padding: 0;
            }

            ${iconStyles}
        `;
    }

    updateStyles(settings: Settings) {
        const styles = this.generateStyles(settings);

        // Skip update if styles haven't changed
        if (this.lastStyles === styles) {
            return;
        }

        // Cancel any pending update
        if (this.pendingUpdate !== null) {
            window.cancelAnimationFrame(this.pendingUpdate);
        }

        // Schedule update for next frame
        this.pendingUpdate = window.requestAnimationFrame(() => {
            this.applyStyles(styles);
            this.pendingUpdate = null;
        });
    }

    private applyStyles(styles: string) {
        this.styleEl.textContent = styles;
        this.lastStyles = styles;
    }

    removeStyles() {
        if (this.pendingUpdate !== null) {
            window.cancelAnimationFrame(this.pendingUpdate);
            this.pendingUpdate = null;
        }
        this.styleEl.remove();
    }
}