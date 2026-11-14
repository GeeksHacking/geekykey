CREATE TABLE `open_seat_lock` (
	`id` int NOT NULL,
	CONSTRAINT `open_seat_lock_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `open_seats` (
	`id` varchar(36) NOT NULL,
	`station_id` varchar(64) NOT NULL,
	`sitter_id` varchar(128) NOT NULL,
	`opened_at` varchar(24) NOT NULL,
	`closes_at` varchar(24) NOT NULL,
	`taker_id` varchar(128),
	`taken_at` varchar(24),
	`prompt` json,
	`request_id` varchar(36),
	`accepted_at` varchar(24),
	CONSTRAINT `open_seats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `open_seats_opened_at_idx` ON `open_seats` (`opened_at`);--> statement-breakpoint
CREATE INDEX `open_seats_sitter_idx` ON `open_seats` (`sitter_id`);--> statement-breakpoint
CREATE INDEX `open_seats_taker_idx` ON `open_seats` (`taker_id`);--> statement-breakpoint
CREATE INDEX `open_seats_request_idx` ON `open_seats` (`request_id`);