import prisma from '../config/database';

async function checkTrainerRecords() {
  try {
    await prisma.$connect();
    console.log('✅ Connected to database\n');

    const trainerUsers = await prisma.user.findMany({
      where: { role: 'TRAINER' },
      select: { id: true, email: true, fullName: true },
    });

    const trainers = await prisma.trainer.findMany({
      select: { id: true },
    });

    const trainerIds = new Set(trainers.map(t => t.id));
    const missing = trainerUsers.filter(u => !trainerIds.has(u.id));

    console.log(`📊 Total TRAINER users: ${trainerUsers.length}`);
    console.log(`📊 Total Trainer records: ${trainers.length}`);
    console.log(`⚠️  Missing Trainer records: ${missing.length}\n`);

    if (missing.length > 0) {
      console.log('Sample missing Trainer records:');
      missing.slice(0, 10).forEach((u, idx) => {
        console.log(`   ${idx + 1}. ${u.email} (${u.id})`);
      });
    }

    await prisma.$disconnect();
  } catch (error: any) {
    console.error('❌ Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

checkTrainerRecords();


