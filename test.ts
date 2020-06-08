import {createClient} from './client'
import {OrderBook} from './orderbook'

const AMOUNT = Math.max(2, parseInt(process.argv[2], 10) || 0);
console.log(`starting ${AMOUNT} nodes`);

for (let i = 0; i < AMOUNT; i++) {
  startNode();
}

function startNode() {
  const port = 1024 + Math.floor(Math.random() * 1000);

  new OrderBook(port)
  createClient(port.toString())
}
