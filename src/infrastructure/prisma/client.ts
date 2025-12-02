import { PrismaClient } from '@prisma/client';

// Prevent multiple instances of Prisma Client in development
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const createPrismaClient = () => {
  console.log('[Prisma] Creating new PrismaClient...');
  console.log('[Prisma] DATABASE_URL exists:', !!process.env.DATABASE_URL);
  console.log('[Prisma] NODE_ENV:', process.env.NODE_ENV);
  
  // Log partial URL for debugging (hide password)
  const dbUrl = process.env.DATABASE_URL || '';
  const safeUrl = dbUrl.replace(/:[^:@]+@/, ':***@');
  console.log('[Prisma] Database URL (masked):', safeUrl);
  
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error', 'warn'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
};

export const prisma = global.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Test connection on startup with retry
const connectWithRetry = async (retries = 3, delay = 2000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await prisma.$connect();
      console.log('[Prisma] ✅ Database connected successfully');
      return;
    } catch (error) {
      const err = error as Error;
      console.error(`[Prisma] ❌ Database connection attempt ${i + 1}/${retries} failed:`, err.message);
      if (i < retries - 1) {
        console.log(`[Prisma] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error('[Prisma] ❌ All database connection attempts failed. Server will continue but database operations will fail.');
};

// Run connection test
connectWithRetry();

export default prisma;
