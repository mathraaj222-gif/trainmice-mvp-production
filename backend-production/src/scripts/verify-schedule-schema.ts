import prisma from '../config/database';

async function verifyScheduleSchema() {
  try {
    await prisma.$connect();
    console.log('✅ Connected to database\n');

    // Get the table structure information
    const result = await prisma.$queryRaw<Array<{
      Field: string;
      Type: string;
      Null: string;
      Key: string;
      Default: string | null;
      Extra: string;
    }>>`
      DESCRIBE course_schedule
    `;

    console.log('📋 Course Schedule Table Structure:');
    console.log('='.repeat(60));
    
    result.forEach((column) => {
      if (column.Field === 'module_title' || column.Field === 'submodule_title') {
        console.log(`\n${column.Field}:`);
        console.log(`  Type: ${column.Type}`);
        console.log(`  Null: ${column.Null}`);
        console.log(`  Default: ${column.Default || 'NULL'}`);
      }
    });

    // Check if we can query with JSON arrays
    const sampleSchedule = await prisma.courseSchedule.findFirst({
      select: {
        id: true,
        dayNumber: true,
        startTime: true,
        endTime: true,
        moduleTitle: true,
        submoduleTitle: true,
      },
    });

    if (sampleSchedule) {
      console.log('\n📊 Sample Schedule Record:');
      console.log('='.repeat(60));
      console.log(`Day: ${sampleSchedule.dayNumber}`);
      console.log(`Time: ${sampleSchedule.startTime} - ${sampleSchedule.endTime}`);
      console.log(`moduleTitle type: ${Array.isArray(sampleSchedule.moduleTitle) ? 'Array ✅' : typeof sampleSchedule.moduleTitle}`);
      console.log(`moduleTitle value:`, sampleSchedule.moduleTitle);
      console.log(`submoduleTitle type: ${sampleSchedule.submoduleTitle === null ? 'null' : (Array.isArray(sampleSchedule.submoduleTitle) ? 'Array ✅' : typeof sampleSchedule.submoduleTitle)}`);
      console.log(`submoduleTitle value:`, sampleSchedule.submoduleTitle);
    } else {
      console.log('\n⚠️  No schedule records found in database');
    }

    // Count total schedules
    const totalSchedules = await prisma.courseSchedule.count();
    console.log(`\n📈 Total schedule records: ${totalSchedules}`);

    console.log('\n✅ Schema verification complete!');
  } catch (error: any) {
    console.error('❌ Error verifying schema:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
  } finally {
    await prisma.$disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

verifyScheduleSchema();

