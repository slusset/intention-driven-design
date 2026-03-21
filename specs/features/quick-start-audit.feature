# id: quick-start-audit
# type: feature
# story: specs/stories/quick-start-audit.story.md
# journey: specs/journeys/trade-show-signup.journey.md
# contract: openapi POST /accounts/{accountId}/audits
# contract: asyncapi publish audits/created
# contract: json-rpc account.getQuickStartPrompt

Feature: Quick-start audit
  In order to see product value before leaving the booth
  As a newly signed-up prospect
  I want the system to guide and confirm my first audit quickly

  Scenario: The confirmation screen loads quick-start guidance
    Given the prospect has just created an account
    When the client requests quick-start prompt details
    Then the response includes the primary call to action
    And the prompt recommends a default audit template

  Scenario: Creating the first audit emits a contract event
    Given the prospect starts the first audit from the confirmation screen
    When the system creates the audit
    Then an audit created event is published for downstream consumers
