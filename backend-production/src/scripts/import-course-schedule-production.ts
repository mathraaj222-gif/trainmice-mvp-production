import prisma from '../config/database';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

interface CourseScheduleRow {
  id: string;
  course_id: string;
  day_number: string;
  start_time: string;
  end_time: string;
  module_title: string;
  submodule_title: string;
  duration_minutes: string;
  created_at: string;
}

/**
 * Convert time format from "9:00 a.m" or "11.00 a.m" or "2.00 p.m" to "09:00" or "14:00"
 */
function normalizeTime(timeStr: string): string {
  if (!timeStr || timeStr.trim() === '' || timeStr.trim().toUpperCase() === 'NULL') {
    return '09:00'; // Default to 9:00 AM
  }

  const cleaned = timeStr.trim().replace(/\./g, ':'); // Replace dots with colons
  const timeMatch = cleaned.match(/(\d{1,2}):?(\d{2})?\s*(a\.?m\.?|p\.?m\.?)/i);
  
  if (!timeMatch) {
    // Try to parse as HH:MM format
    const simpleMatch = cleaned.match(/(\d{1,2}):(\d{2})/);
    if (simpleMatch) {
      let hours = parseInt(simpleMatch[1], 10);
      const minutes = simpleMatch[2] || '00';
      return `${String(hours).padStart(2, '0')}:${minutes.padStart(2, '0')}`;
    }
    return '09:00'; // Default
  }

  let hours = parseInt(timeMatch[1], 10);
  const minutes = timeMatch[2] || '00';
  const period = timeMatch[3].toLowerCase();

  // Convert to 24-hour format
  if (period.includes('p') && hours !== 12) {
    hours += 12;
  } else if (period.includes('a') && hours === 12) {
    hours = 0;
  }

  return `${String(hours).padStart(2, '0')}:${minutes.padStart(2, '0')}`;
}

/**
 * Parse module_title - can contain multiple modules separated by "|"
 */
function parseModuleTitle(moduleTitle: string): string[] {
  if (!moduleTitle || moduleTitle.trim() === '' || moduleTitle.trim().toUpperCase() === 'NULL') {
    return [];
  }

  // Split by "|" and clean up each module
  return moduleTitle
    .split('|')
    .map(m => m.trim())
    .filter(m => m.length > 0);
}

/**
 * Parse submodule_title - contains bullet points with newlines
 */
function parseSubmoduleTitle(submoduleTitle: string): string[] {
  if (!submoduleTitle || submoduleTitle.trim() === '' || submoduleTitle.trim().toUpperCase() === 'NULL') {
    return [];
  }

  // Split by newlines and clean up bullet points
  return submoduleTitle
    .split(/\n/)
    .map(line => {
      // Remove bullet points (•, -, *, etc.) and trim
      return line.replace(/^[\s•\-\*]+/, '').trim();
    })
    .filter(line => line.length > 0);
}

/**
 * Calculate duration in minutes from start and end time
 */
function calculateDurationMinutes(startTime: string, endTime: string): number {
  try {
    const start = normalizeTime(startTime);
    const end = normalizeTime(endTime);
    
    const [startHours, startMinutes] = start.split(':').map(Number);
    const [endHours, endMinutes] = end.split(':').map(Number);
    
    const startTotal = startHours * 60 + startMinutes;
    const endTotal = endHours * 60 + endMinutes;
    
    let duration = endTotal - startTotal;
    
    // Handle case where end time is next day (shouldn't happen but just in case)
    if (duration < 0) {
      duration += 24 * 60;
    }
    
    return duration > 0 ? duration : 120; // Default to 2 hours if invalid
  } catch {
    return 120; // Default to 2 hours
  }
}

/**
 * Parse date string
 */
function parseDate(dateStr: string): Date {
  if (!dateStr || dateStr.trim() === '' || dateStr.trim().toUpperCase() === 'NULL') {
    return new Date();
  }
  
  try {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? new Date() : date;
  } catch {
    return new Date();
  }
}

