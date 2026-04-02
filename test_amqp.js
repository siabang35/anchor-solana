const amqp = require('amqplib');
async function test() {
  try {
    const conn = await amqp.connect(process.env.RABBITMQ_URL);
    console.log('Connected');
    conn.close();
  } catch(e) {
    console.error('Failed:', e);
  }
}
test();
