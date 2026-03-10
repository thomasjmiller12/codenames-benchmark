.PHONY: sync-db ratings

ratings: ## Compute Bradley-Terry ratings from all completed games
	codenames compute-ratings

sync-db: ## Sync local SQLite database to Turso
	sqlite3 codenames.db .dump > /tmp/codenames_dump.sql
	~/.turso/turso db shell codenames-benchmark < /tmp/codenames_dump.sql
	rm /tmp/codenames_dump.sql
	@echo "✓ Database synced to Turso"
