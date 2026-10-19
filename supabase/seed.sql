-- Demo data for local runs and QA. Everything here is invented.
-- Ids are fixed so links and tests stay the same after every reset.
-- Amounts are in minor units: 129000 öre = SEK 1,290.00. Prices include tax.
-- Tax rates are in basis points: 2500 = 25 % (Swedish VAT), 2550 = 25.5 % (Finnish VAT).

-- Two merchant companies, so tests can check that one company can't see the other's orders.
insert into organizations (id, name) values
  ('6f0c2a1e-3b7d-4e8a-9c51-2d4f7a9b0e11', 'Moonlight Goods'),
  ('c7e41b9a-2d3f-4a6b-8e90-5f1a2b3c4d5e', 'Nordic Bikes');

insert into stores (id, organization_id, name, market, currency, status) values
  ('e03c55bc-c4a7-4795-a5ba-3b3b3cf800d6', '6f0c2a1e-3b7d-4e8a-9c51-2d4f7a9b0e11', 'Moonlight Goods Sweden', 'SE', 'SEK', 'live'),
  ('8916eb8f-667b-4bf9-a6d9-c72316aa3841', '6f0c2a1e-3b7d-4e8a-9c51-2d4f7a9b0e11', 'Moonlight Goods Finland', 'FI', 'EUR', 'live'),
  ('a678d77c-964c-45d3-adf2-40b3e78ab482', '6f0c2a1e-3b7d-4e8a-9c51-2d4f7a9b0e11', 'Moonlight Goods Norway', 'NO', 'NOK', 'test'),
  ('d2a94f1c-7e3b-4c8d-9a60-b1e2f3a4c5d6', 'c7e41b9a-2d3f-4a6b-8e90-5f1a2b3c4d5e', 'Nordic Bikes Germany', 'DE', 'EUR', 'live');

insert into orders (id, reference, created_at, expires_at, store_id, currency, customer_first_name, customer_last_name, customer_email, payment_method, status, total_amount, captured_amount, refunded_amount, shipping_carrier, shipping_tracking) values
  ('743bf9c5-f7a6-47d6-b1cb-bf9811f8b922', 'MG-1001', '2026-10-17T08:12:00Z', timestamptz '2026-10-17T08:12:00Z' + interval '28 days', 'e03c55bc-c4a7-4795-a5ba-3b3b3cf800d6', 'SEK', 'Astrid', 'Lind', 'astrid@example.com', 'card', 'authorized', 129000, 0, 0, 'PostNord', null),
  ('a04509c1-b524-494a-8662-8d6ed7bcfc8d', 'MG-1002', '2026-10-16T19:40:00Z', timestamptz '2026-10-16T19:40:00Z' + interval '28 days', 'e03c55bc-c4a7-4795-a5ba-3b3b3cf800d6', 'SEK', 'Erik', 'Holm', 'erik@example.com', 'bank_transfer', 'captured', 54700, 54700, 0, 'DHL', 'DHL-7781'),
  ('29fb84e7-03da-44f2-9389-dbbe9e12d3f3', 'MG-1003', '2026-10-15T11:05:00Z', timestamptz '2026-10-15T11:05:00Z' + interval '28 days', '8916eb8f-667b-4bf9-a6d9-c72316aa3841', 'EUR', 'Aino', 'Virtanen', 'aino@example.com', 'paypal', 'captured', 12000, 12000, 4000, 'Posti', 'PO-5521'),
  ('fc14a20f-334f-4f9a-9b7f-162626167f1f', 'MG-1004', '2026-10-03T22:30:00Z', timestamptz '2026-10-03T22:30:00Z' + interval '28 days', 'e03c55bc-c4a7-4795-a5ba-3b3b3cf800d6', 'SEK', 'Maja', 'Berg', 'maja@example.com', 'card', 'expired', 215000, 0, 0, 'PostNord', null),
  ('f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b', 'NB-2001', '2026-10-16T10:00:00Z', timestamptz '2026-10-16T10:00:00Z' + interval '28 days', 'd2a94f1c-7e3b-4c8d-9a60-b1e2f3a4c5d6', 'EUR', 'Jonas', 'Weber', 'jonas@example.com', 'card', 'authorized', 45000, 0, 0, 'DHL', null);

insert into order_lines (order_id, position, type, sku, name, quantity, unit_price, tax_rate) values
  ('743bf9c5-f7a6-47d6-b1cb-bf9811f8b922', 1, 'physical', 'LAN-BRS-01', 'Lantern, brass', 1, 129000, 2500),
  ('a04509c1-b524-494a-8662-8d6ed7bcfc8d', 1, 'physical', 'CND-SET-03', 'Candle set', 2, 24900, 2500),
  ('a04509c1-b524-494a-8662-8d6ed7bcfc8d', 2, 'shipping_fee', null, 'Shipping, DHL', 1, 4900, 2500),
  ('29fb84e7-03da-44f2-9389-dbbe9e12d3f3', 1, 'physical', 'BLK-WOL-02', 'Wool blanket', 1, 8000, 2550),
  ('29fb84e7-03da-44f2-9389-dbbe9e12d3f3', 2, 'physical', 'LMP-NGT-01', 'Night lamp', 1, 4000, 2550),
  ('fc14a20f-334f-4f9a-9b7f-162626167f1f', 1, 'physical', 'SHF-OAK-90', 'Oak shelf', 1, 215000, 2500),
  ('f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b', 1, 'physical', 'BIK-HLM-01', 'Helmet', 1, 45000, 1900);
