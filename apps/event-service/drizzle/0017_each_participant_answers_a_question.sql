-- Each participant answers the answers game's question (BAC-119, the API
-- agreement's 8.1 and 8.7). answers holds the question each was given and
-- their answer. A new table, so the version still running never reads it.
CREATE TABLE `answers` (
	`user_id` varchar(128) NOT NULL,
	`question` text NOT NULL,
	`answer` text,
	`given_at` varchar(24) NOT NULL,
	`answered_at` varchar(24),
	CONSTRAINT `answers_user_id` PRIMARY KEY(`user_id`)
);
