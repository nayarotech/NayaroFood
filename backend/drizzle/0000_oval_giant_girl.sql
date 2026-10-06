CREATE TABLE `refresh_tokens` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`revoked_at` timestamp,
	`replaced_by_hash` varchar(64),
	`user_agent` varchar(255),
	`ip_address` varchar(45),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `refresh_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_refresh_tokens_hash` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`email` varchar(190) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`name` varchar(120) NOT NULL,
	`phone` varchar(20),
	`role` enum('SUPER_ADMIN','RESTAURANT_ADMIN') NOT NULL DEFAULT 'RESTAURANT_ADMIN',
	`status` enum('ACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
	`email_verified_at` timestamp,
	`last_login_at` timestamp,
	`token_version` bigint unsigned NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_users_email` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `restaurant_settings` (
	`restaurant_id` bigint unsigned NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'NPR',
	`timezone` varchar(64) NOT NULL DEFAULT 'Asia/Kathmandu',
	`min_order_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
	`default_prep_time_minutes` int NOT NULL DEFAULT 30,
	`accepts_orders` int NOT NULL DEFAULT 1,
	`order_number_prefix` varchar(8) NOT NULL DEFAULT '',
	`next_order_number` int NOT NULL DEFAULT 1001,
	`whatsapp_number` varchar(20),
	`whatsapp_status` enum('UNVERIFIED','PENDING','VERIFIED') NOT NULL DEFAULT 'UNVERIFIED',
	`whatsapp_verified_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `restaurant_settings_restaurant_id` PRIMARY KEY(`restaurant_id`)
);
--> statement-breakpoint
CREATE TABLE `restaurant_users` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`restaurant_id` bigint unsigned NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`role` enum('OWNER','MANAGER','STAFF') NOT NULL DEFAULT 'OWNER',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `restaurant_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_restaurant_users` UNIQUE(`restaurant_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `restaurants` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`slug` varchar(120) NOT NULL,
	`name` varchar(150) NOT NULL,
	`description` text,
	`logo_url` varchar(500),
	`cover_url` varchar(500),
	`phone` varchar(20) NOT NULL,
	`email` varchar(190),
	`address` varchar(255) NOT NULL,
	`latitude` decimal(10,7),
	`longitude` decimal(10,7),
	`status` enum('PENDING','ACTIVE','SUSPENDED') NOT NULL DEFAULT 'PENDING',
	`is_open` int NOT NULL DEFAULT 1,
	`onboarding_step` enum('PROFILE','LOCATION','WHATSAPP','CATEGORIES','MENU','DELIVERY_ZONES','DONE') NOT NULL DEFAULT 'PROFILE',
	`suspended_reason` varchar(300),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deleted_at` timestamp,
	CONSTRAINT `restaurants_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_restaurants_slug` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`restaurant_id` bigint unsigned NOT NULL,
	`name` varchar(80) NOT NULL,
	`slug` varchar(120) NOT NULL,
	`description` varchar(500),
	`sort_order` int NOT NULL DEFAULT 0,
	`is_active` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deleted_at` timestamp,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_categories_restaurant_slug` UNIQUE(`restaurant_id`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `food_items` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`restaurant_id` bigint unsigned NOT NULL,
	`category_id` bigint unsigned NOT NULL,
	`name` varchar(150) NOT NULL,
	`slug` varchar(170) NOT NULL,
	`description` text,
	`image_url` varchar(500),
	`price` decimal(10,2) NOT NULL,
	`discount_price` decimal(10,2),
	`prep_time_minutes` int,
	`is_available` int NOT NULL DEFAULT 1,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deleted_at` timestamp,
	CONSTRAINT `food_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_food_items_restaurant_slug` UNIQUE(`restaurant_id`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `delivery_zones` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`restaurant_id` bigint unsigned NOT NULL,
	`name` varchar(80),
	`min_distance_km` decimal(6,2) NOT NULL,
	`max_distance_km` decimal(6,2) NOT NULL,
	`delivery_fee` decimal(10,2) NOT NULL DEFAULT '0.00',
	`is_active` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `delivery_zones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customer_addresses` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`customer_id` bigint unsigned NOT NULL,
	`label` varchar(60),
	`address` varchar(255) NOT NULL,
	`landmark` varchar(160),
	`latitude` decimal(10,7) NOT NULL,
	`longitude` decimal(10,7) NOT NULL,
	`is_default` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_addresses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`phone` varchar(20) NOT NULL,
	`name` varchar(120) NOT NULL,
	`email` varchar(190),
	`user_id` bigint unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_customers_phone` UNIQUE(`phone`)
);
--> statement-breakpoint
CREATE TABLE `restaurant_customers` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`restaurant_id` bigint unsigned NOT NULL,
	`customer_id` bigint unsigned NOT NULL,
	`order_count` int NOT NULL DEFAULT 0,
	`total_spent` decimal(10,2) NOT NULL DEFAULT '0.00',
	`cancelled_count` int NOT NULL DEFAULT 0,
	`first_order_at` timestamp,
	`last_order_at` timestamp,
	`is_blocked` int NOT NULL DEFAULT 0,
	`notes` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `restaurant_customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_restaurant_customers` UNIQUE(`restaurant_id`,`customer_id`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`order_id` bigint unsigned NOT NULL,
	`restaurant_id` bigint unsigned NOT NULL,
	`food_item_id` bigint unsigned,
	`name_snapshot` varchar(150) NOT NULL,
	`unit_price` decimal(10,2) NOT NULL,
	`quantity` int NOT NULL,
	`line_total` decimal(10,2) NOT NULL,
	`note` varchar(200),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_status_history` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`order_id` bigint unsigned NOT NULL,
	`restaurant_id` bigint unsigned NOT NULL,
	`from_status` enum('PENDING','ACCEPTED','REJECTED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','CANCELLED'),
	`to_status` enum('PENDING','ACCEPTED','REJECTED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','CANCELLED') NOT NULL,
	`changed_by_user_id` bigint unsigned,
	`changed_by_actor` varchar(20) NOT NULL,
	`note` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_status_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`restaurant_id` bigint unsigned NOT NULL,
	`order_number` varchar(32) NOT NULL,
	`customer_id` bigint unsigned NOT NULL,
	`customer_name` varchar(120) NOT NULL,
	`customer_phone` varchar(20) NOT NULL,
	`customer_email` varchar(190),
	`delivery_address` varchar(255) NOT NULL,
	`delivery_landmark` varchar(160),
	`delivery_latitude` decimal(10,7) NOT NULL,
	`delivery_longitude` decimal(10,7) NOT NULL,
	`distance_km` decimal(6,2) NOT NULL,
	`delivery_zone_id` bigint unsigned,
	`subtotal` decimal(10,2) NOT NULL,
	`discount_total` decimal(10,2) NOT NULL DEFAULT '0.00',
	`delivery_fee` decimal(10,2) NOT NULL,
	`total` decimal(10,2) NOT NULL,
	`status` enum('PENDING','ACCEPTED','REJECTED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','CANCELLED') NOT NULL DEFAULT 'PENDING',
	`payment_method` enum('COD') NOT NULL DEFAULT 'COD',
	`payment_status` enum('UNPAID','PAID','REFUNDED') NOT NULL DEFAULT 'UNPAID',
	`note` varchar(500),
	`cancelled_reason` varchar(300),
	`idempotency_key` varchar(64),
	`placed_at` timestamp NOT NULL DEFAULT (now()),
	`accepted_at` timestamp,
	`ready_at` timestamp,
	`delivered_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_orders_restaurant_number` UNIQUE(`restaurant_id`,`order_number`),
	CONSTRAINT `uq_orders_idempotency` UNIQUE(`restaurant_id`,`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_verifications` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`restaurant_id` bigint unsigned NOT NULL,
	`phone` varchar(20) NOT NULL,
	`code_hash` varchar(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`max_attempts` int NOT NULL DEFAULT 5,
	`consumed_at` timestamp,
	`invalidated_at` timestamp,
	`requested_by_user_id` bigint unsigned,
	`request_ip` varchar(45),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_verifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_logs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`restaurant_id` bigint unsigned NOT NULL,
	`order_id` bigint unsigned,
	`channel` enum('WHATSAPP','SMS','EMAIL') NOT NULL DEFAULT 'WHATSAPP',
	`provider` varchar(40) NOT NULL,
	`template` varchar(60) NOT NULL,
	`recipient` varchar(20) NOT NULL,
	`status` enum('PENDING','SENT','FAILED') NOT NULL DEFAULT 'PENDING',
	`attempts` int NOT NULL DEFAULT 0,
	`provider_message_id` varchar(128),
	`payload` json,
	`error` text,
	`sent_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`restaurant_id` bigint unsigned,
	`actor_user_id` bigint unsigned,
	`action` varchar(80) NOT NULL,
	`entity_type` varchar(60),
	`entity_id` varchar(64),
	`metadata` json,
	`ip_address` varchar(45),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platform_settings` (
	`setting_key` varchar(100) NOT NULL,
	`setting_value` json,
	`description` varchar(300),
	`updated_by_user_id` bigint unsigned,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `platform_settings_setting_key` PRIMARY KEY(`setting_key`)
);
--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `restaurant_settings` ADD CONSTRAINT `restaurant_settings_restaurant_id_restaurants_id_fk` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `restaurant_users` ADD CONSTRAINT `restaurant_users_restaurant_id_restaurants_id_fk` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `restaurant_users` ADD CONSTRAINT `restaurant_users_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `categories` ADD CONSTRAINT `categories_restaurant_id_restaurants_id_fk` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `food_items` ADD CONSTRAINT `food_items_restaurant_id_restaurants_id_fk` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `food_items` ADD CONSTRAINT `food_items_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `delivery_zones` ADD CONSTRAINT `delivery_zones_restaurant_id_restaurants_id_fk` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_addresses` ADD CONSTRAINT `customer_addresses_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customers` ADD CONSTRAINT `customers_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `restaurant_customers` ADD CONSTRAINT `restaurant_customers_restaurant_id_restaurants_id_fk` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `restaurant_customers` ADD CONSTRAINT `restaurant_customers_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_restaurant_id_restaurants_id_fk` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_food_item_id_food_items_id_fk` FOREIGN KEY (`food_item_id`) REFERENCES `food_items`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_status_history` ADD CONSTRAINT `order_status_history_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_status_history` ADD CONSTRAINT `order_status_history_restaurant_id_restaurants_id_fk` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_status_history` ADD CONSTRAINT `order_status_history_changed_by_user_id_users_id_fk` FOREIGN KEY (`changed_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_restaurant_id_restaurants_id_fk` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_delivery_zone_id_delivery_zones_id_fk` FOREIGN KEY (`delivery_zone_id`) REFERENCES `delivery_zones`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `whatsapp_verifications` ADD CONSTRAINT `whatsapp_verifications_restaurant_id_restaurants_id_fk` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `whatsapp_verifications` ADD CONSTRAINT `whatsapp_verifications_requested_by_user_id_users_id_fk` FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_logs` ADD CONSTRAINT `notification_logs_restaurant_id_restaurants_id_fk` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_logs` ADD CONSTRAINT `notification_logs_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_restaurant_id_restaurants_id_fk` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `platform_settings` ADD CONSTRAINT `platform_settings_updated_by_user_id_users_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_refresh_tokens_user` ON `refresh_tokens` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_users_role_status` ON `users` (`role`,`status`);--> statement-breakpoint
CREATE INDEX `idx_restaurant_settings_whatsapp` ON `restaurant_settings` (`whatsapp_status`);--> statement-breakpoint
CREATE INDEX `idx_restaurant_users_user` ON `restaurant_users` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_restaurants_status` ON `restaurants` (`status`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_restaurants_name` ON `restaurants` (`name`);--> statement-breakpoint
CREATE INDEX `idx_categories_listing` ON `categories` (`restaurant_id`,`is_active`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_food_items_menu` ON `food_items` (`restaurant_id`,`category_id`,`is_available`);--> statement-breakpoint
CREATE INDEX `idx_food_items_availability` ON `food_items` (`restaurant_id`,`is_available`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_food_items_name` ON `food_items` (`name`);--> statement-breakpoint
CREATE INDEX `idx_delivery_zones_lookup` ON `delivery_zones` (`restaurant_id`,`is_active`,`min_distance_km`);--> statement-breakpoint
CREATE INDEX `idx_customer_addresses_customer` ON `customer_addresses` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_customers_user` ON `customers` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_restaurant_customers_repeat` ON `restaurant_customers` (`restaurant_id`,`order_count`);--> statement-breakpoint
CREATE INDEX `idx_restaurant_customers_recent` ON `restaurant_customers` (`restaurant_id`,`last_order_at`);--> statement-breakpoint
CREATE INDEX `idx_order_items_order` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_order_items_tenant` ON `order_items` (`restaurant_id`,`food_item_id`);--> statement-breakpoint
CREATE INDEX `idx_order_status_history_order` ON `order_status_history` (`order_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_order_status_history_tenant` ON `order_status_history` (`restaurant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_orders_dashboard` ON `orders` (`restaurant_id`,`status`,`placed_at`);--> statement-breakpoint
CREATE INDEX `idx_orders_restaurant_placed` ON `orders` (`restaurant_id`,`placed_at`);--> statement-breakpoint
CREATE INDEX `idx_orders_customer` ON `orders` (`customer_id`,`placed_at`);--> statement-breakpoint
CREATE INDEX `idx_orders_phone` ON `orders` (`customer_phone`);--> statement-breakpoint
CREATE INDEX `idx_orders_platform_placed` ON `orders` (`placed_at`);--> statement-breakpoint
CREATE INDEX `idx_whatsapp_verifications_lookup` ON `whatsapp_verifications` (`restaurant_id`,`phone`,`consumed_at`);--> statement-breakpoint
CREATE INDEX `idx_whatsapp_verifications_expiry` ON `whatsapp_verifications` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_notification_logs_order` ON `notification_logs` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_notification_logs_tenant` ON `notification_logs` (`restaurant_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_notification_logs_retry` ON `notification_logs` (`status`,`attempts`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_tenant` ON `audit_logs` (`restaurant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_actor` ON `audit_logs` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_action` ON `audit_logs` (`action`,`created_at`);