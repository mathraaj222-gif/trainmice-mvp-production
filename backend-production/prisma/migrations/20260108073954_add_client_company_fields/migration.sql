-- AlterTable
ALTER TABLE `clients` ADD COLUMN `city` VARCHAR(191) NULL,
    ADD COLUMN `company_address` TEXT NULL,
    ADD COLUMN `company_name` VARCHAR(191) NULL,
    ADD COLUMN `position` VARCHAR(191) NULL,
    ADD COLUMN `state` VARCHAR(191) NULL;
