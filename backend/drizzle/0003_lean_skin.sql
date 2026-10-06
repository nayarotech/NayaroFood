ALTER TABLE `restaurants` MODIFY COLUMN `status` enum('PENDING','ACTIVE','SUSPENDED','INACTIVE') NOT NULL DEFAULT 'PENDING';--> statement-breakpoint
ALTER TABLE `restaurants` ADD `approved_at` timestamp;--> statement-breakpoint
ALTER TABLE `restaurants` ADD `status_changed_at` timestamp;--> statement-breakpoint
-- Restaurants already live were approved before this column existed.
UPDATE `restaurants` SET `approved_at` = `created_at` WHERE `status` = 'ACTIVE' AND `approved_at` IS NULL;