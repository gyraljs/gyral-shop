ALTER TABLE `brands` ADD `archived` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `categories` ADD `archived` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `departments` ADD `archived` integer DEFAULT false NOT NULL;