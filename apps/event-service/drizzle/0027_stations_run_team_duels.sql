CREATE TABLE `duel_round_players` (
	`round_id` varchar(36) NOT NULL,
	`user_id` varchar(128) NOT NULL,
	`joined_at` varchar(24) NOT NULL,
	`won` boolean NOT NULL DEFAULT false,
	`team` varchar(1),
	CONSTRAINT `duel_round_players_round_id_user_id_pk` PRIMARY KEY(`round_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `duel_rounds` (
	`id` varchar(36) NOT NULL,
	`station_id` varchar(64) NOT NULL,
	`opened_at` varchar(24) NOT NULL,
	`closes_at` varchar(24) NOT NULL,
	`ended_at` varchar(24),
	`formed_at` varchar(24),
	`challenge` varchar(8),
	CONSTRAINT `duel_rounds_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `duels` (
	`id` varchar(36) NOT NULL,
	`round_id` varchar(36) NOT NULL,
	`user_a` varchar(128) NOT NULL,
	`user_b` varchar(128) NOT NULL,
	`roll_a` int,
	`roll_b` int,
	`reaction_a_ms` int,
	`reaction_b_ms` int,
	`reaction_a_at` varchar(24),
	`reaction_b_at` varchar(24),
	CONSTRAINT `duels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `duel_round_players_user_idx` ON `duel_round_players` (`user_id`);--> statement-breakpoint
CREATE INDEX `duel_rounds_station_idx` ON `duel_rounds` (`station_id`);--> statement-breakpoint
CREATE INDEX `duels_round_idx` ON `duels` (`round_id`);