import { Settings } from '../types';
import { SVG_ICON } from '../constants';

export class StyleManager {
    private styleEl: HTMLStyleElement;

    constructor() {
        this.styleEl = document.createElement('style');
        document.head.appendChild(this.styleEl);
        this.styleEl.id = 'sleep-tracker-dynamic-styles';
    }

    updateStyles(settings: Settings) {
        const dynamicStyles = `
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

            /* Style the measurement task items */
            .task-list-item[data-task="${settings.stringPrefixLetter}"] {
                position: relative;
                padding-left: 24px;
            }

            /* Style dataview inline fields within measurement entries */
            .task-list-item[data-task="${settings.stringPrefixLetter}"] .dataview.inline-field {
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }

            /* Style the inline field keys */
            .task-list-item[data-task="${settings.stringPrefixLetter}"] .dataview.inline-field-key {
                color: var(--text-muted);
                font-size: 0.9em;
                opacity: 0.8;
            }

            /* Style the inline field values */
            .task-list-item[data-task="${settings.stringPrefixLetter}"] .dataview.inline-field-value {
                color: var(--text-normal);
                font-weight: 500;
            }

            /* Style the separator between key and value */
            .task-list-item[data-task="${settings.stringPrefixLetter}"] .dataview.inline-field-key::after {
                content: ":";
                margin-right: 4px;
                color: var(--text-muted);
                opacity: 0.8;
            }

            /* Style the dataview inline fields */
            body [data-task="${settings.stringPrefixLetter}"]>.dataview.inline-field>.dataview.inline-field-key::after {
                content: "=";
                color: black;
            }
        `;
        this.styleEl.textContent = dynamicStyles;
    }

    removeStyles() {
        this.styleEl.remove();
    }
}