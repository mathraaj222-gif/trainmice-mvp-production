import prisma from '../config/database';

async function clearCourses() {
  try {
    await prisma.$connect();
    console.log('✅ Connected to database\n');

    const count = await prisma.course.count();
    console.log(`📊 Found ${count} courses in database\n`);

    if (count === 0) {
      console.log('✅ Courses table is already empty\n');
      await prisma.$disconnect();
      return;
    }

    console.log('🗑️  Deleting all courses...');
    await prisma.course.deleteMany({});
    
    const newCount = await prisma.course.count();
    console.log(`✅ Successfully deleted all courses. Remaining: ${newCount}\n`);

    await prisma.$disconnect();
  } catch (error: any) {
    console.error('❌ Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

clearCourses();

