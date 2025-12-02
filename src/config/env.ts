import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface Config {
  port: number;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  jwtSecret: string;
  clientOrigin: string;
}

function loadConfig(): Config {
  const requiredEnvVars = [
    'PORT',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'JWT_SECRET',
    'CLIENT_ORIGIN',
  ];

  const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}\n` +
        'Please check your .env file and ensure all required variables are set.'
    );
  }

  return {
    port: parseInt(process.env.PORT!, 10),
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    jwtSecret: process.env.JWT_SECRET!,
    clientOrigin: process.env.CLIENT_ORIGIN!,
  };
}

export const config = loadConfig();
