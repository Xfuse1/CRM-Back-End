/**
 * List all chats in the database
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listChats() {
  console.log('📋 Listing all chats...\n');

  const chats = await prisma.chat.findMany({
    include: { 
      contact: { 
        select: { displayName: true, waId: true } 
      } 
    },
    orderBy: { lastMessageAt: 'desc' }
  });

  console.log('All Chats:');
  console.log('='.repeat(60));
  
  for (const chat of chats) {
    console.log(`ID: ${chat.id}`);
    console.log(`Contact: ${chat.contact?.displayName || chat.contact?.waId || 'N/A'}`);
    console.log(`Contact ID: ${chat.contactId}`);
    console.log(`Session: ${chat.sessionId}`);
    console.log(`Last Message: ${chat.lastMessageAt || 'Never'}`);
    console.log('-'.repeat(60));
  }

  console.log(`\nTotal: ${chats.length} chats`);
}

listChats()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
