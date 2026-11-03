-- Two guests connect by tapping each other's tokens (BAC-120). Each pair's
-- halves, one row per pair, and the connections, one per pair, each with
-- the match worked out when it was made. New tables, so the version still
-- running never reads them.
CREATE TABLE `connections` (
	`user_a` varchar(128) NOT NULL,
	`user_b` varchar(128) NOT NULL,
	`kind_a` varchar(32) NOT NULL,
	`kind_b` varchar(32) NOT NULL,
	`connected_at` varchar(24) NOT NULL,
	`match_percent` int,
	`shared` json NOT NULL,
	CONSTRAINT `connections_user_a_user_b_pk` PRIMARY KEY(`user_a`,`user_b`)
);
--> statement-breakpoint
CREATE TABLE `meeting_halves` (
	`user_a` varchar(128) NOT NULL,
	`user_b` varchar(128) NOT NULL,
	`a_met_at` varchar(24),
	`b_met_at` varchar(24),
	CONSTRAINT `meeting_halves_user_a_user_b_pk` PRIMARY KEY(`user_a`,`user_b`)
);
--> statement-breakpoint
CREATE INDEX `connections_user_b_idx` ON `connections` (`user_b`);--> statement-breakpoint
CREATE INDEX `connections_connected_at_idx` ON `connections` (`connected_at`);