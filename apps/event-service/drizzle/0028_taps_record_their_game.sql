-- Each tap records the game that counted it or held it back, or none for a
-- no_game tap, so a station's game can change at any time (BAC-183, a draft
-- for the API agreement's next version). Until now a station's game was fixed
-- once a game had counted or held back a tap there, so the game each station
-- runs today is the one that judged every accepted and cooldown tap there.
-- The version still running never reads game. A tap it stores between this
-- and the deploy gets none, and the passport wouldn't count it, so migrate
-- while no station is tapping, or run the UPDATE again after the deploy,
-- before any station changes game: it fills only taps that have none.
ALTER TABLE `taps` ADD `game` varchar(64);
--> statement-breakpoint
UPDATE `taps` JOIN `stations` ON `stations`.`id` = `taps`.`station_id`
SET `taps`.`game` = `stations`.`game`
WHERE `taps`.`status` IN ('accepted', 'cooldown') AND `taps`.`game` IS NULL;
