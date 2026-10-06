CREATE TABLE `contact_messages` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`email` varchar(190),
	`phone` varchar(30),
	`topic` varchar(20) NOT NULL DEFAULT 'general',
	`message` text NOT NULL,
	`ip_address` varchar(45),
	`read_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contact_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `site_pages` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`slug` varchar(60) NOT NULL,
	`title` varchar(120) NOT NULL,
	`summary` varchar(300) NOT NULL DEFAULT '',
	`body` mediumtext NOT NULL,
	`show_contact_form` int NOT NULL DEFAULT 0,
	`is_published` int NOT NULL DEFAULT 1,
	`show_in_footer` int NOT NULL DEFAULT 1,
	`sort_order` int NOT NULL DEFAULT 0,
	`updated_by_user_id` bigint unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `site_pages_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_site_pages_slug` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `site_pages` ADD CONSTRAINT `site_pages_updated_by_user_id_users_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_contact_messages_inbox` ON `contact_messages` (`read_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_site_pages_footer` ON `site_pages` (`is_published`,`show_in_footer`,`sort_order`);