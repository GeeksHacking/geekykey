-- Each login link logs someone in once (BAC-59, the API agreement's 7.4).
-- The Event Service keeps each used link's jti until the link expires, 60
-- seconds after it was made. A new table, which the version still running
-- never reads, so it can go in before the deploy.
CREATE TABLE `used_login_links` (
	`jti` varchar(32) NOT NULL,
	`expires_at` varchar(24) NOT NULL,
	CONSTRAINT `used_login_links_jti` PRIMARY KEY(`jti`)
);
--> statement-breakpoint
CREATE INDEX `used_login_links_expires_at_idx` ON `used_login_links` (`expires_at`);