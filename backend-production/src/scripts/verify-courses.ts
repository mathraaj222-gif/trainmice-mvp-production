import prisma from '../config/database';

async function verifyCourses() {
  try {
    await prisma.$connect();
    console.log('✅ Connected to database\n');

    const courseCount = await prisma.course.count();
    console.log(`📊 Total courses in database: ${courseCount}\n`);

    const statusCounts = await prisma.course.groupBy({
      by: ['status'],
      _count: true,
    });

    console.log('📈 Courses by status:');
    statusCounts.forEach(({ status, _count }) => {
      console.log(`   ${status}: ${_count}`);
    });

    const withTrainer = await prisma.course.count({
      where: { trainerId: { not: null } },
    });
    const withoutTrainer = await prisma.course.count({
      where: { trainerId: null },
    });

    console.log(`\n👨‍🏫 Courses with trainer: ${withTrainer}`);
    console.log(`📚 Courses without trainer: ${withoutTrainer}\n`);

    // Show a few sample courses
    const sampleCourses = await prisma.course.findMany({
      take: 5,
      select: {
        id: true,
        courseCode: true,
        title: true,
        status: true,
        trainerId: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    console.log('📋 Sample courses (latest 5):');
    sampleCourses.forEach((course, idx) => {
      console.log(`   ${idx + 1}. ${course.courseCode || 'No code'} - ${course.title.substring(0, 50)} (${course.status})`);
    });

    await prisma.$disconnect();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

verifyCourses();


