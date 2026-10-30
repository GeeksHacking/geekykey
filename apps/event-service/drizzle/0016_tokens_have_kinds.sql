-- Each token has a kind (ADR 0006, BAC-113). token_kinds is GeekyKey's list
-- of them, beside the claims stand-in, filled by `pnpm db:token-kinds` from the
-- token writer's log. user_kinds is the Event Service's own: each user's kind,
-- the first the hand-off or a login link gave. Both are new tables, so the
-- version still running never reads them.
CREATE TABLE `user_kinds` (
	`user_id` varchar(128) NOT NULL,
	`kind` varchar(32) NOT NULL,
	`created_at` varchar(24) NOT NULL,
	CONSTRAINT `user_kinds_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `token_kinds` (
	`uid` varchar(20) NOT NULL,
	`kind` varchar(32) NOT NULL,
	CONSTRAINT `token_kinds_uid` PRIMARY KEY(`uid`)
);
