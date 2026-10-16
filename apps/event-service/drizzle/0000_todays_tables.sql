CREATE TABLE `stations` (
	`id` varchar(64) NOT NULL,
	`name` text NOT NULL,
	`location` text,
	`api_key_hash` varchar(64) NOT NULL,
	`points` int NOT NULL DEFAULT 1,
	`created_at` varchar(24) NOT NULL,
	`last_seen_at` varchar(24),
	CONSTRAINT `stations_id` PRIMARY KEY(`id`),
	CONSTRAINT `stations_api_key_hash_unique` UNIQUE(`api_key_hash`)
);
--> statement-breakpoint
-- AUTO_ID_CACHE=1 was added by hand, since Drizzle can't declare it. It makes
-- TiDB hand out ids in order, so a newer tap always has a higher id. MySQL
-- ignores the /*T! */ comment.
CREATE TABLE `taps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`station_id` varchar(64) NOT NULL,
	`client_tap_id` varchar(128) NOT NULL,
	`token_uid` varchar(20) NOT NULL,
	`user_id` varchar(128),
	`source` enum('nfc','qr_fallback') NOT NULL DEFAULT 'nfc',
	`status` enum('accepted','cooldown','unknown_token') NOT NULL,
	`tapped_at` varchar(24),
	`received_at` varchar(24) NOT NULL,
	CONSTRAINT `taps_id` PRIMARY KEY(`id`),
	CONSTRAINT `taps_station_client_tap_id_uidx` UNIQUE(`station_id`,`client_tap_id`)
) /*T! AUTO_ID_CACHE=1 */;
--> statement-breakpoint
CREATE TABLE `tokens` (
	`uid` varchar(20) NOT NULL,
	`user_id` varchar(128) NOT NULL,
	`paired_at` varchar(24) NOT NULL,
	`revoked_at` varchar(24),
	CONSTRAINT `tokens_uid` PRIMARY KEY(`uid`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(128) NOT NULL,
	`portal_user_id` varchar(128),
	`display_name` text NOT NULL,
	`role` enum('participant','organizer') NOT NULL DEFAULT 'participant',
	`created_at` varchar(24) NOT NULL,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_portal_user_id_unique` UNIQUE(`portal_user_id`)
);
--> statement-breakpoint
-- The indexes come before the foreign keys, moved by hand. TiDB gives a foreign
-- key its own index unless one already starts with its column, and keeps that
-- index even after an index like it is added.
CREATE INDEX `taps_station_user_status_idx` ON `taps` (`station_id`,`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `taps_received_at_idx` ON `taps` (`received_at`);--> statement-breakpoint
CREATE INDEX `taps_user_received_at_idx` ON `taps` (`user_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `tokens_user_id_idx` ON `tokens` (`user_id`);--> statement-breakpoint
ALTER TABLE `taps` ADD CONSTRAINT `taps_station_id_stations_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `taps` ADD CONSTRAINT `taps_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tokens` ADD CONSTRAINT `tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;