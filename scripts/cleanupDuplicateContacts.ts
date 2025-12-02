/**
 * Script to clean up duplicate contacts and chats
 * Merges contacts with same phone number (regardless of format)
 * 
 * Run with: npx ts-node scripts/cleanupDuplicateContacts.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Extract phone number from any format
function extractPhoneNumber(waId: string | null): string | null {
  if (!waId) return null;
  // Remove WhatsApp suffixes (@s.whatsapp.net, @c.us) and + prefix
  return waId
    .replace(/@(s\.whatsapp\.net|c\.us)$/, '')
    .replace(/^\+/, '')
    .trim();
}

async function cleanupDuplicates() {
  console.log('🔍 Analyzing contacts for duplicates...\n');

  // Get all contacts
  const contacts = await prisma.contact.findMany({
    include: {
      chats: true,
    },
  });

  console.log(`Total contacts: ${contacts.length}\n`);

  // Group contacts by normalized phone number
  const contactsByPhone: Map<string, typeof contacts> = new Map();

  for (const contact of contacts) {
    const phone = extractPhoneNumber(contact.waId);
    if (!phone) continue;

    if (!contactsByPhone.has(phone)) {
      contactsByPhone.set(phone, []);
    }
    contactsByPhone.get(phone)!.push(contact);
  }

  // Find duplicates
  const duplicateGroups: Array<{
    phone: string;
    contacts: typeof contacts;
  }> = [];

  for (const [phone, contactGroup] of contactsByPhone) {
    if (contactGroup.length > 1) {
      duplicateGroups.push({ phone, contacts: contactGroup });
    }
  }

  console.log(`Found ${duplicateGroups.length} phone numbers with duplicate contacts\n`);

  if (duplicateGroups.length === 0) {
    console.log('✅ No duplicates found!');
    return;
  }

  let totalChatsMerged = 0;
  let totalContactsDeleted = 0;
  let totalMessagesMoved = 0;

  for (const group of duplicateGroups) {
    console.log(`\n📱 Processing phone: ${group.phone}`);
    console.log(`   Found ${group.contacts.length} duplicate contacts`);

    // Sort by: has displayName first, then by creation date
    const sortedContacts = group.contacts.sort((a, b) => {
      // Prefer contact with displayName
      if (a.displayName && !b.displayName) return -1;
      if (!a.displayName && b.displayName) return 1;
      // Then prefer @s.whatsapp.net format (more standard)
      if (a.waId?.includes('@') && !b.waId?.includes('@')) return -1;
      if (!a.waId?.includes('@') && b.waId?.includes('@')) return 1;
      // Then by creation date
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const primaryContact = sortedContacts[0];
    const duplicateContacts = sortedContacts.slice(1);

    console.log(`   Primary contact: ${primaryContact.id} (${primaryContact.displayName || primaryContact.waId})`);

    // Merge all chats from duplicate contacts to primary contact's chat
    // First, find or create primary chat
    let primaryChat = await prisma.chat.findFirst({
      where: { contactId: primaryContact.id },
      orderBy: { lastMessageAt: 'desc' },
    });

    for (const dupContact of duplicateContacts) {
      console.log(`   Merging contact: ${dupContact.id} (${dupContact.displayName || dupContact.waId})`);

      // Get all chats for this duplicate contact
      const dupChats = await prisma.chat.findMany({
        where: { contactId: dupContact.id },
      });

      for (const dupChat of dupChats) {
        // Count messages
        const messageCount = await prisma.message.count({
          where: { chatId: dupChat.id },
        });

        if (messageCount > 0) {
          if (primaryChat) {
            // Move messages to primary chat
            await prisma.message.updateMany({
              where: { chatId: dupChat.id },
              data: { chatId: primaryChat.id },
            });
            console.log(`     Moved ${messageCount} messages from chat ${dupChat.id}`);
            totalMessagesMoved += messageCount;
            
            // Delete the empty duplicate chat
            await prisma.chat.delete({
              where: { id: dupChat.id },
            });
            totalChatsMerged++;
          } else {
            // This is the first chat with messages - keep it as primary
            // First update the contact reference, then reassign
            primaryChat = await prisma.chat.update({
              where: { id: dupChat.id },
              data: { contactId: primaryContact.id },
            });
            console.log(`     Adopted chat ${dupChat.id} as primary (${messageCount} messages)`);
            continue;
          }
        } else {
          // Delete the duplicate chat (no messages)
          await prisma.chat.delete({
            where: { id: dupChat.id },
          });
          totalChatsMerged++;
        }
      }

      // Delete the duplicate contact
      await prisma.contact.delete({
        where: { id: dupContact.id },
      });
      totalContactsDeleted++;
      console.log(`     Deleted duplicate contact`);
    }

    // Update primary chat's lastMessageAt
    if (primaryChat) {
      const latestMessage = await prisma.message.findFirst({
        where: { chatId: primaryChat.id },
        orderBy: { createdAt: 'desc' },
      });

      if (latestMessage) {
        await prisma.chat.update({
          where: { id: primaryChat.id },
          data: { lastMessageAt: latestMessage.createdAt },
        });
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Cleanup complete!');
  console.log(`   Duplicate contacts deleted: ${totalContactsDeleted}`);
  console.log(`   Chats merged/deleted: ${totalChatsMerged}`);
  console.log(`   Messages moved: ${totalMessagesMoved}`);
}

// Run the cleanup
cleanupDuplicates()
  .catch((error) => {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
