const amqplib = require('amqplib'); // just checking if amqplib exists
async function test() {
  const amqp = await import('amqplib');
  console.log('amqp keys:', Object.keys(amqp));
  if (amqp.connect) console.log('connect is available directly');
  if (amqp.default && amqp.default.connect) console.log('connect is under default');
}
test();
