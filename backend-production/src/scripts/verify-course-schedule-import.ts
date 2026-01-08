import prisma from '../config/database';

async function verifyCourseScheduleImport() {
  try {
    await prisma.$connect();
    console.log('✅ Connected to database\n');

    const totalRecords = await prisma.courseSchedule.count();
    console.log(`📊 Total course schedule records: ${totalRecords}\n`);

    // Get sample records to verify array format
    const samples = await prisma.courseSchedule.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        courseId: true,
        dayNumber: true,
        startTime: true,
        endTime: true,
        moduleTitle: true,
        submoduleTitle: true,
        durationMinutes: true,
      },
    });

    console.log('📋 Sample Records (Latest 5):');
    console.log('='.repeat(60));
    
    samples.forEach((record, index) => {
      console.log(`\n${index + 1}. Record ID: ${record.id}`);
      console.log(`   Course ID: ${record.courseId}`);
      console.log(`   Day: ${record.dayNumber}, Time: ${record.startTime} - ${record.endTime}`);
      console.log(`   Duration: ${record.durationMinutes} minutes`);
      console.log(`   moduleTitle type: ${Array.isArray(record.moduleTitle) ? 'Array ✅' : typeof record.moduleTitle}`);
      console.log(`   moduleTitle:`, Array.isArray(record.moduleTitle) ? JSON.stringify(record.moduleTitle) : record.moduleTitle);
      console.log(`   submoduleTitle type: ${record.submoduleTitle === null || record.submoduleTitle === undefined ? 'null/undefined' : (Array.isArray(record.submoduleTitle) ? 'Array ✅' : typeof record.submoduleTitle)}`);
      if (record.submoduleTitle && Array.isArray(record.submoduleTitle)) {
        console.log(`   submoduleTitle (first 2):`, JSON.stringify(record.submoduleTitle.slice(0, 2)));
        if (record.submoduleTitle.length > 2) {
          console.log(`   ... and ${record.submoduleTitle.length - 2} more`);
        }
      }
    });

    // Count by course
    const schedulesByCourse = await prisma.courseSchedule.groupBy({
      by: ['courseId'],
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: 10,
    });

    console.log('\n📈 Top 10 Courses by Schedule Entries:');
    console.log('='.repeat(60));
    for (const item of schedulesByCourse) {
      const course = await prisma.course.findUnique({
        where: { id: item.courseId },
        select: { title: true },
      });
      console.log(`   ${course?.title || 'Unknown Course'} (${item.courseId.substring(0, 8)}...): ${item._count.id} entries`);
    }

    // Verify array format
    // Since moduleTitle is a required Json field, we can just find any record
    const arrayFormatCheck = await prisma.courseSchedule.findFirst({
      select: {
        moduleTitle: true,
        submoduleTitle: true,
      },
    });

    if (arrayFormatCheck) {
      const isModuleArray = Array.isArray(arrayFormatCheck.moduleTitle);
      const isSubmoduleArray = arrayFormatCheck.submoduleTitle === null || arrayFormatCheck.submoduleTitle === undefined || Array.isArray(arrayFormatCheck.submoduleTitle);
      
      console.log('\n✅ Format Verification:');
      console.log('='.repeat(60));
      console.log(`   moduleTitle is array: ${isModuleArray ? '✅ YES' : '❌ NO'}`);
      console.log(`   submoduleTitle is array/null: ${isSubmoduleArray ? '✅ YES' : '❌ NO'}`);
    }

    console.log('\n✅ Verification complete!');
  } catch (error: any) {
    console.error('❌ Error verifying import:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
  } finally {
    await prisma.$disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

verifyCourseScheduleImport();


