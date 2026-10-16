-- A tap is stored with its user ID and no token UID, and its user needs no
-- row in users, since the Event side never sees a token and a user may never
-- have logged in to it (BAC-32). The version still running writes both
-- columns, and works with this. token_uid is dropped in a later migration
-- (BAC-36).
ALTER TABLE `taps` DROP FOREIGN KEY `taps_user_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `taps` MODIFY COLUMN `token_uid` varchar(20);