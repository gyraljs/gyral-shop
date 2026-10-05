-- Full-text search over products (docs/product-specs/search.md).
-- A standalone FTS5 table keyed by product id (rowid). Brand, category and department names
-- are copied in so one MATCH covers them all. Triggers keep it in sync with `products`.
-- Column order matters: bm25() weights in src/db/repos/search.ts follow it.
CREATE VIRTUAL TABLE `products_fts` USING fts5(
	name, brand, category, department, description,
	tokenize = 'unicode61 remove_diacritics 2',
	prefix = '2 3'
);
--> statement-breakpoint
INSERT INTO `products_fts` (rowid, name, brand, category, department, description)
SELECT p.id, p.name, b.name, c.name, d.name, p.description
FROM `products` p
JOIN `brands` b ON b.id = p.brand_id
JOIN `categories` c ON c.id = p.category_id
JOIN `departments` d ON d.id = p.department_id;
--> statement-breakpoint
CREATE TRIGGER `products_fts_insert` AFTER INSERT ON `products` BEGIN
	INSERT INTO `products_fts` (rowid, name, brand, category, department, description)
	VALUES (
		new.id, new.name,
		(SELECT name FROM `brands` WHERE id = new.brand_id),
		(SELECT name FROM `categories` WHERE id = new.category_id),
		(SELECT name FROM `departments` WHERE id = new.department_id),
		new.description
	);
END;
--> statement-breakpoint
CREATE TRIGGER `products_fts_update` AFTER UPDATE OF name, description, brand_id, category_id, department_id ON `products` BEGIN
	DELETE FROM `products_fts` WHERE rowid = old.id;
	INSERT INTO `products_fts` (rowid, name, brand, category, department, description)
	VALUES (
		new.id, new.name,
		(SELECT name FROM `brands` WHERE id = new.brand_id),
		(SELECT name FROM `categories` WHERE id = new.category_id),
		(SELECT name FROM `departments` WHERE id = new.department_id),
		new.description
	);
END;
--> statement-breakpoint
CREATE TRIGGER `products_fts_delete` AFTER DELETE ON `products` BEGIN
	DELETE FROM `products_fts` WHERE rowid = old.id;
END;
