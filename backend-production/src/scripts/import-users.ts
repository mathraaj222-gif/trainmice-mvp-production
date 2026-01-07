import prisma from '../config/database';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: string;
  email_verified: string;
  created_at: string;
  updated_at: string;
  token_expiry: string;
  verification_token: string;
}

function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || dateStr === 'NULL' || dateStr.trim() === '') {
    return null;
  }
  
  // Handle the weird format like "10:41.1" - treat as invalid and use current date
  if (dateStr.includes(':') && !dateStr.includes('-')) {
    return new Date(); // Use current date if format is invalid
  }
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return new Date(); // Use current date if invalid
    }
    return date;
  } catch {
    return new Date(); // Use current date if parsing fails
  }
}

function parseBoolean(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    return value.trim() === '1' || value.trim().toLowerCase() === 'true';
  }
  return false;
}

async function importUsers() {
  try {
    console.log('🚀 Starting user import process from userDatasetFromMySql.csv...\n');

    // Read CSV file
    const csvPath = path.join(__dirname, '../../userDatasetFromMySql.csv');
    
    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found at: ${csvPath}`);
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8');

    // Parse CSV
    const records: UserRow[] = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
      escape: '"',
      quote: '"',
    });

    console.log(`📋 Found ${records.length} user records to import\n`);

    // Connect to database
    await prisma.$connect();
    console.log('✅ Connected to database\n');

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Import each user
    for (let i = 0; i < records.length; i++) {
      const user = records[i];
      
      try {
        // Skip if no ID or email
        if (!user.id || !user.email) {
          console.warn(`⚠️  Skipping row ${i + 2}: missing ID or email`);
          skippedCount++;
          continue;
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
          where: { id: user.id },
        });

        if (existingUser) {
          console.log(`⏭️  User ${user.email} (${user.id}) already exists, skipping...`);
          skippedCount++;
          continue;
        }

        // Check if email already exists
        const existingEmail = await prisma.user.findUnique({
          where: { email: user.email.trim().toLowerCase() },
        });

        if (existingEmail) {
          console.log(`⏭️  Email ${user.email} already exists, skipping...`);
          skippedCount++;
          continue;
        }

        // Parse dates
        const createdAt = parseDate(user.created_at) || new Date();
        const updatedAt = parseDate(user.updated_at) || new Date();
        const tokenExpiry = parseDate(user.token_expiry);

        // Parse role
        const role = (user.role?.trim().toUpperCase() || 'CLIENT') as 'CLIENT' | 'TRAINER' | 'ADMIN';
        if (!['CLIENT', 'TRAINER', 'ADMIN'].includes(role)) {
          console.warn(`⚠️  Invalid role "${user.role}" for user ${user.email}, defaulting to CLIENT`);
        }

        // Create user
        await prisma.user.create({
          data: {
            id: user.id.trim(),
            email: user.email.trim().toLowerCase(),
            passwordHash: user.password_hash.trim(),
            fullName: user.full_name?.trim() || null,
            role: role,
            emailVerified: parseBoolean(user.email_verified),
            verificationToken: user.verification_token && user.verification_token !== 'NULL' 
              ? user.verification_token.trim() 
              : null,
            tokenExpiry: tokenExpiry,
            createdAt: createdAt,
            updatedAt: updatedAt,
          },
        });

        successCount++;
        if (successCount % 10 === 0) {
          console.log(`✅ Imported ${successCount} users...`);
        }
      } catch (error: any) {
        errorCount++;
        const errorMsg = `Row ${i + 2} (${user.email}): ${error.message}`;
        errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Import Summary:');
    console.log('='.repeat(60));
    console.log(`✅ Successfully imported: ${successCount} users`);
    console.log(`⏭️  Skipped: ${skippedCount} users`);
    console.log(`❌ Errors: ${errorCount} users`);
    
    if (errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      errors.forEach((error, idx) => {
        console.log(`   ${idx + 1}. ${error}`);
      });
    }
    
    console.log('='.repeat(60) + '\n');

    await prisma.$disconnect();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Fatal error during import:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Run the import
importUsers();

