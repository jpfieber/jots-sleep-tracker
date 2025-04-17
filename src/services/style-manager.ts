import { Settings } from '../types';
import { SVG_ICON } from '../constants';

export class StyleManager {
    private styleEl: HTMLStyleElement;
    private lastStyles: string = '';
    private pendingUpdate: number | null = null;

    constructor() {
        this.styleEl = document.createElement('style');
        document.head.appendChild(this.styleEl);
        this.styleEl.id = 'jots-sleep-tracker-dynamic-styles';
    }

    updateStyles(settings: Settings) {
        const dynamicStyles = this.generateStyles(settings);

        // Skip update if styles haven't changed
        if (this.lastStyles === dynamicStyles) {
            return;
        }

        // Cancel any pending update
        if (this.pendingUpdate !== null) {
            window.cancelAnimationFrame(this.pendingUpdate);
        }

        // Schedule update for next frame
        this.pendingUpdate = window.requestAnimationFrame(() => {
            this.applyStyles(dynamicStyles);
            this.pendingUpdate = null;
        });
    }

    private generateStyles(settings: Settings): string {
        return `
            /* Target all checkbox inputs with our prefix */
            input[data-task="${settings.stringPrefixLetter}"]:checked,
            li[data-task="${settings.stringPrefixLetter}"]>input:checked,
            li[data-task="${settings.stringPrefixLetter}"]>p>input:checked {
                --checkbox-marker-color: transparent;
                border: none;
                border-radius: 0;
                background-image: none;
                background-color: currentColor;
                pointer-events: none;
                -webkit-mask-size: var(--checkbox-icon);
                -webkit-mask-position: 50% 50%;
                color: var(--text-muted);
                margin-left: -18px;
                -webkit-mask-image: url("${SVG_ICON}");
            }

            /* Style the sleep record task items */
            .jots-sleep-tracker-sleep-record-entry[data-task="${settings.stringPrefixLetter}"] {
                position: relative;
                padding-left: 24px;
            }

            /* Style dataview inline fields within sleep record entries */
            .jots-sleep-tracker-sleep-record-entry[data-task="${settings.stringPrefixLetter}"] .dataview.inline-field {
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }

            /* Style the inline field keys */
            .jots-sleep-tracker-sleep-record-entry[data-task="${settings.stringPrefixLetter}"] .dataview.inline-field-key {
                color: var(--text-muted);
                font-size: 0.9em;
                opacity: 0.8;
            }

            /* Style the inline field values */
            .jots-sleep-tracker-sleep-record-entry[data-task="${settings.stringPrefixLetter}"] .dataview.inline-field-value {
                color: var(--text-normal);
                font-weight: 500;
            }

            /* Style the separator between key and value */
            .jots-sleep-tracker-sleep-record-entry[data-task="${settings.stringPrefixLetter}"] .dataview.inline-field-key::after {
                content: ":";
                margin-right: 4px;
                color: var(--text-muted);
                opacity: 0.8;
            }

            /* Style the dataview inline fields */
            body .jots-sleep-tracker-sleep-record-entry[data-task="${settings.stringPrefixLetter}"]>.dataview.inline-field>.dataview.inline-field-key::after {
                content: "=";
                color: black;
            }
        `;
    }

    private applyStyles(styles: string) {
        try {
            if ('replaceSync' in CSSStyleSheet.prototype) {
                // Use the modern CSSStyleSheet API if available
                const sheet = new CSSStyleSheet();
                sheet.replaceSync(styles);
                this.styleEl.textContent = ''; // Clear existing styles
                (this.styleEl as any).sheet = sheet;
            } else {
                // Fall back to textContent for older browsers
                this.styleEl.textContent = styles;
            }
            this.lastStyles = styles;
        } catch (error) {
            // Fall back to textContent if CSSStyleSheet API fails
            this.styleEl.textContent = styles;
            this.lastStyles = styles;
        }
    }

    removeStyles() {
        if (this.pendingUpdate !== null) {
            window.cancelAnimationFrame(this.pendingUpdate);
            this.pendingUpdate = null;
        }
        this.styleEl.remove();
    }
}