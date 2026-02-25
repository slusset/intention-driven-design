VERSION := $(shell git describe --tags --always 2>/dev/null || echo "0.0.0")
BUILD_DIR := build
ZIP_NAME := idd-skills-$(VERSION).zip

# Explicit skill list — 9 distributable skills (excludes .system/)
SKILLS := \
	skills/solution-narrative \
	skills/domain-modeling \
	skills/behavior-contract \
	skills/e2e-journey-testing \
	skills/workflow-guide \
	technical-skills/angular-architecture \
	technical-skills/angular-from-design \
	technical-skills/angular-playwright \
	technical-skills/spring-boot-architecture

CLAUDE_DIR := $(HOME)/.claude/skills
CODEX_DIR  := $(HOME)/.codex/skills

.PHONY: build install install-claude install-codex list clean

build:
	@mkdir -p $(BUILD_DIR)/idd-skills
	@cp -R .claude-plugin $(BUILD_DIR)/idd-skills/
	@for skill in $(SKILLS); do \
		mkdir -p "$(BUILD_DIR)/idd-skills/$$(dirname $$skill)"; \
		cp -R "$$skill" "$(BUILD_DIR)/idd-skills/$$(dirname $$skill)/"; \
	done
	@cp -R docs $(BUILD_DIR)/idd-skills/
	@cp install.sh $(BUILD_DIR)/idd-skills/
	@cp README.md $(BUILD_DIR)/idd-skills/
	@cp LICENSE $(BUILD_DIR)/idd-skills/
	@cd $(BUILD_DIR) && zip -rq $(ZIP_NAME) idd-skills/
	@rm -rf $(BUILD_DIR)/idd-skills
	@echo "Built $(BUILD_DIR)/$(ZIP_NAME)"

install: install-claude install-codex

install-claude:
	@for skill in $(SKILLS); do \
		dest="$(CLAUDE_DIR)/$$skill"; \
		mkdir -p "$$(dirname $$dest)"; \
		cp -R "$$skill" "$$dest"; \
	done
	@echo "Installed $(words $(SKILLS)) skills to $(CLAUDE_DIR)"

install-codex:
	@for skill in $(SKILLS); do \
		dest="$(CODEX_DIR)/$$skill"; \
		mkdir -p "$$(dirname $$dest)"; \
		cp -R "$$skill" "$$dest"; \
	done
	@echo "Installed $(words $(SKILLS)) skills to $(CODEX_DIR)"

list:
	@echo "IDD Skills ($(words $(SKILLS))):"
	@for skill in $(SKILLS); do echo "  $$skill"; done

clean:
	rm -rf $(BUILD_DIR)
