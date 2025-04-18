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

        // Base styles for custom icon
        const baseStyles = `
            .HyperMD-task-line[data-task="${settings.stringPrefixLetter}"] {
                position: relative;
            }

            .HyperMD-task-line[data-task="${settings.stringPrefixLetter}"] .task-list-item-checkbox {
                visibility: hidden;
                position: relative;
                margin: 0;
            }

            .HyperMD-task-line[data-task="${settings.stringPrefixLetter}"] .task-list-item-checkbox::before {
                content: "";
                position: absolute;
                left: 0;
                top: 50%;
                transform: translateY(-50%);
                width: 16px;
                height: 16px;
                display: block;
            }`;

        // Icon-specific styles
        const iconStyles = this.isEmojiIcon
            ? `.HyperMD-task-line[data-task="${settings.stringPrefixLetter}"] .task-list-item-checkbox::before {
                content: "${this.customIcon}";
                font-family: "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
                font-size: 14px;
                line-height: 1;
                text-align: center;
                visibility: visible;
            }`
            : `.HyperMD-task-line[data-task="${settings.stringPrefixLetter}"] .task-list-item-checkbox::before {
                -webkit-mask-image: url('${this.customIcon}');
                mask-image: url('${this.customIcon}');
                -webkit-mask-size: contain;
                mask-size: contain;
                -webkit-mask-repeat: no-repeat;
                mask-repeat: no-repeat;
                -webkit-mask-position: center;
                mask-position: center;
                background-color: currentColor;
                visibility: visible;
            }`;

        return `${baseStyles}\n${iconStyles}`;
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