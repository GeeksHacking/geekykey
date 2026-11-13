CREATE TABLE `relay_games` (
	`id` varchar(36) NOT NULL,
	`started_at` varchar(24) NOT NULL,
	`station_a` varchar(64) NOT NULL,
	`station_b` varchar(64) NOT NULL,
	`groups_playing` int NOT NULL,
	`transfers_needed` int NOT NULL,
	`last_moved_at` varchar(24) NOT NULL,
	`ended_at` varchar(24),
	`ended_how` varchar(8),
	CONSTRAINT `relay_games_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `relay_lock` (
	`id` int NOT NULL,
	CONSTRAINT `relay_lock_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `relay_transfers` (
	`id` varchar(36) NOT NULL,
	`game_id` varchar(36) NOT NULL,
	`from_station_id` varchar(64) NOT NULL,
	`to_station_id` varchar(64) NOT NULL,
	`from_group_id` varchar(36) NOT NULL,
	`to_group_id` varchar(36) NOT NULL,
	`called_at` varchar(24) NOT NULL,
	`closes_at` varchar(24) NOT NULL,
	`completed_at` varchar(24),
	CONSTRAINT `relay_transfers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `relay_transfers_game_idx` ON `relay_transfers` (`game_id`);