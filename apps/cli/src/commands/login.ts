import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { Command } from 'commander';

import { saveCredentials } from '../auth/credentials';
import { log } from '../utils/logger';

const CLIENT_ID = 'lobehub-cli';
const SCOPES = 'openid profile email offline_access';

interface LoginOptions {
  server: string;
}

interface DeviceAuthResponse {
  device_code: string;
  expires_in: number;
  interval: number;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
}

interface TokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  token_type: string;
}

interface TokenErrorResponse {
  error: string;
  error_description?: string;
}

async function parseJsonResponse<T>(res: Response, endpoint: string): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    const contentType = res.headers.get('content-type') || 'unknown';
    throw new Error(
      `Expected JSON from ${endpoint}, got non-JSON response (status=${res.status}, content-type=${contentType}).`,
    );
  }
}

export function registerLoginCommand(program: Command) {
  program
    .command('login')
    .description('Log in to LobeHub via browser (Device Code Flow)')
    .option('--server <url>', 'LobeHub server URL', 'https://app.lobehub.com')
    .action(async (options: LoginOptions) => {
      const serverUrl = options.server.replace(/\/$/, '');

      log.info('Starting login...');

      // Step 1: Request device code
      let deviceAuth: DeviceAuthResponse;
      try {
        const res = await fetch(`${serverUrl}/oidc/device/auth`, {
          body: new URLSearchParams({
            client_id: CLIENT_ID,
            resource: 'urn:lobehub:chat',
            scope: SCOPES,
          }),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          method: 'POST',
        });

        if (!res.ok) {
          const text = await res.text();
          log.error(`Failed to start device authorization: ${res.status} ${text}`);
          process.exit(1);
        }

        deviceAuth = await parseJsonResponse<DeviceAuthResponse>(res, '/oidc/device/auth');
      } catch (error: any) {
        log.error(`Failed to reach server: ${error.message}`);
        log.error(`Make sure ${serverUrl} is reachable.`);
        process.exit(1);
      }

      // Step 2: Show user code and open browser
      const verifyUrl = deviceAuth.verification_uri_complete || deviceAuth.verification_uri;

      log.info('');
      log.info('  Open this URL in your browser:');
      log.info(`  ${verifyUrl}`);
      log.info('');
      log.info(`  Enter code: ${deviceAuth.user_code}`);
      log.info('');

      // Try to open browser automatically
      const opened = await openBrowser(verifyUrl);
      if (!opened) {
        log.warn('Could not open browser automatically.');
      }

      log.info('Waiting for authorization...');

      // Step 3: Poll for token
      const interval = (deviceAuth.interval || 5) * 1000;
      const expiresAt = Date.now() + deviceAuth.expires_in * 1000;

      let pollInterval = interval;

      while (Date.now() < expiresAt) {
        await sleep(pollInterval);

        try {
          const res = await fetch(`${serverUrl}/oidc/token`, {
            body: new URLSearchParams({
              client_id: CLIENT_ID,
              device_code: deviceAuth.device_code,
              grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            method: 'POST',
          });

          const body = await parseJsonResponse<TokenResponse & TokenErrorResponse>(
            res,
            '/oidc/token',
          );

          // Check body for error field — some proxies may return 200 for error responses
          if (body.error) {
            switch (body.error) {
              case 'authorization_pending': {
                // Keep polling
                break;
              }
              case 'slow_down': {
                pollInterval += 5000;
                break;
              }
              case 'access_denied': {
                log.error('Authorization denied by user.');
                process.exit(1);
                break;
              }
              case 'expired_token': {
                log.error('Device code expired. Please run login again.');
                process.exit(1);
                break;
              }
              default: {
                log.error(`Authorization error: ${body.error} - ${body.error_description || ''}`);
                process.exit(1);
              }
            }
          } else if (body.access_token) {
            saveCredentials({
              accessToken: body.access_token,
              expiresAt: body.expires_in
                ? Math.floor(Date.now() / 1000) + body.expires_in
                : undefined,
              refreshToken: body.refresh_token,
              serverUrl,
            });

            log.info('Login successful! Credentials saved.');
            return;
          }
        } catch {
          // Network error — keep retrying
        }
      }

      log.error('Device code expired. Please run login again.');
      process.exit(1);
    });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openBrowser(url: string): Promise<boolean> {
  const commandExists = (cmd: string): boolean => {
    const pathValue = process.env.PATH || '';
    if (!pathValue) return false;

    return pathValue
      .split(path.delimiter)
      .filter(Boolean)
      .some((entry) => fs.existsSync(path.join(entry, cmd)));
  };

  const runCommand = (cmd: string, args: string[]) =>
    new Promise<boolean>((resolve) => {
      if (!commandExists(cmd)) {
        log.debug(`Could not open browser automatically: command not found in PATH: ${cmd}`);
        resolve(false);
        return;
      }

      try {
        execFile(cmd, args, (err) => {
          if (err) {
            log.debug(`Could not open browser automatically: ${err.message}`);
            resolve(false);
            return;
          }
          resolve(true);
        });
      } catch (error: any) {
        log.debug(`Could not open browser automatically: ${error?.message || String(error)}`);
        resolve(false);
      }
    });

  if (process.platform === 'win32') {
    // On Windows, use rundll32 to invoke the default URL handler without a shell.
    return runCommand('rundll32', ['url.dll,FileProtocolHandler', url]);
  }

  const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
  return runCommand(cmd, [url]);
}
