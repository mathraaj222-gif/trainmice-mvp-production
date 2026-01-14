import prisma from '../config/database';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

interface CourseRow {
  id: string;
  trainer_id: string;
  course_code: string;
  title: string;
  certificate: string;
  description: string;
  target_audience: string;
  methodology: string;
  prerequisite: string;
  learning_objectives: string;
  learning_outcomes: string;
  category: string;
  course_mode: string;
  course_type: string;
  status: string;
  created_by_admin: string;
  course_sequence: string;
  'created_by_admin.1': string;
  assessment: string;
  duration_hours: string;
  duration_unit: string;
  hrdc_claimable: string;
  modules: string;
  venue: string;
  price: string;
  fixed_date: string;
  start_date: string;
  'city ': string; // Note: column has trailing space
  state: string;
  created_at: string;
  updated_at: string;
}

function parseJsonField(value: string): any {
  if (!value || value.trim() === '' || value.trim() === '[]') {
    return [];
  }
  
  try {
    // Handle Python-style array strings like "['item1', 'item2']"
    let jsonString = value.trim();
    
    // If it starts with [ and ends with ], try to parse
    if (jsonString.startsWith('[') && jsonString.endsWith(']')) {
      // Replace single quotes with double quotes for JSON compatibility
      jsonString = jsonString.replace(/'/g, '"');
      const parsed = JSON.parse(jsonString);
      return Array.isArray(parsed) ? parsed : [];
    }
    
    // Try parsing as regular JSON
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    // If parsing fails, try to extract items manually
    try {
      const matches = value.match(/'([^']+)'/g);
      if (matches && matches.length > 0) {
        return matches.map(m => m.replace(/'/g, '').trim()).filter(m => m.length > 0);
      }
    } catch {
      // Ignore
    }
    return [];
  }
}

function parseDate(value: string): Date | null {
  if (!value || value.trim() === '' || value.includes(':') || !value.includes('-')) {
    return null;
  }
  
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return null;
    }
    return date;
  } catch {
    return null;
  }
}

function parseBoolean(value: string): boolean {
  if (!value) return false;
  const val = value.trim().toUpperCase();
  return val === '1' || val === 'TRUE' || val === 'YES';
}

function parseNumber(value: string): number | null {
  if (!value || value.trim() === '') return null;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? null : parsed;
}

function parseCourseType(value: string): any {
  if (!value) return null;
  try {
    const parsed = parseJsonField(value);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    // If it's a single string, convert to array
    const trimmed = value.trim().toUpperCase();
    if (trimmed === 'PUBLIC' || trimmed === 'IN_HOUSE' || trimmed === 'INHOUSE') {
      return [trimmed === 'INHOUSE' ? 'IN_HOUSE' : trimmed];
    }
    return null;
  } catch {
    return null;
  }
}

function parseCourseMode(value: string): any {
  if (!value) return null;
  try {
    const parsed = parseJsonField(value);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    // If it's a single string, convert to array
    const trimmed = value.trim().toUpperCase();
    if (trimmed === 'PHYSICAL' || trimmed === 'ONLINE' || trimmed === 'VIRTUAL' || trimmed === 'HYBRID') {
      return [trimmed];
    }
    return null;
  } catch {
    return null;
  }
}

