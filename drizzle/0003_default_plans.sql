-- Default subscription plans. Prices are commercial hypotheses and are editable
-- by platform admins in the admin console; they exclude GST (18%).
INSERT INTO subscription_plans (code, name, description, price_paise, interval, max_locations, max_users, max_active_campaigns, features, support_level, trial_days, gst_rate_bps, sort_order)
VALUES
  ('starter', 'Starter', 'For a single showroom or service centre getting started with local ads.', 299900, 'month', 1, 3, 5,
   ARRAY['One location', 'Basic campaign management', 'Standard reporting', 'Meta and Google account connection'], 'email', 14, 1800, 1),
  ('growth', 'Growth', 'For dealerships with a few locations that want leads and approvals in one place.', 799900, 'month', 3, 10, 20,
   ARRAY['Up to three locations', 'Lead centre', 'Multi-platform reporting', 'Campaign approval workflows'], 'priority_email', 14, 1800, 2),
  ('dealer_group', 'Dealer Group', 'For multi-location dealer groups. Final pricing depends on locations and integrations.', 1999900, 'month', NULL, NULL, NULL,
   ARRAY['Multiple locations', 'Role-based permissions', 'Central reporting', 'Advanced integrations by contract'], 'account_manager', 14, 1800, 3)
ON CONFLICT (code) DO NOTHING;
