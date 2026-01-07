import prisma from '../config/database';

async function verifyCoursesWithTrainers() {
  try {
    await prisma.$connect();
    console.log('✅ Connected to database\n');

    const totalCourses = await prisma.course.count();
    console.log(`📊 Total courses: ${totalCourses}\n`);

    const coursesWithTrainer = await prisma.course.count({
      where: { trainerId: { not: null } },
    });

    const coursesWithoutTrainer = await prisma.course.count({
      where: { trainerId: null },
    });

    console.log(`👨‍🏫 Courses with trainer_id: ${coursesWithTrainer}`);
    console.log(`📚 Courses without trainer_id: ${coursesWithoutTrainer}\n`);

    // Show sample courses with trainers
    const sampleCoursesWithTrainer = await prisma.course.findMany({
      where: { trainerId: { not: null } },
      take: 10,
      select: {
        id: true,
        courseCode: true,
        title: true,
        trainerId: true,
        trainer: {
          select: {
            fullName: true,
            customTrainerId: true,
          },
        },
      },
    });

    console.log('📋 Sample courses with trainers (first 10):');
    sampleCoursesWithTrainer.forEach((course, idx) => {
      console.log(`   ${idx + 1}. ${course.courseCode || 'No code'} - ${course.title.substring(0, 50)}`);
      console.log(`      Trainer: ${course.trainer?.fullName || 'Unknown'} (${course.trainer?.customTrainerId || 'No ID'})`);
    });

    // Show sample courses without trainers
    const sampleCoursesWithoutTrainer = await prisma.course.findMany({
      where: { trainerId: null },
      take: 5,
      select: {
        courseCode: true,
        title: true,
      },
    });

    if (sampleCoursesWithoutTrainer.length > 0) {
      console.log('\n📋 Sample courses without trainers (first 5):');
      sampleCoursesWithoutTrainer.forEach((course, idx) => {
        console.log(`   ${idx + 1}. ${course.courseCode || 'No code'} - ${course.title.substring(0, 50)}`);
      });
    }

    await prisma.$disconnect();
  } catch (error: any) {
    console.error('❌ Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

verifyCoursesWithTrainers();