function parseStatus(value: string): 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'DENIED' {
  if (!value) return 'DRAFT';
  const val = value.trim().toUpperCase();
  // Map old statuses to new ones
  if (val === 'ACTIVE' || val === 'COMPLETED') {
    return 'APPROVED';
  }
  if (val === 'CANCELLED') {
    return 'DENIED';
  }
  if (['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'DENIED'].includes(val)) {
    return val as any;
  }
  return 'DRAFT';
}

async function cleanAndImportCourses() {
  try {
    console.log('🚀 Starting course import process from courses_cleaned (1).csv...\n');

    // Step 1: Clean existing data
    console.log('🧹 Cleaning existing courses data...');
    await prisma.$connect();
    const deleteResult = await prisma.course.deleteMany({});
    console.log(`✅ Deleted ${deleteResult.count} existing records\n`);

    // Step 2: Read CSV file
    const csvPath = path.join(__dirname, '../../courses_cleaned (1).csv');
    
    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found at: ${csvPath}`);
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8');

    // Parse CSV with proper handling of multi-line fields
    const records: CourseRow[] = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
      escape: '"',
      quote: '"',
    });

    console.log(`📋 Found ${records.length} course records to import\n`);

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Step 3: Import each course
    for (let i = 0; i < records.length; i++) {
      const course = records[i];
      try {
        // Skip if no title (empty/invalid row)
        if (!course.title || course.title.trim() === '' || course.title.trim().length < 3) {
          console.log(`⏭️  Skipping record ${i + 1}: No title or title too short`);
          skippedCount++;
          continue;
        }

        // Validate and prepare duration_hours (default to 1 if missing)
        let durationHours = 1;
        if (course.duration_hours && course.duration_hours.trim() !== '') {
          const parsed = parseInt(course.duration_hours);
          if (!isNaN(parsed) && parsed > 0) {
            durationHours = parsed;
          }
        }

        // Check if trainer exists in Trainer table (if trainer_id is provided)
        let trainerId: string | null = null;
        if (course.trainer_id && course.trainer_id.trim() !== '' && course.trainer_id.trim() !== '0') {
          const trainerIdCandidate = course.trainer_id.trim();
          if (uuidRegex.test(trainerIdCandidate)) {
            try {
              const trainer = await prisma.trainer.findUnique({
                where: { 
                  id: trainerIdCandidate
                }
              });
              
              if (trainer) {
                trainerId = trainerIdCandidate;
              }
            } catch (e) {
              trainerId = null;
            }
          }
        }

        // Helper to truncate string to max length
        const truncate = (str: string | null | undefined, maxLen: number): string | null => {
          if (!str) return null;
          const trimmed = str.trim();
          return trimmed.length > maxLen ? trimmed.substring(0, maxLen) : trimmed;
        };

        // Prepare data
        const courseData: any = {
          id: course.id && course.id.trim() && uuidRegex.test(course.id.trim()) ? course.id.trim() : undefined,
          courseCode: truncate(course.course_code, 255),
          trainerId: trainerId || null,
          createdBy: trainerId || null,
          title: truncate(course.title, 500) || 'Untitled Course',
          description: course.description && course.description.trim() ? course.description.trim() : null,
          learningObjectives: parseJsonField(course.learning_objectives),
          learningOutcomes: parseJsonField(course.learning_outcomes),
          targetAudience: course.target_audience && course.target_audience.trim() ? course.target_audience.trim() : null,
          methodology: course.methodology && course.methodology.trim() ? course.methodology.trim() : null,
          prerequisite: course.prerequisite && course.prerequisite.trim() ? course.prerequisite.trim() : null,
          certificate: truncate(course.certificate, 255),
          assessment: parseBoolean(course.assessment),
          durationHours: durationHours,
          durationUnit: truncate(course.duration_unit, 50)?.toLowerCase() || 'hours',
          modules: parseJsonField(course.modules),
          venue: course.venue && course.venue.trim() ? course.venue.trim() : null,
          price: course.price ? parseNumber(course.price) : null,
          fixedDate: parseDate(course.fixed_date),
          startDate: parseDate(course.start_date),
          endDate: null,
          category: course.category && course.category.trim() ? course.category.trim() : null,
          city: course['city '] ? course['city '].trim() : null, // Handle column with trailing space
          state: course.state && course.state.trim() ? course.state.trim() : null,
          hrdcClaimable: parseBoolean(course.hrdc_claimable),
          brochureUrl: null,
          courseSequence: course.course_sequence ? parseInt(course.course_sequence) : null,
          status: parseStatus(course.status),
          createdByAdmin: parseBoolean(course.created_by_admin || course['created_by_admin.1']),
          courseType: parseCourseType(course.course_type),
          courseMode: parseCourseMode(course.course_mode),
        };

        // Remove id if it's empty or invalid to let Prisma generate it
        if (!courseData.id || !uuidRegex.test(courseData.id)) {
          delete courseData.id;
        }

        // Use upsert to handle duplicates (by course_code if provided, otherwise by id)
        if (courseData.courseCode) {
          await prisma.course.upsert({
            where: { courseCode: courseData.courseCode },
            update: courseData,
            create: courseData
          });
        } else if (courseData.id) {
          await prisma.course.upsert({
            where: { id: courseData.id },
            update: courseData,
            create: courseData
          });
        } else {
          // No course_code or id, just create
          await prisma.course.create({
            data: courseData
          });
        }

        if ((i + 1) % 50 === 0) {
          console.log(`✅ Processed ${i + 1}/${records.length} records...`);
        }
        successCount++;

      } catch (error: any) {
        const titlePreview = course.title ? (course.title.length > 50 ? course.title.substring(0, 50) + '...' : course.title) : 'Unknown';
        const errorMsg = `Failed to import record ${i + 1} "${titlePreview}": ${error.message}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
        errorCount++;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 IMPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successfully imported: ${successCount}`);
    console.log(`⏭️  Skipped (invalid data): ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log('='.repeat(60) + '\n');

    if (errors.length > 0 && errors.length <= 20) {
      console.log('❌ Error details:');
      errors.forEach(error => console.log(`   - ${error}`));
      console.log('');
    } else if (errors.length > 20) {
      console.log(`❌ ${errors.length} errors occurred (showing first 20):`);
      errors.slice(0, 20).forEach(error => console.log(`   - ${error}`));
      console.log('');
    }

    await prisma.$disconnect();
    console.log('✅ Import process completed!\n');

  } catch (error: any) {
    console.error('❌ Fatal error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Run the import
cleanAndImportCourses()
  .then(() => {
    console.log('✨ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });

