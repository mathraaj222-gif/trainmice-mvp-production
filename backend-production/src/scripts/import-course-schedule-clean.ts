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
 * Parse submodule_title - contains Python-style array string like "['item1', 'item2']" or "[]"
 */
function parseSubmoduleTitle(submoduleTitle: string): string[] | undefined {
  if (!submoduleTitle || submoduleTitle.trim() === '' || 
      submoduleTitle.trim().toUpperCase() === 'NULL' ||
      submoduleTitle.trim() === '#NAME?') {
    return undefined;
  }

  const trimmed = submoduleTitle.trim();
  
  // Handle empty array
  if (trimmed === '[]' || trimmed === '') {
    return undefined;
  }

  try {
    // The CSV contains Python-style array strings like "['item1', 'item2']"
    // Convert single quotes to double quotes for JSON parsing
    let jsonString = trimmed.replace(/'/g, '"');
    
    // Parse as JSON
    const parsed = JSON.parse(jsonString);
    
    if (Array.isArray(parsed)) {
      // Filter out empty strings and return
      const filtered = parsed.filter((item: any) => item && typeof item === 'string' && item.trim() !== '');
      return filtered.length > 0 ? filtered : undefined;
    }
    
    return undefined;
  } catch (error) {
    // If parsing fails, try to extract items manually
    const matches = trimmed.match(/'([^']+)'/g);
    if (matches && matches.length > 0) {
      const items = matches.map(m => m.replace(/'/g, '').trim()).filter(m => m.length > 0);
      return items.length > 0 ? items : undefined;
    }
    
    return undefined;
  }
}

/**
 * Calculate duration in minutes from start and end time
 */
function calculateDurationMinutes(startTime: string, endTime: string): number {
  try {
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);
    
    const startTotal = startHours * 60 + startMinutes;
    const endTotal = endHours * 60 + endMinutes;
    
    // Handle case where end time is next day
    let duration = endTotal - startTotal;
    if (duration < 0) {
      duration += 24 * 60; // Add 24 hours
    }
    
    return duration;
  } catch {
    return 120; // Default 2 hours
  }
}

/**
 * Normalize time to HH:MM format
 */
function normalizeTime(time: string): string {
  if (!time || time.trim() === '') return '09:00';
  const trimmed = time.trim();
  // If it's already in HH:MM format, return as is
  if (/^\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  // If it's in H:MM format, pad with zero
  if (/^\d{1}:\d{2}$/.test(trimmed)) {
    return '0' + trimmed;
  }
  // Try to parse and format
  const parts = trimmed.split(':');
  if (parts.length === 2) {
    const hours = parts[0].padStart(2, '0');
    const minutes = parts[1].padStart(2, '0');
    return `${hours}:${minutes}`;
  }
  return '09:00'; // Default
}

/**
 * Parse date string - handle various formats
 */
function parseDate(dateStr: string): Date {
  if (!dateStr || dateStr.trim() === '' || dateStr.trim().toUpperCase() === 'NULL') {
    return new Date();
  }

  try {
    // Try parsing as ISO date
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date;
    }
    
    // If it's in format like "28:53.6", treat as current date
    return new Date();
  } catch {
    return new Date();
  }
}

async function cleanAndImportCourseSchedule() {
  try {
    console.log('🚀 Starting course schedule import process from output_file (1).csv...\n');

    // Step 1: Clean existing data
    console.log('🧹 Cleaning existing course_schedule data...');
    await prisma.$connect();
    const deleteResult = await prisma.courseSchedule.deleteMany({});
    console.log(`✅ Deleted ${deleteResult.count} existing records\n`);

    // Step 2: Read CSV file
    const csvPath = path.join(__dirname, '../../output_file (1).csv');
    
    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found at: ${csvPath}`);
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8');

    // Parse CSV with proper handling of multi-line fields
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

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Step 3: Import each schedule record
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      
      try {
        // Validate required fields
        if (!record.course_id || !uuidRegex.test(record.course_id)) {
          console.log(`⏭️  Skipping record ${i + 1}: Invalid course_id`);
          skippedCount++;
          continue;
        }

        if (!record.module_title || record.module_title.trim() === '') {
          console.log(`⏭️  Skipping record ${i + 1}: No module_title`);
          skippedCount++;
          continue;
        }

        // Parse fields
        const dayNumber = parseInt(record.day_number, 10);
        if (isNaN(dayNumber) || dayNumber < 1) {
          console.log(`⏭️  Skipping record ${i + 1}: Invalid day_number`);
          skippedCount++;
          continue;
        }

        // Normalize times to HH:MM format
        const startTime = normalizeTime(record.start_time || '09:00');
        const endTime = normalizeTime(record.end_time || '11:00');

        // Parse module_title - clean up newlines and extra spaces
        const moduleTitle = record.module_title
          .replace(/\n+/g, ' ') // Replace newlines with spaces
          .replace(/\s+/g, ' ') // Replace multiple spaces with single space
          .trim();

        // Parse submodule_title - convert Python-style array to JSON array
        const submoduleTitleArray = parseSubmoduleTitle(record.submodule_title || '');
        
        // Calculate duration
        let durationMinutes = parseInt(record.duration_minutes, 10);
        if (isNaN(durationMinutes) || durationMinutes <= 0) {
          durationMinutes = calculateDurationMinutes(startTime, endTime);
        }

        // Parse created_at
        const createdAt = parseDate(record.created_at);

        // Validate ID
        const idValue = record.id?.trim();
        let id: string | undefined = undefined;
        if (idValue && uuidRegex.test(idValue)) {
          id = idValue;
        }

        // Create schedule record - one module per row
        await prisma.courseSchedule.create({
          data: {
            ...(id ? { id } : {}),
            courseId: record.course_id,
            dayNumber,
            startTime,
            endTime,
            moduleTitle, // String (one module per row)
            submoduleTitle: submoduleTitleArray, // JSON array or undefined
            durationMinutes,
            createdAt,
          },
        });

        if ((i + 1) % 100 === 0) {
          console.log(`✅ Processed ${i + 1}/${records.length} records...`);
        }
        successCount++;

      } catch (error: any) {
        const errorMsg = `Failed to import record ${i + 1}: ${error.message}`;
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

    if (errors.length > 0 && errors.length <= 10) {
      console.log('❌ Error details:');
      errors.forEach(err => console.log(`   - ${err}`));
      console.log('');
    } else if (errors.length > 10) {
      console.log(`❌ ${errors.length} errors occurred (showing first 10):`);
      errors.slice(0, 10).forEach(err => console.log(`   - ${err}`));
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
cleanAndImportCourseSchedule()
  .then(() => {
    console.log('✨ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });

