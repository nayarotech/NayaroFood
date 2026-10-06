ALTER TABLE `orders` ADD `tracking_code` varchar(16);--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `uq_orders_tracking_code` UNIQUE(`tracking_code`);--> statement-breakpoint
-- Orders placed before tracking codes existed get a deterministic one.
UPDATE `orders` SET `tracking_code` = CONCAT('NY', LPAD(`id`, 8, '0')) WHERE `tracking_code` IS NULL;