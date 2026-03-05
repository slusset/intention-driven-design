# id: mobile-signup
# type: feature
# story: examples/stories/mobile-signup.story.md
# journey: examples/journeys/trade-show-signup.journey.md
# contract: POST /accounts

Feature: Mobile signup
  In order to begin evaluating the product at a trade show
  As a prospect on a phone
  I want to create an account quickly

  Scenario: Successful mobile signup
    Given the prospect is on the signup page
    When they submit a valid email and booth code
    Then the system creates an active account
    And the response includes a quick-start audit prompt
