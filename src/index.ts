import {Message} from 'whatsapp-web.js';
import {Beltranus} from './beltranus';

const qrcode = require('qrcode-terminal');
const { Client } = require('whatsapp-web.js');
const client = new Client();
const beltranus: Beltranus = new Beltranus();
require('dotenv').config();

client.on('qr', qr => {
  qrcode.generate(qr, {small: true});
});

client.on('ready', () => {
  console.log('Client is ready!');
});

client.on('message', async (message: Message) => {
  beltranus.readMessage(message);
});

client.on('auth_failure', err => {
  console.error(err);
});
client.on('authenticated', t => {
  console.log(t);
});

try {
  client.initialize();
}catch (e){
  console.error('ERROR:', e);
}