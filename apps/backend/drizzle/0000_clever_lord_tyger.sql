CREATE TABLE `stations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`location` text,
	`api_key_hash` text NOT NULL,
	`points` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`last_seen_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stations_api_key_hash_unique` ON `stations` (`api_key_hash`);--> statement-breakpoint
CREATE TABLE `taps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`station_id` text NOT NULL,
	`client_tap_id` text NOT NULL,
	`token_uid` text NOT NULL,
	`user_id` text,
	`source` text DEFAULT 'nfc' NOT NULL,
	`status` text NOT NULL,
	`tapped_at` text,
	`received_at` text NOT NULL,
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "taps_source_check" CHECK("taps"."source" IN ('nfc', 'qr_fallback')),
	CONSTRAINT "taps_status_check" CHECK("taps"."status" IN ('accepted', 'cooldown', 'unknown_token'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `taps_station_client_tap_id_uidx` ON `taps` (`station_id`,`client_tap_id`);--> statement-breakpoint
CREATE INDEX `taps_station_user_status_idx` ON `taps` (`station_id`,`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `taps_received_at_idx` ON `taps` (`received_at`);--> statement-breakpoint
CREATE TABLE `tokens` (
	`uid` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`paired_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tokens_user_id_idx` ON `tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`portal_user_id` text,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'participant' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "users_role_check" CHECK("users"."role" IN ('participant', 'organizer'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_portal_user_id_unique` ON `users` (`portal_user_id`);