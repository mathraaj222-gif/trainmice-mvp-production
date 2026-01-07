import prisma from '../config/database';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

interface TrainerRow {
  id: string;
  custom_trainer_id: string;
  profile_pic: string;
  ic_number: string;
  full_name: string;
  race: string;
  phone_number: string;
  email: string;
  hourly_rate: string;
  hrdc_accreditation_id: string;
  hrdc_accreditation_valid_until: string;
  professional_bio: string;
  state: string;
  city: string;
  country: string;
  areas_of_expertise: string;
  languages_spoken: string;
  qualification: string;
  workHistory: string;
  created_at: string;
}

function parseJsonField(value: string): any {
  if (!value || value.trim() === '' || value.trim() === 'NULL') {
    return null;
  }
  
  try {
    const parsed = JSON.parse(value);
    return parsed;
  } catch (e) {
    // If parsing fails, return null
    return null;
  }
}

function parseDate(value: string): Date | null {
  if (!value || value.trim() === '' || value.trim() === 'NULL' || !value.includes('-')) {
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

function parseNumber(value: string): number | null {
  if (!value || value.trim() === '' || value.trim() === 'NULL') return null;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? null : parsed;
}

function cleanEmail(email: string): string | null {
  if (!email || email.trim() === '' || email.trim() === 'NULL') return null;
  
  // Remove "mailto:" prefix if present
  let cleaned = email.trim().toLowerCase();
  if (cleaned.startsWith('mailto:')) {
    cleaned = cleaned.replace('mailto:', '');
  }
  
  // Remove any trailing spaces or special characters
  cleaned = cleaned.trim();
  
  // Basic email validation
  if (!cleaned.includes('@') || cleaned.length < 5) {
    return null;
  }
  
  return cleaned;
}

async function importTrainers() {
  try {
    console.log('🚀 Starting trainer import process from cleaned trainers dataset.csv...\n');

    const csvPath = path.join(__dirname, '../../cleaned trainers dataset.csv');
    
    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found at: ${csvPath}`);
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8');

    const records: TrainerRow[] = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
      escape: '"',
      quote: '"',
    });

    console.log(`📋 Found ${records.length} trainer records to import\n`);

    await prisma.$connect();
    console.log('✅ Connected to database\n');

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    for (let i = 0; i < records.length; i++) {
      const trainerRow = records[i];
      try {
        // Skip if no full_name
        if (!trainerRow.full_name || trainerRow.full_name.trim() === '') {
          console.log(`⏭️  Skipping row ${i + 1}: No full_name`);
          skippedCount++;
          continue;
        }

        let userId: string | null = null;

        // Try to find user by ID if provided
        if (trainerRow.id && trainerRow.id.trim() !== '' && uuidRegex.test(trainerRow.id.trim())) {
          const user = await prisma.user.findUnique({
            where: { id: trainerRow.id.trim() },
          });
          if (user) {
            userId = user.id;
          }
        }

        // If no user found by ID, try to find by email
        if (!userId && trainerRow.email) {
          const cleanedEmail = cleanEmail(trainerRow.email);
          if (cleanedEmail) {
            const user = await prisma.user.findUnique({
              where: { email: cleanedEmail },
            });
            if (user && user.role === 'TRAINER') {
              userId = user.id;
            }
          }
        }

        // If still no user found, skip this trainer
        if (!userId) {
          console.log(`⏭️  Skipping ${trainerRow.full_name}: No matching User found (id: ${trainerRow.id || 'none'}, email: ${trainerRow.email || 'none'})`);
          skippedCount++;
          continue;
        }

        // Check if trainer already exists
        const existingTrainer = await prisma.trainer.findUnique({
          where: { id: userId },
        });

        if (existingTrainer) {
          // Update existing trainer
          await prisma.trainer.update({
            where: { id: userId },
            data: {
              customTrainerId: trainerRow.custom_trainer_id && trainerRow.custom_trainer_id.trim() !== '' 
                ? trainerRow.custom_trainer_id.trim() 
                : existingTrainer.customTrainerId,
              profilePic: trainerRow.profile_pic && trainerRow.profile_pic.trim() !== '' 
                ? trainerRow.profile_pic.trim() 
                : existingTrainer.profilePic,
              icNumber: trainerRow.ic_number && trainerRow.ic_number.trim() !== '' 
                ? trainerRow.ic_number.trim() 
                : existingTrainer.icNumber,
              fullName: trainerRow.full_name.trim(),
              race: trainerRow.race && trainerRow.race.trim() !== '' ? trainerRow.race.trim() : null,
              phoneNumber: trainerRow.phone_number && trainerRow.phone_number.trim() !== '' 
                ? trainerRow.phone_number.trim() 
                : existingTrainer.phoneNumber,
              email: trainerRow.email ? cleanEmail(trainerRow.email) : existingTrainer.email,
              hourlyRate: trainerRow.hourly_rate ? parseNumber(trainerRow.hourly_rate) : existingTrainer.hourlyRate,
              hrdcAccreditationId: trainerRow.hrdc_accreditation_id && trainerRow.hrdc_accreditation_id.trim() !== '' 
                ? trainerRow.hrdc_accreditation_id.trim() 
                : existingTrainer.hrdcAccreditationId,
              hrdcAccreditationValidUntil: parseDate(trainerRow.hrdc_accreditation_valid_until),
              professionalBio: trainerRow.professional_bio && trainerRow.professional_bio.trim() !== '' 
                ? trainerRow.professional_bio.trim() 
                : existingTrainer.professionalBio,
              state: trainerRow.state && trainerRow.state.trim() !== '' ? trainerRow.state.trim() : existingTrainer.state,
              city: trainerRow.city && trainerRow.city.trim() !== '' ? trainerRow.city.trim() : existingTrainer.city,
              country: trainerRow.country && trainerRow.country.trim() !== '' ? trainerRow.country.trim() : existingTrainer.country,
              areasOfExpertise: parseJsonField(trainerRow.areas_of_expertise),
              languagesSpoken: parseJsonField(trainerRow.languages_spoken),
              qualification: parseJsonField(trainerRow.qualification),
              workHistory: parseJsonField(trainerRow.workHistory),
            },
          });
          console.log(`🔄 Updated: ${trainerRow.full_name} (${trainerRow.custom_trainer_id || 'No ID'})`);
          successCount++;
        } else {
          // Create new trainer
          await prisma.trainer.create({
            data: {
              id: userId,
              customTrainerId: trainerRow.custom_trainer_id && trainerRow.custom_trainer_id.trim() !== '' 
                ? trainerRow.custom_trainer_id.trim() 
                : null,
              profilePic: trainerRow.profile_pic && trainerRow.profile_pic.trim() !== '' 
                ? trainerRow.profile_pic.trim() 
                : null,
              icNumber: trainerRow.ic_number && trainerRow.ic_number.trim() !== '' 
                ? trainerRow.ic_number.trim() 
                : null,
              fullName: trainerRow.full_name.trim(),
              race: trainerRow.race && trainerRow.race.trim() !== '' ? trainerRow.race.trim() : null,
              phoneNumber: trainerRow.phone_number && trainerRow.phone_number.trim() !== '' 
                ? trainerRow.phone_number.trim() 
                : null,
              email: trainerRow.email ? cleanEmail(trainerRow.email) : null,
              hourlyRate: trainerRow.hourly_rate ? parseNumber(trainerRow.hourly_rate) : null,
              hrdcAccreditationId: trainerRow.hrdc_accreditation_id && trainerRow.hrdc_accreditation_id.trim() !== '' 
                ? trainerRow.hrdc_accreditation_id.trim() 
                : null,
              hrdcAccreditationValidUntil: parseDate(trainerRow.hrdc_accreditation_valid_until),
              professionalBio: trainerRow.professional_bio && trainerRow.professional_bio.trim() !== '' 
                ? trainerRow.professional_bio.trim() 
                : null,
              state: trainerRow.state && trainerRow.state.trim() !== '' ? trainerRow.state.trim() : null,
              city: trainerRow.city && trainerRow.city.trim() !== '' ? trainerRow.city.trim() : null,
              country: trainerRow.country && trainerRow.country.trim() !== '' ? trainerRow.country.trim() : null,
              areasOfExpertise: parseJsonField(trainerRow.areas_of_expertise),
              languagesSpoken: parseJsonField(trainerRow.languages_spoken),
              qualification: parseJsonField(trainerRow.qualification),
              workHistory: parseJsonField(trainerRow.workHistory),
            },
          });
          console.log(`✅ Created: ${trainerRow.full_name} (${trainerRow.custom_trainer_id || 'No ID'})`);
          successCount++;
        }

        if (successCount % 10 === 0) {
          console.log(`📊 Progress: ${successCount} trainers processed...`);
        }

      } catch (error: any) {
        errorCount++;
        const errorMsg = `Failed to import ${trainerRow.full_name}: ${error.message}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📈 IMPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successfully imported/updated: ${successCount}`);
    console.log(`⏭️  Skipped: ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log('='.repeat(60) + '\n');

    if (errors.length > 0 && errors.length <= 20) {
      console.log('⚠️  ERRORS:');
      errors.forEach(error => console.log(`   - ${error}`));
      console.log('');
    } else if (errors.length > 20) {
      console.log(`⚠️  ${errors.length} errors occurred. First 20:`);
      errors.slice(0, 20).forEach(error => console.log(`   - ${error}`));
      console.log('');
    }

    console.log('🎉 Import process completed!');

  } catch (error: any) {
    console.error('\n❌ Import failed!');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

importTrainers();

