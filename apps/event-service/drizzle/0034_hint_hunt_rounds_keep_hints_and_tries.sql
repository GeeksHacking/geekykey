CREATE TABLE `hint_hunt_players` (
	`round_id` varchar(36) NOT NULL,
	`user_id` varchar(128) NOT NULL,
	CONSTRAINT `hint_hunt_players_round_id_user_id_pk` PRIMARY KEY(`round_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `hint_hunt_rounds` (
	`id` varchar(36) NOT NULL,
	`station_id` varchar(64) NOT NULL,
	`opened_at` varchar(24) NOT NULL,
	`joining_until` varchar(24) NOT NULL,
	`started_at` varchar(24),
	`hints` json NOT NULL,
	`hints_announced` int NOT NULL DEFAULT 0,
	`tries_left` int NOT NULL,
	`ended_at` varchar(24),
	`ended_how` varchar(16),
	CONSTRAINT `hint_hunt_rounds_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `hint_hunt_rounds_station` ON `hint_hunt_rounds` (`station_id`,`opened_at`);