/**
 * WebSocket secure endpoint URL
 */
export const WSS_ENDPOINT = 'wss://secure.ws.teneo.pro';
export const WSS_ENDPOINT_VERSION = 'v0.2';

/**
 * State of the WebSocket connection
 */
export enum WebSocketConnectionState {
    CONNECTED = 'CONNECTED',
    CONNECTING = 'CONNECTING',
    DISCONNECTED = 'DISCONNECTED',
}

/**
 * Authentication configuration for proxy
 */
export interface ProxyAuth {
    username: string;
    password: string;
}

/**
 * Proxy server configuration
 */
export interface ProxyConfig {
    hostname: string;
    port: number; // Valid port range: 0-65535
    auth?: ProxyAuth;
}

/**
 * Interval
 */
export const INTERVAL = 10000;
export const MAX_PORT = 65535;
export const MIN_PORT = 1;

/**
 * WebSocket message format
 */
export type WebSocketMessage = {
    type: string;
    [key: string]: unknown;
};
