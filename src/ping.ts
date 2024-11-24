import {
    ProxyConfig,
    WebSocketConnectionState,
    WebSocketMessage,
    WSS_ENDPOINT,
    WSS_ENDPOINT_VERSION,
} from './types';
import { createProxyAgent, logMessage } from './utils';
import { WebSocket as WebsocketWS } from 'ws';
import chalk from 'chalk';

/**
 * TeneoWebsocketClient handles WebSocket connections with optional proxy support.
 * It manages connection states, automatic reconnection, and message handling.
 */
export class TeneoWebsocketClient {
    // Class properties
    private webSocket: WebsocketWS | null = null;
    private readonly proxyConfig: ProxyConfig | null;
    private readonly userId: string;
    protected state: WebSocketConnectionState =
        WebSocketConnectionState.DISCONNECTED;
    private retries: number;
    private reconnectTimeout?: NodeJS.Timeout;

    // Configuration constants
    private static readonly MAX_RETRIES = 5;
    private static readonly RECONNECT_DELAY = 5000; // 5 seconds

    /**
     * Initializes a new WebSocket client instance
     * @param userId - Unique identifier for the client
     * @param proxyConfig - Optional proxy configuration
     * @throws Error if userId is empty or invalid
     */
    constructor(userId: string, proxyConfig: ProxyConfig | null = null) {
        if (!userId?.trim()) {
            throw new Error(chalk.red('❌ UserId is required'));
        }
        this.proxyConfig = proxyConfig;
        this.userId = userId.trim();
        this.retries = 0;
    }

    /**
     * Returns the current connection state
     */
    public getState(): WebSocketConnectionState {
        return this.state;
    }

    /**
     * Constructs the WebSocket URL with user ID and version parameters
     */
    private getWssUrl(): string {
        const params = new URLSearchParams({
            userId: this.userId,
            version: WSS_ENDPOINT_VERSION,
        });
        return `${WSS_ENDPOINT}/websocket?${params.toString()}`;
    }

    /**
     * Formats the proxy URL for logging purposes, masking credentials
     */
    private getProxyUrl(): string {
        if (!this.proxyConfig) return '';
        return this.proxyConfig.auth
            ? `${this.proxyConfig.auth.username}:***@${this.proxyConfig.hostname}:${this.proxyConfig.port}`
            : `${this.proxyConfig.hostname}:${this.proxyConfig.port}`;
    }

    /**
     * Establishes a WebSocket connection with optional proxy support
     * @throws Error if connection fails
     */
    public async connect(): Promise<void> {
        if (this.state === WebSocketConnectionState.CONNECTED) {
            return;
        }

        if (this.state === WebSocketConnectionState.CONNECTING) {
            logMessage(
                'warn',
                `WebSocket connection already in progress${
                    this.proxyConfig ? ` using ${this.getProxyUrl()}` : ''
                }, waiting...`
            );
            return;
        }

        try {
            this.state = WebSocketConnectionState.CONNECTING;

            if (!this.proxyConfig) {
                this.webSocket = new WebsocketWS(this.getWssUrl());
            } else {
                const agent = await createProxyAgent(this.proxyConfig);
                this.webSocket = new WebsocketWS(this.getWssUrl(), { agent });
            }

            await this.setupWebSocketListeners();

            logMessage(
                'success',
                `${chalk.green('Connected to WebSocket')}${
                    this.proxyConfig ? ` using ${this.getProxyUrl()}` : ''
                }`
            );
        } catch (error) {
            this.state = WebSocketConnectionState.DISCONNECTED;
            const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';
            throw new Error(chalk.red(`❌ Failed to connect: ${errorMessage}`));
        }
    }

    /**
     * Sets up WebSocket event listeners for connection management
     * @returns Promise that resolves when connection is established
     * @throws Error if WebSocket initialization fails
     */
    private setupWebSocketListeners(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.webSocket) {
                reject(
                    new Error(
                        chalk.red('❌ WebSocket instance not initialized')
                    )
                );
                return;
            }

            const cleanup = () => {
                if (this.reconnectTimeout) {
                    clearTimeout(this.reconnectTimeout);
                }
            };

            this.webSocket.on('open', () => {
                this.state = WebSocketConnectionState.CONNECTED;
                this.retries = 0; // Reset retries on successful connection
                logMessage('info', chalk.green('WebSocket connection opened'));
                resolve();
            });

            this.webSocket.on('message', (data: Buffer) => {
                try {
                    const message = JSON.parse(
                        data.toString()
                    ) as WebSocketMessage;
                    logMessage(
                        'info',
                        chalk.cyan('Received message:'),
                        JSON.stringify(message, null, 2)
                    );
                } catch (error) {
                    logMessage(
                        'error',
                        chalk.red('Failed to parse message:'),
                        data.toString()
                    );
                }
            });

            this.webSocket.on('error', (error) => {
                this.state = WebSocketConnectionState.DISCONNECTED;
                cleanup();
                logMessage(
                    'error',
                    chalk.red('❌ WebSocket error:'),
                    error.message
                );
                reject(error);
            });

            this.webSocket.on('close', () => {
                this.state = WebSocketConnectionState.DISCONNECTED;
                cleanup();
                logMessage(
                    'warn',
                    chalk.yellow(
                        `WebSocket connection closed${
                            this.proxyConfig
                                ? ` using ${this.getProxyUrl()}`
                                : ''
                        }`
                    )
                );
            });
        });
    }

    /**
     * Closes the WebSocket connection and cleans up resources
     */
    public async disconnect(): Promise<void> {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        if (this.webSocket) {
            this.webSocket.close();
            this.webSocket = null;
        }

        this.state = WebSocketConnectionState.DISCONNECTED;
        this.retries = 0; // Reset retries on manual disconnect
        logMessage('info', chalk.yellow('Disconnected from WebSocket'));
    }

    /**
     * Checks if the WebSocket is currently connected
     */
    public isConnected(): boolean {
        return (
            this.state === WebSocketConnectionState.CONNECTED &&
            this.webSocket?.readyState === WebsocketWS.OPEN
        );
    }

    /**
     * Sends a ping message to keep the connection alive
     * Attempts to reconnect if disconnected
     * @throws Error if ping fails or max retries exceeded
     */
    public async ping(): Promise<void> {
        if (!this.webSocket || !this.isConnected()) {
            if (this.retries >= TeneoWebsocketClient.MAX_RETRIES) {
                await this.disconnect();
                throw new Error(
                    chalk.red('❌ Maximum reconnection attempts exceeded')
                );
            }

            logMessage(
                'warn',
                `WebSocket disconnected${
                    this.proxyConfig ? ` using ${this.getProxyUrl()}` : ''
                }, reconnecting...`
            );

            this.retries++;
            await this.connect();
            return;
        }

        const pingData: WebSocketMessage = { type: 'PING' };

        return new Promise((resolve, reject) => {
            this.webSocket!.send(JSON.stringify(pingData), (err) => {
                if (err) {
                    reject(
                        new Error(
                            chalk.red(`❌ Failed to send ping: ${err.message}`)
                        )
                    );
                    return;
                }
                logMessage(
                    'success',
                    chalk.blue(
                        `Ping sent${
                            this.proxyConfig
                                ? ` using ${this.getProxyUrl()}`
                                : ''
                        }`
                    )
                );
                resolve();
            });
        });
    }
}
