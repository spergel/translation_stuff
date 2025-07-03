// This file handles environment variables for Firebase Functions
// Firebase Functions use functions.config() instead of process.env

function getEnvVar(key: string): string | undefined {
  // Try process.env first (for local development and other platforms)
  if (process.env[key]) {
    return process.env[key];
  }

  // For Firebase Functions, try to get from functions.config()
  try {
    // Only require functions if we're in a Firebase Functions environment
    if (typeof global !== 'undefined' && global.process?.env?.FUNCTION_TARGET) {
      const functions = require('firebase-functions');
      const config = functions.config();
      
      // Map Firebase config keys to environment variable names
      const configMap: Record<string, string> = {
        'NEXTAUTH_URL': config.nextauth?.url,
        'NEXTAUTH_SECRET': config.nextauth?.secret,
        'GOOGLE_CLIENT_ID': config.google?.client_id,
        'GOOGLE_CLIENT_SECRET': config.google?.client_secret,
        'GOOGLE_API_KEY': config.gemini?.api_key,
      };
      
      return configMap[key];
    }
  } catch (error) {
    // If functions is not available, continue with undefined
  }

  return undefined;
}

// Export environment variables with proper fallbacks
export const env = {
  NEXTAUTH_URL: getEnvVar('NEXTAUTH_URL') || 'https://translation-461511.web.app',
  NEXTAUTH_SECRET: getEnvVar('NEXTAUTH_SECRET'),
  GOOGLE_CLIENT_ID: getEnvVar('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: getEnvVar('GOOGLE_CLIENT_SECRET'),
  GOOGLE_API_KEY: getEnvVar('GOOGLE_API_KEY'),
}; 