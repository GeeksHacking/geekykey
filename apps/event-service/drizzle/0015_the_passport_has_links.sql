-- Each passport station can give its group's page, which /me gives with the
-- station's stamp so the passport can offer it (BAC-99, the API agreement's
-- 8.1, 9.1 and 9.2). Null for none. The version still running names its own
-- columns in every read and write, so it never reads link, a station it adds
-- gets none, and a save through it leaves the link as it was.
ALTER TABLE `passport_stations` ADD `link` text;
