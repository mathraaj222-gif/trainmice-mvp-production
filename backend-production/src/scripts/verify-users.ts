import prisma from '../config/database';

async function verifyUsers() {
  try {
    await prisma.$connect();
    console.log('✅ Connected to database\n');

    const userCount = await prisma.user.count();
    console.log(`📊 Total users in database: ${userCount}\n`);

    const trainerCount = await prisma.user.count({
      where: { role: 'TRAINER' },
    });
    console.log(`👨‍🏫 Trainers: ${trainerCount}`);

    const clientCount = await prisma.user.count({
      where: { role: 'CLIENT' },
    });
    console.log(`👤 Clients: ${clientCount}`);

    const adminCount = await prisma.user.count({
      where: { role: 'ADMIN' },
    });
    console.log(`👑 Admins: ${adminCount}\n`);

    // Show a few sample users
    const sampleUsers = await prisma.user.findMany({
      take: 5,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        emailVerified: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    console.log('📋 Sample users (latest 5):');
    sampleUsers.forEach((user, idx) => {
      console.log(`   ${idx + 1}. ${user.email} (${user.role}) - ${user.fullName || 'No name'}`);
    });

    await prisma.$disconnect();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

verifyUsers();


