-- Demo data for local runs and QA. Everything here is invented.
-- Ids are fixed so links and tests stay the same after every reset.
-- Amounts are in minor units: 129000 öre = SEK 1,290.00. Prices include tax.
-- Tax rates are in basis points: 2500 = 25 % (Swedish VAT), 2550 = 25.5 % (Finnish VAT).

-- Four fashion companies: two with one store, two with several. Tests check that one company can't see another's orders.
insert into organizations (id, name) values
  ('a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a01', 'Lark & Loom'),
  ('a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a02', 'Hemline Collective'),
  ('a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a03', 'Northstar Threads'),
  ('a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a04', 'Pocket Atelier');

-- The 20 stores. One of Northstar Threads' stores (Silk Pine Oslo) is a test store.
insert into stores (id, organization_id, name, market, currency, status) values
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b01', 'a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a01', 'Lark & Loom Stockholm', 'SE', 'SEK', 'live'),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b02', 'a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a02', 'Hemline Helsinki', 'FI', 'EUR', 'live'),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b03', 'a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a03', 'Velour Vault', 'SE', 'SEK', 'live'),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b04', 'a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a03', 'Moss & Mirror', 'SE', 'SEK', 'live'),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b05', 'a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a03', 'Gingham Galaxy', 'DE', 'EUR', 'live'),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b06', 'a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a03', 'Cobalt Closet', 'DE', 'EUR', 'live'),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b07', 'a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a03', 'Silk Pine Oslo', 'NO', 'NOK', 'test'),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b08', 'a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a03', 'Tangerine Thread', 'NO', 'NOK', 'live'),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b09', 'a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a03', 'Fjord Fabric', 'NO', 'NOK', 'live'),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b10', 'a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a03', 'Plaid Parade', 'FI', 'EUR', 'live'),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b11', 'a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a03', 'Wool Whisper', 'FI', 'EUR', 'live'),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b12', 'a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a03', 'Denim Dune', 'SE', 'SEK', 'live'),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b13', 'a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a03', 'Linen Lantern', 'DE', 'EUR', 'live'),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b14', 'a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a03', 'Corduroy Comet', 'FI', 'EUR', 'live'),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b15', 'a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a03', 'Rayon Rhapsody', 'SE', 'SEK', 'live'),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b16', 'a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a03', 'Chiffon Cascade', 'NO', 'NOK', 'live'),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b17', 'a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a03', 'Thimble & Thyme', 'DE', 'EUR', 'live'),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b18', 'a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a04', 'Satin Sparrow', 'DE', 'EUR', 'live'),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b19', 'a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a04', 'Button Bazaar', 'SE', 'SEK', 'live'),
  ('b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b20', 'a1f3c7e2-4b5d-4c8a-9e10-2f6b7d8c9a04', 'Zipper Zenith', 'FI', 'EUR', 'live');
