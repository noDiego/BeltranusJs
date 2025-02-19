import {Message} from 'whatsapp-web.js';
import {Beltranus} from './beltranus';

const qrcode = require('qrcode-terminal');
const { Client } = require('whatsapp-web.js');
const client = new Client({
  webVersionCache: {
    type: "remote",
    remotePath:
      "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
  },
});


const beltranus: Beltranus = new Beltranus(client);
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
client.on('authenticated', () => {
  console.log('Authentiaction OK');
});

try {
  client.initialize();
}catch (e){
  console.error('ERROR:', e);
}
