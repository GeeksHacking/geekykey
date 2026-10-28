-- Each station runs the game an organizer chose for it, or none (BAC-90,
-- the API agreement's 9.11). Every station with passport settings runs the
-- passport, so its taps are judged as before. The version still running
-- names its own columns in every read and write, so it never reads game.
-- A station it adds to the passport between this and the deploy gets no
-- game, and its taps would get no_game after the deploy, so nobody adds one
-- in that window.
ALTER TABLE `stations` ADD `game` varchar(64);
--> statement-breakpoint
UPDATE `stations` SET `game` = 'passport'
WHERE `id` IN (SELECT `station_id` FROM `passport_stations`);
