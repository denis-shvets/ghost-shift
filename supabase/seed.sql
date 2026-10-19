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
