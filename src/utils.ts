import { HttpsProxyAgent } from 'https-proxy-agent';
import { MAX_PORT, MIN_PORT, ProxyConfig } from './types';
import chalk from 'chalk';
import readline from 'node:readline';

// Log type definition with emoji and color configuration
type LogConfig = {
    emoji: string;
    color: (text: string) => string;
};

const LOG_TYPES: Record<'info' | 'warn' | 'error' | 'success', LogConfig> = {
    info: {
        emoji: '❕',
        color: chalk.blue,
    },
    warn: {
        emoji: '⚠️',
        color: chalk.yellow,
    },
    error: {
        emoji: '❌',
        color: chalk.red,
    },
    success: {
        emoji: '✅',
        color: chalk.green,
    },
};

class ProxyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ProxyError';
    }
}

/**
 * Closes the readline interface
 */
export const closeReadline = (): void => {
    rl.close();
};

/**
 * Enhanced logging function with timestamps, colors, and emojis
 * @param type - Log type (info, warn, error, success)
 * @param message - Message to log
 * @param details - Optional details to append
 */
export const logMessage = (
    type: keyof typeof LOG_TYPES,
    message: string,
    details?: string
): void => {
    const timestamp = new Date().toLocaleTimeString();
    const { emoji, color } = LOG_TYPES[type];

    const formattedMessage = [
        chalk.gray(`[${timestamp}]`),
        emoji,
        color(message),
        details ? chalk.gray(`(${details})`) : '',
    ]
        .join(' ')
        .trim();

    console.log(formattedMessage);
};

/**
 * Creates a ProxyConfig from a proxy URL string
 * @param proxyUrl - URL in format: protocol://[username:password@]hostname:port
 * @throws {ProxyError} When the proxy URL is invalid
 * @returns {Promise<ProxyConfig>} Parsed proxy configuration
 */
export const createProxyConfig = async (
    proxyUrl: string
): Promise<ProxyConfig> => {
    try {
        if (!proxyUrl) {
            throw new ProxyError('Proxy URL cannot be empty');
        }

        const url = new URL(proxyUrl);

        const auth =
            url.username && url.password
                ? {
                      username: decodeURIComponent(url.username),
                      password: decodeURIComponent(url.password),
                  }
                : undefined;

        if (!url.hostname) {
            throw new ProxyError('Invalid proxy URL: missing hostname');
        }

        const port = Number(url.port);
        if (!url.port || isNaN(port)) {
            throw new ProxyError('Invalid proxy URL: missing or invalid port');
        }

        if (port > MAX_PORT || port < MIN_PORT) {
            throw new ProxyError(
                `Invalid proxy URL: port must be between ${MIN_PORT} and ${MAX_PORT}`
            );
        }

        if (!url.protocol || !['http:', 'https:'].includes(url.protocol)) {
            throw new ProxyError(
                'Invalid proxy URL: protocol must be http or https'
            );
        }

        return {
            hostname: url.hostname,
            port,
            auth,
        };
    } catch (error) {
        if (error instanceof ProxyError) {
            throw error;
        }
        throw new ProxyError(`Invalid proxy URL: ${error}`);
    }
};

/**
 * Creates an HTTPS proxy agent from a proxy configuration
 * @param proxyConfig - Proxy configuration object
 * @throws {ProxyError} When the proxy configuration is invalid
 * @returns {Promise<HttpsProxyAgent>} Configured proxy agent
 */
export const createProxyAgent = async (
    proxyConfig: ProxyConfig
): Promise<HttpsProxyAgent<string>> => {
    try {
        if (!proxyConfig.hostname || !proxyConfig.port) {
            throw new ProxyError(
                'Invalid proxy configuration: missing required fields'
            );
        }

        const proxyUrl = proxyConfig.auth
            ? `http://${encodeURIComponent(
                  proxyConfig.auth.username
              )}:${encodeURIComponent(proxyConfig.auth.password)}@${
                  proxyConfig.hostname
              }:${proxyConfig.port}`
            : `http://${proxyConfig.hostname}:${proxyConfig.port}`;

        return new HttpsProxyAgent(proxyUrl);
    } catch (error) {
        throw new ProxyError(`Failed to create proxy agent: ${error}`);
    }
};

// Helper functions for common prompts
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

export async function prompt(message: string): Promise<string> {
    return new Promise<string>((resolve) => {
        rl.question(message, (answer) => {
            resolve(answer.trim());
        });
    });
}
