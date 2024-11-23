import fs from 'node:fs';
import { TeneoWebsocketClient } from './src/ping';
import { createProxyConfig, logMessage, prompt } from './src/utils';
import { INTERVAL } from './src/types';
import chalk from 'chalk';

/**
 * Handles WebSocket client connection with a single proxy configuration
 * @param userId - User identifier for the connection
 * @param proxyConfig - Optional proxy configuration
 */
async function handleSingleClient(
    userId: string,
    proxyConfig: any = null
): Promise<void> {
    const client = new TeneoWebsocketClient(userId, proxyConfig);
    await client.connect();

    const intervalId = setInterval(async () => {
        try {
            await client.ping();
        } catch (error) {
            logMessage('error', 'An error occurred', error as string);
            await client.disconnect();
            clearInterval(intervalId);
        }
    }, INTERVAL);
}

/**
 * Loads and validates proxy configurations from a file
 * @param proxyFilePath - Path to the proxy configuration file
 * @returns Array of proxy configurations
 */
async function loadProxyConfigurations(proxyFilePath: string): Promise<any[]> {
    const fileContent = fs.readFileSync(proxyFilePath, {
        encoding: 'utf-8',
        flag: 'r',
    });
    const proxies = fileContent.split('\n');
    logMessage('info', `Loaded ${proxies.length} proxies`);

    return await Promise.all(proxies.map((proxy) => createProxyConfig(proxy)));
}

/**
 * Prompts for and validates user input
 * @returns Object containing validated user inputs
 */
async function getUserInput() {
    // Get and validate user ID
    const userId = await prompt('🆔 Enter your user ID: ');
    if (!userId) {
        throw new Error('User ID cannot be empty');
    }

    // Get and validate proxy usage preference
    const useProxy = await prompt('🔄 Use proxies? (y/n): ');
    if (useProxy !== 'y' && useProxy !== 'n') {
        throw new Error('Invalid input');
    }

    return {
        userId,
        useProxy: useProxy.toLowerCase() === 'y',
    };
}

/**
 * Main program execution
 */
async function main() {
    try {
        // Get user inputs
        const { userId, useProxy } = await getUserInput();

        if (useProxy) {
            // Handle proxy-based connections
            const proxyFilePath = await prompt(
                '📂 Enter the path to the proxy file: '
            );
            const proxyConfigs = await loadProxyConfigurations(proxyFilePath);

            // Start a client for each proxy configuration
            for (const proxyConfig of proxyConfigs) {
                try {
                    await handleSingleClient(userId, proxyConfig);
                } catch (error) {
                    logMessage('error', 'An error occurred', error as string);
                }
            }
        } else {
            // Handle direct connection without proxy
            await handleSingleClient(userId);
        }
    } catch (error) {
        console.error(chalk.red('❌ An error occurred:'), error);
        process.exit(1);
    }
}

// Program entry point
console.log(chalk.blue('🚀 Starting program...'));
main();
