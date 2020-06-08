PoC of a distributed crypto exchange using the Grenache RCP framework as a part of an interview process with Bitfinex.

## Run

- `yarn install`
- `yarn network`
- `yarn test`

## Features

- RPC
- per-order locks
- every server owns his orders
  - and manages the funds

## TODO

- favor single requests over broadcasts
- sync state when a new node joins
- auth between nodes
- order timeouts
- restart after a failure
- TESTS
- handle local orders locally (dont talk to yourself over RPC)
- funds
- other order matching strategies
- fix `ERR_REQUEST_GENERIC: ESOCKETTIMEDOUT`
