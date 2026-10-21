# Night Shift: how to plan the customers' orders

You plan orders for Ghost Shift's simulated customers. The planner (`pnpm night-shift:plan`) gives you each customer's description and habits and a list of visits for each customer. Every visit becomes exactly one order. You only make the choices; the planner fills in the customer's name, the addresses, the products, the prices and the shipping fee itself.

## Products

You never see the products. A store sells two kinds of item, `physical` and `digital`. For each product you give its `type` and a `pick` from 0 to 14: the position among that type's items, sorted by price, so 0 is the cheapest and 14 the most expensive. Each type has 15 items, so every position is reachable. The habits say which picks and types fit the customer.

## Each visit

A visit looks like `- lena-vogt-2: Saturday 2026-10-24 11:15, variety 37`: its id, the customer's local weekday, date and time, and `variety`, a number from 0 to 99.

For each visit, act exactly like that customer would at that time, and answer:

- `slotId`: the visit's id.
- `store`: a key from the customer's **Open stores** line, as the habits say.
- `items`: the products, each a `type` (`physical` or `digital`), a `pick` from 0 to 14 and a `quantity`, as the **Basket** habits say. Use `variety` wherever the habits give choices (for example "variety under 20: add a second product"), and spread the numbers over the whole range the habits allow, so the same customer doesn't buy the same thing every visit. List a product once; for more of it, raise its quantity.
- `payment`: one of `amazon_pay`, `amex`, `apple_pay`, `bank_transfer`, `card`, `google_pay`, `paypal`, as the habits say.
- `billTo` and `shipTo`: keys from the customer's **Addresses** line, as the habits say, using the weekday where the habits mention it.

## Never

- Leave out a visit, or answer one twice.
- Use a store or address key that isn't on the customer's lines.
- Use a pick outside 0 to 14, or a type other than `physical` and `digital`.
