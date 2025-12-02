/**
 * Script to clean up duplicate chats
 * Keeps only the oldest chat for each contact and merges messages
 * 
 * Run with: npx ts-node scripts/cleanupDuplicateChats.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupDuplicateChats() {
  console.log('🔍 Finding duplicate chats...\n');

  // Find all contacts that have multiple chats
  const duplicates = await prisma.$queryRaw<Array<{ contact_id: string; owner_id: string; count: bigint }>>`
    SELECT "contact_id", "owner_id", COUNT(*) as count
    FROM "chats"
    WHERE "contact_id" IS NOT NULL
    GROUP BY "contact_id", "owner_id"
    HAVING COUNT(*) > 1
  `;

  if (duplicates.length === 0) {
    console.log('✅ No duplicate chats found!');
    return;
  }

  console.log(`Found ${duplicates.length} contacts with duplicate chats\n`);

  let totalMerged = 0;
  let totalDeleted = 0;

  for (const dup of duplicates) {
    console.log(`\n📋 Processing contact: ${dup.contact_id}`);
    
    // Get all chats for this contact, ordered by creation date
    const chats = await prisma.chat.findMany({
      where: {
        contactId: dup.contact_id,
        ownerId: dup.owner_id,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        contact: {
          select: { displayName: true, waId: true }
        }
      }
    });

    const contactName = chats[0]?.contact?.displayName || chats[0]?.contact?.waId || 'Unknown';
    console.log(`   Contact: ${contactName}`);
    console.log(`   Found ${chats.length} chats`);

    // Keep the first (oldest) chat
    const primaryChat = chats[0];
    const duplicateChats = chats.slice(1);

    console.log(`   Keeping chat: ${primaryChat.id}`);
    console.log(`   Merging ${duplicateChats.length} duplicate chats...`);

    // Move all messages from duplicate chats to primary chat
    for (const dupChat of duplicateChats) {
      const messageCount = await prisma.message.count({
        where: { chatId: dupChat.id }
      });

      if (messageCount > 0) {
        await prisma.message.updateMany({
          where: { chatId: dupChat.id },
          data: { chatId: primaryChat.id }
        });
        console.log(`   - Moved ${messageCount} messages from ${dupChat.id}`);
        totalMerged += messageCount;
      }

      // Delete the duplicate chat
      await prisma.chat.delete({
        where: { id: dupChat.id }
      });
      console.log(`   - Deleted duplicate chat: ${dupChat.id}`);
      totalDeleted++;
    }

    // Update the primary chat's lastMessageAt to the latest message
    const latestMessage = await prisma.message.findFirst({
      where: { chatId: primaryChat.id },
      orderBy: { createdAt: 'desc' }
    });

    if (latestMessage) {
      await prisma.chat.update({
        where: { id: primaryChat.id },
        data: { lastMessageAt: latestMessage.createdAt }
      });
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ Cleanup complete!');
  console.log(`   Messages merged: ${totalMerged}`);
  console.log(`   Duplicate chats deleted: ${totalDeleted}`);
}

// Run the cleanup
cleanupDuplicateChats()
  .catch((error) => {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
