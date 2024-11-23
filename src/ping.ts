import {
    ProxyConfig,
    WebSocketConnectionState,
    WSS_ENDPOINT,
    WSS_ENDPOINT_VERSION,
} from './types';
import { HttpsProxyAgent } from 'https-proxy-agent';
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

    // Maximum number of reconnection attempts
    private static readonly MAX_RETRIES = 5;

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
        this.userId = userId;
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
        return `${WSS_ENDPOINT}/websocket?userId=${encodeURIComponent(
            this.userId
        )}&version=${encodeURIComponent(WSS_ENDPOINT_VERSION)}`;
    }

    /**
     * Formats the proxy URL for logging purposes, masking credentials
     */
    private getProxyUrl(): string {
        return this.proxyConfig?.auth
            ? `${this.proxyConfig.auth.username}:***@${this.proxyConfig.hostname}:${this.proxyConfig.port}`
            : `${this.proxyConfig?.hostname}:${this.proxyConfig?.port}`;
    }

    /**
     * Establishes a WebSocket connection with optional proxy support
     * @throws Error if connection fails
     */
    public async connect(): Promise<void> {
        // Skip if already connected
        if (this.state === WebSocketConnectionState.CONNECTED) {
            return;
        }

        // Handle connection in progress
        if (this.state === WebSocketConnectionState.CONNECTING) {
            logMessage(
                'warn',
                'WebSocket connection already in progress' +
                    (this.proxyConfig ? ' using ' + this.getProxyUrl() : '') +
                    ', waiting...'
            );
        }

        try {
            if (!this.proxyConfig) {
                // Direct connection without proxy
                this.webSocket = new WebsocketWS(this.getWssUrl());
                await this.setupWebSocketListeners();
            } else {
                // Connection with proxy
                this.state = WebSocketConnectionState.CONNECTING;
                logMessage(
                    'info',
                    chalk.yellow('Connecting using proxy ' + this.getProxyUrl())
                );

                const agent = await createProxyAgent(this.proxyConfig);
                const wssUrl = this.getWssUrl();

                this.webSocket = new WebsocketWS(wssUrl, {
                    agent: agent,
                });

                await this.setupWebSocketListeners();
            }

            logMessage(
                'success',
                chalk.green('Connected to WebSocket') +
                    (this.proxyConfig ? ' using ' + this.getProxyUrl() : '')
            );
        } catch (error) {
            this.state = WebSocketConnectionState.DISCONNECTED;
            throw new Error(chalk.red(`❌ Failed to connect: ${error}`));
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

            // Connection opened handler
            this.webSocket.on('open', () => {
                this.state = WebSocketConnectionState.CONNECTED;
                logMessage('info', chalk.green('WebSocket connection opened'));
                resolve();
            });

            // Message received handler
            this.webSocket.on('message', (data: Buffer) => {
                const message = data.toString();
                logMessage('info', chalk.cyan('Received message:'), message);
            });

            // Error handler
            this.webSocket.on('error', (error) => {
                this.state = WebSocketConnectionState.DISCONNECTED;
                logMessage(
                    'error',
                    chalk.red('❌ WebSocket error:'),
                    error.message
                );
                reject(error);
            });

            // Connection closed handler
            this.webSocket.on('close', () => {
                this.state = WebSocketConnectionState.DISCONNECTED;
                logMessage(
                    'warn',
                    chalk.yellow(
                        'WebSocket connection closed ' +
                            (this.proxyConfig
                                ? ' using ' + this.getProxyUrl()
                                : '')
                    )
                );
            });
        });
    }

    /**
     * Closes the WebSocket connection
     */
    public async disconnect(): Promise<void> {
        if (this.webSocket) {
            this.webSocket.close();
            this.webSocket = null;
        }
        this.state = WebSocketConnectionState.DISCONNECTED;
        logMessage('info', chalk.yellow('Disconnected from WebSocket'));
    }

    /**
     * Checks if the WebSocket is currently connected
     */
    public isConnected(): boolean {
        return this.state === WebSocketConnectionState.CONNECTED;
    }

    /**
     * Sends a ping message to keep the connection alive
     * Attempts to reconnect if disconnected
     * @throws Error if ping fails or max retries exceeded
     */
    public async ping(): Promise<void> {
        const pingdata = JSON.stringify({
            type: 'PING',
        });

        // Send ping message
        if (!this.webSocket) {
            throw new Error(chalk.red('❌ WebSocket instance not initialized'));
        }

        // Handle disconnected state
        if (!this.isConnected()) {
            if (this.retries >= TeneoWebsocketClient.MAX_RETRIES) {
                this.disconnect();
                throw new Error(
                    chalk.red('❌ WebSocket disconnected too many times')
                );
            }
            logMessage(
                'warn',
                'WebSocket disconnected' +
                    (this.proxyConfig ? ' using ' + this.getProxyUrl() : '') +
                    ', reconnecting...'
            );
            await this.connect();
            this.retries++;
            return;
        }

        this.webSocket.send(pingdata, (err) => {
            if (err) {
                throw new Error(chalk.red(`❌ Failed to send ping: ${err}`));
            }
            logMessage(
                'success',
                chalk.blue(
                    `Ping sent${
                        this.proxyConfig ? ` using ${this.getProxyUrl()}` : ''
                    }`
                )
            );
        });
    }
}
