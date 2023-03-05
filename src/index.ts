import {Message} from 'whatsapp-web.js';
import {Beltranus} from './beltranus';
import {Wenchotino} from './wenchotino';

const qrcode = require('qrcode-terminal');
const { Client } = require('whatsapp-web.js');
const client = new Client();
const beltranus: Beltranus = new Beltranus();
require('dotenv').config();

const prefixWenchotino = 'wenchotino';
const prefixBel = 'bel';

client.on('qr', qr => {
  qrcode.generate(qr, {small: true});
});

client.on('ready', () => {
  console.log('Client is ready!');
});

client.on('message', async (message: Message) => {
  await beltranus.readMessage(message);
});

client.initialize();//827813