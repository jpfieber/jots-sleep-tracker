import { Notice, requestUrl } from 'obsidian';

interface OAuthCallbackParams {
    code: string;
    state: string;
}

declare global {
    interface Window {
        require: any;
    }
}

export class OAuthCallbackServer {
    private callbackPromise: Promise<OAuthCallbackParams> | null = null;
    private callbackResolver: ((value: OAuthCallbackParams) => void) | null = null;
    private server: any = null;

    async start(): Promise<void> {
        if (this.server) {
            return;
        }

        try {
            // Using Node's http module via Electron
            const http = window.require('http');

            this.server = http.createServer((req: any, res: any) => {
                try {
                    // Parse the URL properly, ensuring we handle the full URL including query parameters
                    const url = new URL(req.url, `http://localhost:16321`);
                    const params = url.searchParams;

                    const code = params.get('code');
                    const state = params.get('state');

                    console.log('Received OAuth callback with params:', {
                        code: code ? '[REDACTED]' : 'null',
                        state: state ? '[REDACTED]' : 'null'
                    });

                    // Send response
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    if (code && state) {
                        res.end('<html><body><h1>Authentication successful!</h1><p>You can close this window now.</p></body></html>');
                        // Handle the callback parameters
                        this.handleCallback(params);
                    } else {
                        res.end('<html><body><h1>Authentication failed!</h1><p>No code or state received. Please try again.</p></body></html>');
                        console.error('Invalid callback parameters received');
                    }
                } catch (error) {
                    console.error('Error handling OAuth callback:', error);
                    res.writeHead(500, { 'Content-Type': 'text/html' });
                    res.end('<html><body><h1>Authentication Error</h1><p>An error occurred during authentication. Please try again.</p></body></html>');
                }
            });

            await new Promise<void>((resolve, reject) => {
                this.server.listen(16321, 'localhost', () => {
                    console.log('OAuth callback server listening on port 16321');
                    resolve();
                });

                this.server.on('error', (error: Error) => {
                    console.error('OAuth server error:', error);
                    reject(error);
                });
            });
        } catch (error) {
            console.error('Failed to start OAuth server:', error);
            throw error;
        }
    }

    handleCallback(params: URLSearchParams): void {
        const code = params.get('code');
        const state = params.get('state');

        if (code && state && this.callbackResolver) {
            this.callbackResolver({ code, state });
            new Notice('Successfully received OAuth callback');
        } else {
            console.error('Invalid callback parameters:', {
                hasCode: !!code,
                hasState: !!state,
                hasResolver: !!this.callbackResolver
            });
            if (this.callbackResolver) {
                this.callbackResolver({ code: '', state: '' });
            }
            new Notice('Failed to process OAuth callback');
        }
    }

    waitForCallback(): Promise<OAuthCallbackParams> {
        if (this.callbackPromise) {
            return this.callbackPromise;
        }

        this.callbackPromise = new Promise((resolve) => {
            this.callbackResolver = resolve;

            // Set a timeout to prevent hanging
            setTimeout(() => {
                if (this.callbackResolver) {
                    console.error('OAuth callback timeout');
                    new Notice('OAuth callback timeout. Please try again.');
                    resolve({ code: '', state: '' });
                }
            }, 300000); // 5 minute timeout
        });

        return this.callbackPromise;
    }

    async close(): Promise<void> {
        if (this.server) {
            await new Promise<void>((resolve) => {
                this.server.close(() => {
                    console.log('OAuth callback server closed');
                    resolve();
                });
            });
            this.server = null;
        }

        this.callbackPromise = null;
        this.callbackResolver = null;
    }
}