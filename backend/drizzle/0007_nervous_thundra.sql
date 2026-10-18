CREATE TABLE `order_reviews` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`order_id` bigint unsigned NOT NULL,
	`restaurant_id` bigint unsigned NOT NULL,
	`customer_id` bigint unsigned NOT NULL,
	`rating` int NOT NULL,
	`comment` varchar(1000) NOT NULL DEFAULT '',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `order_reviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_order_reviews_order` UNIQUE(`order_id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `email` varchar(190);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('SUPER_ADMIN','RESTAURANT_ADMIN','CUSTOMER','RIDER') NOT NULL DEFAULT 'RESTAURANT_ADMIN';--> statement-breakpoint
ALTER TABLE `restaurant_users` MODIFY COLUMN `role` enum('OWNER','MANAGER','STAFF','RIDER') NOT NULL DEFAULT 'OWNER';--> statement-breakpoint
ALTER TABLE `restaurant_users` ADD `permissions` json;--> statement-breakpoint
ALTER TABLE `restaurant_users` ADD `is_active` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `rider_user_id` bigint unsigned;--> statement-breakpoint
ALTER TABLE `orders` ADD `assigned_at` timestamp;--> statement-breakpoint
ALTER TABLE `orders` ADD `picked_up_at` timestamp;--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_note` varchar(500);--> statement-breakpoint
ALTER TABLE `order_reviews` ADD CONSTRAINT `order_reviews_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_reviews` ADD CONSTRAINT `order_reviews_restaurant_id_restaurants_id_fk` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_reviews` ADD CONSTRAINT `order_reviews_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_order_reviews_restaurant` ON `order_reviews` (`restaurant_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_rider_user_id_users_id_fk` FOREIGN KEY (`rider_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_orders_rider` ON `orders` (`rider_user_id`,`status`);