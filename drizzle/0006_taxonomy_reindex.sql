-- Keep the product search index in sync when a brand, category or department is renamed
-- (shop-eyl). products_fts copies these names into every product's row (0002_search_fts.sql),
-- and the products triggers only fire on product changes.
CREATE TRIGGER `brands_fts_rename` AFTER UPDATE OF name ON `brands` BEGIN
	UPDATE `products_fts` SET brand = new.name
	WHERE rowid IN (SELECT id FROM `products` WHERE brand_id = new.id);
END;
--> statement-breakpoint
CREATE TRIGGER `categories_fts_rename` AFTER UPDATE OF name ON `categories` BEGIN
	UPDATE `products_fts` SET category = new.name
	WHERE rowid IN (SELECT id FROM `products` WHERE category_id = new.id);
END;
--> statement-breakpoint
CREATE TRIGGER `departments_fts_rename` AFTER UPDATE OF name ON `departments` BEGIN
	UPDATE `products_fts` SET department = new.name
	WHERE rowid IN (SELECT id FROM `products` WHERE department_id = new.id);
END;
