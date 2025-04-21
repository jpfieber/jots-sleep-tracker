import { Settings } from '../types';
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
        this.styleEl.id = 'jots-body-tracker-dynamic-styles';
    }

    setCustomIcon(iconData: string) {
        if (!iconData || iconData.trim() === '') {
            this.isEmojiIcon = false;
            this.customIcon = null;
            return;
        }

        const trimmedData = iconData.trim();

        // If it's an emoji, use it directly
        if (isEmoji(trimmedData)) {
            this.isEmojiIcon = true;
            this.customIcon = trimmedData;
        } else {
            // Otherwise treat as SVG and convert to data URI
            this.isEmojiIcon = false;
            try {
                this.customIcon = svgToDataUri(trimmedData);
            } catch (error) {
                console.error('Failed to process SVG:', error);
                // Fallback to default emoji if SVG processing fails
                this.isEmojiIcon = true;
                this.customIcon = '⚡️';
            }
        }

        // Force an immediate style update
        if (this.pendingUpdate !== null) {
            window.cancelAnimationFrame(this.pendingUpdate);
            this.pendingUpdate = null;
        }
    }

    generateStyles(settings: Settings): string {
        if (!this.customIcon) {
            return '';
        }

        const commonBaseStyles = `
            /* Common base styles for both SVG and emoji */
            input[data-task="${settings.stringPrefixLetter}"],
            li[data-task="${settings.stringPrefixLetter}"]>input,
            li[data-task="${settings.stringPrefixLetter}"]>p>input,
            input[data-task="${settings.stringPrefixLetter}"]:checked,
            li[data-task="${settings.stringPrefixLetter}"]>input:checked,
            li[data-task="${settings.stringPrefixLetter}"]>p>input:checked {
                --checkbox-marker-color: transparent !important;
                border: none !important;
                padding: 0 !important;
                width: 1.0em !important;
                height: 1.0em !important;
                position: relative !important;
                margin-inline-start: 0 !important;
                cursor: pointer !important;
                appearance: none !important;
                -webkit-appearance: none !important;
                color: currentColor !important;
                vertical-align: text-bottom !important;
                margin-bottom: 3px !important;
            }

            /* Override Obsidian's task list margin styles */
            ul.contains-task-list li[data-task="${settings.stringPrefixLetter}"] .task-list-item-checkbox {
                margin-inline-start: 0 !important;
            }
        `;

        const iconStyles = this.isEmojiIcon
            ? `
            /* Emoji specific base styles */
            input[data-task="${settings.stringPrefixLetter}"],
            li[data-task="${settings.stringPrefixLetter}"]>input,
            li[data-task="${settings.stringPrefixLetter}"]>p>input {
                background: none !important;
                background-image: none !important;
                -webkit-mask-image: none !important;
            }

            /* Emoji specific styles */
            input[data-task="${settings.stringPrefixLetter}"]::before,
            li[data-task="${settings.stringPrefixLetter}"]>input::before,
            li[data-task="${settings.stringPrefixLetter}"]>p>input::before,
            input[data-task="${settings.stringPrefixLetter}"]:checked::before,
            li[data-task="${settings.stringPrefixLetter}"]>input:checked::before,
            li[data-task="${settings.stringPrefixLetter}"]>p>input:checked::before {
                content: "${this.customIcon}" !important;
                display: flex !important;
                justify-content: center !important;
                align-items: center !important;
                font-family: "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji" !important;
                font-size: 1.2em !important;
                position: absolute !important;
                top: 50% !important;
                left: 50% !important;
                transform: translate(-50%, -50%) !important;
                width: 100% !important;
                height: 100% !important;
                line-height: 1 !important;
                text-align: center !important;
                background: none !important;
                -webkit-mask-image: none !important;
                mask-image: none !important;
                color: inherit !important;
            }`
            : `
            /* SVG specific styles */
            input[data-task="${settings.stringPrefixLetter}"],
            li[data-task="${settings.stringPrefixLetter}"]>input,
            li[data-task="${settings.stringPrefixLetter}"]>p>input,
            input[data-task="${settings.stringPrefixLetter}"]:checked,
            li[data-task="${settings.stringPrefixLetter}"]>input:checked,
            li[data-task="${settings.stringPrefixLetter}"]>p>input:checked {
                background-color: currentColor !important;
                background-image: none !important;
                -webkit-mask: url("${this.customIcon}") no-repeat 50% 50% !important;
                -webkit-mask-size: contain !important;
                mask: url("${this.customIcon}") no-repeat 50% 50% !important;
                mask-size: contain !important;
            }`;
        
        return `
            /* Base styles for body tracker tasks */
            .task-list-item[data-task="${settings.stringPrefixLetter}"] {
                position: relative !important;
                margin: 0 !important;
                padding: 0 !important;
                background: none !important;
            }

            ${commonBaseStyles}
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