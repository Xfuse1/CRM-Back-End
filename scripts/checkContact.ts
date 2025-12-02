import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const contacts = await prisma.contact.findMany({
    where: { waId: { contains: '201068298970' } },
    include: { chats: true }
  });
  
  console.log('Contacts for 201068298970:');
  for (const c of contacts) {
    console.log(`  Contact ID: ${c.id}`);
    console.log(`  waId: ${c.waId}`);
    console.log(`  displayName: ${c.displayName}`);
    console.log(`  Chats: ${c.chats.map(ch => ch.id).join(', ')}`);
    console.log('---');
  }
}

check().finally(() => prisma.$disconnect());
