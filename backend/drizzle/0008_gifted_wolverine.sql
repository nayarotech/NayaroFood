CREATE TABLE `email_codes` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`purpose` enum('SIGNUP','PASSWORD_RESET') NOT NULL,
	`email` varchar(190) NOT NULL,
	`code_hash` varchar(64) NOT NULL,
	`payload` json,
	`attempts` int NOT NULL DEFAULT 0,
	`max_attempts` int NOT NULL DEFAULT 5,
	`expires_at` timestamp NOT NULL,
	`consumed_at` timestamp,
	`invalidated_at` timestamp,
	`request_ip` varchar(45),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_email_codes_lookup` ON `email_codes` (`email`,`purpose`,`created_at`);