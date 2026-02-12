/*
  Warnings:

  - You are about to alter the column `module_title` on the `course_schedule` table. The data in that column could be lost. The data in that column will be cast from `VarChar(500)` to `VarChar(191)`.

*/
-- AlterTable
ALTER TABLE `course_schedule` MODIFY `module_title` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `fcm_token` VARCHAR(255) NULL;
