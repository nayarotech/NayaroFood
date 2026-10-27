ALTER TABLE `restaurant_settings` ADD `weekly_hours` json;--> statement-breakpoint
ALTER TABLE `restaurant_settings` ADD `holiday_closures` json;--> statement-breakpoint
ALTER TABLE `restaurant_settings` ADD `scheduling_enabled` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `restaurant_settings` ADD `max_orders_per_slot` int DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `scheduled_for` timestamp;--> statement-breakpoint
ALTER TABLE `orders` ADD `prepare_at` timestamp;--> statement-breakpoint
ALTER TABLE `orders` ADD `schedule_timezone` varchar(64);--> statement-breakpoint
CREATE INDEX `idx_orders_schedule` ON `orders` (`restaurant_id`,`scheduled_for`,`status`);