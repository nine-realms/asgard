.PHONY: check

check: ## Run contract validation checks
	@./scripts/check-contracts.sh