async function importCourseSchedule() {
  try {
    console.log('🚀 Starting course schedule import process from courseSchedule_grouped_by_timeID.csv...\n');

    const csvPath = path.join(__dirname, '../../courseSchedule_grouped_by_timeID.csv');

    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found at: ${csvPath}`);
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8');

    const records: CourseScheduleRow[] = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
      escape: '"',
      quote: '"',
    });

    console.log(`📋 Found ${records.length} schedule records to import\n`);

    await prisma.$connect();
    console.log('✅ Connected to database\n');

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      try {
        // Validate required fields
        if (!record.course_id || record.course_id.trim() === '') {
          console.log(`⏭️  Skipping record ${record.id}: Missing course_id`);
          skippedCount++;
          continue;
        }

        // Check if course exists
        const course = await prisma.course.findUnique({
          where: { id: record.course_id.trim() },
        });

        if (!course) {
          console.log(`⏭️  Skipping record ${record.id}: Course ${record.course_id} not found`);
          skippedCount++;
          continue;
        }

        // Check if schedule record already exists
        const existing = await prisma.courseSchedule.findUnique({
          where: { id: record.id.trim() },
        });

        if (existing) {
          console.log(`⏭️  Skipping record ${record.id}: Already exists`);
          skippedCount++;
          continue;
        }

        // Parse and normalize data
        const dayNumber = parseInt(record.day_number, 10);
        if (isNaN(dayNumber) || dayNumber < 1) {
          console.log(`⏭️  Skipping record ${record.id}: Invalid day_number`);
          skippedCount++;
          continue;
        }

        const startTime = normalizeTime(record.start_time);
        const endTime = normalizeTime(record.end_time);
        
        // Parse module_title into array
        const moduleTitleArray = parseModuleTitle(record.module_title);
        if (moduleTitleArray.length === 0) {
          console.log(`⏭️  Skipping record ${record.id}: No module title`);
          skippedCount++;
          continue;
        }

        // Parse submodule_title into array
        const submoduleTitleArray = parseSubmoduleTitle(record.submodule_title);
        
        // Calculate duration
        let durationMinutes = parseInt(record.duration_minutes, 10);
        if (isNaN(durationMinutes) || durationMinutes <= 0) {
          durationMinutes = calculateDurationMinutes(record.start_time, record.end_time);
        }

        // Parse created_at
        const createdAt = parseDate(record.created_at);

        // Create schedule record
        await prisma.courseSchedule.create({
          data: {
            id: record.id.trim(),
            courseId: record.course_id.trim(),
            dayNumber,
            startTime,
            endTime,
            moduleTitle: moduleTitleArray, // JSON array
            submoduleTitle: submoduleTitleArray.length > 0 ? submoduleTitleArray : undefined, // JSON array or undefined
            durationMinutes,
            createdAt,
          },
        });

        successCount++;
        if (successCount % 100 === 0) {
          console.log(`✅ Imported ${successCount} schedule records...`);
        }
      } catch (recordError: any) {
        errorCount++;
        const errorMsg = `Error importing schedule ${record.id}: ${recordError.message}`;
        errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📈 IMPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successfully imported: ${successCount}`);
    console.log(`⏭️  Skipped: ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log('='.repeat(60) + '\n');

    if (errors.length > 0 && errors.length <= 20) {
      console.log('⚠️  Detailed Errors:');
      errors.forEach((err) => console.error(`- ${err}`));
      console.log('');
    } else if (errors.length > 20) {
      console.log(`⚠️  ${errors.length} errors occurred. Showing first 10:`);
      errors.slice(0, 10).forEach((err) => console.error(`- ${err}`));
      console.log('');
    }

    console.log('🎉 Import process completed!');
  } catch (error: any) {
    console.error('\n❌ Fatal error during import:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

importCourseSchedule();


