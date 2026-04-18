ALTER TABLE `parties` ADD `external_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `parties_external_id_unique` ON `parties` (`external_id`);