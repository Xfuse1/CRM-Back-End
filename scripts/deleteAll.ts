import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteAll() {
  console.log('🗑️ Deleting all records using transaction...');
  
  try {
    // Use transaction to ensure all deletes happen together
    await prisma.$transaction(async (tx) => {
      // Delete in order (respecting foreign keys)
      const messages = await tx.message.deleteMany({});
      console.log('✅ Deleted messages:', messages.count);
      
      const chats = await tx.chat.deleteMany({});
      console.log('✅ Deleted chats:', chats.count);
      
      const contacts = await tx.contact.deleteMany({});
      console.log('✅ Deleted contacts:', contacts.count);
      
      const sessions = await tx.whatsappSession.deleteMany({});
      console.log('✅ Deleted WhatsApp sessions:', sessions.count);
    }, {
      timeout: 60000, // 60 seconds
    });
    
    console.log('🎉 All records deleted successfully!');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

deleteAll();
