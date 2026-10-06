CREATE TABLE `restaurant_rankings` (
	`restaurant_id` bigint unsigned NOT NULL,
	`score` decimal(6,2) NOT NULL DEFAULT 0,
	`popularity_score` decimal(6,2) NOT NULL DEFAULT 0,
	`loyalty_score` decimal(6,2) NOT NULL DEFAULT 0,
	`reliability_score` decimal(6,2) NOT NULL DEFAULT 0,
	`completeness_score` decimal(6,2) NOT NULL DEFAULT 0,
	`freshness_score` decimal(6,2) NOT NULL DEFAULT 0,
	`orders_30d` int NOT NULL DEFAULT 0,
	`orders_7d` int NOT NULL DEFAULT 0,
	`repeat_customers` int NOT NULL DEFAULT 0,
	`total_customers` int NOT NULL DEFAULT 0,
	`acceptance_rate` decimal(5,2) NOT NULL DEFAULT 0,
	`cancellation_rate` decimal(5,2) NOT NULL DEFAULT 0,
	`manual_boost` int NOT NULL DEFAULT 0,
	`pinned_position` int,
	`computed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `restaurant_rankings_restaurant_id` PRIMARY KEY(`restaurant_id`)
);
--> statement-breakpoint
ALTER TABLE `restaurant_rankings` ADD CONSTRAINT `restaurant_rankings_restaurant_id_restaurants_id_fk` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_rankings_order` ON `restaurant_rankings` (`pinned_position`,`score`);--> statement-breakpoint
CREATE INDEX `idx_rankings_score` ON `restaurant_rankings` (`score`);