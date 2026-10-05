CREATE TABLE `checkouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cart_id` integer NOT NULL,
	`email` text,
	`shipping_address` text,
	`shipping_method` text,
	`payment_ref` text,
	`card_brand` text,
	`card_last4` text,
	`card_exp_month` integer,
	`card_exp_year` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`cart_id`) REFERENCES `carts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkouts_cart_id_unique` ON `checkouts` (`cart_id`);