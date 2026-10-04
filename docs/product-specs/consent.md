# Consent and analytics (mock)

- First visit shows a consent banner (accept all / reject non-essential / customize) as a
  non-modal region; choice stored in a cookie; re-openable from the footer.
- A mock analytics driver records page views and add-to-cart events to a local table **only
  after consent**; admin dashboard reads it.
