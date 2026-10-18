CREATE TABLE `customer_remarks` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`customer_id` bigint unsigned NOT NULL,
	`restaurant_id` bigint unsigned NOT NULL,
	`order_id` bigint unsigned,
	`reason` enum('NOT_REACHABLE','CANCELLED_LATE','REFUSED_DELIVERY','WRONG_ADDRESS','FAKE_ORDER','ABUSIVE','OTHER') NOT NULL,
	`note` varchar(500) NOT NULL DEFAULT '',
	`created_by_user_id` bigint unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_remarks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `customers` ADD CONSTRAINT `uq_customers_user` UNIQUE(`user_id`);--> statement-breakpoint
DROP INDEX `idx_customers_user` ON `customers`;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('SUPER_ADMIN','RESTAURANT_ADMIN','CUSTOMER') NOT NULL DEFAULT 'RESTAURANT_ADMIN';--> statement-breakpoint
ALTER TABLE `customers` ADD `is_blocked` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `blocked_reason` varchar(300);--> statement-breakpoint
ALTER TABLE `customers` ADD `blocked_at` timestamp;--> statement-breakpoint
ALTER TABLE `customers` ADD `blocked_by_user_id` bigint unsigned;--> statement-breakpoint
ALTER TABLE `customer_remarks` ADD CONSTRAINT `customer_remarks_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_remarks` ADD CONSTRAINT `customer_remarks_restaurant_id_restaurants_id_fk` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_remarks` ADD CONSTRAINT `customer_remarks_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_customer_remarks_customer` ON `customer_remarks` (`customer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_customer_remarks_tenant` ON `customer_remarks` (`restaurant_id`,`customer_id`);--> statement-breakpoint
ALTER TABLE `customers` ADD CONSTRAINT `customers_blocked_by_user_id_users_id_fk` FOREIGN KEY (`blocked_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_customers_blocked` ON `customers` (`is_blocked`);