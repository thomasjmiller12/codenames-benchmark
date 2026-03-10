.PHONY: sync-db ratings

ratings: ## Compute Bradley-Terry ratings from all completed games
	codenames compute-ratings

sync-db: ## Sync local SQLite database to Turso (full replace)
	sqlite3 codenames.db .dump > /tmp/codenames_dump.sql
	echo "DROP TABLE IF EXISTS turns; DROP TABLE IF EXISTS games; DROP TABLE IF EXISTS boards; DROP TABLE IF EXISTS ratings_history; DROP TABLE IF EXISTS experiments; DROP TABLE IF EXISTS models;" | ~/.turso/turso db shell codenames-benchmark
	~/.turso/turso db shell codenames-benchmark < /tmp/codenames_dump.sql
	rm /tmp/codenames_dump.sql
	@echo "✓ Database synced to Turso"
