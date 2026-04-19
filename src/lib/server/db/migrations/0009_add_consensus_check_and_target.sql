ALTER TABLE `councils` ADD `consensus_check` text;--> statement-breakpoint
ALTER TABLE `tables` ADD `consensus_target` text DEFAULT 'rounds';