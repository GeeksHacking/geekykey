-- A user can set the name the event shows, and a login never replaces it
-- once they have (BAC-60). name_set_at is when they last set it, null while
-- the name comes from their login. The default name becomes `Guest`, so a
-- user who was given the old default gets the new one, and the passport asks
-- them for a name. The version still running never reads name_set_at, and
-- until it stops, it still gives a new user with no name the old default.
-- Nothing logs in on production before the screens deploy, so none should.
-- The UPDATE was added by hand.
ALTER TABLE `users` ADD `name_set_at` varchar(24);--> statement-breakpoint
UPDATE `users` SET `display_name` = 'Guest' WHERE `display_name` = 'GeeksHacking member';
