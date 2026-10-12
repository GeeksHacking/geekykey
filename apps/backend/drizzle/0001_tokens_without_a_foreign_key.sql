-- No foreign key crosses between the Event side's tables and the claims
-- stand-in's, so a token's owner needs no row in `users`. The version still
-- running works without it. `tokens_user_id_idx` stays, since it was made
-- before the foreign key and is its own index.
ALTER TABLE `tokens` DROP FOREIGN KEY `tokens_user_id_users_id_fk`;
